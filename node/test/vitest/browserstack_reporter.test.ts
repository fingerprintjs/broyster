import { describe, expect, it, vi } from 'vitest'
import type { TestModule, TestSpecification } from 'vitest/node'

import { BrowserStackReporter } from '../../src/vitest/browserstack_reporter.js'
import { BrowserStackRuntime } from '../../src/vitest/runtime.js'

describe('BrowserStackReporter', () => {
  it('reports the matching session and converts API failures into artifact warnings', async () => {
    const runtime = new BrowserStackRuntime()
    runtime.setSession('chrome-latest', 'session-123')
    const updateSession = vi.fn(async () => {
      throw new Error('temporary API failure')
    })
    const reporter = new BrowserStackReporter({
      runtime,
      apiBaseUrl: 'https://api.browserstack.com/automate',
      client: { updateSession },
    })
    reporter.onTestRunStart([makeSpecification('chrome-latest')])

    await reporter.onTestRunEnd([makeModule('chrome-latest', 'failed')], [], 'failed')

    expect(updateSession).toHaveBeenCalledWith(
      'session-123',
      {
        status: 'failed',
        reason: 'Vitest reported one or more test failures.',
      },
      expect.any(AbortSignal),
    )
    expect(runtime.getWarnings()).toEqual([
      '[broyster] Failed to update BrowserStack session session-123: temporary API failure',
    ])
  })
})

function makeSpecification(projectName: string): TestSpecification {
  return { project: { name: projectName } } as unknown as TestSpecification
}

function makeModule(projectName: string, state: 'passed' | 'failed'): TestModule {
  return {
    project: { name: projectName },
    state: () => state,
    errors: () => [],
  } as unknown as TestModule
}
