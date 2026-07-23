import { describe, expect, it, vi } from 'vitest'

import type { BrowserDefinition } from '../../src/core/types.js'
import { scheduleBrowsers } from '../../src/runner/scheduler.js'
import type { TunnelSlot } from '../../src/transports/types.js'

type Deferred<T> = {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined
  let rejectPromise: ((reason: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve(value) {
      if (!resolvePromise) {
        throw new Error('Deferred promise was not initialized.')
      }
      resolvePromise(value)
    },
    reject(reason) {
      if (!rejectPromise) {
        throw new Error('Deferred promise was not initialized.')
      }
      rejectPromise(reason)
    },
  }
}

const browsers: Readonly<Record<string, BrowserDefinition>> = {
  chrome: { browser: 'chrome', protocol: 'https' },
  firefox: { browser: 'firefox', protocol: 'https' },
  edge: { browser: 'edge', protocol: 'https' },
  safari: { browser: 'safari', protocol: 'http' },
}

const slots: readonly TunnelSlot[] = [
  { id: 'https-1', publicUrl: 'https://one.example.test', localPort: 7_201, protocol: 'https' },
  { id: 'https-2', publicUrl: 'https://two.example.test', localPort: 7_202, protocol: 'https' },
  { id: 'http-1', publicUrl: 'http://three.example.test', localPort: 7_203, protocol: 'http' },
]

describe('scheduleBrowsers', () => {
  it('never exceeds local concurrency and does not reuse an active slot', async () => {
    let active = 0
    let maximumActive = 0
    const activeSlots = new Set<string>()
    const started: string[] = []

    const result = await scheduleBrowsers({
      browserIds: ['chrome', 'firefox', 'edge'],
      browsers,
      slots: slots.slice(0, 2),
      concurrency: 2,
      queuePollIntervalMs: 1,
      queueTimeoutMs: 1_000,
      signal: new AbortController().signal,
      getAvailableBrowserStackSlots: async () => 10,
      run: async (browserId, _browser, slot) => {
        expect(activeSlots.has(slot.id)).toBe(false)
        activeSlots.add(slot.id)
        active += 1
        maximumActive = Math.max(maximumActive, active)
        started.push(browserId)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        activeSlots.delete(slot.id)
        return `${browserId}:${slot.id}`
      },
    })

    expect(maximumActive).toBe(2)
    expect(started).toEqual(['chrome', 'firefox', 'edge'])
    expect(result.unstarted).toEqual([])
    expect(result.completed.map(({ browserId }) => browserId).sort()).toEqual(['chrome', 'edge', 'firefox'])
  })

  it('treats a plan response as a launch budget until a running browser completes', async () => {
    const releases = new Map<string, Deferred<string>>()
    const started: string[] = []
    const getAvailableBrowserStackSlots = vi.fn(async () => 1)

    const scheduling = scheduleBrowsers({
      browserIds: ['chrome', 'firefox', 'edge'],
      browsers,
      slots,
      concurrency: 3,
      queuePollIntervalMs: 1,
      queueTimeoutMs: 1_000,
      signal: new AbortController().signal,
      getAvailableBrowserStackSlots,
      run: (browserId) => {
        const release = deferred<string>()
        releases.set(browserId, release)
        started.push(browserId)
        return release.promise
      },
    })

    try {
      await vi.waitFor(() => expect(started).toHaveLength(1))
      await Promise.resolve()
      expect(started).toEqual(['chrome'])
      expect(getAvailableBrowserStackSlots).toHaveBeenCalledTimes(1)

      releases.get('chrome')?.resolve('chrome complete')
      await vi.waitFor(() => expect(started).toHaveLength(2))
      expect(started).toEqual(['chrome', 'firefox'])

      releases.get('firefox')?.resolve('firefox complete')
      await vi.waitFor(() => expect(started).toHaveLength(3))
      expect(started).toEqual(['chrome', 'firefox', 'edge'])
      releases.get('edge')?.resolve('edge complete')

      await expect(scheduling).resolves.toMatchObject({ unstarted: [] })
      expect(getAvailableBrowserStackSlots).toHaveBeenCalledTimes(3)
    } finally {
      for (const [browserId, release] of releases) {
        release.resolve(`${browserId} cleanup`)
      }
      await scheduling.catch(() => undefined)
    }
  })

  it('matches each browser only to a transport slot with the same protocol', async () => {
    const assignments: Array<{ browserId: string; browserProtocol: string; slotProtocol: string }> = []

    const result = await scheduleBrowsers({
      browserIds: ['safari', 'chrome', 'firefox'],
      browsers,
      slots,
      concurrency: 3,
      queuePollIntervalMs: 1,
      queueTimeoutMs: 1_000,
      signal: new AbortController().signal,
      getAvailableBrowserStackSlots: async () => 10,
      run: async (browserId, browser, slot) => {
        assignments.push({ browserId, browserProtocol: browser.protocol, slotProtocol: slot.protocol })
        return slot.id
      },
    })

    expect(assignments).toHaveLength(3)
    expect(assignments.every(({ browserProtocol, slotProtocol }) => browserProtocol === slotProtocol)).toBe(true)
    expect(assignments.find(({ browserId }) => browserId === 'safari')?.slotProtocol).toBe('http')
    expect(result.unstarted).toEqual([])
  })

  it('stops launching queued browsers after cancellation and reports them as unstarted', async () => {
    const controller = new AbortController()
    const firstRun = deferred<'cancelled'>()
    const started: string[] = []

    const scheduling = scheduleBrowsers({
      browserIds: ['chrome', 'firefox', 'edge'],
      browsers,
      slots: slots.slice(0, 1),
      concurrency: 1,
      queuePollIntervalMs: 1,
      queueTimeoutMs: 1_000,
      signal: controller.signal,
      getAvailableBrowserStackSlots: async () => 10,
      run: (browserId) => {
        started.push(browserId)
        controller.signal.addEventListener('abort', () => firstRun.resolve('cancelled'), { once: true })
        return firstRun.promise
      },
    })

    await vi.waitFor(() => expect(started).toEqual(['chrome']))
    controller.abort(new Error('test cancellation'))

    await expect(scheduling).resolves.toEqual({
      completed: [{ browserId: 'chrome', result: 'cancelled' }],
      unstarted: ['firefox', 'edge'],
    })
  })

  it('does not query capacity or launch work when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled before scheduling'))
    const getAvailableBrowserStackSlots = vi.fn(async () => 10)
    const run = vi.fn(async () => 'unused')

    await expect(
      scheduleBrowsers({
        browserIds: ['chrome', 'firefox'],
        browsers,
        slots,
        concurrency: 2,
        queuePollIntervalMs: 1,
        queueTimeoutMs: 1_000,
        signal: controller.signal,
        getAvailableBrowserStackSlots,
        run,
      }),
    ).resolves.toEqual({ completed: [], unstarted: ['chrome', 'firefox'] })
    expect(getAvailableBrowserStackSlots).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('settles remaining tasks before rejecting after one scheduled browser fails', async () => {
    const chrome = deferred<string>()
    const firefox = deferred<string>()
    const failure = new Error('chrome failed')
    const started: string[] = []
    let schedulerSettled = false

    const scheduling = scheduleBrowsers({
      browserIds: ['chrome', 'firefox'],
      browsers,
      slots: slots.slice(0, 2),
      concurrency: 2,
      queuePollIntervalMs: 1,
      queueTimeoutMs: 1_000,
      signal: new AbortController().signal,
      getAvailableBrowserStackSlots: async () => 2,
      run: (browserId) => {
        started.push(browserId)
        return browserId === 'chrome' ? chrome.promise : firefox.promise
      },
    })
    const observed = scheduling.then(
      () => undefined,
      (error: unknown) => {
        schedulerSettled = true
        return error
      },
    )

    await vi.waitFor(() => expect(started).toEqual(['chrome', 'firefox']))
    try {
      chrome.reject(failure)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(schedulerSettled).toBe(false)
    } finally {
      firefox.resolve('firefox complete')
    }
    await expect(observed).resolves.toBe(failure)
    expect(schedulerSettled).toBe(true)
  })

  it('validates browser IDs and transport slot uniqueness before querying capacity', async () => {
    const getAvailableBrowserStackSlots = vi.fn(async () => 10)
    const base = {
      browserIds: ['chrome'],
      browsers,
      concurrency: 1,
      queuePollIntervalMs: 1,
      queueTimeoutMs: 1_000,
      signal: new AbortController().signal,
      getAvailableBrowserStackSlots,
      run: async () => 'unused',
    }

    await expect(
      scheduleBrowsers({
        ...base,
        slots: [slots[0]!, { ...slots[1]!, id: slots[0]!.id }],
      }),
    ).rejects.toThrow('Duplicate transport slot ID')
    await expect(
      scheduleBrowsers({
        ...base,
        slots: [slots[0]!, { ...slots[1]!, localPort: slots[0]!.localPort }],
      }),
    ).rejects.toThrow('Duplicate transport local port')
    await expect(scheduleBrowsers({ ...base, browserIds: ['missing'], slots })).rejects.toThrow(
      'Unknown browser "missing"',
    )
    await expect(scheduleBrowsers({ ...base, browserIds: ['safari'], slots: slots.slice(0, 2) })).rejects.toThrow(
      'No HTTP transport slot is available for "safari"',
    )
    expect(getAvailableBrowserStackSlots).not.toHaveBeenCalled()
  })
})
