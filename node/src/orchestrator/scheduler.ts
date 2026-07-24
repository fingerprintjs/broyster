import type { BrowserDef } from '../browsers.js'
import { abortReason } from '../internal/abort.js'
import type { BrowserStackQueue } from '../queue.js'
import type { Transport, TransportSlot } from '../transports/transport.js'
import type { RunResult } from './results.js'

export type SchedulerOptions = {
  browserKeys: string[]
  catalog: Record<string, BrowserDef>
  concurrency: number
  transport: Transport
  queue: BrowserStackQueue
  /** Runs all attempts for one browser on the given slot and returns the final result */
  runBrowser: (browserKey: string, slot: TransportSlot) => Promise<RunResult>
  onLog: (line: string) => void
  /** Stops launching new browsers when aborted; already-running browsers are allowed to settle */
  signal?: AbortSignal
}

/**
 * Runs browsers concurrently, pairing each with a compatible transport slot
 * and respecting both the concurrency limit and the BrowserStack plan's free
 * parallel-session budget.
 */
export async function runWithTransport(options: SchedulerOptions): Promise<RunResult[]> {
  const { catalog, concurrency, transport, queue: browserStackQueue, onLog } = options
  const results: RunResult[] = []
  const queue = [...options.browserKeys]
  const running = new Map<Promise<void>, TransportSlot>()
  let rejection: { error: unknown } | undefined
  let launchBudget = 0

  for (const key of queue) {
    const browser = getBrowserOrThrow(catalog, key)
    if (!transport.supports({ useHttps: browser.useHttps })) {
      throw new Error(
        `The "${transport.name}" transport has no ${browser.useHttps ? 'HTTPS' : 'HTTP'} slots configured ` +
          `for browser "${key}".`,
      )
    }
  }

  const launchController = new AbortController()
  const abortLaunches = () => launchController.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortLaunches, { once: true })
  if (options.signal?.aborted) {
    abortLaunches()
  }

  try {
    while (queue.length > 0 || running.size > 0) {
      while (running.size < concurrency && queue.length > 0 && rejection === undefined && !options.signal?.aborted) {
        if (launchBudget <= 0) {
          const desiredLaunches = Math.min(concurrency - running.size, queue.length)
          const availableSlots = await browserStackQueue.waitForAvailableSlots(1, {
            signal: launchController.signal,
          })
          launchBudget = Math.min(availableSlots, desiredLaunches)
          if (rejection || options.signal?.aborted) {
            break
          }
        }

        const launch = await acquireNextLaunch(queue, catalog, transport)
        if (!launch) {
          break
        }

        const { key, slot } = launch
        if (rejection || options.signal?.aborted) {
          transport.releaseSlot(slot)
          break
        }

        launchBudget -= 1
        const tracked = Promise.resolve()
          .then(() => {
            onLog(`  Starting: ${key} (slot ${slot.id} -> port ${slot.localPort})`)
            return options.runBrowser(key, slot)
          })
          .then((result) => {
            results.push(result)
          })
          .catch((error: unknown) => {
            if (!options.signal?.aborted) {
              rejection ??= { error }
              launchController.abort(error)
            }
          })
          .finally(() => {
            try {
              transport.releaseSlot(slot)
            } catch (error) {
              rejection ??= { error }
              launchController.abort(error)
            }
            running.delete(tracked)
          })
        running.set(tracked, slot)
      }

      if (running.size > 0) {
        if (rejection || options.signal?.aborted) {
          await Promise.all(running.keys())
        } else {
          await Promise.race(running.keys())
        }
      } else if (rejection || options.signal?.aborted) {
        break
      } else if (queue.length > 0) {
        throw new Error(
          `No compatible "${transport.name}" slot is available for remaining browsers: ${queue.join(', ')}`,
        )
      }
    }
  } catch (error) {
    rejection ??= { error }
  } finally {
    options.signal?.removeEventListener('abort', abortLaunches)
  }

  await Promise.allSettled(running.keys())
  if (rejection) {
    throw rejection.error
  }
  if (options.signal?.aborted) {
    throw abortReason(options.signal, 'Browser scheduling was cancelled.')
  }
  return results
}

async function acquireNextLaunch(
  queue: string[],
  catalog: Record<string, BrowserDef>,
  transport: Transport,
): Promise<{ key: string; slot: TransportSlot } | undefined> {
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index] as string
    const browser = getBrowserOrThrow(catalog, key)
    const slot = await transport.acquireSlot({
      useHttps: browser.useHttps,
      browserKey: key,
      browserName: browser.browserName,
      platform: browser.platform,
    })
    if (slot) {
      queue.splice(index, 1)
      return { key, slot }
    }
  }
  return undefined
}

function getBrowserOrThrow(catalog: Record<string, BrowserDef>, browserKey: string): BrowserDef {
  const browser = catalog[browserKey]
  if (!browser) {
    throw new Error(`Unknown browser "${browserKey}". Available: ${Object.keys(catalog).join(', ')}`)
  }
  return browser
}
