import { relative } from 'node:path'
import type { Reporter, TestCase, TestModule } from 'vitest/node'

import { readChildContext } from '../../env_contract.js'

type FailedTestRecord = {
  projectName: string
  moduleId: string
  fullName: string
  duration: number
  error: string
}

type ModuleErrorRecord = {
  projectName: string
  moduleId: string
  error: string
}

/**
 * Prints a compact, human-readable block of all failures at the end of the
 * run — handy when the default reporter output is drowned in per-browser logs.
 */
export class FailureSummaryReporter implements Reporter {
  private failedTests: FailedTestRecord[] = []
  private seenFailedTestIds = new Set<string>()

  onTestRunStart(): void {
    this.failedTests = []
    this.seenFailedTestIds.clear()
  }

  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result()
    if (result.state !== 'failed') {
      return
    }

    if (this.seenFailedTestIds.has(testCase.id)) {
      return
    }
    this.seenFailedTestIds.add(testCase.id)

    this.failedTests.push({
      projectName: testCase.project.name,
      moduleId: testCase.module.moduleId,
      fullName: testCase.fullName,
      duration: testCase.diagnostic()?.duration ?? 0,
      error: formatError(result.errors?.[0]),
    })
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<unknown>): void {
    const moduleErrors = collectModuleErrors(testModules)

    if (this.failedTests.length === 0 && moduleErrors.length === 0 && unhandledErrors.length === 0) {
      return
    }

    const projectNames = uniqueValues(this.failedTests.map((test) => test.projectName))
    const runLabel = readChildContext()?.browserKey || projectNames.join(', ')

    logLine('')
    logLine('='.repeat(68))
    logLine(`Failure Summary${runLabel ? `: ${runLabel}` : ''}`)
    logLine('='.repeat(68))

    if (this.failedTests.length > 0) {
      logLine(`Failed tests: ${this.failedTests.length}`)
      const failedTests = [...this.failedTests].sort((left, right) =>
        left.moduleId === right.moduleId
          ? left.fullName.localeCompare(right.fullName)
          : left.moduleId.localeCompare(right.moduleId),
      )

      for (const failedTest of failedTests) {
        logLine(`- ${formatModuleId(failedTest.moduleId)}`)
        logLine(`  [${failedTest.projectName}] ${failedTest.fullName} (${failedTest.duration}ms)`)
        logLine(`  Error: ${failedTest.error}`)
      }
    }

    if (moduleErrors.length > 0) {
      logLine(`Module errors: ${moduleErrors.length}`)
      for (const moduleError of moduleErrors) {
        logLine(`- ${formatModuleId(moduleError.moduleId)}`)
        logLine(`  [${moduleError.projectName}] ${moduleError.error}`)
      }
    }

    if (unhandledErrors.length > 0) {
      logLine(`Unhandled errors: ${unhandledErrors.length}`)
      for (const error of unhandledErrors) {
        logLine(`- ${formatError(error)}`)
      }
    }

    logLine('='.repeat(68))
    logLine('')
  }
}

function collectModuleErrors(testModules: ReadonlyArray<TestModule>): ModuleErrorRecord[] {
  const moduleErrors: ModuleErrorRecord[] = []

  for (const testModule of testModules) {
    for (const error of testModule.errors()) {
      moduleErrors.push({
        projectName: testModule.project.name,
        moduleId: testModule.moduleId,
        error: formatError(error),
      })
    }
  }

  return moduleErrors
}

function formatModuleId(moduleId: string): string {
  const relativeModuleId = relative(process.cwd(), moduleId)
  const normalizedModuleId = relativeModuleId && !relativeModuleId.startsWith('..') ? relativeModuleId : moduleId
  return normalizedModuleId.replace(/\\/g, '/')
}

function formatError(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Unknown error'
  }

  if (typeof error === 'string') {
    return toSingleLine(error)
  }

  if (typeof error === 'object') {
    const { name, message, stack, stackStr } = error as {
      name?: unknown
      message?: unknown
      stack?: unknown
      stackStr?: unknown
    }

    if (typeof name === 'string' && typeof message === 'string' && message) {
      return toSingleLine(name === 'Error' ? message : `${name}: ${message}`)
    }

    if (typeof message === 'string' && message) {
      return toSingleLine(message)
    }

    if (typeof stackStr === 'string' && stackStr) {
      return toSingleLine(stackStr)
    }

    if (typeof stack === 'string' && stack) {
      return toSingleLine(stack)
    }
  }

  return toSingleLine(String(error))
}

function toSingleLine(message: string): string {
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ')
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function logLine(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line)
}
