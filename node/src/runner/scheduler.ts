import type { BrowserDefinition } from '../core/types.js'
import type { TunnelSlot } from '../transports/types.js'
import { abortableDelay, throwIfAborted } from './processes.js'

export type ScheduledBrowserResult<T> = {
  browserId: string
  result: T
}

export type BrowserScheduleOptions<T> = {
  browserIds: readonly string[]
  browsers: Readonly<Record<string, BrowserDefinition>>
  slots: readonly TunnelSlot[]
  concurrency: number
  queuePollIntervalMs: number
  queueTimeoutMs: number
  signal: AbortSignal
  getAvailableBrowserStackSlots(signal: AbortSignal): Promise<number>
  run(browserId: string, browser: BrowserDefinition, slot: TunnelSlot): Promise<T>
}

export type BrowserScheduleResult<T> = {
  completed: ScheduledBrowserResult<T>[]
  unstarted: string[]
}

export async function scheduleBrowsers<T>(options: BrowserScheduleOptions<T>): Promise<BrowserScheduleResult<T>> {
  const slots = validateSlots(options)
  const queue = [...options.browserIds]
  const freeSlots = [...slots]
  const completed: ScheduledBrowserResult<T>[] = []
  const running = new Map<Promise<void>, TunnelSlot>()
  let rejection: { error: unknown } | undefined
  let launchBudget = 0
  let shouldRefreshCapacity = true

  try {
    while ((queue.length > 0 || running.size > 0) && !options.signal.aborted) {
      while (
        queue.length > 0 &&
        running.size < options.concurrency &&
        !options.signal.aborted &&
        rejection === undefined
      ) {
        const match = findCompatiblePair(queue, freeSlots, options.browsers)
        if (!match) {
          break
        }
        if (launchBudget <= 0) {
          if (!shouldRefreshCapacity) {
            break
          }
          launchBudget = await waitForCapacity(options, Date.now() + options.queueTimeoutMs)
          shouldRefreshCapacity = false
          if (options.signal.aborted) {
            break
          }
        }
        if (launchBudget <= 0 || options.signal.aborted) {
          break
        }

        const [browserId] = queue.splice(match.browserIndex, 1)
        const [slot] = freeSlots.splice(match.slotIndex, 1)
        if (browserId === undefined || slot === undefined) {
          throw new Error('Broyster scheduler lost a browser or transport slot.')
        }
        const browser = Object.hasOwn(options.browsers, browserId) ? options.browsers[browserId] : undefined
        if (!browser) {
          throw new Error(`Unknown browser "${browserId}".`)
        }

        launchBudget -= 1
        const tracked = Promise.resolve()
          .then(() => options.run(browserId, browser, slot))
          .then((result) => {
            completed.push({ browserId, result })
          })
          .catch((error: unknown) => {
            rejection ??= { error }
          })
          .finally(() => {
            freeSlots.push(slot)
            running.delete(tracked)
          })
        running.set(tracked, slot)
      }

      if (running.size > 0) {
        if (rejection) {
          await Promise.all(running.keys())
        } else {
          await Promise.race(running.keys())
        }
        launchBudget = 0
        shouldRefreshCapacity = true
      } else if (rejection) {
        break
      } else if (queue.length > 0 && !options.signal.aborted) {
        throw new Error(`No compatible transport slot is available for: ${queue.join(', ')}.`)
      }
    }
  } catch (error) {
    if (!options.signal.aborted) {
      rejection ??= { error }
    }
  }

  await Promise.allSettled(running.keys())
  if (rejection) {
    throw rejection.error
  }
  return { completed, unstarted: queue }
}

async function waitForCapacity<T>(options: BrowserScheduleOptions<T>, deadline: number): Promise<number> {
  let lastError: unknown
  while (Date.now() <= deadline) {
    throwIfAborted(options.signal)
    try {
      const remainingMs = Math.max(1, deadline - Date.now())
      const requestSignal = AbortSignal.any([options.signal, AbortSignal.timeout(remainingMs)])
      const available = await settleWithSignal(
        Promise.resolve().then(() => options.getAvailableBrowserStackSlots(requestSignal)),
        requestSignal,
      )
      throwIfAborted(options.signal)
      if (available > 0) {
        return available
      }
      lastError = undefined
    } catch (error) {
      throwIfAborted(options.signal)
      lastError = error
    }
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }
    await abortableDelay(Math.min(options.queuePollIntervalMs, remainingMs), options.signal)
  }

  const suffix = lastError instanceof Error ? ` Last API error: ${lastError.message}` : ''
  throw new Error(`Timed out waiting for BrowserStack capacity after ${options.queueTimeoutMs}ms.${suffix}`)
}

function settleWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('The BrowserStack capacity request was cancelled.'))
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(signal.reason ?? new Error('The capacity request timed out.')))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

function findCompatiblePair(
  browserIds: readonly string[],
  slots: readonly TunnelSlot[],
  browsers: Readonly<Record<string, BrowserDefinition>>,
): { browserIndex: number; slotIndex: number } | undefined {
  for (let browserIndex = 0; browserIndex < browserIds.length; browserIndex += 1) {
    const browserId = browserIds[browserIndex] ?? ''
    const browser = Object.hasOwn(browsers, browserId) ? browsers[browserId] : undefined
    if (!browser) {
      continue
    }
    const slotIndex = slots.findIndex((slot) => slot.protocol === browser.protocol)
    if (slotIndex >= 0) {
      return { browserIndex, slotIndex }
    }
  }
  return undefined
}

function validateSlots<T>(options: BrowserScheduleOptions<T>): readonly TunnelSlot[] {
  if (options.slots.length === 0) {
    throw new Error('The browser transport returned no slots.')
  }
  const ids = new Set<string>()
  const ports = new Set<number>()
  const publicUrls = new Set<string>()
  const slots = options.slots.map((slot, index): TunnelSlot => {
    if (!slot || typeof slot.id !== 'string' || slot.id.trim() === '') {
      throw new Error(`Transport slot at index ${index} must have a non-empty ID.`)
    }
    const id = slot.id.trim()
    if (ids.has(id)) {
      throw new Error(`Duplicate transport slot ID "${id}".`)
    }
    if (slot.protocol !== 'http' && slot.protocol !== 'https') {
      throw new Error(`Transport slot "${id}" must use protocol "http" or "https".`)
    }
    if (!Number.isSafeInteger(slot.localPort) || slot.localPort < 1 || slot.localPort > 65_535) {
      throw new Error(`Transport slot "${id}" must use a local port between 1 and 65535.`)
    }
    if (ports.has(slot.localPort)) {
      throw new Error(`Duplicate transport local port ${slot.localPort}.`)
    }
    if (typeof slot.publicUrl !== 'string') {
      throw new Error(`Transport slot "${id}" must have an HTTP(S) public URL.`)
    }
    let publicUrl: URL
    try {
      publicUrl = new URL(slot.publicUrl)
    } catch {
      throw new Error(`Transport slot "${id}" must have a valid absolute public URL.`)
    }
    if (publicUrl.protocol !== 'http:' && publicUrl.protocol !== 'https:') {
      throw new Error(`Transport slot "${id}" public URL must use HTTP or HTTPS.`)
    }
    if (publicUrl.protocol !== `${slot.protocol}:`) {
      throw new Error(`Transport slot "${id}" protocol must match its public URL.`)
    }
    if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
      throw new Error(
        `Transport slot "${id}" public URL must not include credentials, query parameters, or a fragment.`,
      )
    }
    if (publicUrls.has(publicUrl.href)) {
      throw new Error(`Duplicate transport public URL "${publicUrl.href}".`)
    }
    ids.add(id)
    ports.add(slot.localPort)
    publicUrls.add(publicUrl.href)
    return Object.freeze({ id, publicUrl: publicUrl.href, localPort: slot.localPort, protocol: slot.protocol })
  })

  for (const browserId of options.browserIds) {
    const browser = Object.hasOwn(options.browsers, browserId) ? options.browsers[browserId] : undefined
    if (!browser) {
      throw new Error(`Unknown browser "${browserId}".`)
    }
    if (!slots.some((slot) => slot.protocol === browser.protocol)) {
      throw new Error(`No ${browser.protocol.toUpperCase()} transport slot is available for "${browserId}".`)
    }
  }
  return Object.freeze(slots)
}
