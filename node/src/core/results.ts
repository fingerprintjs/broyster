export const BROYSTER_RESULTS_SCHEMA_VERSION = 1 as const

export type TestCaseStatus = 'passed' | 'failed' | 'skipped' | 'todo'
export type TestModuleStatus = 'passed' | 'failed' | 'skipped'
export type BrowserAttemptStatus = 'passed' | 'failed' | 'cancelled'
export type BrowserFinalStatus = 'passed' | 'flaky' | 'failed' | 'cancelled'
export type BroysterRunStatus = BrowserFinalStatus
export type RetryScope = 'failed-files' | 'browser'

export interface SerializedError {
  readonly name?: string
  readonly message: string
  readonly stack?: string
}

export interface TestCaseResult {
  readonly id: string
  readonly name: string
  readonly fullName: string
  readonly status: TestCaseStatus
  readonly durationMs: number
  readonly errors: readonly SerializedError[]
}

export interface TestModuleResult {
  readonly id: string
  readonly status: TestModuleStatus
  readonly durationMs: number
  readonly errors: readonly SerializedError[]
  readonly tests: readonly TestCaseResult[]
}

export interface BrowserAttemptResult {
  readonly number: number
  readonly kind: 'initial' | 'retry'
  readonly status: BrowserAttemptStatus
  readonly exitCode: number | null
  readonly signal: string | null
  readonly sessionId: string | null
  readonly startedAt: string
  readonly endedAt: string
  readonly durationMs: number
  readonly modules: readonly TestModuleResult[]
  readonly unhandledErrors: readonly SerializedError[]
  readonly warnings: readonly string[]
}

export interface BrowserRunResult {
  readonly id: string
  readonly name: string
  readonly finalStatus: BrowserFinalStatus
  readonly retryScope: RetryScope | null
  readonly durationMs: number
  readonly attempts: readonly BrowserAttemptResult[]
}

export interface BroysterRunFilters {
  readonly browserIds: readonly string[]
  readonly browserFilter: string | null
  readonly files: readonly string[]
  readonly testNamePattern: string | null
}

export interface RunSummary {
  readonly attempts: number
  readonly browsers: {
    readonly total: number
    readonly passed: number
    readonly flaky: number
    readonly failed: number
    readonly cancelled: number
  }
  readonly modules: {
    readonly total: number
    readonly passed: number
    readonly failed: number
    readonly skipped: number
  }
  readonly tests: {
    readonly total: number
    readonly passed: number
    readonly failed: number
    readonly skipped: number
    readonly todo: number
  }
}

export interface BroysterRunMetadata {
  readonly id: string
  readonly projectName: string
  readonly buildName: string
  readonly startedAt: string
  readonly endedAt: string
  readonly durationMs: number
  readonly status: BroysterRunStatus
  readonly filters: BroysterRunFilters
  readonly summary: RunSummary
  readonly warnings: readonly string[]
}

export interface BroysterResult {
  readonly schemaVersion: typeof BROYSTER_RESULTS_SCHEMA_VERSION
  readonly run: BroysterRunMetadata
  readonly browsers: readonly BrowserRunResult[]
}

export interface CreateBrowserRunResultInput {
  readonly id: string
  readonly name?: string
  readonly retryScope?: RetryScope | null
  readonly attempts: readonly BrowserAttemptResult[]
}

export interface CreateBroysterResultInput {
  readonly id: string
  readonly projectName: string
  readonly buildName: string
  readonly startedAt: string
  readonly endedAt: string
  readonly filters?: Partial<BroysterRunFilters>
  readonly warnings?: readonly string[]
  readonly browsers: readonly BrowserRunResult[]
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      ...(error.name && { name: error.name }),
      message: error.message || error.name || 'Unknown error',
      ...(error.stack && { stack: error.stack }),
    }
  }
  if (typeof error === 'string') {
    return { message: error }
  }
  if (isRecord(error)) {
    const name = typeof error.name === 'string' && error.name ? error.name : undefined
    const message = typeof error.message === 'string' && error.message ? error.message : safeStringify(error)
    const stack = typeof error.stack === 'string' && error.stack ? error.stack : undefined
    return {
      ...(name && { name }),
      message,
      ...(stack && { stack }),
    }
  }
  return { message: String(error) }
}

/**
 * Produces the effective module state after retrying. A browser retry replaces the
 * previous run; a failed-files retry overlays only the modules present in that attempt.
 */
export function mergeAttemptModules(
  attempts: readonly BrowserAttemptResult[],
  retryScope: RetryScope | null,
): readonly TestModuleResult[] {
  const orderedAttempts = sortAttempts(attempts)
  if (orderedAttempts.length === 0) {
    return []
  }
  if (retryScope !== 'failed-files') {
    return normalizeModules(orderedAttempts[orderedAttempts.length - 1].modules)
  }

  const modules = new Map<string, TestModuleResult>()
  for (const attempt of orderedAttempts) {
    for (const module of normalizeModules(attempt.modules)) {
      modules.set(module.id, module)
    }
  }
  return [...modules.values()].sort(compareById)
}

export function deriveBrowserFinalStatus(attempts: readonly BrowserAttemptResult[]): BrowserFinalStatus {
  const orderedAttempts = sortAttempts(attempts)
  const finalAttempt = orderedAttempts[orderedAttempts.length - 1]
  if (!finalAttempt || finalAttempt.status === 'cancelled') {
    return 'cancelled'
  }
  if (finalAttempt.status === 'failed') {
    return 'failed'
  }
  return orderedAttempts.slice(0, -1).some((attempt) => attempt.status !== 'passed') ? 'flaky' : 'passed'
}

export function createBrowserRunResult(input: CreateBrowserRunResultInput): BrowserRunResult {
  const attempts = sortAttempts(input.attempts).map(normalizeAttempt)
  const retryScope = attempts.length > 1 ? (input.retryScope ?? 'browser') : null
  return {
    id: input.id,
    name: input.name ?? input.id,
    finalStatus: deriveBrowserFinalStatus(attempts),
    retryScope,
    durationMs: attempts.reduce((total, attempt) => total + nonNegative(attempt.durationMs), 0),
    attempts,
  }
}

/** Merges independently produced child results and returns a stable browser-id order. */
export function mergeBrowserRunResults(
  ...collections: readonly (readonly BrowserRunResult[])[]
): readonly BrowserRunResult[] {
  const browsers = new Map<string, BrowserRunResult>()

  for (const collection of collections) {
    for (const browser of collection) {
      const previous = browsers.get(browser.id)
      if (!previous) {
        browsers.set(
          browser.id,
          createBrowserRunResult({
            id: browser.id,
            name: browser.name,
            retryScope: browser.retryScope,
            attempts: browser.attempts,
          }),
        )
        continue
      }

      const attempts = new Map<number, BrowserAttemptResult>()
      for (const attempt of [...previous.attempts, ...browser.attempts]) {
        attempts.set(attempt.number, attempt)
      }
      browsers.set(
        browser.id,
        createBrowserRunResult({
          id: browser.id,
          name: browser.name || previous.name,
          retryScope: browser.retryScope ?? previous.retryScope,
          attempts: [...attempts.values()],
        }),
      )
    }
  }

  return [...browsers.values()].sort(compareById)
}

export function summarizeBrowserResults(browsers: readonly BrowserRunResult[]): RunSummary {
  const summary: MutableRunSummary = {
    attempts: 0,
    browsers: { total: 0, passed: 0, flaky: 0, failed: 0, cancelled: 0 },
    modules: { total: 0, passed: 0, failed: 0, skipped: 0 },
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
  }

  for (const browser of browsers) {
    summary.browsers.total += 1
    summary.browsers[browser.finalStatus] += 1
    summary.attempts += browser.attempts.length

    for (const module of mergeAttemptModules(browser.attempts, browser.retryScope)) {
      summary.modules.total += 1
      summary.modules[module.status] += 1
      for (const test of module.tests) {
        summary.tests.total += 1
        summary.tests[test.status] += 1
      }
    }
  }

  return summary
}

export function createBroysterResult(input: CreateBroysterResultInput): BroysterResult {
  const browsers = mergeBrowserRunResults(input.browsers)
  const summary = summarizeBrowserResults(browsers)
  const startedAtMs = Date.parse(input.startedAt)
  const endedAtMs = Date.parse(input.endedAt)

  return {
    schemaVersion: BROYSTER_RESULTS_SCHEMA_VERSION,
    run: {
      id: input.id,
      projectName: input.projectName,
      buildName: input.buildName,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationMs: Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) ? Math.max(0, endedAtMs - startedAtMs) : 0,
      status: deriveRunStatus(browsers),
      filters: {
        browserIds: uniqueSorted(input.filters?.browserIds ?? []),
        browserFilter: input.filters?.browserFilter ?? null,
        files: uniqueSorted(input.filters?.files ?? []),
        testNamePattern: input.filters?.testNamePattern ?? null,
      },
      summary,
      warnings: [...(input.warnings ?? [])],
    },
    browsers,
  }
}

function deriveRunStatus(browsers: readonly BrowserRunResult[]): BroysterRunStatus {
  if (browsers.length === 0 || browsers.some((browser) => browser.finalStatus === 'cancelled')) {
    return 'cancelled'
  }
  if (browsers.some((browser) => browser.finalStatus === 'failed')) {
    return 'failed'
  }
  if (browsers.some((browser) => browser.finalStatus === 'flaky')) {
    return 'flaky'
  }
  return 'passed'
}

function normalizeAttempt(attempt: BrowserAttemptResult): BrowserAttemptResult {
  return {
    ...attempt,
    durationMs: nonNegative(attempt.durationMs),
    modules: normalizeModules(attempt.modules),
    unhandledErrors: attempt.unhandledErrors.map(cloneError),
    warnings: [...attempt.warnings],
  }
}

function normalizeModules(modules: readonly TestModuleResult[]): readonly TestModuleResult[] {
  const modulesById = new Map<string, TestModuleResult>()
  for (const module of modules) {
    const testsById = new Map<string, TestCaseResult>()
    for (const test of module.tests) {
      testsById.set(test.id, {
        ...test,
        durationMs: nonNegative(test.durationMs),
        errors: test.errors.map(cloneError),
      })
    }
    modulesById.set(module.id, {
      ...module,
      durationMs: nonNegative(module.durationMs),
      errors: module.errors.map(cloneError),
      tests: [...testsById.values()].sort(compareById),
    })
  }
  return [...modulesById.values()].sort(compareById)
}

function sortAttempts(attempts: readonly BrowserAttemptResult[]): BrowserAttemptResult[] {
  return attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort((left, right) => left.attempt.number - right.attempt.number || left.index - right.index)
    .map(({ attempt }) => attempt)
}

function cloneError(error: SerializedError): SerializedError {
  return { ...error }
}

function compareById<T extends { readonly id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id)
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return (
      JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) {
            return '[Circular]'
          }
          seen.add(item)
        }
        return item
      }) ?? String(value)
    )
  } catch {
    return String(value)
  }
}

type MutableRunSummary = {
  attempts: number
  browsers: Record<'total' | BrowserFinalStatus, number>
  modules: Record<'total' | TestModuleStatus, number>
  tests: Record<'total' | TestCaseStatus, number>
}
