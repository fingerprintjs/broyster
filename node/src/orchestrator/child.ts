import { spawn } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BrowserDef } from '../browsers.js'
import type { BrowserStackCapabilities } from '../capabilities.js'
import { parseAttemptReport } from '../contracts/attempt_report.js'
import type { ParsedAttemptReport } from '../contracts/attempt_report.js'
import type { BrowserStackCredentials } from '../credentials.js'
import { CHILD_CONTEXT_SCHEMA_VERSION, serializeChildContext } from '../env_contract.js'
import { abortError } from '../internal/abort.js'
import { createLineForwarder } from '../internal/line_forwarder.js'
import type { Transport, TransportSlot } from '../transports/transport.js'
import { waitForPort } from './ports.js'
import type { RunAttemptName, RunAttemptResult } from './results.js'

export type ChildAttemptOptions = {
  browserKey: string
  browser: BrowserDef
  attempt: RunAttemptName
  slot: TransportSlot
  transport: Transport
  buildName: string
  /** Path to the consumer's Vitest config, resolved against cwd */
  configPath: string
  /** Absolute path to vitest.mjs resolved from the consumer's dependencies */
  vitestCliPath: string
  cwd: string
  /** Passed to the child via BROWSERSTACK_* env vars so programmatic credentials reach the provider */
  credentials?: BrowserStackCredentials
  env?: Record<string, string>
  signal?: AbortSignal
  debug?: boolean
  /** Only the listed test files are run (used for file-level retries) */
  filePaths?: string[]
  onLog: (line: string) => void
}

export type ChildAttemptRunner = (options: ChildAttemptOptions) => Promise<RunAttemptResult>

/**
 * Spawns one Vitest child process for one browser attempt, waits for its local
 * server, marks the slot ready, and collects the failed-files report.
 */
export function runChildAttempt(options: ChildAttemptOptions): Promise<RunAttemptResult> {
  if (options.signal?.aborted) {
    return Promise.reject(abortError(options.signal, 'The Vitest child attempt was cancelled.'))
  }

  const { browserKey, attempt, slot, onLog } = options
  const start = Date.now()

  const readyFile = makeTempFilePath('broyster-ready', browserKey, attempt, 'ready')
  const failedFilesOut = makeTempFilePath('broyster-failed-files', browserKey, attempt, 'json')

  return new Promise<RunAttemptResult>((resolve, reject) => {
    let settled = false
    let abortRequested = false
    let terminationRequested = false
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined
    let removeAbortListener: () => void = () => undefined
    const routingController = new AbortController()
    const settle = (result: RunAttemptResult) => {
      if (abortRequested && options.signal) {
        reject(abortError(options.signal, 'The Vitest child attempt was cancelled.'))
      } else {
        resolve(result)
      }
    }
    const finish = (exitCode: number | null) => {
      if (settled) {
        return
      }
      settled = true
      routingController.abort()
      removeAbortListener()
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
      }
      void (async () => {
        const report = await readAttemptReport(failedFilesOut, browserKey, attempt, onLog)
        await unlink(readyFile).catch(() => undefined)
        await unlink(failedFilesOut).catch(() => undefined)
        settle({
          browser: browserKey,
          attempt,
          exitCode,
          duration: Date.now() - start,
          ...report,
        })
      })().catch((error) => {
        onLog(`  [${browserKey}] Failed to finalize ${attempt} attempt: ${String(error)}`)
        settle({
          browser: browserKey,
          attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds: [],
        })
      })
    }

    const capabilities: BrowserStackCapabilities | undefined = slot.capabilities
    const env = sanitizeChildEnvironment(
      {
        ...process.env,
        ...options.env,
        // The credentials the orchestrator resolved are authoritative; the child's
        // provider and reporters read them from the standard variables.
        ...(options.credentials && {
          BROWSERSTACK_USERNAME: options.credentials.username,
          BROWSERSTACK_ACCESS_KEY: options.credentials.accessKey,
        }),
        ...serializeChildContext({
          schemaVersion: CHILD_CONTEXT_SCHEMA_VERSION,
          browserKey,
          browser: options.browser,
          buildName: options.buildName,
          publicOrigin: slot.publicOrigin,
          useHttps: slot.useHttps,
          apiPort: slot.localPort,
          readyFile,
          failedFilesOut,
          attempt,
          queueManagedExternally: true,
          ...(capabilities && { capabilities }),
        }),
        ...(options.debug && { DEBUG: 'vitest:broyster' }),
      },
      options.transport.sensitiveEnvKeys,
    )
    const vitestArgs = [options.vitestCliPath, 'run', '--config', options.configPath, ...(options.filePaths ?? [])]

    const child = spawn(process.execPath, vitestArgs, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const terminateChild = () => {
      if (settled || terminationRequested) {
        return
      }
      terminationRequested = true
      child.kill('SIGTERM')
      if (settled) {
        return
      }
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          onLog(`  [${browserKey}] Vitest child did not exit after SIGTERM, sending SIGKILL`)
          child.kill('SIGKILL')
        }
      }, 5_000)
      forceKillTimer.unref()
    }
    const onAbort = () => {
      abortRequested = true
      routingController.abort()
      terminateChild()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => options.signal?.removeEventListener('abort', onAbort)
    if (options.signal?.aborted) {
      onAbort()
    }

    void (async () => {
      try {
        await waitForPort(slot.localPort, 30_000, routingController.signal)
        if (routingController.signal.aborted) {
          return
        }
        await options.transport.waitForSlotRouting?.(slot, routingController.signal)
        if (routingController.signal.aborted) {
          return
        }
        await writeFile(readyFile, '')
      } catch (error) {
        if (routingController.signal.aborted) {
          return
        }
        onLog(`  [${browserKey}] Failed to prepare ${options.transport.name} routing: ${error}`)
        terminateChild()
      }
    })()

    const prefix = attempt === 'retry' ? `[${browserKey} retry]` : `[${browserKey}]`
    const stdoutForwarder = createLineForwarder((line) => onLog(`  ${prefix} ${line}`))
    const stderrForwarder = createLineForwarder((line) => onLog(`  ${prefix} ${line}`))
    child.stdout.on('data', stdoutForwarder.write)
    child.stdout.on('end', stdoutForwarder.flush)
    child.stderr.on('data', stderrForwarder.write)
    child.stderr.on('end', stderrForwarder.flush)

    child.on('error', (error) => {
      onLog(`  [${browserKey}] Failed to start Vitest child process: ${error.message}`)
      finish(1)
    })
    child.on('close', (code) => {
      stdoutForwarder.flush()
      stderrForwarder.flush()
      finish(code)
    })
  })
}

export function sanitizeChildEnvironment(
  env: NodeJS.ProcessEnv,
  sensitiveEnvKeys: readonly string[] | undefined,
): NodeJS.ProcessEnv {
  const sanitized = { ...env }
  for (const key of sensitiveEnvKeys ?? []) {
    delete sanitized[key]
  }
  return sanitized
}

async function readAttemptReport(
  reportPath: string,
  browserKey: string,
  attempt: RunAttemptName,
  onLog: (line: string) => void,
): Promise<ParsedAttemptReport> {
  const emptyReport: ParsedAttemptReport = {
    failedModuleIds: [],
    modules: [],
    unhandledErrors: [],
    warnings: [],
  }
  let rawReport: string
  try {
    rawReport = await readFile(reportPath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      onLog(`  [${browserKey}] Failed to read ${attempt} failed-files report: ${String(error)}`)
    }
    return emptyReport
  }

  try {
    const report = parseAttemptReport(JSON.parse(rawReport))
    if (!report) {
      onLog(`  [${browserKey}] Ignoring malformed or unsupported ${attempt} failed-files report.`)
      return emptyReport
    }
    return report
  } catch (error) {
    onLog(`  [${browserKey}] Failed to parse ${attempt} failed-files report: ${String(error)}`)
    return emptyReport
  }
}

function makeTempFilePath(prefix: string, browserKey: string, attempt: RunAttemptName, extension: string): string {
  const safeBrowserKey = browserKey.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${safeBrowserKey}-${attempt}.${extension}`)
}
