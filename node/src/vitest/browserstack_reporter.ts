import type { Reporter, TestModule, TestSpecification, Vitest } from 'vitest/node'
import { createDebugger } from 'vitest/node'

import { BrowserStackClient } from '../core/browserstack_client.js'
import { getBrowserStackCredentials } from '../core/credentials.js'
import { BrowserStackRuntime } from './runtime.js'

const debug = createDebugger('vitest:browser:broyster')
const DEFAULT_STATUS_UPDATE_TIMEOUT_MS = 30_000

type TestRunEndReason = 'passed' | 'failed' | 'interrupted'

export type BrowserStackReporterOptions = {
  runtime: BrowserStackRuntime
  apiBaseUrl: string
  statusUpdateTimeoutMs?: number
  client?: BrowserStackSessionClient
}

export type BrowserStackSessionClient = {
  updateSession(
    sessionId: string,
    update: { status: 'passed' | 'failed'; reason?: string },
    signal?: AbortSignal,
  ): Promise<void>
}

export class BrowserStackReporter implements Reporter {
  private activeProjects = new Set<string>()

  constructor(private readonly options: BrowserStackReporterOptions) {}

  onInit(vitest: Vitest): void {
    vitest.onClose(() => {
      this.options.runtime.clear()
    })
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    this.activeProjects = new Set(specifications.map((specification) => specification.project.name))
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): Promise<void> {
    const update = this.reportStatuses(testModules, unhandledErrors, reason).catch((error) => {
      const warning = `[broyster] Failed to report BrowserStack session status: ${getErrorMessage(error)}`
      this.options.runtime.addWarning(warning)
      debug?.('%s', warning)
    })
    this.options.runtime.trackStatusUpdate(update)
    return update
  }

  private async reportStatuses(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): Promise<void> {
    const sessions = this.options.runtime.getSessions()
    if (sessions.length === 0) {
      return
    }

    const participatingProjects = new Set(this.activeProjects)
    for (const testModule of testModules) {
      participatingProjects.add(testModule.project.name)
    }

    const projectFailed = new Map<string, boolean>()
    for (const testModule of testModules) {
      const projectName = testModule.project.name
      const failed = testModule.state() === 'failed' || testModule.errors().length > 0
      projectFailed.set(projectName, (projectFailed.get(projectName) ?? false) || failed)
    }

    const runFailed = reason !== 'passed' || unhandledErrors.length > 0
    const client =
      this.options.client ??
      new BrowserStackClient({
        credentials: getBrowserStackCredentials(),
        apiBaseUrl: this.options.apiBaseUrl,
      })
    await Promise.all(
      sessions.map(async ({ projectName, sessionId }) => {
        if (participatingProjects.size > 0 && !participatingProjects.has(projectName)) {
          return
        }

        const failed = runFailed || (projectFailed.get(projectName) ?? false)
        const status = failed ? 'failed' : 'passed'
        const statusReason = makeStatusReason(status, reason, unhandledErrors.length)
        try {
          await client.updateSession(
            sessionId,
            { status, reason: statusReason },
            AbortSignal.timeout(this.options.statusUpdateTimeoutMs ?? DEFAULT_STATUS_UPDATE_TIMEOUT_MS),
          )
          debug?.('[%s] Reported BrowserStack session %s as %s', projectName, sessionId, status)
        } catch (error) {
          const warning = `[broyster] Failed to update BrowserStack session ${sessionId}: ${getErrorMessage(error)}`
          this.options.runtime.addWarning(warning)
          debug?.('%s', warning)
        }
      }),
    )
  }
}

function makeStatusReason(status: 'passed' | 'failed', reason: TestRunEndReason, unhandledErrorCount: number): string {
  if (status === 'passed') {
    return 'All Vitest tests passed.'
  }
  if (reason === 'interrupted') {
    return 'The Vitest run was interrupted.'
  }
  if (unhandledErrorCount > 0) {
    return `Vitest reported ${unhandledErrorCount} unhandled error${unhandledErrorCount === 1 ? '' : 's'}.`
  }
  return 'Vitest reported one or more test failures.'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
