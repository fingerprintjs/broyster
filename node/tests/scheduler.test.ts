import { describe, expect, it, vi } from 'vitest'

import type { BrowserDef } from '../src/browsers.js'
import { BrowserStackQueue } from '../src/queue.js'
import type { SlotRequirement, Transport, TransportSlot } from '../src/transports/transport.js'
import type { RunResult } from '../src/orchestrator/results.js'
import { runWithTransport } from '../src/orchestrator/scheduler.js'
import { deferred } from './helpers.js'

const catalog: Record<string, BrowserDef> = {
  ChromeHttps: { platform: 'Windows', osVersion: '11', browserName: 'Chrome', useHttps: true },
  FirefoxHttps: { platform: 'Windows', osVersion: '11', browserName: 'Firefox', useHttps: true },
  SafariHttp: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Safari', useHttps: false },
}

class FakeTransport implements Transport {
  readonly name = 'fake'
  opened = false
  closed = false
  acquired: string[] = []
  released: string[] = []
  private protocols: Set<boolean>

  constructor(private slots: TransportSlot[]) {
    this.protocols = new Set(slots.map((slot) => slot.useHttps))
  }

  supports(requirement: SlotRequirement): boolean {
    return this.protocols.has(requirement.useHttps)
  }

  async open(): Promise<void> {
    this.opened = true
  }

  async close(): Promise<void> {
    this.closed = true
  }

  acquireSlot(requirement: SlotRequirement): TransportSlot | undefined {
    const index = this.slots.findIndex((slot) => slot.useHttps === requirement.useHttps)
    if (index === -1) {
      return undefined
    }
    const slot = this.slots.splice(index, 1)[0] as TransportSlot
    this.acquired.push(slot.id)
    return slot
  }

  releaseSlot(slot: TransportSlot): void {
    this.released.push(slot.id)
    this.slots.push(slot)
  }
}

function makeSlot(id: string, useHttps: boolean): TransportSlot {
  return {
    id,
    localPort: 7000 + Number(id.replace(/\D/g, '') || 0),
    publicOrigin: `https://${id}.example.com`,
    useHttps,
  }
}

function makeQueue(availableSlots = 100): BrowserStackQueue {
  const fakeClient = {
    getPlan: async () => ({ parallelSessionsMaxAllowed: availableSlots, parallelSessionsRunning: 0 }),
    setSessionStatus: async () => undefined,
  }
  return new BrowserStackQueue({ username: 'u', accessKey: 'k' }, fakeClient as never)
}

function passResult(browser: string): RunResult {
  return { browser, status: 'PASS', exitCode: 0, duration: 1, attempts: [] }
}

describe('runWithTransport', () => {
  it('runs every browser on a protocol-compatible slot and releases the slots', async () => {
    const transport = new FakeTransport([makeSlot('https-1', true), makeSlot('http-1', false)])
    const assignments: Array<{ browser: string; slotHttps: boolean }> = []

    const results = await runWithTransport({
      browserKeys: ['ChromeHttps', 'SafariHttp', 'FirefoxHttps'],
      catalog,
      concurrency: 2,
      transport,
      queue: makeQueue(),
      runBrowser: async (browserKey, slot) => {
        assignments.push({ browser: browserKey, slotHttps: slot.useHttps })
        return passResult(browserKey)
      },
      onLog: () => undefined,
    })

    expect(results.map((result) => result.browser).sort()).toEqual(['ChromeHttps', 'FirefoxHttps', 'SafariHttp'])
    for (const assignment of assignments) {
      expect(assignment.slotHttps).toBe(catalog[assignment.browser]?.useHttps)
    }
    expect(transport.released.sort()).toEqual(transport.acquired.sort())
  })

  it('respects the concurrency limit', async () => {
    const transport = new FakeTransport([
      makeSlot('https-1', true),
      makeSlot('https-2', true),
      makeSlot('https-3', true),
    ])
    let runningNow = 0
    let maxRunning = 0

    await runWithTransport({
      browserKeys: ['ChromeHttps', 'FirefoxHttps'],
      catalog: { ...catalog, ExtraHttps: { ...(catalog.ChromeHttps as BrowserDef) } },
      concurrency: 1,
      transport,
      queue: makeQueue(),
      runBrowser: async (browserKey) => {
        runningNow += 1
        maxRunning = Math.max(maxRunning, runningNow)
        await new Promise((resolve) => setTimeout(resolve, 10))
        runningNow -= 1
        return passResult(browserKey)
      },
      onLog: () => undefined,
    })

    expect(maxRunning).toBe(1)
  })

  it('fails fast when the transport cannot serve a required protocol', async () => {
    const transport = new FakeTransport([makeSlot('https-1', true)])

    await expect(
      runWithTransport({
        browserKeys: ['SafariHttp'],
        catalog,
        concurrency: 1,
        transport,
        queue: makeQueue(),
        runBrowser: async (browserKey) => passResult(browserKey),
        onLog: () => undefined,
      }),
    ).rejects.toThrow(/no HTTP slots configured/)
  })

  it('rejects unknown browser keys', async () => {
    const transport = new FakeTransport([makeSlot('https-1', true)])

    await expect(
      runWithTransport({
        browserKeys: ['Nope'],
        catalog,
        concurrency: 1,
        transport,
        queue: makeQueue(),
        runBrowser: async (browserKey) => passResult(browserKey),
        onLog: () => undefined,
      }),
    ).rejects.toThrow(/Unknown browser "Nope"/)
  })

  it('stops launching and waits for other active browsers before rejecting', async () => {
    const transport = new FakeTransport([makeSlot('https-1', true), makeSlot('https-2', true)])
    const chrome = deferred<RunResult>()
    const firefox = deferred<RunResult>()
    const failure = new Error('Chrome runner failed')
    const started: string[] = []
    let schedulerSettled = false

    const scheduling = runWithTransport({
      browserKeys: ['ChromeHttps', 'FirefoxHttps', 'ExtraHttps'],
      catalog: { ...catalog, ExtraHttps: { ...(catalog.ChromeHttps as BrowserDef) } },
      concurrency: 2,
      transport,
      queue: makeQueue(),
      runBrowser: (browserKey) => {
        started.push(browserKey)
        return browserKey === 'ChromeHttps' ? chrome.promise : firefox.promise
      },
      onLog: () => undefined,
    })
    const observed = scheduling.then(
      () => undefined,
      (error: unknown) => {
        schedulerSettled = true
        return error
      },
    )

    await vi.waitFor(() => expect(started).toEqual(['ChromeHttps', 'FirefoxHttps']))
    chrome.reject(failure)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(schedulerSettled).toBe(false)
    expect(started).not.toContain('ExtraHttps')

    firefox.resolve(passResult('FirefoxHttps'))
    await expect(observed).resolves.toBe(failure)
    expect(schedulerSettled).toBe(true)
    expect(transport.released.sort()).toEqual(transport.acquired.sort())
  })

  it('interrupts a plan-capacity wait when an active browser fails', async () => {
    const transport = new FakeTransport([makeSlot('https-1', true), makeSlot('https-2', true)])
    const failure = new Error('Chrome runner failed')
    const started: string[] = []
    let waitCalls = 0
    let blockedSignal: AbortSignal | undefined
    const queue = {
      waitForAvailableSlots: async (_requiredSlots: number, options?: { signal?: AbortSignal }) => {
        waitCalls += 1
        if (waitCalls === 1) {
          return 1
        }
        blockedSignal = options?.signal
        return new Promise<number>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
        })
      },
    } as BrowserStackQueue

    await expect(
      runWithTransport({
        browserKeys: ['ChromeHttps', 'FirefoxHttps'],
        catalog,
        concurrency: 2,
        transport,
        queue,
        runBrowser: async (browserKey) => {
          started.push(browserKey)
          throw failure
        },
        onLog: () => undefined,
      }),
    ).rejects.toBe(failure)

    expect(started).toEqual(['ChromeHttps'])
    expect(waitCalls).toBe(2)
    expect(blockedSignal?.aborted).toBe(true)
    expect(transport.released).toEqual(transport.acquired)
  })

  it('stops launching after cancellation and waits for an active browser to settle', async () => {
    const transport = new FakeTransport([makeSlot('https-1', true)])
    const controller = new AbortController()
    const chrome = deferred<RunResult>()
    const cancellation = new Error('Run cancelled')
    const started: string[] = []
    let schedulerSettled = false

    const scheduling = runWithTransport({
      browserKeys: ['ChromeHttps', 'FirefoxHttps'],
      catalog,
      concurrency: 1,
      transport,
      queue: makeQueue(),
      signal: controller.signal,
      runBrowser: (browserKey) => {
        started.push(browserKey)
        return chrome.promise
      },
      onLog: () => undefined,
    })
    const observed = scheduling.then(
      () => undefined,
      (error: unknown) => {
        schedulerSettled = true
        return error
      },
    )

    await vi.waitFor(() => expect(started).toEqual(['ChromeHttps']))
    controller.abort(cancellation)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(schedulerSettled).toBe(false)
    expect(started).not.toContain('FirefoxHttps')

    chrome.resolve(passResult('ChromeHttps'))
    await expect(observed).resolves.toBe(cancellation)
    expect(schedulerSettled).toBe(true)
    expect(transport.released).toEqual(transport.acquired)
  })
})
