import { randomUUID } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { Reporter, TestCase, TestModule } from 'vitest/node'

import { serializeVitestError, type SerializedVitestError } from './error_serialization.js'
import type { BrowserStackRunContext } from './run_context.js'
import { BrowserStackRuntime } from './runtime.js'

export type ChildTestStatus = 'passed' | 'failed' | 'skipped' | 'todo' | 'pending'
export type ChildModuleStatus = Exclude<ChildTestStatus, 'todo'> | 'queued'

export type ChildTestResult = {
  id: string
  name: string
  fullName: string
  status: ChildTestStatus
  durationMs: number
  errors: SerializedVitestError[]
}

export type ChildModuleResult = {
  id: string
  status: ChildModuleStatus
  durationMs: number
  errors: SerializedVitestError[]
  tests: ChildTestResult[]
}

export type ChildRunReport = {
  schemaVersion: 1
  runId: string
  browserId: string
  browserName: string
  browser: string
  attempt: {
    number: number
    kind: 'initial' | 'retry'
  }
  sessionId: string | null
  status: 'passed' | 'failed'
  reason: 'passed' | 'failed' | 'interrupted'
  projectNames: string[]
  failedModuleIds: string[]
  modules: ChildModuleResult[]
  unhandledErrors: SerializedVitestError[]
  warnings: string[]
  startedAt: string
  endedAt: string
  durationMs: number
}

export type ChildResultReporterOptions = {
  context: BrowserStackRunContext
  runtime: BrowserStackRuntime
  now?: () => number
}

export class ChildResultReporter implements Reporter {
  private readonly startedAtMs: number
  private readonly now: () => number

  constructor(private readonly options: ChildResultReporterOptions) {
    this.now = options.now ?? Date.now
    this.startedAtMs = this.now()
  }

  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: 'passed' | 'failed' | 'interrupted',
  ): Promise<void> {
    await this.options.runtime.waitForStatusUpdate()

    const endedAtMs = this.now()
    const modules = testModules.map(serializeModule).sort((left, right) => left.id.localeCompare(right.id))
    const projectNames = uniqueSorted(testModules.map((testModule) => testModule.project.name))
    const failedModuleIds = collectFailedModuleIds(testModules, unhandledErrors)
    const session =
      this.options.runtime.getSession(this.options.context.browser.id) ?? this.options.runtime.getSessions()[0]
    const failed =
      reason !== 'passed' ||
      unhandledErrors.length > 0 ||
      modules.some((testModule) => testModule.status === 'failed' || testModule.errors.length > 0)

    const report: ChildRunReport = {
      schemaVersion: 1,
      runId: this.options.context.run.id,
      browserId: this.options.context.browser.id,
      browserName: this.options.context.browser.name,
      browser: this.options.context.browser.browser,
      attempt: { ...this.options.context.attempt },
      sessionId: session?.sessionId ?? null,
      status: failed ? 'failed' : 'passed',
      reason,
      projectNames,
      failedModuleIds,
      modules,
      unhandledErrors: unhandledErrors.map(serializeVitestError),
      warnings: this.options.runtime.getWarnings(),
      startedAt: new Date(this.startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - this.startedAtMs),
    }

    await writeJsonAtomically(this.options.context.resultFile, report)
  }
}

function serializeModule(testModule: TestModule): ChildModuleResult {
  return {
    id: testModule.moduleId,
    status: testModule.state(),
    durationMs: testModule.diagnostic().duration,
    errors: testModule.errors().map(serializeVitestError),
    tests: [...testModule.children.allTests()].map(serializeTest),
  }
}

function serializeTest(testCase: TestCase): ChildTestResult {
  const result = testCase.result()
  return {
    id: testCase.id,
    name: testCase.name,
    fullName: testCase.fullName,
    status: result.state === 'skipped' && testCase.options.mode === 'todo' ? 'todo' : result.state,
    durationMs: testCase.diagnostic()?.duration ?? 0,
    errors: result.errors?.map(serializeVitestError) ?? [],
  }
}

function collectFailedModuleIds(
  testModules: ReadonlyArray<TestModule>,
  unhandledErrors: ReadonlyArray<unknown>,
): string[] {
  const failedModuleIds = new Set<string>()
  for (const testModule of testModules) {
    const failedTest = [...testModule.children.allTests()].some((testCase) => testCase.result().state === 'failed')
    if (testModule.state() === 'failed' || testModule.errors().length > 0 || failedTest) {
      failedModuleIds.add(testModule.moduleId)
    }
  }
  for (const error of unhandledErrors) {
    collectModuleIdsFromError(error, failedModuleIds, new Set<unknown>())
  }
  return uniqueSorted([...failedModuleIds])
}

function collectModuleIdsFromError(error: unknown, moduleIds: Set<string>, seen: Set<unknown>): void {
  if (typeof error === 'string') {
    addModuleIdsFromText(error, moduleIds)
    return
  }
  if (error === null || typeof error !== 'object' || seen.has(error)) {
    return
  }

  seen.add(error)
  const record = error as Record<string, unknown>
  for (const key of ['message', 'stack', 'stackStr']) {
    if (typeof record[key] === 'string') {
      addModuleIdsFromText(record[key], moduleIds)
    }
  }
  collectModuleIdsFromError(record.cause, moduleIds, seen)
  if (Array.isArray(record.errors)) {
    for (const nestedError of record.errors) {
      collectModuleIdsFromError(nestedError, moduleIds, seen)
    }
  }
}

function addModuleIdsFromText(text: string, moduleIds: Set<string>): void {
  const testModulePattern = /(?:[A-Za-z]:[\\/]|\/|\.{1,2}\/)?[^\s'"`<>]+?\.(?:test|spec)\.[cm]?[jt]sx?/g
  for (const match of text.matchAll(testModulePattern)) {
    moduleIds.add(match[0])
  }
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const directory = dirname(path)
  const temporaryPath = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}
