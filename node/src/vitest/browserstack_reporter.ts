import { createDebugger } from 'vitest/node'
import type { Reporter, TestModule, TestSpecification, Vitest } from 'vitest/node'

import { reportSessionStatusAsync } from './api_client'
import { getCredentials } from './credentials'
import { BrowserStackSessionManager } from './session_manager'

const debug = createDebugger('vitest:browser:browserstack')

type TestRunEndReason = 'passed' | 'failed' | 'interrupted'

export type BrowserStackReporterOptions = {
  localIdentifier?: string | null
}

export class BrowserStackReporter implements Reporter {
  private options: BrowserStackReporterOptions
  private activeProjects = new Set<string>()

  constructor(options: BrowserStackReporterOptions = {}) {
    this.options = options
  }

  onInit(vitest: Vitest): void {
    const localIdentifier = this.options.localIdentifier ?? process.env.BS_LOCAL_IDENTIFIER ?? null
    BrowserStackSessionManager.setTunnelIdentifier(localIdentifier)

    vitest.onClose(() => {
      debug?.('Shutting down BrowserStack resources')
      BrowserStackSessionManager.clear()
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
    const allSessions = BrowserStackSessionManager.getAllSessionIds()
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

    const credentials = getCredentials()

    if (reason !== 'passed' || unhandledErrors.length > 0) {
      debug?.(
        'Run-wide failure (reason=%s, unhandledErrors=%d), marking all sessions as failed',
        reason,
        unhandledErrors.length,
      )
      const promises: Promise<void>[] = []
      for (const [projectName, bsSessionId] of allSessions) {
        if (!participatingProjects.has(projectName)) {
          continue
        }
        debug?.('[%s] Reporting session %s as failed', projectName, bsSessionId)
        promises.push(
          reportSessionStatusAsync(credentials, bsSessionId, 'failed').catch((err) =>
            debug?.('[%s] Failed to report: %s', projectName, err),
          ),
        )
      }
      await Promise.all(promises)
      return
    }

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

    const promises: Promise<void>[] = []
    for (const [projectName, bsSessionId] of allSessions) {
      if (!participatingProjects.has(projectName)) {
        continue
      }
      const failed = projectFailed.get(projectName) ?? false
      const status = failed ? 'failed' : 'passed'
      debug?.('[%s] Reporting session %s as %s', projectName, bsSessionId, status)
      promises.push(
        reportSessionStatusAsync(credentials, bsSessionId, status).catch((err) =>
          debug?.('[%s] Failed to report: %s', projectName, err),
        ),
      )
    }
    await Promise.all(promises)
  }
}
