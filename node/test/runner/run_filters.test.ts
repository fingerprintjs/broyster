import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrowserAttemptResult } from '../../src/core/results.js'
import type { BroysterConfig } from '../../src/core/types.js'
import type { RunAttemptOptions } from '../../src/runner/attempt.js'

const runBrowserAttempt = vi.fn<
  (options: RunAttemptOptions) => Promise<{
    attempt: BrowserAttemptResult
    failedModuleIds: string[]
  }>
>()
const getPlan = vi.fn<(signal?: AbortSignal) => Promise<{ availableSessions: number }>>()

vi.mock('../../src/runner/attempt.js', () => ({ runBrowserAttempt }))
vi.mock('../../src/core/browserstack_client.js', () => ({
  BrowserStackClient: class {
    async getPlan(signal?: AbortSignal) {
      return getPlan(signal)
    }
  },
}))

const { runBrowserStack } = await import('../../src/runner/run.js')

let temporaryDirectory: string | undefined

beforeEach(async () => {
  runBrowserAttempt.mockReset()
  getPlan.mockReset().mockResolvedValue({ availableSessions: 1 })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'broyster-runner-test-'))
  vi.stubEnv('BROWSERSTACK_USERNAME', 'test-user')
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'test-key')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true })
    temporaryDirectory = undefined
  }
})

describe('runBrowserStack retry filters', () => {
  it('retries only failed modules while preserving the test-name pattern', async () => {
    runBrowserAttempt
      .mockResolvedValueOnce({
        attempt: attempt(1, 'failed'),
        failedModuleIds: ['src/checkout.test.ts'],
      })
      .mockResolvedValueOnce({ attempt: attempt(2, 'passed'), failedModuleIds: [] })

    const result = await runBrowserStack(config(), {
      fileFilters: ['src/checkout.test.ts', 'src/profile.test.ts'],
      testNamePattern: '^checkout submits$',
    })

    expect(runBrowserAttempt).toHaveBeenCalledTimes(2)
    expect(runBrowserAttempt.mock.calls[0]?.[0]).toMatchObject({
      number: 1,
      kind: 'initial',
      fileFilters: ['src/checkout.test.ts', 'src/profile.test.ts'],
      testNamePattern: '^checkout submits$',
    })
    expect(runBrowserAttempt.mock.calls[1]?.[0]).toMatchObject({
      number: 2,
      kind: 'retry',
      fileFilters: ['src/checkout.test.ts'],
      testNamePattern: '^checkout submits$',
    })
    expect(result.browsers[0]).toMatchObject({ finalStatus: 'flaky', retryScope: 'failed-files' })
    expect(result.run.filters).toMatchObject({
      files: ['src/checkout.test.ts', 'src/profile.test.ts'],
      testNamePattern: '^checkout submits$',
    })
  })

  it('retries the original file selection after a startup-style failure', async () => {
    runBrowserAttempt
      .mockResolvedValueOnce({ attempt: attempt(1, 'failed'), failedModuleIds: [] })
      .mockResolvedValueOnce({ attempt: attempt(2, 'passed'), failedModuleIds: [] })

    const result = await runBrowserStack(config(), {
      fileFilters: ['src/checkout.test.ts', 'src/profile.test.ts'],
      testNamePattern: 'critical path',
    })

    expect(runBrowserAttempt.mock.calls[1]?.[0]).toMatchObject({
      number: 2,
      kind: 'retry',
      fileFilters: ['src/checkout.test.ts', 'src/profile.test.ts'],
      testNamePattern: 'critical path',
    })
    expect(result.browsers[0]).toMatchObject({ finalStatus: 'flaky', retryScope: 'browser' })
  })

  it('does not start a retry when cancellation arrives during its capacity check', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel while waiting for retry capacity')
    runBrowserAttempt
      .mockResolvedValueOnce({ attempt: attempt(1, 'failed'), failedModuleIds: [] })
      .mockResolvedValueOnce({ attempt: attempt(2, 'passed'), failedModuleIds: [] })
    getPlan.mockResolvedValueOnce({ availableSessions: 1 }).mockImplementationOnce(async () => {
      controller.abort(reason)
      return { availableSessions: 1 }
    })

    const result = await runBrowserStack(config(), { signal: controller.signal })

    expect(runBrowserAttempt).toHaveBeenCalledTimes(1)
    expect(result.browsers[0]?.attempts.map(({ status }) => status)).toEqual(['failed', 'cancelled'])
    expect(result.browsers[0]?.finalStatus).toBe('cancelled')
  })

  it('redacts free-form result text without corrupting structural statuses or timestamps', async () => {
    vi.stubEnv('BROWSERSTACK_USERNAME', 'passed')
    vi.stubEnv('BROWSERSTACK_ACCESS_KEY', '2026')
    runBrowserAttempt.mockResolvedValueOnce({
      attempt: {
        ...attempt(1, 'passed'),
        modules: [
          {
            id: 'src/passed-2026.test.ts',
            status: 'passed',
            durationMs: 5,
            errors: [{ message: 'passed in 2026' }],
            tests: [
              {
                id: 'passed-2026-case',
                name: 'passed during 2026',
                fullName: 'suite passed during 2026',
                status: 'passed',
                durationMs: 5,
                errors: [],
              },
            ],
          },
        ],
      },
      failedModuleIds: [],
    })

    const result = await runBrowserStack(config())
    const module = result.browsers[0]?.attempts[0]?.modules[0]

    expect(result.run.status).toBe('passed')
    expect(Number.isFinite(Date.parse(result.run.startedAt))).toBe(true)
    expect(module?.status).toBe('passed')
    expect(module?.id).toBe('src/[REDACTED]-[REDACTED].test.ts')
    expect(module?.errors[0]?.message).toBe('[REDACTED] in [REDACTED]')
    expect(module?.tests[0]).toMatchObject({
      status: 'passed',
      name: '[REDACTED] during [REDACTED]',
    })
  })
})

function config(): BroysterConfig {
  if (!temporaryDirectory) {
    throw new Error('Test temporary directory is unavailable.')
  }
  return {
    projectName: 'runner filters',
    vitestConfig: './vitest.browserstack.config.ts',
    browsers: { chrome: { browser: 'chrome', protocol: 'https' } },
    transport: {
      async start() {
        return {
          slots: [
            {
              id: 'https-1',
              publicUrl: 'https://browser.example.test',
              localPort: 7_201,
              protocol: 'https',
            },
          ],
          async close() {},
        }
      },
    },
    buildName: 'test-build',
    resultsFile: join(temporaryDirectory, 'results.json'),
    queuePollIntervalMs: 1,
    queueTimeoutMs: 1_000,
  }
}

function attempt(number: number, status: 'passed' | 'failed'): BrowserAttemptResult {
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
    modules: [],
    unhandledErrors: [],
    warnings: [],
  }
}
