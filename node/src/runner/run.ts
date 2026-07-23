import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { BrowserStackClient } from '../core/browserstack_client.js'
import { buildBrowserStackCapabilities } from '../core/capabilities.js'
import { normalizeBroysterConfig } from '../core/config.js'
import {
  browserStackCredentialSecretValues,
  createSecretRedactor,
  getBrowserStackCredentials,
} from '../core/credentials.js'
import {
  createBrowserRunResult,
  createBroysterResult,
  type BrowserAttemptResult,
  type BrowserRunResult,
  type BroysterResult,
  type RetryScope,
} from '../core/results.js'
import type { BroysterConfig, NormalizedBroysterConfig } from '../core/types.js'
import { runBrowserAttempt, type AttemptExecution } from './attempt.js'
import { writeJsonAtomic } from './io.js'
import { ChildProcessRegistry } from './processes.js'
import { scheduleBrowsers } from './scheduler.js'
import { BroysterRunError, type BrowserStackRunOverrides } from './types.js'

export async function runBrowserStack(
  inputConfig: BroysterConfig,
  overrides: BrowserStackRunOverrides = {},
): Promise<BroysterResult> {
  let config: NormalizedBroysterConfig
  try {
    config = applyOverrides(
      normalizeBroysterConfig(inputConfig, {
        ...(overrides.configFilePath === undefined ? {} : { configFilePath: overrides.configFilePath }),
      }),
      overrides,
    )
  } catch (error) {
    throw new BroysterRunError('CONFIGURATION', errorMessage(error), error)
  }

  const selectedBrowserIds = selectBrowsers(config, overrides)
  const fileFilters = normalizeStringList(overrides.fileFilters ?? [], 'fileFilters')
  if (fileFilters.some((file) => file.startsWith('-'))) {
    throw new BroysterRunError('CONFIGURATION', 'fileFilters cannot start with "-".')
  }
  const testNamePattern = normalizeOptionalString(overrides.testNamePattern, 'testNamePattern')
  const runId = randomUUID()
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  const children = new ChildProcessRegistry()
  const signal = overrides.signal ?? new AbortController().signal
  const runDirectory = await mkdtemp(join(tmpdir(), 'broyster-'))
  const browserResults = new Map<string, BrowserRunResult>()
  const attemptsByBrowser = new Map<string, BrowserAttemptResult[]>(
    selectedBrowserIds.map((browserId) => [browserId, []]),
  )
  const retryScopeByBrowser = new Map<string, RetryScope | null>()
  const filtersByBrowser = new Map<string, string[]>(
    selectedBrowserIds.map((browserId) => [browserId, [...fileFilters]]),
  )
  const runWarnings: string[] = []
  let redact = (value: string) => value
  let activeTransport: Awaited<ReturnType<NormalizedBroysterConfig['transport']['start']>> | undefined
  let fatalError: unknown

  const onAbort = () => {
    void children.closeAll()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    const credentials = getBrowserStackCredentials()
    redact = createSecretRedactor(browserStackCredentialSecretValues(credentials))
    const browserStackClient = new BrowserStackClient({
      credentials,
      apiBaseUrl: config.browserStack.apiBaseUrl,
    })
    const transport = await config.transport.start(signal)
    activeTransport = transport
    redact = createSecretRedactor([
      ...browserStackCredentialSecretValues(credentials),
      ...(transport.sensitiveEnvKeys ?? []).map((key) => process.env[key]),
    ])

    let pendingBrowserIds = [...selectedBrowserIds]
    for (let number = 1; number <= config.maxRetries + 1 && pendingBrowserIds.length > 0; number += 1) {
      const roundBrowserIds = pendingBrowserIds
      const executions = new Map<string, AttemptExecution>()
      try {
        const scheduled = await scheduleBrowsers({
          browserIds: roundBrowserIds,
          browsers: config.browsers,
          slots: transport.slots,
          concurrency: config.concurrency,
          queuePollIntervalMs: config.queuePollIntervalMs,
          queueTimeoutMs: config.queueTimeoutMs,
          signal,
          getAvailableBrowserStackSlots: async (requestSignal) =>
            (await browserStackClient.getPlan(requestSignal)).availableSessions,
          run: async (browserId, browser, slot) => {
            let execution: AttemptExecution
            try {
              const capabilities = buildBrowserStackCapabilities({
                browser: browser.browser,
                metadata: {
                  projectName: config.projectName,
                  buildName: config.buildName,
                  sessionName: `${browser.name ?? browserId} (attempt ${number})`,
                },
                shared: config.browserStack.capabilities,
                ...(browser.capabilities === undefined ? {} : { browserCapabilities: browser.capabilities }),
              })
              execution = await runBrowserAttempt({
                runId,
                browserId,
                browser,
                capabilities: capabilities as Record<string, unknown>,
                slot,
                config,
                number,
                kind: number === 1 ? 'initial' : 'retry',
                fileFilters: filtersByBrowser.get(browserId) ?? fileFilters,
                ...(testNamePattern === undefined ? {} : { testNamePattern }),
                runDirectory,
                signal,
                children,
                credentials,
                browserStackClient,
                sensitiveEnvKeys: transport.sensitiveEnvKeys ?? [],
                debug: overrides.debug ?? false,
              })
            } catch (error) {
              if (!signal.aborted) {
                throw error
              }
              execution = { attempt: cancelledAttempt(number), failedModuleIds: [] }
            }
            attemptsByBrowser.get(browserId)?.push(execution.attempt)
            executions.set(browserId, execution)
            return execution
          },
        })
        appendCancelledAttempts(scheduled.unstarted, attemptsByBrowser, number)
      } catch (error) {
        fatalError = error
        runWarnings.push(`The browser scheduler stopped early: ${redact(errorMessage(error))}`)
        appendCancelledAttempts(roundBrowserIds, attemptsByBrowser, number)
        break
      }

      if (signal.aborted) {
        appendCancelledAttempts(roundBrowserIds, attemptsByBrowser, number)
        break
      }

      pendingBrowserIds = []
      if (number <= config.maxRetries) {
        for (const browserId of roundBrowserIds) {
          const execution = executions.get(browserId)
          if (!execution || execution.attempt.status !== 'failed') {
            continue
          }
          pendingBrowserIds.push(browserId)
          if (execution.failedModuleIds.length > 0 && retryScopeByBrowser.get(browserId) !== 'browser') {
            filtersByBrowser.set(browserId, execution.failedModuleIds)
            if (retryScopeByBrowser.get(browserId) !== 'browser') {
              retryScopeByBrowser.set(browserId, 'failed-files')
            }
          } else {
            filtersByBrowser.set(browserId, [...fileFilters])
            retryScopeByBrowser.set(browserId, 'browser')
          }
        }
      }
    }
  } catch (error) {
    fatalError = error
    runWarnings.push(`Run setup failed: ${redact(errorMessage(error))}`)
  } finally {
    await children.closeAll()
    if (activeTransport) {
      try {
        await activeTransport.close()
      } catch (error) {
        fatalError ??= error
        runWarnings.push(`Transport cleanup failed: ${redact(errorMessage(error))}`)
      }
    }
    signal.removeEventListener('abort', onAbort)
  }

  for (const browserId of selectedBrowserIds) {
    const browser = Object.hasOwn(config.browsers, browserId) ? config.browsers[browserId] : undefined
    if (browser) {
      const result = createBrowserRunResult({
        id: browserId,
        name: browser.name ?? browserId,
        retryScope: retryScopeByBrowser.get(browserId) ?? null,
        attempts: attemptsByBrowser.get(browserId) ?? [],
      })
      browserResults.set(browserId, result)
      logBrowserResult(redactBrowserResult(result, redact))
    }
  }

  const endedAt = new Date().toISOString()
  const result = redactBroysterResult(
    createBroysterResult({
      id: runId,
      projectName: config.projectName,
      buildName: config.buildName,
      startedAt,
      endedAt,
      filters: {
        browserIds: selectedBrowserIds,
        browserFilter: overrides.browserFilter?.source ?? null,
        files: fileFilters,
        testNamePattern: testNamePattern ?? null,
      },
      warnings: runWarnings,
      browsers: [...browserResults.values()],
    }),
    redact,
  )

  try {
    await writeJsonAtomic(config.resultsFile, result)
  } finally {
    await rm(runDirectory, { recursive: true, force: true })
  }

  logSummary(result, Date.now() - startedAtMs, redact(config.resultsFile))
  if (fatalError) {
    const code = signal.aborted ? 'INTERRUPTED' : 'SETUP'
    throw new BroysterRunError(code, redact(errorMessage(fatalError)), fatalError, result)
  }
  return result
}

function applyOverrides(
  config: NormalizedBroysterConfig,
  overrides: BrowserStackRunOverrides,
): NormalizedBroysterConfig {
  const concurrency = overrides.concurrency ?? config.concurrency
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a positive integer.')
  }
  const buildName = normalizeOptionalString(overrides.buildName, 'buildName') ?? config.buildName
  const resultsFile =
    overrides.resultsFile === undefined
      ? config.resultsFile
      : resolve(config.baseDir, normalizeOptionalString(overrides.resultsFile, 'resultsFile')!)
  return {
    ...config,
    concurrency,
    buildName,
    resultsFile,
    failOnFlaky: overrides.failOnFlaky ?? config.failOnFlaky,
  }
}

function selectBrowsers(config: NormalizedBroysterConfig, overrides: BrowserStackRunOverrides): string[] {
  if (overrides.browserIds && overrides.browserFilter) {
    throw new BroysterRunError('CONFIGURATION', 'browserIds and browserFilter cannot be combined.')
  }
  let ids = overrides.browserIds
    ? normalizeStringList(overrides.browserIds, 'browserIds')
    : Object.keys(config.browsers)
  const unknown = ids.filter((id) => !Object.hasOwn(config.browsers, id))
  if (unknown.length > 0) {
    throw new BroysterRunError(
      'CONFIGURATION',
      `Unknown browser IDs: ${unknown.join(', ')}. Available: ${Object.keys(config.browsers).join(', ')}.`,
    )
  }
  if (overrides.browserFilter) {
    ids = ids.filter((id) => {
      overrides.browserFilter!.lastIndex = 0
      return overrides.browserFilter!.test(id)
    })
  }
  if (ids.length === 0) {
    throw new BroysterRunError('CONFIGURATION', 'No browsers matched the requested selection.')
  }
  return ids
}

function normalizeStringList(values: readonly string[], label: string): string[] {
  const result = values.map((value) => value.trim()).filter(Boolean)
  if (result.length !== values.length) {
    throw new BroysterRunError('CONFIGURATION', `${label} cannot contain empty values.`)
  }
  return [...new Set(result)]
}

function normalizeOptionalString(value: string | undefined, label: string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value.trim() === '') {
    throw new BroysterRunError('CONFIGURATION', `${label} cannot be empty.`)
  }
  return value
}

function appendCancelledAttempts(
  browserIds: readonly string[],
  attemptsByBrowser: ReadonlyMap<string, BrowserAttemptResult[]>,
  number: number,
): void {
  for (const browserId of browserIds) {
    const attempts = attemptsByBrowser.get(browserId)
    if (attempts && !attempts.some((attempt) => attempt.number === number)) {
      attempts.push(cancelledAttempt(number))
    }
  }
}

function cancelledAttempt(number: number): BrowserAttemptResult {
  const timestamp = new Date().toISOString()
  return {
    number,
    kind: number === 1 ? 'initial' : 'retry',
    status: 'cancelled',
    exitCode: null,
    signal: null,
    sessionId: null,
    startedAt: timestamp,
    endedAt: timestamp,
    durationMs: 0,
    modules: [],
    unhandledErrors: [],
    warnings: ['The run was cancelled before this attempt started.'],
  }
}

function redactBroysterResult(result: BroysterResult, redact: (value: string) => string): BroysterResult {
  return {
    ...result,
    run: {
      ...result.run,
      projectName: redact(result.run.projectName),
      buildName: redact(result.run.buildName),
      filters: {
        browserIds: result.run.filters.browserIds.map(redact),
        browserFilter: result.run.filters.browserFilter === null ? null : redact(result.run.filters.browserFilter),
        files: result.run.filters.files.map(redact),
        testNamePattern:
          result.run.filters.testNamePattern === null ? null : redact(result.run.filters.testNamePattern),
      },
      warnings: result.run.warnings.map(redact),
    },
    browsers: result.browsers.map((browser) => redactBrowserResult(browser, redact)),
  }
}

function redactBrowserResult(result: BrowserRunResult, redact: (value: string) => string): BrowserRunResult {
  return {
    ...result,
    id: redact(result.id),
    name: redact(result.name),
    attempts: result.attempts.map((attempt) => ({
      ...attempt,
      modules: attempt.modules.map((module) => ({
        ...module,
        id: redact(module.id),
        errors: module.errors.map((error) => redactSerializedError(error, redact)),
        tests: module.tests.map((test) => ({
          ...test,
          id: redact(test.id),
          name: redact(test.name),
          fullName: redact(test.fullName),
          errors: test.errors.map((error) => redactSerializedError(error, redact)),
        })),
      })),
      unhandledErrors: attempt.unhandledErrors.map((error) => redactSerializedError(error, redact)),
      warnings: attempt.warnings.map(redact),
    })),
  }
}

function redactSerializedError(
  error: { readonly name?: string; readonly message: string; readonly stack?: string },
  redact: (value: string) => string,
): { name?: string; message: string; stack?: string } {
  return {
    ...(error.name === undefined ? {} : { name: redact(error.name) }),
    message: redact(error.message),
    ...(error.stack === undefined ? {} : { stack: redact(error.stack) }),
  }
}

function logBrowserResult(result: BrowserRunResult): void {
  const seconds = (result.durationMs / 1_000).toFixed(1)
  // eslint-disable-next-line no-console
  console.log(`  ${result.finalStatus.toUpperCase()}: ${result.id} (${seconds}s)`)
}

function logSummary(result: BroysterResult, durationMs: number, resultPath: string): void {
  const { browsers } = result.run.summary
  // eslint-disable-next-line no-console
  console.log(
    `\nResults: ${browsers.passed} passed, ${browsers.flaky} flaky, ${browsers.failed} failed, ` +
      `${browsers.cancelled} cancelled (${(durationMs / 1_000).toFixed(1)}s)\nArtifact: ${resultPath}\n`,
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}
