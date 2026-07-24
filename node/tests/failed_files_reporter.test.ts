import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TestCase, TestModule } from 'vitest/node'

import { ATTEMPT_REPORT_SCHEMA_VERSION } from '../src/contracts/attempt_report.js'
import { CHILD_CONTEXT_ENV, CHILD_CONTEXT_SCHEMA_VERSION } from '../src/env_contract.js'
import { FailedFilesReporter } from '../src/vitest/reporters/failed_files_reporter.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('FailedFilesReporter artifact', () => {
  it('writes versioned and deterministically ordered structured results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'broyster-child-report-'))
    temporaryDirectories.push(directory)
    const failedFilesOut = join(directory, 'nested', 'attempt.json')
    vi.stubEnv(
      CHILD_CONTEXT_ENV,
      JSON.stringify({
        schemaVersion: CHILD_CONTEXT_SCHEMA_VERSION,
        browserKey: 'ChromeHttps',
        browser: {
          platform: 'Windows',
          osVersion: '11',
          browserName: 'Chrome',
          useHttps: true,
        },
        buildName: 'build',
        publicOrigin: 'https://example.test',
        useHttps: true,
        apiPort: 7_201,
        failedFilesOut,
        attempt: 'initial',
        queueManagedExternally: true,
      }),
    )

    const testCase = {
      id: 'test-b',
      name: 'fails',
      fullName: 'suite fails',
      project: { name: 'ChromeHttps' },
      module: { moduleId: 'b.test.ts' },
      options: { mode: 'run' },
      result: () => ({ state: 'failed', errors: [new Error('broken')] }),
      diagnostic: () => ({ duration: 4 }),
    } as unknown as TestCase
    const testModule = {
      moduleId: 'b.test.ts',
      project: { name: 'ChromeHttps' },
      state: () => 'failed',
      errors: () => [],
      diagnostic: () => ({ duration: 5 }),
      children: { allTests: () => [testCase] },
    } as unknown as TestModule
    const reporter = new FailedFilesReporter()

    reporter.onTestRunStart()
    reporter.onTestCaseResult(testCase)
    await reporter.onTestRunEnd([testModule], [])

    const report = JSON.parse(await readFile(failedFilesOut, 'utf8'))
    expect(report).toMatchObject({
      schemaVersion: ATTEMPT_REPORT_SCHEMA_VERSION,
      browser: 'ChromeHttps',
      failedModuleIds: ['b.test.ts'],
      modules: [
        {
          id: 'b.test.ts',
          status: 'failed',
          duration: 5,
          tests: [
            {
              id: 'test-b',
              status: 'failed',
              duration: 4,
              errors: [{ name: 'Error', message: 'broken' }],
            },
          ],
        },
      ],
    })
  })
})
