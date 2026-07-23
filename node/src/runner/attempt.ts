import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import spawn from 'cross-spawn'

import type { BrowserStackClient } from '../core/browserstack_client.js'
import {
  BROWSERSTACK_ACCESS_KEY_ENV,
  BROWSERSTACK_USERNAME_ENV,
  LEGACY_BROWSERSTACK_ACCESS_KEY_ENV,
  LEGACY_BROWSERSTACK_USERNAME_ENV,
  browserStackCredentialSecretValues,
  createSecretRedactor,
  type BrowserStackCredentials,
} from '../core/credentials.js'
import type { BrowserAttemptResult, SerializedError, TestCaseResult, TestModuleResult } from '../core/results.js'
import type { BrowserDefinition, NormalizedBroysterConfig } from '../core/types.js'
import type { TunnelSlot } from '../transports/types.js'
import {
  BROYSTER_RUN_CONTEXT_ENV,
  readBrowserStackSessionFile,
  type BrowserStackRunContext,
  type ChildModuleResult,
  type ChildRunReport,
  type ChildTestResult,
} from '../vitest/index.js'
import { readJson, serializeError, writeJsonAtomic } from './io.js'
import { assertPortAvailable, ChildProcessRegistry, stopChild, throwIfAborted, waitForPort } from './processes.js'

const SESSION_STATUS_UPDATE_TIMEOUT_MS = 5_000

export type AttemptExecution = {
  attempt: BrowserAttemptResult
  failedModuleIds: string[]
}

export type RunAttemptOptions = {
  runId: string
  browserId: string
  browser: BrowserDefinition
  capabilities: Record<string, unknown>
  slot: TunnelSlot
  config: NormalizedBroysterConfig
  number: number
  kind: 'initial' | 'retry'
  fileFilters: readonly string[]
  testNamePattern?: string
  runDirectory: string
  signal: AbortSignal
  children: ChildProcessRegistry
  credentials: BrowserStackCredentials
  browserStackClient: Pick<BrowserStackClient, 'updateSession'>
  sensitiveEnvKeys: readonly string[]
  debug: boolean
  log?: (line: string, error?: boolean) => void
}

export async function runBrowserAttempt(options: RunAttemptOptions): Promise<AttemptExecution> {
  throwIfAborted(options.signal)
  const startedAtMs = Date.now()
  const attemptDirectory = join(options.runDirectory, safeSegment(options.browserId), String(options.number))
  const contextPath = join(attemptDirectory, 'context.json')
  const resultPath = join(attemptDirectory, 'result.json')
  const readinessPath = join(attemptDirectory, 'ready')
  const sessionPath = join(attemptDirectory, 'session.json')
  await mkdir(attemptDirectory, { recursive: true })
  await assertPortAvailable(options.slot.localPort)

  const context: BrowserStackRunContext = {
    schemaVersion: 1,
    run: {
      id: options.runId,
      projectName: options.config.projectName,
      buildName: options.config.buildName,
    },
    browser: {
      id: options.browserId,
      name: options.browser.name ?? options.browserId,
      browser: options.browser.browser,
      capabilities: options.capabilities,
    },
    slot: {
      publicUrl: options.slot.publicUrl,
      localPort: options.slot.localPort,
      protocol: options.slot.protocol,
    },
    browserStack: {
      hubUrl: options.config.browserStack.hubUrl,
      apiBaseUrl: options.config.browserStack.apiBaseUrl,
    },
    apiPort: options.slot.localPort,
    providerConnectTimeoutMs: options.config.providerConnectTimeoutMs,
    attempt: { number: options.number, kind: options.kind },
    resultFile: resultPath,
    readinessFile: readinessPath,
    sessionFile: sessionPath,
    heartbeatIntervalMs: options.config.heartbeatIntervalMs,
  }
  await writeJsonAtomic(contextPath, context)

  const redact = createRedactor(options.credentials, options.sensitiveEnvKeys)
  const vitestExecutable = resolveVitestExecutable(options.config)
  const vitestArguments = [
    'run',
    '--config',
    options.config.vitestConfig,
    ...options.fileFilters,
    ...(options.testNamePattern === undefined ? [] : ['-t', options.testNamePattern]),
  ]
  throwIfAborted(options.signal)
  const child = spawn(vitestExecutable, vitestArguments, {
    cwd: options.config.baseDir,
    env: createChildEnvironment(options, contextPath),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  options.children.add(child)

  const label = `[${options.browserId}${options.kind === 'retry' ? ` retry ${options.number}` : ''}]`
  pipeLines(child.stdout, (line) => (options.log ?? defaultLog)(redact(`  ${label} ${line}`)))
  pipeLines(child.stderr, (line) => (options.log ?? defaultLog)(redact(`  ${label} ${line}`), true))

  let spawnError: Error | undefined
  let timedOut = false
  let parentAborted = options.signal.aborted
  const attemptController = new AbortController()
  const readinessSignal = AbortSignal.any([options.signal, attemptController.signal])
  const onAbort = () => {
    parentAborted = true
    void stopChild(child)
  }
  options.signal.addEventListener('abort', onAbort, { once: true })
  if (options.signal.aborted) {
    onAbort()
  }

  const timeout = setTimeout(() => {
    timedOut = true
    void stopChild(child)
  }, options.config.browserTimeoutMs)
  timeout.unref()

  const close = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveClose) => {
    child.once('error', (error) => {
      spawnError = error
    })
    child.once('close', (code, signal) => resolveClose({ code, signal }))
  })

  const readiness = waitForPort(options.slot.localPort, options.config.providerConnectTimeoutMs, readinessSignal)
    .then(() => writeFile(readinessPath, '', 'utf8'))
    .catch((error: unknown) => {
      if (!attemptController.signal.aborted && !options.signal.aborted) {
        spawnError = error instanceof Error ? error : new Error(String(error))
        void stopChild(child)
      }
    })

  const outcome = await close
  attemptController.abort()
  clearTimeout(timeout)
  options.signal.removeEventListener('abort', onAbort)
  await readiness

  const endedAtMs = Date.now()
  const report = await readChildReport(resultPath, context)
  const session = await readBrowserStackSessionFile({
    file: sessionPath,
    runId: options.runId,
    browserId: options.browserId,
    attempt: { number: options.number, kind: options.kind },
  })
  const warnings = [
    ...(report?.warnings.map(redact) ?? []),
    ...(spawnError ? [`Vitest child process error: ${redact(spawnError.message)}`] : []),
    ...(timedOut ? [`Vitest child exceeded ${options.config.browserTimeoutMs}ms and was terminated.`] : []),
    ...(!report ? ['Vitest did not produce a valid child result artifact.'] : []),
  ]
  const sessionId = report?.sessionId ?? session?.sessionId ?? null
  const retryStatusUpdate =
    !report || report.warnings.some((warning) => warning.includes('Failed to update BrowserStack session'))
  if (retryStatusUpdate && sessionId) {
    try {
      await options.browserStackClient.updateSession(
        sessionId,
        {
          status: report?.status ?? 'failed',
          reason: report
            ? 'Broyster retried a BrowserStack status update that failed in the Vitest child.'
            : fallbackSessionReason(timedOut, parentAborted),
        },
        AbortSignal.timeout(Math.min(options.config.providerConnectTimeoutMs, SESSION_STATUS_UPDATE_TIMEOUT_MS)),
      )
    } catch (error) {
      warnings.push(`Failed to mark BrowserStack session as failed: ${redact(errorMessage(error))}`)
    }
  }
  const status = parentAborted ? 'cancelled' : outcome.code === 0 && report?.status === 'passed' ? 'passed' : 'failed'

  return {
    attempt: {
      number: options.number,
      kind: options.kind,
      status,
      exitCode: outcome.code,
      signal: outcome.signal,
      sessionId,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - startedAtMs),
      modules: report?.modules.map((module) => mapModule(module, redact)) ?? [],
      unhandledErrors:
        report?.unhandledErrors.map((error) => mapError(error, redact)) ??
        (spawnError ? [redactSerializedError(serializeError(spawnError), redact)] : []),
      warnings,
    },
    failedModuleIds: uniqueSorted(report?.failedModuleIds ?? []),
  }
}

export function resolveVitestExecutable(config: NormalizedBroysterConfig): string {
  if (config.vitestExecutable) {
    return config.vitestExecutable
  }
  const requireFromConsumer = createRequire(resolve(config.baseDir, '__broyster_resolve.cjs'))
  try {
    const packageJsonPath = requireFromConsumer.resolve('vitest/package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      bin?: string | Record<string, unknown>
    }
    const executable = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.vitest
    if (typeof executable !== 'string' || executable.trim() === '') {
      throw new Error('The installed Vitest package does not declare a "vitest" executable.')
    }
    return resolve(dirname(packageJsonPath), executable)
  } catch (error) {
    throw new Error(
      `Unable to resolve Vitest from ${config.baseDir}: ${error instanceof Error ? error.message : error}`,
    )
  }
}

async function readChildReport(path: string, context: BrowserStackRunContext): Promise<ChildRunReport | undefined> {
  try {
    const value = await readJson(path)
    if (!isChildRunReport(value)) {
      return undefined
    }
    if (
      value.runId !== context.run.id ||
      value.browserId !== context.browser.id ||
      value.attempt.number !== context.attempt.number ||
      value.attempt.kind !== context.attempt.kind
    ) {
      return undefined
    }
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    return undefined
  }
}

function isChildRunReport(value: unknown): value is ChildRunReport {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.attempt)) {
    return false
  }
  return (
    typeof value.runId === 'string' &&
    typeof value.browserId === 'string' &&
    typeof value.browserName === 'string' &&
    typeof value.browser === 'string' &&
    typeof value.attempt.number === 'number' &&
    Number.isInteger(value.attempt.number) &&
    value.attempt.number > 0 &&
    (value.attempt.kind === 'initial' || value.attempt.kind === 'retry') &&
    (value.sessionId === null || (typeof value.sessionId === 'string' && value.sessionId.length > 0)) &&
    (value.status === 'passed' || value.status === 'failed') &&
    (value.reason === 'passed' || value.reason === 'failed' || value.reason === 'interrupted') &&
    isStringArray(value.projectNames) &&
    isStringArray(value.failedModuleIds) &&
    Array.isArray(value.modules) &&
    value.modules.every(isChildModuleResult) &&
    Array.isArray(value.unhandledErrors) &&
    value.unhandledErrors.every(isSerializedChildError) &&
    isStringArray(value.warnings) &&
    isValidDateString(value.startedAt) &&
    isValidDateString(value.endedAt) &&
    isNonNegativeFiniteNumber(value.durationMs)
  )
}

function isChildModuleResult(value: unknown): value is ChildModuleResult {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    ['passed', 'failed', 'skipped', 'pending', 'queued'].includes(String(value.status)) &&
    isNonNegativeFiniteNumber(value.durationMs) &&
    Array.isArray(value.errors) &&
    value.errors.every(isSerializedChildError) &&
    Array.isArray(value.tests) &&
    value.tests.every(isChildTestResult)
  )
}

function isChildTestResult(value: unknown): value is ChildTestResult {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.fullName === 'string' &&
    ['passed', 'failed', 'skipped', 'todo', 'pending'].includes(String(value.status)) &&
    isNonNegativeFiniteNumber(value.durationMs) &&
    Array.isArray(value.errors) &&
    value.errors.every(isSerializedChildError)
  )
}

function isSerializedChildError(value: unknown): value is { name: string; message: string; stack?: string } {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string')
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function mapModule(module: ChildModuleResult, redact: (value: string) => string): TestModuleResult {
  return {
    id: module.id,
    status: module.status === 'failed' ? 'failed' : module.status === 'passed' ? 'passed' : 'skipped',
    durationMs: module.durationMs,
    errors: module.errors.map((error) => mapError(error, redact)),
    tests: module.tests.map((test) => mapTest(test, redact)),
  }
}

function mapTest(test: ChildTestResult, redact: (value: string) => string): TestCaseResult {
  return {
    id: test.id,
    name: test.name,
    fullName: test.fullName,
    status: test.status === 'pending' ? 'todo' : test.status,
    durationMs: test.durationMs,
    errors: test.errors.map((error) => mapError(error, redact)),
  }
}

function mapError(
  error: { name: string; message: string; stack?: string },
  redact: (value: string) => string,
): SerializedError {
  return {
    name: redact(error.name),
    message: redact(error.message),
    ...(error.stack === undefined ? {} : { stack: redact(error.stack) }),
  }
}

function pipeLines(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): void {
  if (!stream) {
    return
  }
  let remainder = ''
  stream.on('data', (chunk: Buffer | string) => {
    const lines = `${remainder}${String(chunk)}`.split(/\r?\n/)
    remainder = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) {
        onLine(line)
      }
    }
  })
  stream.on('end', () => {
    if (remainder.trim()) {
      onLine(remainder)
    }
  })
}

function createChildEnvironment(options: RunAttemptOptions, contextPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of options.sensitiveEnvKeys) {
    delete env[key]
  }
  delete env[LEGACY_BROWSERSTACK_USERNAME_ENV]
  delete env[LEGACY_BROWSERSTACK_ACCESS_KEY_ENV]
  env[BROWSERSTACK_USERNAME_ENV] = options.credentials.username
  env[BROWSERSTACK_ACCESS_KEY_ENV] = options.credentials.accessKey
  env[BROYSTER_RUN_CONTEXT_ENV] = contextPath
  if (options.debug) {
    env.DEBUG = appendDebug(env.DEBUG)
  }
  return env
}

function createRedactor(
  credentials: BrowserStackCredentials,
  sensitiveEnvKeys: readonly string[],
): (value: string) => string {
  return createSecretRedactor([
    ...browserStackCredentialSecretValues(credentials),
    ...sensitiveEnvKeys.map((key) => process.env[key]),
  ])
}

function redactSerializedError(error: SerializedError, redact: (value: string) => string): SerializedError {
  return {
    ...(error.name === undefined ? {} : { name: redact(error.name) }),
    message: redact(error.message),
    ...(error.stack === undefined ? {} : { stack: redact(error.stack) }),
  }
}

function fallbackSessionReason(timedOut: boolean, parentAborted: boolean): string {
  if (timedOut) {
    return 'The Vitest child exceeded its timeout and was terminated.'
  }
  if (parentAborted) {
    return 'The Broyster run was cancelled before Vitest completed.'
  }
  return 'The Vitest child exited without a valid result artifact.'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function appendDebug(current: string | undefined): string {
  return [...new Set([...(current?.split(',') ?? []), 'broyster:*', 'vitest:*'])].filter(Boolean).join(',')
}

function safeSegment(value: string): string {
  const slug = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'browser'
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 12)
  return `${slug.slice(0, 48)}-${digest}`
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function defaultLog(line: string, error = false): void {
  if (error) {
    // eslint-disable-next-line no-console
    console.error(line)
  } else {
    // eslint-disable-next-line no-console
    console.log(line)
  }
}
