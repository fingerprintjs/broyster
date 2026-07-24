import { randomUUID } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { compareById, uniqueSorted } from '../internal/collections.js'
import { formatJson } from '../internal/json.js'
import { finiteNonNegative } from '../internal/validation.js'

export const BROYSTER_RESULTS_SCHEMA_VERSION = 1 as const

export type RunStatus = 'PASS' | 'FLAKY' | 'FAIL'
export type RunAttemptName = 'initial' | 'retry'
export type RetryScope = 'files' | 'browser'

export type SerializedError = {
  name?: string
  message: string
  stack?: string
}

export type TestCaseResult = {
  id: string
  name: string
  fullName: string
  status: 'passed' | 'failed' | 'skipped' | 'todo'
  duration: number
  errors: SerializedError[]
}

export type TestModuleResult = {
  id: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  errors: SerializedError[]
  tests: TestCaseResult[]
}

export type RunAttemptResult = {
  browser: string
  attempt: RunAttemptName
  exitCode: number | null
  duration: number
  failedModuleIds: string[]
  /** Structured child results, when the Vitest reporter completed. */
  modules?: TestModuleResult[]
  unhandledErrors?: SerializedError[]
  warnings?: string[]
}

export type RunResult = {
  browser: string
  status: RunStatus
  exitCode: number | null
  duration: number
  attempts: RunAttemptResult[]
  retryScope?: RetryScope
  /** Effective module state after applying the retry to the initial attempt. */
  modules?: TestModuleResult[]
}

export type RunSummary = {
  schemaVersion: typeof BROYSTER_RESULTS_SCHEMA_VERSION
  ok: boolean
  results: RunResult[]
  duration: number
}

/**
 * Produces the final module state deterministically. A browser retry replaces
 * the initial state; a failed-file retry overlays only the modules it reran.
 */
export function mergeAttemptModules(
  attempts: readonly RunAttemptResult[],
  retryScope: RetryScope | undefined,
): TestModuleResult[] {
  const orderedAttempts = sortAttempts(attempts)
  if (orderedAttempts.length === 0) {
    return []
  }
  if (retryScope !== 'files') {
    return normalizeModules(orderedAttempts[orderedAttempts.length - 1]?.modules ?? [])
  }

  const modules = new Map<string, TestModuleResult>()
  for (const attempt of orderedAttempts) {
    for (const module of normalizeModules(attempt.modules ?? [])) {
      modules.set(module.id, module)
    }
  }
  return [...modules.values()].sort(compareById)
}

export function normalizeRunResult(result: RunResult): RunResult {
  const attempts = sortAttempts(result.attempts).map(normalizeAttempt)
  return {
    ...result,
    duration: finiteNonNegative(result.duration),
    attempts,
    modules: mergeAttemptModules(attempts, result.retryScope),
  }
}

export function createRunSummary(results: readonly RunResult[], duration: number): RunSummary {
  const normalizedResults = results
    .map(normalizeRunResult)
    .sort((left, right) => left.browser.localeCompare(right.browser))
  return {
    schemaVersion: BROYSTER_RESULTS_SCHEMA_VERSION,
    ok: normalizedResults.every((result) => result.status !== 'FAIL'),
    results: normalizedResults,
    duration: finiteNonNegative(duration),
  }
}

/** Writes the public run artifact atomically so readers never observe partial JSON. */
export async function writeRunSummary(path: string, summary: RunSummary): Promise<void> {
  const directory = dirname(path)
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporaryPath, formatJson(summary), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

export function formatExitCode(exitCode: number | null): string {
  return exitCode === null ? 'null' : String(exitCode)
}

export function formatRetryScope(scope: RetryScope | undefined): string {
  switch (scope) {
    case 'files':
      return 'file-level retry'
    case 'browser':
      return 'browser-level retry'
    default:
      return 'retry'
  }
}

export function formatRunResult(result: RunResult): string {
  const seconds = (result.duration / 1000).toFixed(1)
  const initialAttempt = result.attempts[0]
  const retryAttempt = getRetryAttempt(result)
  const retryDetail = retryAttempt
    ? `, ${formatRetryScope(result.retryScope)} exit ${formatExitCode(retryAttempt.exitCode)}`
    : ''

  return `  ${result.status}: ${result.browser} (${seconds}s, initial exit ${formatExitCode(
    initialAttempt?.exitCode ?? null,
  )}${retryDetail})`
}

export function formatSummary(summary: RunSummary): string {
  const totalDuration = (summary.duration / 1000).toFixed(1)
  const passed = summary.results.filter((r) => r.status === 'PASS')
  const flaky = summary.results.filter((r) => r.status === 'FLAKY')
  const failed = summary.results.filter((r) => r.status === 'FAIL')
  const lines: string[] = []

  lines.push('')
  lines.push('='.repeat(60))
  lines.push(`  Results: ${passed.length} passed, ${flaky.length} flaky, ${failed.length} failed (${totalDuration}s)`)
  lines.push('='.repeat(60))

  if (flaky.length > 0) {
    lines.push('')
    lines.push('  Flaky browsers:')
    for (const result of flaky) {
      if (result.retryScope === 'browser') {
        lines.push(`    - ${result.browser} (browser passed on retry after no failed files were reported)`)
      } else {
        const failedFiles = result.attempts[0]?.failedModuleIds.length ?? 0
        lines.push(`    - ${result.browser} (${failedFiles} file(s) passed on retry)`)
      }
    }
  }

  if (failed.length > 0) {
    lines.push('')
    lines.push('  Failed browsers:')
    for (const result of failed) {
      const initialAttempt = result.attempts[0]
      const retryAttempt = getRetryAttempt(result)
      const retryDetail = retryAttempt
        ? `, ${formatRetryScope(result.retryScope)} exit code ${formatExitCode(retryAttempt.exitCode)}`
        : ''
      lines.push(
        `    - ${result.browser} (initial exit code ${formatExitCode(initialAttempt?.exitCode ?? null)}${retryDetail})`,
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}

function normalizeAttempt(attempt: RunAttemptResult): RunAttemptResult {
  return {
    ...attempt,
    duration: finiteNonNegative(attempt.duration),
    failedModuleIds: uniqueSorted(attempt.failedModuleIds),
    modules: normalizeModules(attempt.modules ?? []),
    unhandledErrors: (attempt.unhandledErrors ?? []).map((error) => ({ ...error })),
    warnings: [...(attempt.warnings ?? [])],
  }
}

function normalizeModules(modules: readonly TestModuleResult[]): TestModuleResult[] {
  const byId = new Map<string, TestModuleResult>()
  for (const module of modules) {
    const tests = new Map<string, TestCaseResult>()
    for (const test of module.tests) {
      tests.set(test.id, {
        ...test,
        duration: finiteNonNegative(test.duration),
        errors: test.errors.map((error) => ({ ...error })),
      })
    }
    byId.set(module.id, {
      ...module,
      duration: finiteNonNegative(module.duration),
      errors: module.errors.map((error) => ({ ...error })),
      tests: [...tests.values()].sort(compareById),
    })
  }
  return [...byId.values()].sort(compareById)
}

function sortAttempts(attempts: readonly RunAttemptResult[]): RunAttemptResult[] {
  const order: Record<RunAttemptName, number> = { initial: 0, retry: 1 }
  return attempts
    .map((attempt, index) => ({ attempt, index }))
    .sort((left, right) => order[left.attempt.attempt] - order[right.attempt.attempt] || left.index - right.index)
    .map(({ attempt }) => attempt)
}

function getRetryAttempt(result: RunResult): RunAttemptResult | undefined {
  return result.attempts.length > 1 ? result.attempts[result.attempts.length - 1] : undefined
}
