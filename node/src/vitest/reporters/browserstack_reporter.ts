import { createDebugger } from 'vitest/node'
import type { Reporter, TestModule, TestSpecification, Vitest } from 'vitest/node'

import { BrowserStackApiClient } from '../../api_client.js'
import type { BrowserStackCredentials } from '../../credentials.js'
import { getBrowserStackCredentials } from '../../credentials.js'
import type { SessionRegistry } from '../../session_registry.js'

const debug = createDebugger('vitest:broyster')

type TestRunEndReason = 'passed' | 'failed' | 'interrupted'

export type BrowserStackReporterOptions = {
  /** Registry the provider stores BrowserStack session IDs in */
  registry: SessionRegistry
  /** Defaults to reading BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY */
  credentials?: BrowserStackCredentials
}

/**
 * Marks the BrowserStack Automate sessions as passed or failed once the test
 * run finishes.
 */
export class BrowserStackReporter implements Reporter {
  private options: BrowserStackReporterOptions
  private activeProjects = new Set<string>()

  constructor(options: BrowserStackReporterOptions) {
    this.options = options
  }

  onInit(vitest: Vitest): void {
    vitest.onClose(() => {
      debug?.('Shutting down BrowserStack resources')
      this.options.registry.clear()
      debug?.('BrowserStack cleanup complete')
    })
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    this.activeProjects = new Set(specifications.map((spec) => spec.project.name))
  }

  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): Promise<void> {
    const allSessions = this.options.registry.getAllSessionIds()
    if (allSessions.size === 0) {
      return
    }

    const participatingProjects = new Set(this.activeProjects)
    testModules.forEach((module) => {
      participatingProjects.add(module.project.name)
    })
    if (participatingProjects.size === 0) {
      return
    }

    const credentials = this.options.credentials ?? getBrowserStackCredentials()
    const client = new BrowserStackApiClient(credentials)

    // If there are global failures, mark all participating sessions as 'failed'.
    // unhandledErrors are global (no project identity) and reason is run-wide.
    if (reason !== 'passed' || unhandledErrors.length > 0) {
      debug?.(
        'Run-wide failure (reason=%s, unhandledErrors=%d), marking all sessions as failed',
        reason,
        unhandledErrors.length,
      )
      await this.reportSessions(client, allSessions, participatingProjects, () => 'failed')
      return
    }

    // Per-project: check module.state() for 'failed'
    const projectFailed = new Map<string, boolean>()
    participatingProjects.forEach((projectName) => {
      projectFailed.set(projectName, false)
    })
    for (const module of testModules) {
      const name = module.project.name
      if (!projectFailed.has(name)) {
        projectFailed.set(name, false)
      }
      if (module.state() === 'failed') {
        projectFailed.set(name, true)
      }
    }

    await this.reportSessions(client, allSessions, participatingProjects, (projectName) =>
      projectFailed.get(projectName) ? 'failed' : 'passed',
    )
  }

  private async reportSessions(
    client: BrowserStackApiClient,
    allSessions: Map<string, string>,
    participatingProjects: Set<string>,
    statusFor: (projectName: string) => 'passed' | 'failed',
  ): Promise<void> {
    const promises: Promise<void>[] = []
    for (const [projectName, bsSessionId] of allSessions) {
      if (!participatingProjects.has(projectName)) {
        continue
      }
      const status = statusFor(projectName)
      debug?.('[%s] Reporting session %s as %s', projectName, bsSessionId, status)
      promises.push(
        client
          .setSessionStatus(bsSessionId, status)
          .catch((err) => debug?.('[%s] Failed to report: %s', projectName, err)),
      )
    }
    await Promise.all(promises)
  }
}
