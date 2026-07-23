import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { TestCase, TestModule } from 'vitest/node'

import { ChildResultReporter, type ChildRunReport } from '../../src/vitest/child_result_reporter.js'
import type { BrowserStackRunContext } from '../../src/vitest/run_context.js'
import { BrowserStackRuntime } from '../../src/vitest/runtime.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ChildResultReporter', () => {
  it('writes the complete failed attempt atomically for parent aggregation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'broyster-child-result-'))
    temporaryDirectories.push(directory)
    const resultFile = join(directory, 'attempt.json')
    const runtime = new BrowserStackRuntime()
    runtime.setSession('chrome-latest', 'session-123')
    runtime.addWarning('Session status update failed')
    const times = [1_000, 1_250]
    const reporter = new ChildResultReporter({
      context: makeContext(resultFile),
      runtime,
      now: () => {
        const time = times.shift()
        if (time === undefined) {
          throw new Error('Unexpected extra clock read')
        }
        return time
      },
    })

    await reporter.onTestRunEnd([makeFailedModule()], [{ message: 'Unhandled problem' }], 'failed')

    const report = JSON.parse(await readFile(resultFile, 'utf8')) as ChildRunReport
    expect(report).toMatchObject({
      schemaVersion: 1,
      runId: 'run-1',
      browserId: 'chrome-latest',
      sessionId: 'session-123',
      status: 'failed',
      reason: 'failed',
      failedModuleIds: ['/project/src/example.test.ts'],
      warnings: ['Session status update failed'],
      durationMs: 250,
      modules: [
        {
          id: '/project/src/example.test.ts',
          status: 'failed',
          durationMs: 30,
          tests: [
            {
              id: 'test-1',
              name: 'fails',
              fullName: 'example > fails',
              status: 'failed',
              durationMs: 20,
              errors: [{ name: 'AssertionError', message: 'expected true to be false' }],
            },
          ],
        },
      ],
      unhandledErrors: [{ name: 'Error', message: 'Unhandled problem' }],
    })
    expect((await readFile(resultFile, 'utf8')).endsWith('\n')).toBe(true)
  })
})

function makeContext(resultFile: string): BrowserStackRunContext {
  return {
    schemaVersion: 1,
    run: { id: 'run-1', projectName: 'example', buildName: 'build-1' },
    browser: {
      id: 'chrome-latest',
      name: 'Chrome latest',
      browser: 'chrome',
      capabilities: {},
    },
    slot: { publicUrl: 'https://browser.example.test/', localPort: 7_201, protocol: 'https' },
    browserStack: {
      hubUrl: 'https://hub-cloud.browserstack.com/wd/hub',
      apiBaseUrl: 'https://api.browserstack.com/automate',
    },
    apiPort: 7_201,
    providerConnectTimeoutMs: 120_000,
    attempt: { number: 1, kind: 'initial' },
    resultFile,
    readinessFile: join(resultFile, '..', 'ready'),
    sessionFile: join(resultFile, '..', 'session.json'),
  }
}

function makeFailedModule(): TestModule {
  const testCase = {
    id: 'test-1',
    name: 'fails',
    fullName: 'example > fails',
    result: () => ({
      state: 'failed',
      errors: [{ name: 'AssertionError', message: 'expected true to be false' }],
    }),
    diagnostic: () => ({ duration: 20 }),
  } as unknown as TestCase

  return {
    moduleId: '/project/src/example.test.ts',
    project: { name: 'chrome-latest' },
    state: () => 'failed',
    diagnostic: () => ({ duration: 30 }),
    errors: () => [],
    children: {
      *allTests() {
        yield testCase
      },
    },
  } as unknown as TestModule
}
