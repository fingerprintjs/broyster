/* eslint-disable no-console */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { readFile, unlink, writeFile } from 'fs/promises'
import * as net from 'net'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import type { BrowserDef } from '../browsers'
import { browserstackBrowsers, filterBetaBrowsers } from '../browsers'
import { getCredentials } from '../credentials'
import { BrowserStackQueue } from '../queue'
import { startBrowserStackLocal, type BrowserStackLocalHandle } from '../tunnel/browserstack_local'

export type RunStatus = 'PASS' | 'FLAKY' | 'FAIL'
export type RunAttemptName = 'initial' | 'retry'
export type RetryScope = 'files' | 'browser'

export type RunAttemptResult = {
  browser: string
  attempt: RunAttemptName
  exitCode: number | null
  duration: number
  failedModuleIds: string[]
}

export type RunResult = {
  browser: string
  status: RunStatus
  exitCode: number | null
  duration: number
  attempts: RunAttemptResult[]
  retryScope?: RetryScope
}

export type PublicUrlSlot = {
  /** Public hostname (or full origin without path), e.g. bs-slot-https-1.example.com */
  hostname: string
  /** Local Vitest browser API port this slot maps to */
  port: number
  useHttps: boolean
}

export type RunSuiteOptions = {
  /** Absolute or cwd-relative path to the consumer vitest config */
  configPath: string
  /** Working directory for vitest child processes (default: process.cwd()) */
  cwd?: string
  /** Browser keys to run; default all keys in `browsers` */
  browsers?: string[] | 'all' | 'beta'
  /** Case-insensitive filter applied to browser keys */
  filter?: string
  /** Max concurrent browser processes (default: 5) */
  concurrency?: number
  /** BrowserStack build name */
  buildName?: string
  /** Browser matrix (default: built-in Fingerprint matrix) */
  browserMatrix?: Record<string, BrowserDef>
  /**
   * Tunnel mode:
   * - `browserstack-local` (default): start Local once, share BS_LOCAL_IDENTIFIER
   * - `public-url`: consumer-managed tunnel; requires `publicUrlSlots`
   * - `none`: no tunnel helpers (sessions must reach the Vitest server another way)
   */
  tunnel?: 'browserstack-local' | 'public-url' | 'none'
  /** Required when tunnel is `public-url` */
  publicUrlSlots?: PublicUrlSlot[]
  /** Retry failed files once (default: true) */
  retryFailedFiles?: boolean
  /** Fall back to full browser retry when no failed files were reported (default: true) */
  retryBrowserOnMissingFiles?: boolean
  /** Write combined results JSON here */
  resultsPath?: string
  /** Enable vitest:browser:browserstack debug logs in children */
  debug?: boolean
  /** Path to vitest CLI (default: resolved from cwd node_modules) */
  vitestPath?: string
}

type FailedFilesReport = {
  failedModuleIds?: unknown
}

type RunBrowserOptions = {
  apiPort?: number
  publicBaseUrl?: string
  browserStackQueue: BrowserStackQueue
  localIdentifier?: string
  queueManagedExternally: boolean
}

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function formatExitCode(exitCode: number | null): string {
  return exitCode === null ? 'null' : String(exitCode)
}

function formatRetryScope(scope: RetryScope | undefined): string {
  switch (scope) {
    case 'files':
      return 'file-level retry'
    case 'browser':
      return 'browser-level retry'
    default:
      return 'retry'
  }
}

function makeTempFilePath(prefix: string, browserKey: string, attempt: RunAttemptName, extension: string): string {
  const safeBrowserKey = browserKey.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${safeBrowserKey}-${attempt}.${extension}`)
}

async function readFailedModuleIds(reportPath: string, browserKey: string, attempt: RunAttemptName): Promise<string[]> {
  let rawReport: string
  try {
    rawReport = await readFile(reportPath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn(`  [${browserKey}] Failed to read ${attempt} failed-files report: ${String(error)}`)
    }
    return []
  }

  try {
    const report = JSON.parse(rawReport) as FailedFilesReport
    if (!Array.isArray(report.failedModuleIds)) {
      return []
    }
    return uniqueSorted(report.failedModuleIds.filter((id): id is string => typeof id === 'string'))
  } catch (error) {
    console.warn(`  [${browserKey}] Failed to parse ${attempt} failed-files report: ${String(error)}`)
    return []
  }
}

function resolveBrowserKeys(options: RunSuiteOptions, matrix: Record<string, BrowserDef>): string[] {
  let keys: string[]
  if (!options.browsers || options.browsers === 'all') {
    keys = Object.keys(matrix)
  } else if (options.browsers === 'beta') {
    keys = Object.keys(filterBetaBrowsers(matrix))
  } else {
    keys = options.browsers
  }

  if (options.filter) {
    const re = new RegExp(options.filter, 'i')
    keys = keys.filter((k) => re.test(k))
  }

  const unknown = keys.filter((k) => !matrix[k])
  if (unknown.length > 0) {
    throw new Error(`Unknown browsers: ${unknown.join(', ')}. Available: ${Object.keys(matrix).join(', ')}`)
  }

  if (keys.length === 0) {
    throw new Error(`No browsers matched. Available: ${Object.keys(matrix).join(', ')}`)
  }

  return keys
}

function allocateFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to allocate a free TCP port for Vitest browser API'))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolvePort(port)
      })
    })
  })
}

function resolveVitestPath(cwd: string, explicit?: string): string {
  if (explicit) {
    return resolve(cwd, explicit)
  }

  // Yarn/npm workspaces often hoist vitest to a parent node_modules.
  let dir = resolve(cwd)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, 'node_modules', 'vitest', 'vitest.mjs')
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = resolve(dir, '..')
    if (parent === dir) {
      break
    }
    dir = parent
  }

  throw new Error(
    `Could not find vitest CLI (vitest.mjs) from "${cwd}". ` +
      'Install vitest in the project, or pass vitestPath explicitly.',
  )
}

async function runBrowserAttempt(
  browserKey: string,
  options: RunBrowserOptions & {
    attempt: RunAttemptName
    filePaths?: string[]
    configPath: string
    cwd: string
    vitestPath: string
    buildName: string
    debug?: boolean
  },
): Promise<RunAttemptResult> {
  const start = Date.now()
  const failedFilesReportPath = makeTempFilePath('broyster-failed-files', browserKey, options.attempt, 'json')
  const tunnelReadyFile = options.publicBaseUrl
    ? makeTempFilePath('broyster-tunnel-ready', browserKey, options.attempt, 'ready')
    : undefined
  // Unique port per process avoids Vitest default-port races under concurrency.
  const apiPort = options.apiPort ?? (await allocateFreePort())

  return new Promise<RunAttemptResult>((resolvePromise) => {
    let settled = false
    const finish = (exitCode: number | null) => {
      if (settled) {
        return
      }
      settled = true
      void (async () => {
        const failedModuleIds = await readFailedModuleIds(failedFilesReportPath, browserKey, options.attempt)
        await unlink(failedFilesReportPath).catch(() => undefined)
        if (tunnelReadyFile) {
          await unlink(tunnelReadyFile).catch(() => undefined)
        }
        resolvePromise({
          browser: browserKey,
          attempt: options.attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds,
        })
      })().catch(() => {
        resolvePromise({
          browser: browserKey,
          attempt: options.attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds: [],
        })
      })
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BS_BROWSER: browserKey,
      BS_BUILD_NAME: options.buildName,
      BS_FAILED_FILES_OUT: failedFilesReportPath,
      BS_RUN_ATTEMPT: options.attempt,
      BROYSTER_PRESET: 'browserstack',
      BS_API_PORT: String(apiPort),
      ...(options.queueManagedExternally && { BS_QUEUE_MANAGED_EXTERNALLY: '1' }),
      ...(options.localIdentifier && { BS_LOCAL_IDENTIFIER: options.localIdentifier }),
      ...(options.publicBaseUrl && { BS_PUBLIC_BASE_URL: options.publicBaseUrl }),
      ...(tunnelReadyFile && { BS_TUNNEL_READY_FILE: tunnelReadyFile }),
      ...(options.debug && { DEBUG: 'vitest:browser:browserstack' }),
    }

    const vitestArgs = [options.vitestPath, 'run', '--config', options.configPath, ...(options.filePaths ?? [])]
    const child = spawn(process.execPath, vitestArgs, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // For public-url mode the consumer tunnel is already up; mark ready immediately.
    // (Cloudflare slot routing that waits on the local port stays in the consumer.)
    if (tunnelReadyFile) {
      void writeFile(tunnelReadyFile, '').catch((error) => {
        console.error(`  [${browserKey}] Failed to write tunnel ready file: ${error}`)
        child.kill('SIGTERM')
      })
    }

    const prefix = options.attempt === 'retry' ? `[${browserKey} retry]` : `[${browserKey}]`
    child.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) {
          console.log(`  ${prefix} ${line}`)
        }
      }
    })
    child.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) {
          console.error(`  ${prefix} ${line}`)
        }
      }
    })
    child.on('error', (error) => {
      console.error(`  [${browserKey}] Failed to start Vitest: ${error.message}`)
      finish(1)
    })
    child.on('close', (code) => finish(code))
  })
}

async function runBrowser(
  browserKey: string,
  options: RunBrowserOptions & {
    configPath: string
    cwd: string
    vitestPath: string
    buildName: string
    debug?: boolean
    retryFailedFiles: boolean
    retryBrowserOnMissingFiles: boolean
  },
): Promise<RunResult> {
  const base = {
    ...options,
    configPath: options.configPath,
    cwd: options.cwd,
    vitestPath: options.vitestPath,
    buildName: options.buildName,
    debug: options.debug,
  }

  const initialAttempt = await runBrowserAttempt(browserKey, { ...base, attempt: 'initial' })

  if (initialAttempt.exitCode === 0) {
    return {
      browser: browserKey,
      status: 'PASS',
      exitCode: 0,
      duration: initialAttempt.duration,
      attempts: [initialAttempt],
    }
  }

  if (!options.retryFailedFiles && !options.retryBrowserOnMissingFiles) {
    return {
      browser: browserKey,
      status: 'FAIL',
      exitCode: initialAttempt.exitCode,
      duration: initialAttempt.duration,
      attempts: [initialAttempt],
    }
  }

  if (initialAttempt.failedModuleIds.length === 0) {
    if (!options.retryBrowserOnMissingFiles) {
      return {
        browser: browserKey,
        status: 'FAIL',
        exitCode: initialAttempt.exitCode,
        duration: initialAttempt.duration,
        attempts: [initialAttempt],
      }
    }
    console.log(`  [${browserKey}] No failed files reported; retrying full browser run.`)
    await options.browserStackQueue.waitForAvailableSlots(1)
    const retryAttempt = await runBrowserAttempt(browserKey, { ...base, attempt: 'retry' })
    return {
      browser: browserKey,
      status: retryAttempt.exitCode === 0 ? 'FLAKY' : 'FAIL',
      exitCode: retryAttempt.exitCode,
      duration: initialAttempt.duration + retryAttempt.duration,
      attempts: [initialAttempt, retryAttempt],
      retryScope: 'browser',
    }
  }

  if (!options.retryFailedFiles) {
    return {
      browser: browserKey,
      status: 'FAIL',
      exitCode: initialAttempt.exitCode,
      duration: initialAttempt.duration,
      attempts: [initialAttempt],
    }
  }

  console.log(`  Retrying failed files: ${browserKey} (${initialAttempt.failedModuleIds.length} failed file(s))`)
  await options.browserStackQueue.waitForAvailableSlots(1)
  const retryAttempt = await runBrowserAttempt(browserKey, {
    ...base,
    attempt: 'retry',
    filePaths: initialAttempt.failedModuleIds,
  })

  return {
    browser: browserKey,
    status: retryAttempt.exitCode === 0 ? 'FLAKY' : 'FAIL',
    exitCode: retryAttempt.exitCode,
    duration: initialAttempt.duration + retryAttempt.duration,
    attempts: [initialAttempt, retryAttempt],
    retryScope: 'files',
  }
}

function logRunResult(result: RunResult): void {
  const seconds = (result.duration / 1000).toFixed(1)
  const initialAttempt = result.attempts[0]
  const finalAttempt = result.attempts[result.attempts.length - 1]
  const retryDetail =
    result.attempts.length > 1
      ? `, ${formatRetryScope(result.retryScope)} exit ${formatExitCode(finalAttempt.exitCode)}`
      : ''

  console.log(
    `  ${result.status}: ${result.browser} (${seconds}s, initial exit ${formatExitCode(
      initialAttempt.exitCode,
    )}${retryDetail})`,
  )
}

async function runWithConcurrency(
  keys: string[],
  maxConcurrent: number,
  matrix: Record<string, BrowserDef>,
  browserStackQueue: BrowserStackQueue,
  runOptions: Omit<Parameters<typeof runBrowser>[1], 'apiPort' | 'publicBaseUrl' | 'browserStackQueue'>,
  publicUrlSlots?: PublicUrlSlot[],
): Promise<RunResult[]> {
  const results: RunResult[] = []
  const queue = [...keys]
  const freeSlots = publicUrlSlots ? [...publicUrlSlots] : null
  const running = new Set<Promise<void>>()
  let launchBudget = 0

  while (queue.length > 0 || running.size > 0) {
    while (running.size < maxConcurrent && queue.length > 0) {
      if (launchBudget <= 0) {
        const desired = Math.min(
          maxConcurrent - running.size,
          queue.length,
          freeSlots ? freeSlots.length : queue.length,
        )
        if (desired <= 0) {
          break
        }
        const availableSlots = await browserStackQueue.waitForAvailableSlots(1)
        launchBudget = Math.min(availableSlots, desired)
      }

      let key: string | undefined
      let slot: PublicUrlSlot | undefined

      if (freeSlots) {
        const nextIndex = queue.findIndex((k) => {
          const browser = matrix[k]
          return browser !== undefined && freeSlots.some((s) => s.useHttps === browser.useHttps)
        })
        if (nextIndex === -1) {
          break
        }
        key = queue.splice(nextIndex, 1)[0]
        const browser = matrix[key]
        const slotIndex = freeSlots.findIndex((s) => s.useHttps === browser.useHttps)
        if (slotIndex === -1) {
          queue.unshift(key)
          break
        }
        slot = freeSlots.splice(slotIndex, 1)[0]
      } else {
        key = queue.shift()
      }

      if (!key) {
        break
      }

      launchBudget -= 1
      const browserKey = key
      const usedSlot = slot

      const promise = (async () => {
        const publicBaseUrl = usedSlot ? `${usedSlot.useHttps ? 'https' : 'http'}://${usedSlot.hostname}` : undefined
        console.log(
          `  Starting: ${browserKey}${usedSlot ? ` (slot ${usedSlot.hostname} -> port ${usedSlot.port})` : ''}`,
        )
        const result = await runBrowser(browserKey, {
          ...runOptions,
          browserStackQueue,
          apiPort: usedSlot?.port,
          publicBaseUrl,
        })
        results.push(result)
        logRunResult(result)
      })()

      const tracked = promise.finally(() => {
        if (usedSlot && freeSlots) {
          freeSlots.push(usedSlot)
        }
        running.delete(tracked)
      })
      running.add(tracked)
    }

    if (running.size > 0) {
      await Promise.race(running)
    } else if (queue.length > 0) {
      throw new Error(`Unable to schedule remaining browsers: ${queue.join(', ')}`)
    }
  }

  return results
}

/**
 * Parallel BrowserStack suite runner: one Vitest process per browser.
 */
export async function runBrowserStackSuite(options: RunSuiteOptions): Promise<RunResult[]> {
  const cwd = options.cwd ?? process.cwd()
  const configPath = resolve(cwd, options.configPath)
  const vitestPath = resolveVitestPath(cwd, options.vitestPath)
  const concurrency = options.concurrency ?? 5
  const buildName =
    options.buildName ?? process.env.BS_BUILD_NAME ?? `vitest-bs-${process.env.GITHUB_RUN_ID || Date.now()}`
  const matrix = options.browserMatrix ?? browserstackBrowsers
  const tunnelMode = options.tunnel ?? 'browserstack-local'
  const browserKeys = resolveBrowserKeys(options, matrix)

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Invalid concurrency "${concurrency}". Expected a positive integer.`)
  }

  if (tunnelMode === 'public-url' && (!options.publicUrlSlots || options.publicUrlSlots.length === 0)) {
    throw new Error('tunnel "public-url" requires publicUrlSlots.')
  }

  const credentials = getCredentials()
  const browserStackQueue = new BrowserStackQueue(credentials)

  let localTunnel: BrowserStackLocalHandle | null = null
  let localIdentifier: string | undefined

  const cleanup = async () => {
    if (localTunnel) {
      console.log('Stopping BrowserStack Local...')
      await localTunnel.stop().catch((error) => {
        console.warn(`Failed to stop BrowserStack Local: ${error}`)
      })
      localTunnel = null
    }
  }

  const onSignal = () => {
    void cleanup().finally(() => process.exit(1))
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    if (tunnelMode === 'browserstack-local') {
      console.log('Starting BrowserStack Local...')
      localTunnel = await startBrowserStackLocal({ accessKey: credentials.accessKey })
      localIdentifier = localTunnel.localIdentifier
      console.log(`BrowserStack Local ready (identifier=${localIdentifier})`)
    }

    console.log(`\n  Browsers: ${browserKeys.length}`)
    console.log(`  Concurrency: ${concurrency}`)
    console.log(`  Tunnel: ${tunnelMode}`)
    console.log(`  Build: ${buildName}`)
    console.log(`  Config: ${configPath}`)
    console.log(`  Browsers: ${browserKeys.join(', ')}\n`)

    const startTime = Date.now()
    const results = await runWithConcurrency(
      browserKeys,
      concurrency,
      matrix,
      browserStackQueue,
      {
        configPath,
        cwd,
        vitestPath,
        buildName,
        debug: options.debug,
        retryFailedFiles: options.retryFailedFiles !== false,
        retryBrowserOnMissingFiles: options.retryBrowserOnMissingFiles !== false,
        localIdentifier,
        // Parent manages the BrowserStack free-slot queue.
        queueManagedExternally: true,
      },
      tunnelMode === 'public-url' ? options.publicUrlSlots : undefined,
    )

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
    const passed = results.filter((r) => r.status === 'PASS')
    const flaky = results.filter((r) => r.status === 'FLAKY')
    const failed = results.filter((r) => r.status === 'FAIL')

    console.log(`\n${'='.repeat(60)}`)
    console.log(
      `  Results: ${passed.length} passed, ${flaky.length} flaky, ${failed.length} failed (${totalDuration}s)`,
    )
    console.log('='.repeat(60))

    if (options.resultsPath) {
      await writeFile(
        resolve(cwd, options.resultsPath),
        `${JSON.stringify(
          { buildName, results, passed: passed.length, flaky: flaky.length, failed: failed.length },
          null,
          2,
        )}\n`,
        'utf8',
      )
      console.log(`  Wrote results to ${options.resultsPath}`)
    }

    console.log()
    return results
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    await cleanup()
  }
}

/**
 * CLI entry used by `bin/broyster-vitest`.
 * Parses argv and exits with code 1 if any browser failed.
 */
export async function runBrowserStackSuiteCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const configPath = getArg(argv, 'config')
  if (!configPath) {
    console.error(
      [
        'Usage: broyster-vitest --config vitest.config.ts',
        '[--concurrency 5] [--filter Safari] [--browsers a,b]',
        '[--build name] [--results out.json]',
        '[--tunnel browserstack-local|public-url|none] [--debug]',
      ].join(' '),
    )
    process.exit(1)
  }

  const browsersArg = getArg(argv, 'browsers')
  const results = await runBrowserStackSuite({
    configPath,
    concurrency: Number(getArg(argv, 'concurrency') || '5'),
    filter: getArg(argv, 'filter'),
    browsers: browsersArg ? browsersArg.split(',') : getArg(argv, 'preset') === 'browserstack-beta' ? 'beta' : 'all',
    buildName: getArg(argv, 'build'),
    resultsPath: getArg(argv, 'results'),
    tunnel: (getArg(argv, 'tunnel') as RunSuiteOptions['tunnel']) || 'browserstack-local',
    debug: argv.includes('--debug'),
  })

  process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0)
}
