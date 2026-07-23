import { describe, expect, it } from 'vitest'

import {
  createBrowserRunResult,
  createBroysterResult,
  mergeAttemptModules,
  type BrowserAttemptResult,
  type TestModuleResult,
} from '../../src/core/results.js'

function module(id: string, status: 'passed' | 'failed'): TestModuleResult {
  return {
    id,
    status,
    durationMs: 1,
    errors: [],
    tests: [
      {
        id: `${id}:test`,
        name: 'test',
        fullName: `${id} test`,
        status,
        durationMs: 1,
        errors: [],
      },
    ],
  }
}

function attempt(number: number, status: 'passed' | 'failed', modules: TestModuleResult[]): BrowserAttemptResult {
  return {
    number,
    kind: number === 1 ? 'initial' : 'retry',
    status,
    exitCode: status === 'passed' ? 0 : 1,
    signal: null,
    sessionId: `session-${number}`,
    startedAt: `2026-01-01T00:00:0${number}.000Z`,
    endedAt: `2026-01-01T00:00:0${number + 1}.000Z`,
    durationMs: 1_000,
    modules,
    unhandledErrors: [],
    warnings: [],
  }
}

describe('result merging', () => {
  it('overlays only retried modules for a failed-files retry', () => {
    const attempts = [
      attempt(1, 'failed', [module('a', 'failed'), module('b', 'passed')]),
      attempt(2, 'passed', [module('a', 'passed')]),
    ]

    expect(mergeAttemptModules(attempts, 'failed-files').map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'a', status: 'passed' },
      { id: 'b', status: 'passed' },
    ])
  })

  it('replaces all initial modules for a full-browser retry', () => {
    const attempts = [attempt(1, 'failed', [module('old', 'failed')]), attempt(2, 'passed', [module('new', 'passed')])]
    expect(mergeAttemptModules(attempts, 'browser').map(({ id }) => id)).toEqual(['new'])
  })

  it('creates a deterministic versioned aggregate and classifies flaky browsers', () => {
    const browser = createBrowserRunResult({
      id: 'chrome',
      retryScope: 'failed-files',
      attempts: [
        attempt(2, 'passed', [module('a', 'passed')]),
        attempt(1, 'failed', [module('a', 'failed'), module('b', 'passed')]),
      ],
    })
    const result = createBroysterResult({
      id: 'run',
      projectName: 'project',
      buildName: 'build',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:03.000Z',
      browsers: [browser],
    })

    expect(result.schemaVersion).toBe(1)
    expect(result.run.status).toBe('flaky')
    expect(result.run.durationMs).toBe(3_000)
    expect(result.run.summary).toMatchObject({
      attempts: 2,
      browsers: { total: 1, flaky: 1 },
      modules: { total: 2, passed: 2 },
      tests: { total: 2, passed: 2 },
    })
    expect(result.browsers[0]?.attempts.map(({ number }) => number)).toEqual([1, 2])
  })
})
