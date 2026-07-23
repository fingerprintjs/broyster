import { describe, expect, it, vi } from 'vitest'

import { abortableDelay, throwIfAborted } from '../../src/runner/processes.js'

describe('runner cancellation utilities', () => {
  it('rejects an in-flight delay with the abort reason', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new Error('stop this run')
    const waiting = abortableDelay(60_000, controller.signal)

    controller.abort(reason)

    await expect(waiting).rejects.toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('fails immediately for an already-aborted signal', async () => {
    const controller = new AbortController()
    const reason = new Error('already stopped')
    controller.abort(reason)

    expect(() => throwIfAborted(controller.signal)).toThrow(reason)
    await expect(abortableDelay(1, controller.signal)).rejects.toBe(reason)
  })
})
