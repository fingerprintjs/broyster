import type { BrowserDef } from '../browsers.js'
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

  while (queue.length > 0 || running.size > 0) {
    while (running.size < concurrency && queue.length > 0) {
      if (launchBudget <= 0) {
        const desiredLaunches = Math.min(concurrency - running.size, queue.length)
        const availableSlots = await browserStackQueue.waitForAvailableSlots(1)
        launchBudget = Math.min(availableSlots, desiredLaunches)
      }

      const launch = await acquireNextLaunch(queue, catalog, transport)
      if (!launch) {
        break
      }

      const { key, slot } = launch
      launchBudget -= 1
      const promise = (async () => {
        onLog(`  Starting: ${key} (slot ${slot.id} -> port ${slot.localPort})`)
        const result = await options.runBrowser(key, slot)
        results.push(result)
      })()

      const tracked = promise.finally(() => {
        transport.releaseSlot(slot)
        running.delete(tracked)
      })
      running.set(tracked, slot)
    }

    if (running.size > 0) {
      await Promise.race(running.keys())
    } else if (queue.length > 0) {
      throw new Error(`No compatible "${transport.name}" slot is available for remaining browsers: ${queue.join(', ')}`)
    }
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
