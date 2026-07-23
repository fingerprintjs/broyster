import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'
import { createServer } from 'node:net'

import type { ActiveBrowserTransport, BrowserTransport, TunnelSlot } from './types.js'

export type { ActiveBrowserTransport, BrowserProtocol, BrowserTransport, TunnelSlot } from './types.js'

const defaultTokenEnv = 'CLOUDFLARE_TUNNEL_TOKEN'
const defaultStartupAttempts = 3
const defaultReadinessTimeoutMs = 30_000
const defaultReadinessPollIntervalMs = 250
const defaultRetryBackoffMs = 1_000
const defaultShutdownTimeoutMs = 5_000
const metricsHost = '127.0.0.1'

export type CloudflareTunnelErrorCode =
  | 'INVALID_OPTIONS'
  | 'MISSING_TOKEN'
  | 'SPAWN_FAILED'
  | 'EARLY_EXIT'
  | 'READINESS_TIMEOUT'
  | 'STARTUP_FAILED'

export class CloudflareTunnelError extends Error {
  readonly code: CloudflareTunnelErrorCode
  readonly cause: unknown

  constructor(code: CloudflareTunnelErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'CloudflareTunnelError'
    this.code = code
    this.cause = cause
  }
}

export interface CloudflareTunnelOptions {
  /** Slots whose public hostnames and local ports are already configured in Cloudflare. */
  readonly slots: readonly TunnelSlot[]
  /** Environment variable from which the tunnel token is read. */
  readonly tokenEnv?: string
  readonly executable?: string
  readonly startupAttempts?: number
  readonly readinessTimeoutMs?: number
  readonly readinessPollIntervalMs?: number
  readonly retryBackoffMs?: number
  readonly shutdownTimeoutMs?: number
}

export interface CloudflaredProcess {
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'error', listener: (error: Error) => void): this
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
}

export interface CloudflareTunnelTimers {
  now(): number
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(timer: ReturnType<typeof setTimeout>): void
}

export interface CloudflareTunnelDependencies {
  readonly env?: NodeJS.ProcessEnv
  readonly spawn?: (command: string, args: string[], options: SpawnOptions) => CloudflaredProcess
  readonly fetch?: (url: string, init: RequestInit) => Promise<Pick<Response, 'status'>>
  readonly timers?: CloudflareTunnelTimers
  readonly findFreePort?: (signal: AbortSignal) => Promise<number>
}

interface ResolvedOptions {
  readonly slots: readonly TunnelSlot[]
  readonly tokenEnv: string
  readonly executable: string
  readonly startupAttempts: number
  readonly readinessTimeoutMs: number
  readonly readinessPollIntervalMs: number
  readonly retryBackoffMs: number
  readonly shutdownTimeoutMs: number
}

interface ResolvedDependencies {
  readonly env: NodeJS.ProcessEnv
  readonly spawn: (command: string, args: string[], options: SpawnOptions) => CloudflaredProcess
  readonly fetch: (url: string, init: RequestInit) => Promise<Pick<Response, 'status'>>
  readonly timers: CloudflareTunnelTimers
  readonly findFreePort: (signal: AbortSignal) => Promise<number>
}

interface ProcessState {
  readonly child: CloudflaredProcess
  readonly exit: Promise<void>
  failure: CloudflareTunnelError | null
  closing: boolean
}

const defaultTimers: CloudflareTunnelTimers = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
}

function invalidOption(message: string): never {
  throw new CloudflareTunnelError('INVALID_OPTIONS', message)
}

function resolvePositiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    invalidOption(`${name} must be a positive integer.`)
  }
  return resolved
}

function resolveNonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    invalidOption(`${name} must be a non-negative integer.`)
  }
  return resolved
}

function validateSlots(slots: readonly TunnelSlot[]): readonly TunnelSlot[] {
  if (slots.length === 0) {
    invalidOption('Cloudflare transport requires at least one tunnel slot.')
  }

  const ids = new Set<string>()
  const publicUrls = new Set<string>()
  const localPorts = new Set<number>()

  return Object.freeze(
    slots.map((slot, index) => {
      if (!slot.id.trim()) {
        invalidOption(`Cloudflare slot at index ${index} must have a non-empty id.`)
      }
      if (ids.has(slot.id)) {
        invalidOption(`Cloudflare slot id "${slot.id}" is duplicated.`)
      }
      ids.add(slot.id)

      let publicUrl: URL
      try {
        publicUrl = new URL(slot.publicUrl)
      } catch (error) {
        throw new CloudflareTunnelError(
          'INVALID_OPTIONS',
          `Cloudflare slot "${slot.id}" has an invalid publicUrl.`,
          error,
        )
      }

      if (publicUrl.protocol !== `${slot.protocol}:`) {
        invalidOption(
          `Cloudflare slot "${slot.id}" declares ${slot.protocol} but its publicUrl uses ${publicUrl.protocol}`,
        )
      }
      if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
        invalidOption(
          `Cloudflare slot "${slot.id}" publicUrl must not include credentials, query parameters, or a fragment.`,
        )
      }
      if (publicUrls.has(publicUrl.href)) {
        invalidOption(`Cloudflare slot publicUrl "${publicUrl.href}" is duplicated.`)
      }
      publicUrls.add(publicUrl.href)

      if (!Number.isSafeInteger(slot.localPort) || slot.localPort < 1 || slot.localPort > 65_535) {
        invalidOption(`Cloudflare slot "${slot.id}" must use a local port between 1 and 65535.`)
      }
      if (localPorts.has(slot.localPort)) {
        invalidOption(`Cloudflare slot local port ${slot.localPort} is duplicated.`)
      }
      localPorts.add(slot.localPort)

      return Object.freeze({
        id: slot.id,
        publicUrl: slot.publicUrl,
        localPort: slot.localPort,
        protocol: slot.protocol,
      })
    }),
  )
}

function resolveOptions(options: CloudflareTunnelOptions): ResolvedOptions {
  const tokenEnv = options.tokenEnv ?? defaultTokenEnv
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv)) {
    invalidOption('tokenEnv must be a valid environment variable name.')
  }

  const executable = options.executable ?? 'cloudflared'
  if (!executable.trim()) {
    invalidOption('executable must not be empty.')
  }

  return {
    slots: validateSlots(options.slots),
    tokenEnv,
    executable,
    startupAttempts: resolvePositiveInteger(options.startupAttempts, defaultStartupAttempts, 'startupAttempts'),
    readinessTimeoutMs: resolvePositiveInteger(
      options.readinessTimeoutMs,
      defaultReadinessTimeoutMs,
      'readinessTimeoutMs',
    ),
    readinessPollIntervalMs: resolvePositiveInteger(
      options.readinessPollIntervalMs,
      defaultReadinessPollIntervalMs,
      'readinessPollIntervalMs',
    ),
    retryBackoffMs: resolveNonNegativeInteger(options.retryBackoffMs, defaultRetryBackoffMs, 'retryBackoffMs'),
    shutdownTimeoutMs: resolveNonNegativeInteger(
      options.shutdownTimeoutMs,
      defaultShutdownTimeoutMs,
      'shutdownTimeoutMs',
    ),
  }
}

function resolveDependencies(dependencies: CloudflareTunnelDependencies): ResolvedDependencies {
  return {
    env: dependencies.env ?? process.env,
    spawn:
      dependencies.spawn ??
      ((command, args, options) => nodeSpawn(command, args, options) as unknown as CloudflaredProcess),
    fetch: dependencies.fetch ?? ((url, init) => fetch(url, init)),
    timers: dependencies.timers ?? defaultTimers,
    findFreePort: dependencies.findFreePort ?? findFreePort,
  }
}

function abortError(): Error {
  const error = new Error('Cloudflare tunnel operation was aborted.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError()
  }
}

function sleep(delayMs: number, signal: AbortSignal, timers: CloudflareTunnelTimers): Promise<void> {
  throwIfAborted(signal)
  if (delayMs === 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      timers.clearTimeout(timer)
      reject(abortError())
    }
    const timer = timers.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function hasExited(child: CloudflaredProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function observeProcess(child: CloudflaredProcess): ProcessState {
  let resolveExit: () => void = () => undefined
  const state: ProcessState = {
    child,
    exit: new Promise<void>((resolve) => {
      resolveExit = resolve
    }),
    failure: null,
    closing: false,
  }

  child.once('error', (error) => {
    state.failure = new CloudflareTunnelError('SPAWN_FAILED', `Failed to start cloudflared: ${error.message}`, error)
    resolveExit()
  })
  child.once('exit', (code, signal) => {
    if (!state.closing) {
      const detail = code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`
      state.failure = new CloudflareTunnelError('EARLY_EXIT', `cloudflared exited before it was ready with ${detail}.`)
    }
    resolveExit()
  })

  if (hasExited(child)) {
    resolveExit()
  }

  return state
}

function waitForExitOrTimeout(
  state: ProcessState,
  timeoutMs: number,
  timers: CloudflareTunnelTimers,
): Promise<boolean> {
  if (hasExited(state.child)) {
    return Promise.resolve(true)
  }
  if (timeoutMs === 0) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (exited: boolean) => {
      if (settled) {
        return
      }
      settled = true
      timers.clearTimeout(timer)
      resolve(exited)
    }
    const timer = timers.setTimeout(() => finish(false), timeoutMs)
    void state.exit.then(() => finish(true))
  })
}

async function stopProcess(
  state: ProcessState,
  shutdownTimeoutMs: number,
  timers: CloudflareTunnelTimers,
): Promise<void> {
  state.closing = true
  if (hasExited(state.child)) {
    return
  }

  state.child.kill('SIGTERM')
  const exitedGracefully = await waitForExitOrTimeout(state, shutdownTimeoutMs, timers)
  if (!exitedGracefully && !hasExited(state.child)) {
    state.child.kill('SIGKILL')
    await waitForExitOrTimeout(state, shutdownTimeoutMs, timers)
  }
}

async function probeReady(
  url: string,
  timeoutMs: number,
  parentSignal: AbortSignal,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  parentSignal.addEventListener('abort', onAbort, { once: true })
  const timer = dependencies.timers.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await dependencies.fetch(url, { signal: controller.signal })
    return response.status === 200
  } catch {
    throwIfAborted(parentSignal)
    return false
  } finally {
    dependencies.timers.clearTimeout(timer)
    parentSignal.removeEventListener('abort', onAbort)
  }
}

async function waitUntilReady(
  state: ProcessState,
  readyUrl: string,
  options: ResolvedOptions,
  signal: AbortSignal,
  dependencies: ResolvedDependencies,
): Promise<void> {
  const deadline = dependencies.timers.now() + options.readinessTimeoutMs

  while (dependencies.timers.now() < deadline) {
    throwIfAborted(signal)
    if (state.failure) {
      throw state.failure
    }

    const remainingMs = deadline - dependencies.timers.now()
    const probeTimeoutMs = Math.max(1, Math.min(options.readinessPollIntervalMs, remainingMs))
    if (await probeReady(readyUrl, probeTimeoutMs, signal, dependencies)) {
      if (state.failure) {
        throw state.failure
      }
      return
    }

    if (state.failure) {
      throw state.failure
    }
    const waitMs = Math.min(options.readinessPollIntervalMs, deadline - dependencies.timers.now())
    if (waitMs > 0) {
      await sleep(waitMs, signal, dependencies.timers)
    }
  }

  if (state.failure) {
    throw state.failure
  }
  throw new CloudflareTunnelError(
    'READINESS_TIMEOUT',
    `Timed out after ${options.readinessTimeoutMs}ms waiting for cloudflared readiness at ${readyUrl}.`,
  )
}

async function findFreePort(signal: AbortSignal): Promise<number> {
  throwIfAborted(signal)

  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    const cleanUp = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      server.close()
      cleanUp()
      reject(abortError())
    }

    signal.addEventListener('abort', onAbort, { once: true })
    server.unref()
    server.once('error', (error) => {
      cleanUp()
      reject(error)
    })
    server.listen(0, metricsHost, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        cleanUp()
        reject(new Error('Unable to allocate a metrics port for cloudflared.'))
        return
      }

      server.close((error) => {
        cleanUp()
        if (error) {
          reject(error)
        } else {
          resolve(address.port)
        }
      })
    })
  })
}

function isMissingExecutable(error: unknown): boolean {
  if (!(error instanceof CloudflareTunnelError) || error.code !== 'SPAWN_FAILED') {
    return false
  }
  return (
    typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause && error.cause.code === 'ENOENT'
  )
}

function spawnCloudflared(
  token: string,
  metricsPort: number,
  options: ResolvedOptions,
  dependencies: ResolvedDependencies,
): ProcessState {
  const childEnv: NodeJS.ProcessEnv = { ...dependencies.env, TUNNEL_TOKEN: token }
  if (options.tokenEnv !== 'TUNNEL_TOKEN') {
    delete childEnv[options.tokenEnv]
  }

  let child: CloudflaredProcess
  try {
    child = dependencies.spawn(
      options.executable,
      ['tunnel', '--no-autoupdate', '--metrics', `${metricsHost}:${metricsPort}`, 'run'],
      {
        env: childEnv,
        stdio: 'ignore',
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new CloudflareTunnelError('SPAWN_FAILED', `Failed to start cloudflared: ${message}`, error)
  }

  return observeProcess(child)
}

function createActiveTransport(
  state: ProcessState,
  slots: readonly TunnelSlot[],
  signal: AbortSignal,
  options: ResolvedOptions,
  dependencies: ResolvedDependencies,
): ActiveBrowserTransport {
  let closePromise: Promise<void> | undefined
  const onAbort = () => {
    void close()
  }
  const close = (): Promise<void> => {
    if (!closePromise) {
      signal.removeEventListener('abort', onAbort)
      closePromise = stopProcess(state, options.shutdownTimeoutMs, dependencies.timers)
    }
    return closePromise
  }

  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) {
    onAbort()
  }

  return Object.freeze({
    slots,
    sensitiveEnvKeys: Object.freeze([...new Set([options.tokenEnv, 'TUNNEL_TOKEN'])]),
    close,
  })
}

/**
 * Creates a transport for a remotely managed Cloudflare Tunnel.
 *
 * The adapter only starts an existing tunnel. It never creates tunnels, DNS records, or ingress routes.
 */
export function cloudflareTunnel(
  tunnelOptions: CloudflareTunnelOptions,
  tunnelDependencies: CloudflareTunnelDependencies = {},
): BrowserTransport {
  const options = resolveOptions(tunnelOptions)
  const dependencies = resolveDependencies(tunnelDependencies)

  return Object.freeze({
    async start(signal: AbortSignal): Promise<ActiveBrowserTransport> {
      throwIfAborted(signal)
      const token = dependencies.env[options.tokenEnv]?.trim()
      if (!token) {
        throw new CloudflareTunnelError(
          'MISSING_TOKEN',
          `Cloudflare tunnel token is missing from environment variable ${options.tokenEnv}.`,
        )
      }

      let lastError: unknown
      for (let attempt = 1; attempt <= options.startupAttempts; attempt += 1) {
        throwIfAborted(signal)
        let state: ProcessState | undefined

        try {
          const metricsPort = await dependencies.findFreePort(signal)
          throwIfAborted(signal)
          state = spawnCloudflared(token, metricsPort, options, dependencies)
          await waitUntilReady(state, `http://${metricsHost}:${metricsPort}/ready`, options, signal, dependencies)
          return createActiveTransport(state, options.slots, signal, options, dependencies)
        } catch (error) {
          lastError = error
          if (state) {
            await stopProcess(state, options.shutdownTimeoutMs, dependencies.timers)
          }
          throwIfAborted(signal)
          if (isMissingExecutable(error)) {
            throw error
          }
          if (attempt < options.startupAttempts) {
            await sleep(options.retryBackoffMs * attempt, signal, dependencies.timers)
          }
        }
      }

      const detail = lastError instanceof Error ? ` ${lastError.message}` : ''
      throw new CloudflareTunnelError(
        'STARTUP_FAILED',
        `Cloudflare tunnel failed to start after ${options.startupAttempts} attempts.${detail}`,
        lastError,
      )
    },
  })
}
