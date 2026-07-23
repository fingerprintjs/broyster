/* eslint-disable no-console */
import { spawn } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import * as net from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'

import { openCloudflareTunnel } from '../cloudflare/cloudflare'
import { getCloudflareSlots, type CloudflareSlot } from '../cloudflare/cloudflare_slots'
import { browserstackBrowsers, type BrowserDef } from './browsers'
import { getCredentials } from './credentials'
import { BrowserStackQueue } from './queue'

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

export type BroysterRunnerOptions = {
  concurrency?: number
  filter?: string
  browsers?: string[]
  configPath?: string
  buildName?: string
  debug?: boolean
  availableBrowsers?: Record<string, BrowserDef>
}

type RunBrowserOptions = {
  apiPort: number
  publicBaseUrl: string
  browserStackQueue: BrowserStackQueue
  configPath: string
  buildName: string
  debug?: boolean
}

type RunBrowserAttemptOptions = RunBrowserOptions & {
  attempt: RunAttemptName
  filePaths?: string[]
}

type FailedFilesReport = {
  failedModuleIds?: unknown
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function makeTempFilePath(prefix: string, browserKey: string, attempt: RunAttemptName, extension: string): string {
  const safeBrowserKey = browserKey.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${safeBrowserKey}-${attempt}.${extension}`)
}

function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ host: '127.0.0.1', port })

      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })

      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for local server on port ${port}`))
          return
        }
        setTimeout(tryConnect, 250)
      })
    }

    tryConnect()
  })
}

function checkPortAvailability(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.message)
    })
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        resolve(error ? error.message : null)
      })
    })
  })
}

async function filterAvailableCloudflareSlots(slots: CloudflareSlot[]): Promise<CloudflareSlot[]> {
  const checks = await Promise.all(
    slots.map(async (slot) => ({
      slot,
      error: await checkPortAvailability(slot.port),
    })),
  )

  const unavailable = checks.filter((check) => check.error !== null)
  if (unavailable.length > 0) {
    console.warn(
      `Skipping Cloudflare slots with busy ports: ${unavailable
        .map(({ slot, error }) => `${slot.hostname} -> localhost:${slot.port} (${error})`)
        .join(', ')}`,
    )
  }

  return checks.filter((check) => check.error === null).map((check) => check.slot)
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
      console.warn(`  [${browserKey}] Ignoring ${attempt} failed-files report without failedModuleIds array.`)
      return []
    }

    return uniqueSorted(report.failedModuleIds.filter((moduleId): moduleId is string => typeof moduleId === 'string'))
  } catch (error) {
    console.warn(`  [${browserKey}] Failed to parse ${attempt} failed-files report: ${String(error)}`)
    return []
  }
}

function runBrowserAttempt(
  browserKey: string,
  options: RunBrowserAttemptOptions,
  allBrowsers: Record<string, BrowserDef>,
): Promise<RunAttemptResult> {
  const start = Date.now()
  if (!allBrowsers[browserKey]) {
    throw new Error(`Unknown browser "${browserKey}".`)
  }

  const tunnelReadyFile = makeTempFilePath('vitest-browserstack-cloudflare', browserKey, options.attempt, 'ready')
  const failedFilesReportPath = makeTempFilePath(
    'vitest-browserstack-failed-files',
    browserKey,
    options.attempt,
    'json',
  )

  return new Promise<RunAttemptResult>((resolve) => {
    let settled = false
    const finish = (exitCode: number | null) => {
      if (settled) {
        return
      }
      settled = true
      void (async () => {
        const failedModuleIds = await readFailedModuleIds(failedFilesReportPath, browserKey, options.attempt)
        await unlink(tunnelReadyFile).catch(() => undefined)
        await unlink(failedFilesReportPath).catch(() => undefined)
        resolve({
          browser: browserKey,
          attempt: options.attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds,
        })
      })().catch((error) => {
        console.warn(`  [${browserKey}] Failed to finalize ${options.attempt} attempt: ${String(error)}`)
        resolve({
          browser: browserKey,
          attempt: options.attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds: [],
        })
      })
    }

    const env = {
      ...process.env,
      BS_BROWSER: browserKey,
      BS_BUILD_NAME: options.buildName,
      BS_PUBLIC_BASE_URL: options.publicBaseUrl,
      BS_TUNNEL_READY_FILE: tunnelReadyFile,
      BS_API_PORT: String(options.apiPort),
      BS_QUEUE_MANAGED_EXTERNALLY: '1',
      BS_FAILED_FILES_OUT: failedFilesReportPath,
      BS_RUN_ATTEMPT: options.attempt,
      ...(options.debug && { DEBUG: 'vitest:browser:browserstack' }),
    }

    const vitestCli = resolvePath(process.cwd(), 'node_modules/vitest/vitest.mjs')
    const filePaths = options.filePaths || []
    const vitestArgs: string[] = [vitestCli, 'run', '--config', options.configPath, ...filePaths]

    const child = spawn(process.execPath, vitestArgs, {
      cwd: process.cwd(),
      env,
      stdio: 'pipe',
    })

    void (async () => {
      try {
        await waitForPort(options.apiPort)
        await writeFile(tunnelReadyFile, '')
      } catch (error) {
        console.error(`  [${browserKey}] Failed to prepare Cloudflare routing: ${error}`)
        child.kill('SIGTERM')
      }
    })()

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
      console.error(`  [${browserKey}] Failed to start Vitest child process: ${error.message}`)
      finish(1)
    })
    child.on('close', (code) => {
      finish(code)
    })
  })
}

async function runBrowser(
  browserKey: string,
  options: RunBrowserOptions,
  allBrowsers: Record<string, BrowserDef>,
): Promise<RunResult> {
  const initialAttempt = await runBrowserAttempt(browserKey, { ...options, attempt: 'initial' }, allBrowsers)

  if (initialAttempt.exitCode === 0) {
    return {
      browser: browserKey,
      status: 'PASS',
      exitCode: initialAttempt.exitCode,
      duration: initialAttempt.duration,
      attempts: [initialAttempt],
    }
  }

  if (initialAttempt.failedModuleIds.length === 0) {
    console.log(`  [${browserKey}] No failed files were reported; retrying full browser run.`)
    await options.browserStackQueue.waitForAvailableSlots(1)
    const retryAttempt = await runBrowserAttempt(browserKey, { ...options, attempt: 'retry' }, allBrowsers)

    return {
      browser: browserKey,
      status: retryAttempt.exitCode === 0 ? 'FLAKY' : 'FAIL',
      exitCode: retryAttempt.exitCode,
      duration: initialAttempt.duration + retryAttempt.duration,
      attempts: [initialAttempt, retryAttempt],
      retryScope: 'browser',
    }
  }

  console.log(`  Retrying failed files: ${browserKey} (${initialAttempt.failedModuleIds.length} failed file(s))`)
  await options.browserStackQueue.waitForAvailableSlots(1)
  const retryAttempt = await runBrowserAttempt(
    browserKey,
    { ...options, attempt: 'retry', filePaths: initialAttempt.failedModuleIds },
    allBrowsers,
  )

  return {
    browser: browserKey,
    status: retryAttempt.exitCode === 0 ? 'FLAKY' : 'FAIL',
    exitCode: retryAttempt.exitCode,
    duration: initialAttempt.duration + retryAttempt.duration,
    attempts: [initialAttempt, retryAttempt],
    retryScope: 'files',
  }
}

export async function runBroysterVitest(options: BroysterRunnerOptions = {}): Promise<RunResult[]> {
  const allBrowsers = options.availableBrowsers || browserstackBrowsers
  const concurrency = options.concurrency ?? 5
  const buildName = options.buildName || `vitest-bs-${process.env.GITHUB_RUN_ID || Date.now()}`
  const configPath = resolvePath(process.cwd(), options.configPath || 'vitest.config.ts')

  let browserKeys = Object.keys(allBrowsers)
  if (options.browsers && options.browsers.length > 0) {
    const unknown = options.browsers.filter((b) => !allBrowsers[b])
    if (unknown.length > 0) {
      throw new Error(`Unknown browsers: ${unknown.join(', ')}`)
    }
    browserKeys = options.browsers
  } else if (options.filter) {
    const re = new RegExp(options.filter, 'i')
    browserKeys = browserKeys.filter((k) => re.test(k))
  }

  if (browserKeys.length === 0) {
    throw new Error('No browsers matched selection.')
  }

  const credentials = getCredentials()
  const browserStackQueue = new BrowserStackQueue(credentials)

  const cloudflareToken = process.env.CLOUDFLARE_TUNNEL_TOKEN
  if (!cloudflareToken) {
    throw new Error('Cloudflare tunnel token not found. Set CLOUDFLARE_TUNNEL_TOKEN to use BrowserStack runs.')
  }

  const cloudflareSlots = await filterAvailableCloudflareSlots(getCloudflareSlots())

  console.log(`\n  Browsers: ${browserKeys.length}`)
  console.log(`  Concurrency: ${concurrency}`)
  console.log(`  Build: ${buildName}`)
  console.log(
    `  Cloudflare slots: ${cloudflareSlots.map((slot) => `${slot.hostname} -> localhost:${slot.port}`).join(', ')}`,
  )
  console.log(`  Browsers: ${browserKeys.join(', ')}\n`)

  const readySlot = cloudflareSlots.find((slot) => slot.useHttps) ?? cloudflareSlots[0]
  if (!readySlot) {
    throw new Error('No Cloudflare slots configured.')
  }
  const readyUrl = `${readySlot.useHttps ? 'https' : 'http'}://${readySlot.hostname}/`

  const cloudflareTunnel = await openCloudflareTunnel({
    token: cloudflareToken,
    readyUrl,
  })
  console.log(`Cloudflare tunnel ready via ${readyUrl}\n`)

  const startTime = Date.now()
  const results: RunResult[] = []
  const queue = [...browserKeys]
  const freeSlots = [...cloudflareSlots]
  const running = new Map<Promise<void>, CloudflareSlot>()
  let launchBudget = 0

  try {
    while (queue.length > 0 || running.size > 0) {
      while (running.size < concurrency) {
        if (launchBudget <= 0) {
          const desiredLaunches = Math.min(concurrency - running.size, queue.length, freeSlots.length)
          if (desiredLaunches <= 0) {
            break
          }

          const availableSlots = await browserStackQueue.waitForAvailableSlots(1)
          launchBudget = Math.min(availableSlots, desiredLaunches)
        }

        const nextIndex = queue.findIndex((key) => {
          const browser = allBrowsers[key]
          return browser !== undefined && freeSlots.some((slot) => slot.useHttps === browser.useHttps)
        })
        if (nextIndex === -1) {
          break
        }

        const key = queue.splice(nextIndex, 1)[0]
        if (!key) {
          break
        }
        const browser = allBrowsers[key]
        if (!browser) {
          break
        }

        const slotIndex = freeSlots.findIndex((slot) => slot.useHttps === browser.useHttps)
        if (slotIndex === -1) {
          queue.unshift(key)
          break
        }

        const slot = freeSlots.splice(slotIndex, 1)[0]
        if (!slot) {
          queue.unshift(key)
          break
        }
        launchBudget -= 1
        const promise = (async () => {
          console.log(`  Starting: ${key} (slot ${slot.hostname} -> port ${slot.port})`)
          const result = await runBrowser(
            key,
            {
              apiPort: slot.port,
              publicBaseUrl: `${slot.useHttps ? 'https' : 'http'}://${slot.hostname}`,
              browserStackQueue,
              configPath,
              buildName,
              debug: options.debug,
            },
            allBrowsers,
          )
          results.push(result)
          logRunResult(result)
        })()

        const tracked = promise.finally(() => {
          freeSlots.push(slot)
          running.delete(tracked)
        })
        running.set(tracked, slot)
      }

      if (running.size > 0) {
        await Promise.race(Array.from(running.keys()))
      } else if (queue.length > 0) {
        throw new Error(`No compatible Cloudflare slot is available for remaining browsers: ${queue.join(', ')}`)
      }
    }
  } finally {
    console.log('Stopping Cloudflare tunnel...')
    await cloudflareTunnel.close()
  }

  // --- Summary ---
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
  const passed = results.filter((r) => r.status === 'PASS')
  const flaky = results.filter((r) => r.status === 'FLAKY')
  const failed = results.filter((r) => r.status === 'FAIL')

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  Results: ${passed.length} passed, ${flaky.length} flaky, ${failed.length} failed (${totalDuration}s)`)
  console.log('='.repeat(60))

  if (flaky.length > 0) {
    console.log('\n  Flaky browsers:')
    for (const r of flaky) {
      if (r.retryScope === 'browser') {
        console.log(`    - ${r.browser} (browser passed on retry after no failed files were reported)`)
      } else {
        const failedFiles = r.attempts[0].failedModuleIds.length
        console.log(`    - ${r.browser} (${failedFiles} file(s) passed on retry)`)
      }
    }
  }

  if (failed.length > 0) {
    console.log('\n  Failed browsers:')
    for (const r of failed) {
      const initialAttempt = r.attempts[0]
      const finalAttempt = r.attempts[r.attempts.length - 1]
      const retryDetail =
        r.attempts.length > 1
          ? `, ${formatRetryScope(r.retryScope)} exit code ${formatExitCode(finalAttempt.exitCode)}`
          : ''
      console.log(`    - ${r.browser} (initial exit code ${formatExitCode(initialAttempt.exitCode)}${retryDetail})`)
    }
  }

  return results
}
