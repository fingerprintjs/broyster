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

export type RunSummary = {
  ok: boolean
  results: RunResult[]
  duration: number
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
  const finalAttempt = result.attempts[result.attempts.length - 1]
  const retryDetail =
    result.attempts.length > 1 && finalAttempt
      ? `, ${formatRetryScope(result.retryScope)} exit ${formatExitCode(finalAttempt.exitCode)}`
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
      const finalAttempt = result.attempts[result.attempts.length - 1]
      const retryDetail =
        result.attempts.length > 1 && finalAttempt
          ? `, ${formatRetryScope(result.retryScope)} exit code ${formatExitCode(finalAttempt.exitCode)}`
          : ''
      lines.push(
        `    - ${result.browser} (initial exit code ${formatExitCode(initialAttempt?.exitCode ?? null)}${retryDetail})`,
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}
