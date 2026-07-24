import { EventEmitter } from 'node:events'
import { access } from 'node:fs/promises'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  waitForPort: vi.fn(() => new Promise<void>(() => undefined)),
}))

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../src/orchestrator/ports.js', () => ({ waitForPort: mocks.waitForPort }))

import { runChildAttempt } from '../src/orchestrator/child.js'
import { CHILD_CONTEXT_ENV } from '../src/env_contract.js'
import type { Transport } from '../src/transports/transport.js'

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly signals: (NodeJS.Signals | number)[] = []

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.signals.push(signal)
    if (signal === 'SIGKILL') {
      this.emit('close', null, signal)
    }
    return true
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('runChildAttempt process lifecycle', () => {
  it('strips transport secrets and force-kills a child that ignores cancellation', async () => {
    vi.useFakeTimers()
    const child = new FakeChild()
    mocks.spawn.mockReturnValue(child)
    const transport: Transport = {
      name: 'cloudflare',
      sensitiveEnvKeys: ['CLOUDFLARE_TUNNEL_TOKEN', 'TUNNEL_TOKEN'],
      open: async () => undefined,
      close: async () => undefined,
      supports: () => true,
      acquireSlot: () => undefined,
      releaseSlot: () => undefined,
    }
    const controller = new AbortController()

    const resultPromise = runChildAttempt({
      browserKey: 'chrome',
      browser: {
        platform: 'Windows',
        osVersion: '11',
        browserName: 'Chrome',
        browserVersion: 'latest',
        useHttps: true,
      },
      attempt: 'initial',
      slot: {
        id: 'slot',
        localPort: 7_201,
        publicOrigin: 'https://a.example.com',
        useHttps: true,
      },
      transport,
      buildName: 'build',
      configPath: '/project/vitest.config.ts',
      vitestCliPath: '/project/node_modules/vitest/vitest.mjs',
      cwd: '/project',
      env: {
        CLOUDFLARE_TUNNEL_TOKEN: 'source-secret',
        TUNNEL_TOKEN: 'spawn-secret',
        KEEP_ME: 'value',
      },
      signal: controller.signal,
      onLog: () => undefined,
    })

    const spawnOptions = mocks.spawn.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv }
    expect(spawnOptions.env).toMatchObject({ KEEP_ME: 'value' })
    expect(spawnOptions.env?.CLOUDFLARE_TUNNEL_TOKEN).toBeUndefined()
    expect(spawnOptions.env?.TUNNEL_TOKEN).toBeUndefined()

    controller.abort()
    expect(child.signals).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  it('serializes the effective HTTP slot when BrowserStack Local downgrades an HTTPS browser', async () => {
    const child = new FakeChild()
    mocks.spawn.mockReturnValue(child)
    const transport: Transport = {
      name: 'browserstack-local',
      open: async () => undefined,
      close: async () => undefined,
      supports: () => true,
      acquireSlot: () => undefined,
      releaseSlot: () => undefined,
    }

    const resultPromise = runChildAttempt({
      browserKey: 'iOS18_Safari',
      browser: {
        platform: 'iOS',
        osVersion: '18',
        browserName: 'Safari',
        deviceName: 'iPhone 16',
        useHttps: true,
      },
      attempt: 'initial',
      slot: {
        id: 'bs-local-7201',
        localPort: 7_201,
        publicOrigin: 'http://bs-local.com:7201',
        useHttps: false,
      },
      transport,
      buildName: 'build',
      configPath: '/project/vitest.config.ts',
      vitestCliPath: '/project/node_modules/vitest/vitest.mjs',
      cwd: '/project',
      onLog: () => undefined,
    })

    const spawnOptions = mocks.spawn.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv }
    const context = JSON.parse(spawnOptions.env?.[CHILD_CONTEXT_ENV] ?? 'null')
    expect(context).toMatchObject({
      browser: { useHttps: true },
      publicOrigin: 'http://bs-local.com:7201',
      useHttps: false,
    })

    child.emit('close', 0, null)
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 })
  })

  it('does not write a stale ready marker after the child exits during custom routing', async () => {
    const child = new FakeChild()
    mocks.spawn.mockReturnValue(child)
    mocks.waitForPort.mockResolvedValueOnce(undefined)
    let finishRouting: (() => void) | undefined
    let routingSignal: AbortSignal | undefined
    const transport: Transport = {
      name: 'custom',
      open: async () => undefined,
      close: async () => undefined,
      supports: () => true,
      acquireSlot: () => undefined,
      releaseSlot: () => undefined,
      waitForSlotRouting: async (_slot, signal) => {
        routingSignal = signal
        await new Promise<void>((resolve) => {
          finishRouting = resolve
        })
      },
    }

    const resultPromise = runChildAttempt({
      browserKey: 'chrome',
      browser: {
        platform: 'Windows',
        osVersion: '11',
        browserName: 'Chrome',
        useHttps: true,
      },
      attempt: 'initial',
      slot: {
        id: 'slot',
        localPort: 7_201,
        publicOrigin: 'https://example.test',
        useHttps: true,
      },
      transport,
      buildName: 'build',
      configPath: '/project/vitest.config.ts',
      vitestCliPath: '/project/node_modules/vitest/vitest.mjs',
      cwd: '/project',
      onLog: () => undefined,
    })

    await vi.waitFor(() => expect(routingSignal).toBeDefined())
    const spawnOptions = mocks.spawn.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv }
    const context = JSON.parse(spawnOptions.env?.[CHILD_CONTEXT_ENV] ?? 'null') as { readyFile: string }
    child.emit('close', 0, null)
    await resultPromise
    expect(routingSignal?.aborted).toBe(true)

    finishRouting?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(access(context.readyFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
