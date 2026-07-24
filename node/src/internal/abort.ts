export type TimerApi = {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(timer: ReturnType<typeof setTimeout>): void
}

export type AbortableDelayOptions = {
  signal?: AbortSignal
  timers?: TimerApi
}

export const systemTimerApi: TimerApi = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
}

export function createAbortError(message = 'The operation was aborted.'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function abortReason(signal: AbortSignal, fallbackMessage = 'The operation was aborted.'): unknown {
  return signal.reason ?? createAbortError(fallbackMessage)
}

export function abortError(signal: AbortSignal, fallbackMessage = 'The operation was aborted.'): Error {
  const reason = abortReason(signal, fallbackMessage)
  return reason instanceof Error ? reason : createAbortError(String(reason))
}

export function throwIfAborted(signal: AbortSignal | undefined, fallbackMessage?: string): void {
  if (signal?.aborted) {
    throw abortReason(signal, fallbackMessage)
  }
}

export function abortableDelay(delayMs: number, options: AbortableDelayOptions = {}): Promise<void> {
  const { signal, timers = systemTimerApi } = options
  throwIfAborted(signal)

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const settle = () => {
      if (settled) {
        return false
      }
      settled = true
      timers.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      return true
    }
    const onTimer = () => {
      if (settle()) {
        resolve()
      }
    }
    const onAbort = () => {
      if (signal && settle()) {
        reject(abortReason(signal))
      }
    }
    const timer = timers.setTimeout(onTimer, delayMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
    }
  })
}
