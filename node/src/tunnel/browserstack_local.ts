import * as browserStack from 'browserstack-local'
import { promisify } from 'util'

export type BrowserStackLocalOptions = {
  accessKey: string
  localIdentifier?: string
  /** Max attempts to start the tunnel (default: 3) */
  startRetries?: number
  /** Delay between start retries in ms (default: 2000) */
  startRetryDelayMs?: number
  forceLocal?: boolean
  force?: boolean
}

export type BrowserStackLocalHandle = {
  localIdentifier: string
  stop: () => Promise<void>
}

/**
 * Starts a BrowserStack Local tunnel with retries.
 * Prefer owning this from the multi-browser orchestrator so all Vitest children share one identifier.
 */
export async function startBrowserStackLocal(options: BrowserStackLocalOptions): Promise<BrowserStackLocalHandle> {
  const localIdentifier = options.localIdentifier ?? Math.random().toString(36).slice(2)
  const startRetries = options.startRetries ?? 3
  const startRetryDelayMs = options.startRetryDelayMs ?? 2_000
  const bsLocal = new browserStack.Local()

  let lastError: unknown
  for (let attempt = 1; attempt <= startRetries; attempt++) {
    try {
      await promisify(bsLocal.start.bind(bsLocal))({
        key: options.accessKey,
        localIdentifier,
        forceLocal: options.forceLocal ?? true,
        force: options.force ?? true,
      })
      return {
        localIdentifier,
        stop: async () => {
          if (!bsLocal.isRunning()) {
            return
          }
          await promisify(bsLocal.stop.bind(bsLocal))()
        },
      }
    } catch (error) {
      lastError = error
      if (attempt < startRetries) {
        await new Promise((resolve) => setTimeout(resolve, startRetryDelayMs))
      }
    }
  }

  throw new Error(
    `Failed to start BrowserStack Local after ${startRetries} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}
