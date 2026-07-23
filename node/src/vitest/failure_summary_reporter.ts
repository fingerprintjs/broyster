import { relative } from 'node:path'

import type { Reporter, TestCase, TestModule } from 'vitest/node'

import { formatVitestError } from './error_serialization.js'

type FailedTestRecord = {
  projectName: string
  moduleId: string
  fullName: string
  durationMs: number
  error: string
}

type ModuleErrorRecord = {
  projectName: string
  moduleId: string
  error: string
}

export type FailureSummaryReporterOptions = {
  runLabel?: string
  log?: (line: string) => void
}

export class FailureSummaryReporter implements Reporter {
  private readonly failedTests: FailedTestRecord[] = []
  private readonly seenFailedTestIds = new Set<string>()

  constructor(private readonly options: FailureSummaryReporterOptions = {}) {}

  onTestRunStart(): void {
    this.failedTests.length = 0
    this.seenFailedTestIds.clear()
  }

  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result()
    if (result.state !== 'failed' || this.seenFailedTestIds.has(testCase.id)) {
      return
    }

    this.seenFailedTestIds.add(testCase.id)
    this.failedTests.push({
      projectName: testCase.project.name,
      moduleId: testCase.module.moduleId,
      fullName: testCase.fullName,
      durationMs: testCase.diagnostic()?.duration ?? 0,
      error: formatVitestError(result.errors[0]),
    })
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<unknown>): void {
    const moduleErrors = collectModuleErrors(testModules)
    if (this.failedTests.length === 0 && moduleErrors.length === 0 && unhandledErrors.length === 0) {
      return
    }

    const log = this.options.log ?? defaultLog
    const projectNames = uniqueSorted(this.failedTests.map((test) => test.projectName))
    const runLabel = this.options.runLabel ?? projectNames.join(', ')

    log('')
    log('='.repeat(68))
    log(`Failure Summary${runLabel ? `: ${runLabel}` : ''}`)
    log('='.repeat(68))

    if (this.failedTests.length > 0) {
      log(`Failed tests: ${this.failedTests.length}`)
      const failedTests = [...this.failedTests].sort((left, right) =>
        left.moduleId === right.moduleId
          ? left.fullName.localeCompare(right.fullName)
          : left.moduleId.localeCompare(right.moduleId),
      )
      for (const failedTest of failedTests) {
        log(`- ${formatModuleId(failedTest.moduleId)}`)
        log(`  [${failedTest.projectName}] ${failedTest.fullName} (${failedTest.durationMs}ms)`)
        log(`  Error: ${failedTest.error}`)
      }
    }

    if (moduleErrors.length > 0) {
      log(`Module errors: ${moduleErrors.length}`)
      for (const moduleError of moduleErrors) {
        log(`- ${formatModuleId(moduleError.moduleId)}`)
        log(`  [${moduleError.projectName}] ${moduleError.error}`)
      }
    }

    if (unhandledErrors.length > 0) {
      log(`Unhandled errors: ${unhandledErrors.length}`)
      for (const error of unhandledErrors) {
        log(`- ${formatVitestError(error)}`)
      }
    }

    log('='.repeat(68))
    log('')
  }
}

function collectModuleErrors(testModules: ReadonlyArray<TestModule>): ModuleErrorRecord[] {
  const moduleErrors: ModuleErrorRecord[] = []
  for (const testModule of testModules) {
    for (const error of testModule.errors()) {
      moduleErrors.push({
        projectName: testModule.project.name,
        moduleId: testModule.moduleId,
        error: formatVitestError(error),
      })
    }
  }
  return moduleErrors
}

function formatModuleId(moduleId: string): string {
  const relativeModuleId = relative(process.cwd(), moduleId)
  const normalized = relativeModuleId && !relativeModuleId.startsWith('..') ? relativeModuleId : moduleId
  return normalized.replace(/\\/g, '/')
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function defaultLog(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line)
}
