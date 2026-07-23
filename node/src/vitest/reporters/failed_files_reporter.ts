import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Reporter, TestCase, TestModule } from 'vitest/node'

import { readChildContext } from '../../env_contract.js'

type FailedFilesReport = {
  browser: string | null
  projectNames: string[]
  failedModuleIds: string[]
  failedTestModuleIds: string[]
  moduleErrorIds: string[]
  failedStateModuleIds: string[]
  unhandledErrorModuleIds: string[]
  unhandledErrorCount: number
}

/**
 * Writes a JSON report of failed test files. The orchestrator reads it to
 * retry only the failed files instead of the whole browser run.
 */
export class FailedFilesReporter implements Reporter {
  private failedTestModuleIds = new Set<string>()
  private projectNames = new Set<string>()

  onTestRunStart(): void {
    this.failedTestModuleIds.clear()
    this.projectNames.clear()
  }

  onTestCaseResult(testCase: TestCase): void {
    this.projectNames.add(testCase.project.name)

    if (testCase.result().state === 'failed') {
      this.failedTestModuleIds.add(testCase.module.moduleId)
    }
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<unknown>): Promise<void> {
    const context = readChildContext()
    const outputPath = context?.failedFilesOut
    if (!outputPath) {
      return
    }

    const moduleErrorIds = new Set<string>()
    const failedStateModuleIds = new Set<string>()
    const unhandledErrorModuleIds = collectUnhandledErrorModuleIds(unhandledErrors)

    for (const testModule of testModules) {
      this.projectNames.add(testModule.project.name)

      if (testModule.errors().length > 0) {
        moduleErrorIds.add(testModule.moduleId)
      }

      if (testModule.state() === 'failed') {
        failedStateModuleIds.add(testModule.moduleId)
      }
    }

    const failedModuleIds = uniqueSorted([
      ...this.failedTestModuleIds,
      ...moduleErrorIds,
      ...failedStateModuleIds,
      ...unhandledErrorModuleIds,
    ])
    const report: FailedFilesReport = {
      browser: context?.browserKey ?? null,
      projectNames: uniqueSorted([...this.projectNames]),
      failedModuleIds,
      failedTestModuleIds: uniqueSorted([...this.failedTestModuleIds]),
      moduleErrorIds: uniqueSorted([...moduleErrorIds]),
      failedStateModuleIds: uniqueSorted([...failedStateModuleIds]),
      unhandledErrorModuleIds: uniqueSorted([...unhandledErrorModuleIds]),
      unhandledErrorCount: unhandledErrors.length,
    }

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function collectUnhandledErrorModuleIds(unhandledErrors: ReadonlyArray<unknown>): Set<string> {
  const moduleIds = new Set<string>()

  for (const error of unhandledErrors) {
    collectModuleIdsFromError(error, moduleIds, new Set<unknown>())
  }

  return moduleIds
}

function collectModuleIdsFromError(error: unknown, moduleIds: Set<string>, seen: Set<unknown>): void {
  if (error === null || error === undefined) {
    return
  }

  if (typeof error === 'string') {
    addModuleIdsFromText(error, moduleIds)
    return
  }

  if (typeof error !== 'object' || seen.has(error)) {
    return
  }
  seen.add(error)

  const record = error as Record<string, unknown>
  for (const key of ['message', 'stack', 'stackStr']) {
    const value = record[key]
    if (typeof value === 'string') {
      addModuleIdsFromText(value, moduleIds)
    }
  }

  collectModuleIdsFromError(record.cause, moduleIds, seen)

  const nestedErrors = record.errors
  if (Array.isArray(nestedErrors)) {
    for (const nestedError of nestedErrors) {
      collectModuleIdsFromError(nestedError, moduleIds, seen)
    }
  }
}

// Fallback: when a module crashes before structured results exist, recover
// test file paths from the error text.
function addModuleIdsFromText(text: string, moduleIds: Set<string>): void {
  const testModulePattern = /(?:[A-Za-z]:[\\/]|\/|\.{1,2}\/)?[^\s'"`<>]+?\.test\.[cm]?[tj]sx?/g
  for (const match of text.matchAll(testModulePattern)) {
    moduleIds.add(match[0])
  }
}
