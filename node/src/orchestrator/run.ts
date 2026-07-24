import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

import { browserstackBrowsers, type BrowserDef } from '../browsers.js'
import { getBrowserStackCredentials, type BrowserStackCredentials } from '../credentials.js'
import { throwIfAborted } from '../internal/abort.js'
import { errorMessage } from '../internal/errors.js'
import { isPositiveInteger } from '../internal/validation.js'
import { BrowserStackQueue } from '../queue.js'
import type { Transport, TransportSlot } from '../transports/transport.js'
import { runChildAttempt, type ChildAttemptRunner } from './child.js'
import type { RunResult, RunSummary } from './results.js'
import { createRunSummary, formatRunResult, writeRunSummary } from './results.js'
import { runWithTransport } from './scheduler.js'

export type RunOptions = {
  /** Path to the consumer's Vitest config that calls createBrowserStackConfig, resolved against cwd */
  configPath: string
  transport: Transport
  /** Catalog keys to run (default: all keys in the catalog) */
  browsers?: string[]
  /** Case-insensitive regex applied to catalog keys; ignored when `browsers` is set */
  filter?: string | RegExp
  /** Authoritative browser catalog; the selected definition is serialized to each child. */
  catalog?: Record<string, BrowserDef>
  /** Maximum browsers running at once (default: 5) */
  concurrency?: number
  /** BrowserStack build name (default: broyster-<GITHUB_RUN_ID or timestamp>) */
  buildName?: string
  credentials?: BrowserStackCredentials
  /** Retry failed test files (or the whole browser when unknown) once (default: true) */
  retryFailed?: boolean
  /** Directory the consumer project lives in; vitest is resolved from here (default: process.cwd()) */
  cwd?: string
  /** Extra environment variables for the child Vitest processes */
  env?: Record<string, string>
  /** Write the versioned, deterministic JSON result artifact to this cwd-relative path. */
  resultsFile?: string
  /** Cancels queue waits, stops new launches, and terminates active Vitest children. */
  signal?: AbortSignal
  debug?: boolean
  onLog?: (line: string) => void
  /** Test seam: replaces the child-process spawner */
  attemptRunner?: ChildAttemptRunner
}

/** Typed, reusable programmatic configuration without the internal attempt-runner test seam. */
export type BroysterConfig = Omit<RunOptions, 'attemptRunner'>

export function defineBroysterConfig<const Config extends BroysterConfig>(config: Config): Config {
  return config
}

/**
 * Runs the selected browsers on BrowserStack, one Vitest child process per
 * browser, routed through the given transport. Does not call process.exit —
 * inspect the returned summary's `ok` flag.
 */
export async function runBrowserStackTests(options: RunOptions): Promise<RunSummary> {
  // eslint-disable-next-line no-console
  const onLog = options.onLog ?? ((line: string) => console.log(line))
  const catalog = options.catalog ?? browserstackBrowsers
  const concurrency = options.concurrency ?? 5
  const retryFailed = options.retryFailed ?? true
  const cwd = resolve(options.cwd ?? process.cwd())
  const buildName = options.buildName || `broyster-${process.env.GITHUB_RUN_ID || Date.now()}`
  const transport = options.transport

  if (!isPositiveInteger(concurrency)) {
    throw new Error(`Invalid concurrency "${concurrency}". Expected a positive integer.`)
  }

  const browserKeys = selectBrowserKeys(catalog, options.browsers, options.filter)
  const credentials = options.credentials ?? getBrowserStackCredentials()
  const browserStackQueue = new BrowserStackQueue(credentials)
  const attemptRunner = options.attemptRunner ?? runChildAttempt
  const configPath = resolve(cwd, options.configPath)
  const resultsFile = options.resultsFile ? resolve(cwd, options.resultsFile) : undefined
  const vitestCliPath = options.attemptRunner ? '' : resolveVitestCliPath(cwd)

  const runBrowser = async (browserKey: string, slot: TransportSlot): Promise<RunResult> => {
    const browser = catalog[browserKey]
    if (!browser) {
      throw new Error(`Unknown browser "${browserKey}".`)
    }
    const attemptOptions = {
      browserKey,
      browser,
      slot,
      transport,
      buildName,
      configPath,
      vitestCliPath,
      cwd,
      credentials,
      env: options.env,
      signal: options.signal,
      debug: options.debug,
      onLog,
    }

    const initialAttempt = await attemptRunner({ ...attemptOptions, attempt: 'initial' })
    throwIfAborted(options.signal)
    if (initialAttempt.exitCode === 0) {
      return {
        browser: browserKey,
        status: 'PASS',
        exitCode: initialAttempt.exitCode,
        duration: initialAttempt.duration,
        attempts: [initialAttempt],
      }
    }

    if (!retryFailed) {
      return {
        browser: browserKey,
        status: 'FAIL',
        exitCode: initialAttempt.exitCode,
        duration: initialAttempt.duration,
        attempts: [initialAttempt],
      }
    }

    const retryScope = initialAttempt.failedModuleIds.length === 0 ? 'browser' : 'files'
    if (retryScope === 'browser') {
      onLog(`  [${browserKey}] No failed files were reported; retrying full browser run.`)
    } else {
      onLog(`  Retrying failed files: ${browserKey} (${initialAttempt.failedModuleIds.length} failed file(s))`)
    }

    await browserStackQueue.waitForAvailableSlots(1, { signal: options.signal })
    throwIfAborted(options.signal)
    const retryAttempt = await attemptRunner({
      ...attemptOptions,
      attempt: 'retry',
      ...(retryScope === 'files' && { filePaths: initialAttempt.failedModuleIds }),
    })
    throwIfAborted(options.signal)

    return {
      browser: browserKey,
      status: retryAttempt.exitCode === 0 ? 'FLAKY' : 'FAIL',
      exitCode: retryAttempt.exitCode,
      duration: initialAttempt.duration + retryAttempt.duration,
      attempts: [initialAttempt, retryAttempt],
      retryScope,
    }
  }

  onLog('')
  onLog(`  Browsers (${browserKeys.length}): ${browserKeys.join(', ')}`)
  onLog(`  Concurrency: ${concurrency}`)
  onLog(`  Transport: ${transport.name}`)
  onLog(`  Build: ${buildName}`)
  onLog('')

  const startTime = Date.now()
  let results: RunResult[]
  throwIfAborted(options.signal)
  let transportClosePromise: Promise<void> | undefined
  const closeTransport = () => {
    transportClosePromise ??= Promise.resolve().then(() => transport.close())
    return transportClosePromise
  }
  const closeOnAbort = () => {
    void closeTransport().catch((error) =>
      onLog(`Failed to stop ${transport.name} transport after cancellation: ${error}`),
    )
  }
  options.signal?.addEventListener('abort', closeOnAbort, { once: true })
  try {
    try {
      await transport.open()
    } catch (error) {
      throwIfAborted(options.signal)
      throw error
    }
    options.signal?.removeEventListener('abort', closeOnAbort)
    throwIfAborted(options.signal)
    results = await runWithTransport({
      browserKeys,
      catalog,
      concurrency,
      transport,
      queue: browserStackQueue,
      runBrowser: async (browserKey, slot) => {
        const result = await runBrowser(browserKey, slot)
        onLog(formatRunResult(result))
        return result
      },
      onLog,
      signal: options.signal,
    })
  } finally {
    options.signal?.removeEventListener('abort', closeOnAbort)
    onLog(`Stopping ${transport.name} transport...`)
    await closeTransport()
  }

  const summary = createRunSummary(results, Date.now() - startTime)
  if (resultsFile) {
    await writeRunSummary(resultsFile, summary)
  }
  return summary
}

function selectBrowserKeys(
  catalog: Record<string, BrowserDef>,
  browsers: string[] | undefined,
  filter: string | RegExp | undefined,
): string[] {
  let browserKeys = Object.keys(catalog)

  if (browsers) {
    const unknownBrowsers = browsers.filter((browser) => !catalog[browser])
    if (unknownBrowsers.length > 0) {
      throw new Error(`Unknown browsers: ${unknownBrowsers.join(', ')}. Available: ${browserKeys.join(', ')}`)
    }
    browserKeys = browsers
  } else if (filter) {
    let re: RegExp
    try {
      re = typeof filter === 'string' ? new RegExp(filter, 'i') : filter
    } catch (error) {
      throw new Error(`Invalid filter regex "${filter}": ${errorMessage(error)}`)
    }
    browserKeys = browserKeys.filter((key) => {
      re.lastIndex = 0
      return re.test(key)
    })
  }

  if (browserKeys.length === 0) {
    throw new Error(`No browsers matched. Available: ${Object.keys(catalog).join(', ')}`)
  }

  return browserKeys
}

function resolveVitestCliPath(cwd: string): string {
  const require = createRequire(join(cwd, 'package.json'))
  let vitestPackageJsonPath: string
  try {
    vitestPackageJsonPath = require.resolve('vitest/package.json')
  } catch {
    throw new Error(`Could not resolve "vitest" from ${cwd}. Install vitest in the project that runs broyster.`)
  }
  return join(dirname(vitestPackageJsonPath), 'vitest.mjs')
}
