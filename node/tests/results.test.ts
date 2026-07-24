import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  BROYSTER_RESULTS_SCHEMA_VERSION,
  createRunSummary,
  mergeAttemptModules,
  writeRunSummary,
  type RunAttemptResult,
  type TestModuleResult,
} from '../src/orchestrator/results.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function module(id: string, status: 'passed' | 'failed'): TestModuleResult {
  return {
    id,
    status,
    duration: 1,
    errors: [],
    tests: [
      {
        id: `${id}:test`,
        name: 'test',
        fullName: `${id} test`,
        status,
        duration: 1,
        errors: [],
      },
    ],
  }
}

function attempt(
  name: 'initial' | 'retry',
  modules: TestModuleResult[],
  exitCode = name === 'initial' ? 1 : 0,
): RunAttemptResult {
  return {
    browser: 'Chrome',
    attempt: name,
    exitCode,
    duration: 1,
    failedModuleIds: modules.filter((item) => item.status === 'failed').map((item) => item.id),
    modules,
  }
}

describe('run result artifacts', () => {
  it('overlays only rerun modules for a failed-file retry', () => {
    const modules = mergeAttemptModules(
      [
        attempt('initial', [module('b.test.ts', 'failed'), module('a.test.ts', 'passed')]),
        attempt('retry', [module('b.test.ts', 'passed')]),
      ],
      'files',
    )

    expect(modules.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'a.test.ts', status: 'passed' },
      { id: 'b.test.ts', status: 'passed' },
    ])
  })

  it('replaces the initial module state for a whole-browser retry', () => {
    const modules = mergeAttemptModules(
      [attempt('retry', [module('b.test.ts', 'passed')]), attempt('initial', [module('a.test.ts', 'failed')])],
      'browser',
    )

    expect(modules.map((item) => item.id)).toEqual(['b.test.ts'])
  })

  it('normalizes browser, attempt, module, and test ordering', () => {
    const summary = createRunSummary(
      [
        {
          browser: 'Firefox',
          status: 'PASS',
          exitCode: 0,
          duration: -1,
          attempts: [attempt('retry', [module('z.test.ts', 'passed')]), attempt('initial', [])],
        },
        {
          browser: 'Chrome',
          status: 'FAIL',
          exitCode: 1,
          duration: 2,
          attempts: [attempt('initial', [module('b.test.ts', 'failed'), module('a.test.ts', 'passed')])],
        },
      ],
      -5,
    )

    expect(summary.schemaVersion).toBe(BROYSTER_RESULTS_SCHEMA_VERSION)
    expect(summary.ok).toBe(false)
    expect(summary.duration).toBe(0)
    expect(summary.results.map((result) => result.browser)).toEqual(['Chrome', 'Firefox'])
    expect(summary.results[1]?.attempts.map((item) => item.attempt)).toEqual(['initial', 'retry'])
  })

  it('writes a private, complete JSON artifact atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'broyster-results-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'nested', 'results.json')
    const summary = createRunSummary([], 3)

    await writeRunSummary(path, summary)

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(summary)
  })
})
