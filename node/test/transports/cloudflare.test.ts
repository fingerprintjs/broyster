import { EventEmitter } from 'node:events'
import type { SpawnOptions } from 'node:child_process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cloudflareTunnel,
  CloudflareTunnelError,
  type CloudflaredProcess,
  type CloudflareTunnelDependencies,
} from '../../src/transports/cloudflare.js'
import type { TunnelSlot } from '../../src/transports/types.js'

const slots: readonly TunnelSlot[] = [
  {
    id: 'https-1',
    publicUrl: 'https://browser.example.test',
    localPort: 7_201,
    protocol: 'https',
  },
]

class FakeProcess extends EventEmitter implements CloudflaredProcess {
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly signals: (NodeJS.Signals | number)[] = []
  exitOnSigterm = true

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.signals.push(signal)
    if ((signal === 'SIGTERM' && this.exitOnSigterm) || signal === 'SIGKILL') {
      this.signalCode = signal
      this.emit('exit', null, signal)
    }
    return true
  }

  exitWithCode(code: number): void {
    this.exitCode = code
    this.emit('exit', code, null)
  }
}

function dependencies(
  child: FakeProcess,
  overrides: Partial<CloudflareTunnelDependencies> = {},
): CloudflareTunnelDependencies {
  return {
    env: { CLOUDFLARE_TUNNEL_TOKEN: 'secret-token', PASSTHROUGH: 'value' },
    spawn: () => child,
    fetch: async () => ({ status: 200 }),
    findFreePort: async () => 41_237,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('cloudflareTunnel', () => {
  it('starts cloudflared with a private token environment and checks its metrics readiness endpoint', async () => {
    const child = new FakeProcess()
    const spawn = vi.fn((...spawnArguments: [string, string[], SpawnOptions]) => {
      void spawnArguments
      return child
    })
    const fetchReady = vi.fn(async () => ({ status: 200 }))
    const transport = cloudflareTunnel(
      { slots },
      dependencies(child, {
        spawn,
        fetch: fetchReady,
      }),
    )

    const active = await transport.start(new AbortController().signal)

    expect(spawn).toHaveBeenCalledOnce()
    const firstCall = spawn.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('Expected cloudflared to be spawned.')
    }
    const [command, args, options] = firstCall
    expect(command).toBe('cloudflared')
    expect(args).toEqual(['tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:41237', 'run'])
    expect(args.join(' ')).not.toContain('secret-token')
    expect(options.env).toMatchObject({ TUNNEL_TOKEN: 'secret-token', PASSTHROUGH: 'value' })
    expect(options.env?.CLOUDFLARE_TUNNEL_TOKEN).toBeUndefined()
    expect(fetchReady).toHaveBeenCalledWith('http://127.0.0.1:41237/ready', {
      signal: expect.any(AbortSignal),
    })
    expect(active.slots).toEqual(slots)
    expect(active.sensitiveEnvKeys).toEqual(['CLOUDFLARE_TUNNEL_TOKEN', 'TUNNEL_TOKEN'])

    await active.close()
    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('reads the token from a configurable environment variable', async () => {
    const child = new FakeProcess()
    const spawn = vi.fn((...spawnArguments: [string, string[], SpawnOptions]) => {
      void spawnArguments
      return child
    })
    const transport = cloudflareTunnel(
      { slots, tokenEnv: 'MY_TUNNEL_TOKEN' },
      dependencies(child, {
        env: { MY_TUNNEL_TOKEN: 'custom-secret' },
        spawn,
      }),
    )

    const active = await transport.start(new AbortController().signal)
    const firstCall = spawn.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    if (!firstCall) {
      throw new Error('Expected cloudflared to be spawned.')
    }
    const options = firstCall[2]
    expect(options.env).toMatchObject({ TUNNEL_TOKEN: 'custom-secret' })
    expect(options.env?.MY_TUNNEL_TOKEN).toBeUndefined()
    expect(active.sensitiveEnvKeys).toEqual(['MY_TUNNEL_TOKEN', 'TUNNEL_TOKEN'])
    await active.close()
  })

  it('rejects a missing token before allocating a port or spawning a process', async () => {
    const child = new FakeProcess()
    const spawn = vi.fn(() => child)
    const findFreePort = vi.fn(async () => 41_237)
    const transport = cloudflareTunnel(
      { slots },
      dependencies(child, {
        env: {},
        spawn,
        findFreePort,
      }),
    )

    await expect(transport.start(new AbortController().signal)).rejects.toMatchObject({
      name: 'CloudflareTunnelError',
      code: 'MISSING_TOKEN',
    })
    expect(findFreePort).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('retries readiness failures three times with a new metrics port', async () => {
    const children: FakeProcess[] = []
    const ports = [40_001, 40_002, 40_003]
    const spawn = vi.fn(() => {
      const child = new FakeProcess()
      children.push(child)
      return child
    })
    const findFreePort = vi.fn(async () => {
      const port = ports.shift()
      if (port === undefined) {
        throw new Error('No fake metrics ports remain.')
      }
      return port
    })
    const transport = cloudflareTunnel(
      {
        slots,
        readinessTimeoutMs: 2,
        readinessPollIntervalMs: 1,
        retryBackoffMs: 0,
        shutdownTimeoutMs: 0,
      },
      {
        env: { CLOUDFLARE_TUNNEL_TOKEN: 'secret-token' },
        spawn,
        fetch: async () => ({ status: 503 }),
        findFreePort,
      },
    )

    await expect(transport.start(new AbortController().signal)).rejects.toMatchObject({
      code: 'STARTUP_FAILED',
      cause: expect.objectContaining({ code: 'READINESS_TIMEOUT' }),
    })
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(spawn.mock.calls.map((call: [string, string[], SpawnOptions]) => call[1][3])).toEqual([
      '127.0.0.1:40001',
      '127.0.0.1:40002',
      '127.0.0.1:40003',
    ])
    expect(children.every((child) => child.signals[0] === 'SIGTERM')).toBe(true)
  })

  it('surfaces early exits and cleans each failed process before retrying', async () => {
    const children: FakeProcess[] = []
    const transport = cloudflareTunnel(
      {
        slots,
        startupAttempts: 2,
        readinessTimeoutMs: 20,
        readinessPollIntervalMs: 1,
        retryBackoffMs: 0,
      },
      {
        env: { CLOUDFLARE_TUNNEL_TOKEN: 'secret-token' },
        spawn: () => {
          const child = new FakeProcess()
          children.push(child)
          queueMicrotask(() => child.exitWithCode(7))
          return child
        },
        fetch: async () => ({ status: 503 }),
        findFreePort: async () => 41_237,
      },
    )

    await expect(transport.start(new AbortController().signal)).rejects.toMatchObject({
      code: 'STARTUP_FAILED',
      cause: expect.objectContaining({
        code: 'EARLY_EXIT',
        message: expect.stringContaining('code 7'),
      }),
    })
    expect(children).toHaveLength(2)
  })

  it('does not retry when the cloudflared executable is missing', async () => {
    const child = new FakeProcess()
    const spawn = vi.fn(() => {
      queueMicrotask(() => {
        const error = Object.assign(new Error('spawn cloudflared ENOENT'), { code: 'ENOENT' })
        child.emit('error', error)
      })
      return child
    })
    const transport = cloudflareTunnel(
      { slots, readinessPollIntervalMs: 1 },
      dependencies(child, {
        spawn,
        fetch: async () => ({ status: 503 }),
      }),
    )

    await expect(transport.start(new AbortController().signal)).rejects.toMatchObject({
      code: 'SPAWN_FAILED',
      cause: expect.objectContaining({ code: 'ENOENT' }),
    })
    expect(spawn).toHaveBeenCalledOnce()
  })

  it('aborts startup and terminates an already spawned process', async () => {
    const child = new FakeProcess()
    const controller = new AbortController()
    const transport = cloudflareTunnel(
      { slots },
      dependencies(child, {
        spawn: () => {
          queueMicrotask(() => controller.abort())
          return child
        },
        fetch: async (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true })
          }),
      }),
    )

    await expect(transport.start(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('makes close idempotent', async () => {
    const child = new FakeProcess()
    const transport = cloudflareTunnel({ slots }, dependencies(child))
    const active = await transport.start(new AbortController().signal)

    await Promise.all([active.close(), active.close(), active.close()])

    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('closes an active tunnel when its signal is aborted', async () => {
    const child = new FakeProcess()
    const controller = new AbortController()
    const transport = cloudflareTunnel({ slots }, dependencies(child))
    const active = await transport.start(controller.signal)

    controller.abort()
    await active.close()

    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('force kills cloudflared when it ignores the graceful shutdown deadline', async () => {
    vi.useFakeTimers()
    const child = new FakeProcess()
    child.exitOnSigterm = false
    const timers = {
      now: Date.now,
      setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    }
    const transport = cloudflareTunnel({ slots, shutdownTimeoutMs: 5_000 }, dependencies(child, { timers }))
    const active = await transport.start(new AbortController().signal)

    const closing = active.close()
    expect(child.signals).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(4_999)
    expect(child.signals).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(1)
    await closing
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  it('validates slots before exposing a transport', () => {
    expect(() =>
      cloudflareTunnel({
        slots: [
          {
            id: 'mismatch',
            publicUrl: 'https://browser.example.test',
            localPort: 7_201,
            protocol: 'http',
          },
        ],
      }),
    ).toThrowError(CloudflareTunnelError)
  })
})
