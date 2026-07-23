import { spawn } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { BrowserStackCapabilities } from '../capabilities.js'
import { serializeChildContext } from '../env_contract.js'
import type { Transport, TransportSlot } from '../transports/transport.js'
import { waitForPort } from './ports.js'
import type { RunAttemptName, RunAttemptResult } from './results.js'

export type ChildAttemptOptions = {
  browserKey: string
  attempt: RunAttemptName
  slot: TransportSlot
  transport: Transport
  buildName: string
  /** Path to the consumer's Vitest config, resolved against cwd */
  configPath: string
  /** Absolute path to vitest.mjs resolved from the consumer's dependencies */
  vitestCliPath: string
  cwd: string
  env?: Record<string, string>
  debug?: boolean
  /** Only the listed test files are run (used for file-level retries) */
  filePaths?: string[]
  onLog: (line: string) => void
}

export type ChildAttemptRunner = (options: ChildAttemptOptions) => Promise<RunAttemptResult>

type FailedFilesReport = {
  failedModuleIds?: unknown
}

/**
 * Spawns one Vitest child process for one browser attempt, waits for its local
 * server, marks the slot ready, and collects the failed-files report.
 */
export function runChildAttempt(options: ChildAttemptOptions): Promise<RunAttemptResult> {
  const { browserKey, attempt, slot, onLog } = options
  const start = Date.now()

  const readyFile = makeTempFilePath('broyster-ready', browserKey, attempt, 'ready')
  const failedFilesOut = makeTempFilePath('broyster-failed-files', browserKey, attempt, 'json')

  return new Promise<RunAttemptResult>((resolve) => {
    let settled = false
    const finish = (exitCode: number | null) => {
      if (settled) {
        return
      }
      settled = true
      void (async () => {
        const failedModuleIds = await readFailedModuleIds(failedFilesOut, browserKey, attempt, onLog)
        await unlink(readyFile).catch(() => undefined)
        await unlink(failedFilesOut).catch(() => undefined)
        resolve({
          browser: browserKey,
          attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds,
        })
      })().catch((error) => {
        onLog(`  [${browserKey}] Failed to finalize ${attempt} attempt: ${String(error)}`)
        resolve({
          browser: browserKey,
          attempt,
          exitCode,
          duration: Date.now() - start,
          failedModuleIds: [],
        })
      })
    }

    const capabilities: BrowserStackCapabilities | undefined = slot.capabilities
    const env = {
      ...process.env,
      ...options.env,
      ...serializeChildContext({
        browserKey,
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
    }
    const vitestArgs = [options.vitestCliPath, 'run', '--config', options.configPath, ...(options.filePaths ?? [])]

    const child = spawn(process.execPath, vitestArgs, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    void (async () => {
      try {
        await waitForPort(slot.localPort)
        await options.transport.waitForSlotRouting?.(slot)
        await writeFile(readyFile, '')
      } catch (error) {
        onLog(`  [${browserKey}] Failed to prepare ${options.transport.name} routing: ${error}`)
        child.kill('SIGTERM')
      }
    })()

    const prefix = attempt === 'retry' ? `[${browserKey} retry]` : `[${browserKey}]`
    const forwardOutput = (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) {
          onLog(`  ${prefix} ${line}`)
        }
      }
    }
    child.stdout.on('data', forwardOutput)
    child.stderr.on('data', forwardOutput)

    child.on('error', (error) => {
      onLog(`  [${browserKey}] Failed to start Vitest child process: ${error.message}`)
      finish(1)
    })
    child.on('close', (code) => {
      finish(code)
    })
  })
}

async function readFailedModuleIds(
  reportPath: string,
  browserKey: string,
  attempt: RunAttemptName,
  onLog: (line: string) => void,
): Promise<string[]> {
  let rawReport: string
  try {
    rawReport = await readFile(reportPath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      onLog(`  [${browserKey}] Failed to read ${attempt} failed-files report: ${String(error)}`)
    }
    return []
  }

  try {
    const report = JSON.parse(rawReport) as FailedFilesReport
    if (!Array.isArray(report.failedModuleIds)) {
      onLog(`  [${browserKey}] Ignoring ${attempt} failed-files report without failedModuleIds array.`)
      return []
    }

    return uniqueSorted(report.failedModuleIds.filter((moduleId): moduleId is string => typeof moduleId === 'string'))
  } catch (error) {
    onLog(`  [${browserKey}] Failed to parse ${attempt} failed-files report: ${String(error)}`)
    return []
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function makeTempFilePath(prefix: string, browserKey: string, attempt: RunAttemptName, extension: string): string {
  const safeBrowserKey = browserKey.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${safeBrowserKey}-${attempt}.${extension}`)
}
