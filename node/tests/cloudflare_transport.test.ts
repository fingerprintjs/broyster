import type { SpawnOptions } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cloudflareTransport,
  cloudflareTransportFromEnv,
  type CloudflaredProcess,
  type CloudflareTransportDependencies,
} from '../src/transports/cloudflare.js'

const token = 'test-token'
const slot = { hostname: 'a.example.com', port: 7_201, useHttps: true }
const noLog = () => undefined

class FakeProcess extends EventEmitter implements CloudflaredProcess {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly signals: (NodeJS.Signals | number)[] = []
  exitOnSigterm = true

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.signals.push(signal)
    if ((signal === 'SIGTERM' && this.exitOnSigterm) || signal === 'SIGKILL') {
      this.signalCode = signal as NodeJS.Signals
      this.emit('exit', null, signal)
      this.emit('close', null, signal)
    }
    return true
  }

  exitWithCode(code: number): void {
    this.exitCode = code
    this.emit('exit', code, null)
    this.emit('close', code, null)
  }
}

function dependencies(
  child: FakeProcess,
  overrides: Partial<CloudflareTransportDependencies> = {},
): CloudflareTransportDependencies {
  return {
    env: { CLOUDFLARE_TUNNEL_TOKEN: token, PASSTHROUGH: 'value' },
    spawn: () => child,
    fetch: async () => ({ status: 200 }),
    allocateFreePort: async () => 41_237,
    checkPortAvailability: async () => null,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('cloudflareTransportFromEnv', () => {
  it('requires the tunnel token', () => {
    expect(() => cloudflareTransportFromEnv({})).toThrow(/CLOUDFLARE_TUNNEL_TOKEN/)
  })

  it('requires at least one slot', () => {
    expect(() => cloudflareTransportFromEnv({ CLOUDFLARE_TUNNEL_TOKEN: token })).toThrow(/No Cloudflare slots/)
  })

  it('builds slots from CSV env variables', () => {
    const transport = cloudflareTransportFromEnv({
      CLOUDFLARE_TUNNEL_TOKEN: token,
      BROYSTER_CLOUDFLARE_HTTPS_HOSTS: 'a.example.com, b.example.com',
      BROYSTER_CLOUDFLARE_HTTPS_PORTS: '7201,7202',
      BROYSTER_CLOUDFLARE_HTTP_HOSTS: 'c.example.com',
      BROYSTER_CLOUDFLARE_HTTP_PORTS: '7203',
    })

    expect(transport.supports({ useHttps: true })).toBe(true)
    expect(transport.supports({ useHttps: false })).toBe(true)
  })

  it('rejects host/port count mismatches', () => {
    expect(() =>
      cloudflareTransportFromEnv({
        CLOUDFLARE_TUNNEL_TOKEN: token,
        BROYSTER_CLOUDFLARE_HTTPS_HOSTS: 'a.example.com,b.example.com',
        BROYSTER_CLOUDFLARE_HTTPS_PORTS: '7201',
      }),
    ).toThrow(/hosts \(2\) must match ports \(1\)/)
  })

  it('rejects invalid ports', () => {
    expect(() =>
      cloudflareTransportFromEnv({
        CLOUDFLARE_TUNNEL_TOKEN: token,
        BROYSTER_CLOUDFLARE_HTTPS_HOSTS: 'a.example.com',
        BROYSTER_CLOUDFLARE_HTTPS_PORTS: '65536',
      }),
    ).toThrow(/integer port between 1 and 65535/)
  })
})

describe('cloudflareTransport', () => {
  it('rejects invalid options and duplicate slots', () => {
    expect(() =>
      cloudflareTransport({
        token,
        slots: [
          { hostname: 'a.example.com', port: 7_201, useHttps: true },
          { hostname: 'a.example.com', port: 7_202, useHttps: true },
        ],
      }),
    ).toThrow(/Duplicate Cloudflare slot hostname/)

    expect(() =>
      cloudflareTransport({
        token,
        slots: [
          { hostname: 'a.example.com', port: 7_201, useHttps: true },
          { hostname: 'b.example.com', port: 7_201, useHttps: false },
        ],
      }),
    ).toThrow(/Duplicate Cloudflare slot port/)

    expect(() => cloudflareTransport({ token: ' ', slots: [slot] })).toThrow(/token must not be empty/)
    expect(() => cloudflareTransport({ token, slots: [slot], startupAttempts: 0 })).toThrow(
      /startupAttempts must be a positive integer/,
    )
  })

  it('reports supported protocols from the slot list', () => {
    const transport = cloudflareTransport({ token, slots: [slot] })

    expect(transport.supports({ useHttps: true })).toBe(true)
    expect(transport.supports({ useHttps: false })).toBe(false)
  })

  it('passes the token privately and waits on the local metrics readiness endpoint', async () => {
    const child = new FakeProcess()
    const logs: string[] = []
    const spawn = vi.fn((...spawnArguments: [string, string[], SpawnOptions]) => {
      void spawnArguments
      return child
    })
    const fetchReady = vi.fn(async () => ({ status: 200 }))
    const transport = cloudflareTransport(
      { token, slots: [slot], onLog: (line) => logs.push(line) },
      dependencies(child, { spawn, fetch: fetchReady }),
    )

    await transport.open()
    child.stderr.write('diagnostic accidentally containing test-')
    child.stderr.write('token\n')

    const call = spawn.mock.calls.at(0)
    expect(call).toBeDefined()
    if (!call) {
      throw new Error('Expected cloudflared to be spawned.')
    }
    const [command, args, options] = call
    expect(command).toBe('cloudflared')
    expect(args).toEqual(['tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:41237', 'run'])
    expect(args.join(' ')).not.toContain(token)
    expect(options.env).toMatchObject({ TUNNEL_TOKEN: token, PASSTHROUGH: 'value' })
    expect(options.env?.CLOUDFLARE_TUNNEL_TOKEN).toBeUndefined()
    expect(fetchReady).toHaveBeenCalledWith('http://127.0.0.1:41237/ready', {
      signal: expect.any(AbortSignal),
    })
    expect(transport.sensitiveEnvKeys).toEqual(['CLOUDFLARE_TUNNEL_TOKEN', 'TUNNEL_TOKEN'])
    expect(logs.join('\n')).toContain('[REDACTED]')
    expect(logs.join('\n')).not.toContain(token)

    expect(transport.acquireSlot({ useHttps: true })).toMatchObject({
      id: slot.hostname,
      localPort: slot.port,
      publicOrigin: `https://${slot.hostname}`,
    })
    child.stderr.write('final unterminated diagnostic')
    await transport.close()
    expect(logs.join('\n')).toContain('final unterminated diagnostic')
    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('waits for process close so output delivered after exit is flushed before shutdown resolves', async () => {
    const child = new FakeProcess()
    child.exitOnSigterm = false
    const logs: string[] = []
    const transport = cloudflareTransport(
      { token, slots: [slot], onLog: (line) => logs.push(line) },
      dependencies(child),
    )
    await transport.open()

    child.stderr.write('diagnostic split ')
    const closing = transport.close()
    expect(child.signals).toEqual(['SIGTERM'])

    child.signalCode = 'SIGTERM'
    child.emit('exit', null, 'SIGTERM')
    child.stderr.write('after exit')
    let didClose = false
    void closing.then(() => {
      didClose = true
    })
    await Promise.resolve()
    expect(didClose).toBe(false)

    child.emit('close', null, 'SIGTERM')
    await closing
    expect(logs.join('\n')).toContain('diagnostic split after exit')
  })

  it('skips slots whose local ports are busy', async () => {
    const child = new FakeProcess()
    const logs: string[] = []
    const transport = cloudflareTransport(
      {
        token,
        slots: [slot, { hostname: 'b.example.com', port: 7_202, useHttps: false }],
        onLog: (line) => logs.push(line),
      },
      dependencies(child, {
        checkPortAvailability: async (port) => (port === slot.port ? 'EADDRINUSE' : null),
      }),
    )

    await transport.open()

    expect(logs.join('\n')).toContain('a.example.com -> localhost:7201 (EADDRINUSE)')
    expect(transport.acquireSlot({ useHttps: true })).toBeUndefined()
    expect((await transport.acquireSlot({ useHttps: false }))?.id).toBe('b.example.com')
    await transport.close()
  })

  it('retries failed readiness checks with a new metrics port and cleans up each process', async () => {
    const children: FakeProcess[] = []
    const ports = [40_001, 40_002, 40_003]
    const spawn = vi.fn((...spawnArguments: [string, string[], SpawnOptions]) => {
      void spawnArguments
      const child = new FakeProcess()
      children.push(child)
      return child
    })
    const transport = cloudflareTransport(
      {
        token,
        slots: [slot],
        readyTimeoutMs: 2,
        readinessPollIntervalMs: 1,
        retryBackoffMs: 0,
        shutdownTimeoutMs: 0,
        onLog: noLog,
      },
      {
        env: {},
        spawn,
        fetch: async () => ({ status: 503 }),
        allocateFreePort: async () => ports.shift() as number,
        checkPortAvailability: async () => null,
      },
    )

    await expect(transport.open()).rejects.toThrow(/failed to start after 3 attempt/)
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(spawn.mock.calls.map((call) => call[1][3])).toEqual([
      '127.0.0.1:40001',
      '127.0.0.1:40002',
      '127.0.0.1:40003',
    ])
    expect(children.every((process) => process.signals[0] === 'SIGTERM')).toBe(true)
  })

  it('surfaces early exits and cleans each failed process before retrying', async () => {
    const children: FakeProcess[] = []
    const transport = cloudflareTransport(
      {
        token,
        slots: [slot],
        startupAttempts: 2,
        readyTimeoutMs: 20,
        readinessPollIntervalMs: 1,
        retryBackoffMs: 0,
        onLog: noLog,
      },
      {
        env: {},
        spawn: () => {
          const child = new FakeProcess()
          children.push(child)
          queueMicrotask(() => child.exitWithCode(7))
          return child
        },
        fetch: async () => ({ status: 503 }),
        allocateFreePort: async () => 41_237,
        checkPortAvailability: async () => null,
      },
    )

    await expect(transport.open()).rejects.toThrow(/cloudflared exited early with code 7/)
    expect(children).toHaveLength(2)
  })

  it('does not retry when the cloudflared executable is missing', async () => {
    const child = new FakeProcess()
    const spawn = vi.fn(() => {
      queueMicrotask(() => {
        child.emit('error', Object.assign(new Error('spawn cloudflared ENOENT'), { code: 'ENOENT' }))
        child.emit('close', null, null)
      })
      return child
    })
    const transport = cloudflareTransport(
      { token, slots: [slot], readinessPollIntervalMs: 1, onLog: noLog },
      dependencies(child, {
        spawn,
        fetch: async () => ({ status: 503 }),
      }),
    )

    await expect(transport.open()).rejects.toThrow(/binary was not found/)
    expect(spawn).toHaveBeenCalledOnce()
    expect(child.signals).toEqual([])
  })

  it('cancels startup and terminates the process when close is called', async () => {
    const child = new FakeProcess()
    const transport = cloudflareTransport(
      { token, slots: [slot], onLog: noLog },
      dependencies(child, {
        fetch: async (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true })
          }),
      }),
    )

    const opening = transport.open()
    await vi.waitFor(() => expect(child.listenerCount('exit')).toBeGreaterThan(0))
    const closing = transport.close()

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await closing
    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('makes close idempotent', async () => {
    const child = new FakeProcess()
    const transport = cloudflareTransport({ token, slots: [slot], onLog: noLog }, dependencies(child))
    await transport.open()

    await Promise.all([transport.close(), transport.close(), transport.close()])

    expect(child.signals).toEqual(['SIGTERM'])
  })

  it('force kills cloudflared when it ignores the graceful shutdown deadline', async () => {
    vi.useFakeTimers()
    const child = new FakeProcess()
    child.exitOnSigterm = false
    const transport = cloudflareTransport(
      { token, slots: [slot], shutdownTimeoutMs: 5_000, onLog: noLog },
      dependencies(child),
    )
    await transport.open()

    const closing = transport.close()
    expect(child.signals).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(4_999)
    expect(child.signals).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(1)
    await closing

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })
})
