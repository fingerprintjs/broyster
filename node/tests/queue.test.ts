import { describe, expect, it, vi } from 'vitest'

import { BrowserStackQueue } from '../src/queue.js'

describe('BrowserStackQueue cancellation', () => {
  it('aborts while waiting between capacity polls', async () => {
    const getPlan = vi.fn(async () => ({
      parallelSessionsMaxAllowed: 1,
      parallelSessionsRunning: 1,
    }))
    const queue = new BrowserStackQueue({ username: 'user', accessKey: 'key' }, {
      getPlan,
      setSessionStatus: vi.fn(),
    } as never)
    const controller = new AbortController()
    const reason = new Error('cancelled by caller')

    const waiting = queue.waitForAvailableSlots(1, {
      pollInterval: 60_000,
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(getPlan).toHaveBeenCalledOnce())
    controller.abort(reason)

    await expect(waiting).rejects.toBe(reason)
    expect(getPlan).toHaveBeenCalledOnce()
  })

  it('passes the signal to the BrowserStack plan request', async () => {
    const getPlan = vi.fn(async () => ({
      parallelSessionsMaxAllowed: 2,
      parallelSessionsRunning: 0,
    }))
    const queue = new BrowserStackQueue({ username: 'user', accessKey: 'key' }, {
      getPlan,
      setSessionStatus: vi.fn(),
    } as never)
    const controller = new AbortController()

    await expect(queue.waitForAvailableSlots(1, { signal: controller.signal })).resolves.toBe(2)
    expect(getPlan).toHaveBeenCalledWith(controller.signal)
  })
})
