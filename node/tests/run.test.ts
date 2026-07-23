import { describe, expect, it } from 'vitest'

import type { BrowserDef } from '../src/browsers.js'
import type { ChildAttemptOptions } from '../src/orchestrator/child.js'
import type { RunAttemptResult } from '../src/orchestrator/results.js'
import { runBrowserStackTests } from '../src/orchestrator/run.js'
import type { SlotRequirement, Transport, TransportSlot } from '../src/transports/transport.js'

const catalog: Record<string, BrowserDef> = {
  ChromeHttps: { platform: 'Windows', osVersion: '11', browserName: 'Chrome', useHttps: true },
  FirefoxHttps: { platform: 'Windows', osVersion: '11', browserName: 'Firefox', useHttps: true },
}

class StubTransport implements Transport {
  readonly name = 'stub'
  opened = false
  closed = false
  private free: TransportSlot[] = [
    { id: 's1', localPort: 7001, publicOrigin: 'https://s1.example.com', useHttps: true },
    { id: 's2', localPort: 7002, publicOrigin: 'https://s2.example.com', useHttps: true },
  ]

  supports(requirement: SlotRequirement): boolean {
    return requirement.useHttps
  }

  async open(): Promise<void> {
    this.opened = true
  }

  async close(): Promise<void> {
    this.closed = true
  }

  acquireSlot(requirement: SlotRequirement): TransportSlot | undefined {
    const index = this.free.findIndex((slot) => slot.useHttps === requirement.useHttps)
    return index === -1 ? undefined : this.free.splice(index, 1)[0]
  }

  releaseSlot(slot: TransportSlot): void {
    this.free.push(slot)
  }
}

type AttemptScript = (options: ChildAttemptOptions) => Pick<RunAttemptResult, 'exitCode' | 'failedModuleIds'>

function makeRunOptions(transport: StubTransport, script: AttemptScript) {
  const attempts: ChildAttemptOptions[] = []
  const attemptRunner = async (options: ChildAttemptOptions): Promise<RunAttemptResult> => {
    attempts.push(options)
    const { exitCode, failedModuleIds } = script(options)
    return { browser: options.browserKey, attempt: options.attempt, exitCode, duration: 1, failedModuleIds }
  }

  return {
    attempts,
    options: {
      configPath: 'vitest.browserstack.config.ts',
      transport,
      catalog,
      credentials: { username: 'u', accessKey: 'k' },
      attemptRunner,
      onLog: () => undefined,
      buildName: 'test-build',
    },
  }
}

function stubPlanFetch() {
  // BrowserStackQueue polls the plan API; give it unlimited slots.
  const original = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ parallel_sessions_max_allowed: 100, parallel_sessions_running: 0 }),
    text: async () => '',
  })) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

describe('runBrowserStackTests', () => {
  it('classifies passing browsers and opens/closes the transport', async () => {
    const restoreFetch = stubPlanFetch()
    try {
      const transport = new StubTransport()
      const { options } = makeRunOptions(transport, () => ({ exitCode: 0, failedModuleIds: [] }))

      const summary = await runBrowserStackTests(options)

      expect(summary.ok).toBe(true)
      expect(summary.results.map((result) => result.status)).toEqual(['PASS', 'PASS'])
      expect(transport.opened).toBe(true)
      expect(transport.closed).toBe(true)
    } finally {
      restoreFetch()
    }
  })

  it('retries only the failed files and marks recovered browsers FLAKY', async () => {
    const restoreFetch = stubPlanFetch()
    try {
      const transport = new StubTransport()
      const { options, attempts } = makeRunOptions(transport, ({ browserKey, attempt }) => {
        if (browserKey === 'ChromeHttps' && attempt === 'initial') {
          return { exitCode: 1, failedModuleIds: ['src/flaky.test.ts'] }
        }
        return { exitCode: 0, failedModuleIds: [] }
      })

      const summary = await runBrowserStackTests({ ...options, browsers: ['ChromeHttps'] })

      expect(summary.ok).toBe(true)
      expect(summary.results[0]).toMatchObject({ status: 'FLAKY', retryScope: 'files' })
      const retryAttempt = attempts.find((attempt) => attempt.attempt === 'retry')
      expect(retryAttempt?.filePaths).toEqual(['src/flaky.test.ts'])
    } finally {
      restoreFetch()
    }
  })

  it('retries the whole browser when no failed files were reported', async () => {
    const restoreFetch = stubPlanFetch()
    try {
      const transport = new StubTransport()
      const { options, attempts } = makeRunOptions(transport, ({ attempt }) =>
        attempt === 'initial' ? { exitCode: 1, failedModuleIds: [] } : { exitCode: 0, failedModuleIds: [] },
      )

      const summary = await runBrowserStackTests({ ...options, browsers: ['FirefoxHttps'] })

      expect(summary.results[0]).toMatchObject({ status: 'FLAKY', retryScope: 'browser' })
      const retryAttempt = attempts.find((attempt) => attempt.attempt === 'retry')
      expect(retryAttempt?.filePaths).toBeUndefined()
    } finally {
      restoreFetch()
    }
  })

  it('marks browsers FAIL when the retry fails too, and reports ok=false', async () => {
    const restoreFetch = stubPlanFetch()
    try {
      const transport = new StubTransport()
      const { options } = makeRunOptions(transport, () => ({ exitCode: 1, failedModuleIds: ['src/broken.test.ts'] }))

      const summary = await runBrowserStackTests({ ...options, browsers: ['ChromeHttps'] })

      expect(summary.ok).toBe(false)
      expect(summary.results[0]).toMatchObject({ status: 'FAIL', retryScope: 'files' })
      expect(summary.results[0]?.attempts).toHaveLength(2)
    } finally {
      restoreFetch()
    }
  })

  it('does not retry when retryFailed is false', async () => {
    const restoreFetch = stubPlanFetch()
    try {
      const transport = new StubTransport()
      const { options, attempts } = makeRunOptions(transport, () => ({ exitCode: 1, failedModuleIds: [] }))

      const summary = await runBrowserStackTests({ ...options, browsers: ['ChromeHttps'], retryFailed: false })

      expect(summary.results[0]?.status).toBe('FAIL')
      expect(attempts).toHaveLength(1)
    } finally {
      restoreFetch()
    }
  })

  it('filters catalog keys with a regex', async () => {
    const restoreFetch = stubPlanFetch()
    try {
      const transport = new StubTransport()
      const { options, attempts } = makeRunOptions(transport, () => ({ exitCode: 0, failedModuleIds: [] }))

      await runBrowserStackTests({ ...options, filter: 'firefox' })

      expect(attempts.map((attempt) => attempt.browserKey)).toEqual(['FirefoxHttps'])
    } finally {
      restoreFetch()
    }
  })

  it('rejects unknown browser selections', async () => {
    const transport = new StubTransport()
    const { options } = makeRunOptions(transport, () => ({ exitCode: 0, failedModuleIds: [] }))

    await expect(runBrowserStackTests({ ...options, browsers: ['Nope'] })).rejects.toThrow(/Unknown browsers: Nope/)
  })
})
