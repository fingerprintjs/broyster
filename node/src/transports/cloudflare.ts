import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'

import { abortableDelay, createAbortError, systemTimerApi, throwIfAborted } from '../internal/abort.js'
import { createLineForwarder } from '../internal/line_forwarder.js'
import { errorMessage } from '../internal/errors.js'
import { redactSecrets } from '../internal/secrets.js'
import { isNonNegativeSafeInteger, isPort, isPositiveSafeInteger, isRecord, parseCsv } from '../internal/validation.js'
import { allocateFreePort, checkPortAvailability } from '../orchestrator/ports.js'
import type { SlotRequirement, Transport, TransportSlot } from './transport.js'

export type CloudflareSlotConfig = {
  hostname: string
  port: number
  useHttps: boolean
}

export type CloudflareTransportOptions = {
  /** Cloudflare tunnel token, passed privately through cloudflared's `TUNNEL_TOKEN` environment variable */
  token: string
  /** Public hostname → local port pairs, each pre-configured in the Cloudflare tunnel */
  slots: CloudflareSlotConfig[]
  /** How long to wait for each tunnel startup attempt, in milliseconds */
  readyTimeoutMs?: number
  /** Number of times to try starting cloudflared (default: 3) */
  startupAttempts?: number
  /** Delay between readiness probes, in milliseconds (default: 250) */
  readinessPollIntervalMs?: number
  /** Base delay between startup attempts, in milliseconds (default: 1000) */
  retryBackoffMs?: number
  /** Grace period before cloudflared is force-killed, in milliseconds (default: 5000) */
  shutdownTimeoutMs?: number
  /** Path to the cloudflared binary (default: "cloudflared" on PATH) */
  cloudflaredPath?: string
  onLog?: (line: string) => void
}

export interface CloudflaredProcess {
  readonly stdout: NodeJS.ReadableStream | null
  readonly stderr: NodeJS.ReadableStream | null
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: 'error', listener: (error: Error) => void): this
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
}

export interface CloudflareTransportTimers {
  now(): number
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(timer: ReturnType<typeof setTimeout>): void
}

/** Dependency seams for deterministic transport lifecycle tests. */
export interface CloudflareTransportDependencies {
  env?: NodeJS.ProcessEnv
  spawn?: (command: string, args: string[], options: SpawnOptions) => CloudflaredProcess
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<{ status: number }>
  allocateFreePort?: () => Promise<number>
  checkPortAvailability?: (port: number) => Promise<string | null>
  timers?: CloudflareTransportTimers
}

type ResolvedOptions = Required<
  Pick<
    CloudflareTransportOptions,
    | 'readyTimeoutMs'
    | 'startupAttempts'
    | 'readinessPollIntervalMs'
    | 'retryBackoffMs'
    | 'shutdownTimeoutMs'
    | 'cloudflaredPath'
    | 'onLog'
  >
> &
  Pick<CloudflareTransportOptions, 'token' | 'slots'>

type ResolvedDependencies = Required<CloudflareTransportDependencies>

type ProcessState = {
  child: CloudflaredProcess
  terminated: Promise<void>
  closed: Promise<void>
  didTerminate: boolean
  didClose: boolean
  failure: Error | null
  closing: boolean
  stopPromise?: Promise<void>
}

const cloudflareTokenEnvKeys = Object.freeze(['CLOUDFLARE_TUNNEL_TOKEN', 'TUNNEL_TOKEN'])
const metricsHost = '127.0.0.1'

const defaultTimers: CloudflareTransportTimers = {
  now: Date.now,
  ...systemTimerApi,
}

/**
 * Routes BrowserStack traffic to local Vitest servers through a Cloudflare
 * tunnel. Requires the `cloudflared` binary and a tunnel pre-configured with
 * public hostnames mapped to the given local ports.
 */
export function cloudflareTransport(
  options: CloudflareTransportOptions,
  dependencies: CloudflareTransportDependencies = {},
): Transport {
  return new CloudflareTransport(options, dependencies)
}

/**
 * Builds a Cloudflare transport from environment variables:
 * - CLOUDFLARE_TUNNEL_TOKEN
 * - BROYSTER_CLOUDFLARE_HTTPS_HOSTS / BROYSTER_CLOUDFLARE_HTTPS_PORTS (CSV, same length)
 * - BROYSTER_CLOUDFLARE_HTTP_HOSTS / BROYSTER_CLOUDFLARE_HTTP_PORTS (CSV, same length, optional)
 */
export function cloudflareTransportFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: CloudflareTransportDependencies = {},
): Transport {
  const token = env.CLOUDFLARE_TUNNEL_TOKEN
  if (!token) {
    throw new Error('Cloudflare tunnel token not found. Set the CLOUDFLARE_TUNNEL_TOKEN environment variable.')
  }

  const httpsHosts = parseCsv(env.BROYSTER_CLOUDFLARE_HTTPS_HOSTS)
  const httpHosts = parseCsv(env.BROYSTER_CLOUDFLARE_HTTP_HOSTS)
  const httpsPorts = parsePorts(env.BROYSTER_CLOUDFLARE_HTTPS_PORTS, 'BROYSTER_CLOUDFLARE_HTTPS_PORTS')
  const httpPorts = parsePorts(env.BROYSTER_CLOUDFLARE_HTTP_PORTS, 'BROYSTER_CLOUDFLARE_HTTP_PORTS')

  const slots = [...zipSlots('https', httpsHosts, httpsPorts, true), ...zipSlots('http', httpHosts, httpPorts, false)]

  if (slots.length === 0) {
    throw new Error(
      'No Cloudflare slots configured. Set BROYSTER_CLOUDFLARE_HTTPS_HOSTS and BROYSTER_CLOUDFLARE_HTTPS_PORTS ' +
        '(and optionally BROYSTER_CLOUDFLARE_HTTP_HOSTS / BROYSTER_CLOUDFLARE_HTTP_PORTS) to CSV lists of the ' +
        'public hostnames and matching local ports configured in your Cloudflare tunnel.',
    )
  }

  return new CloudflareTransport({ token, slots }, { ...dependencies, env: dependencies.env ?? env })
}

class CloudflareTransport implements Transport {
  readonly name = 'cloudflare'
  readonly sensitiveEnvKeys = cloudflareTokenEnvKeys

  private readonly options: ResolvedOptions
  private readonly dependencies: ResolvedDependencies
  private freeSlots: TransportSlot[] = []
  private processState: ProcessState | null = null
  private openController: AbortController | null = null
  private openPromise: Promise<void> | null = null
  private closePromise: Promise<void> | null = null

  constructor(options: CloudflareTransportOptions, dependencies: CloudflareTransportDependencies) {
    validateSlotConfigs(options.slots)
    this.options = resolveOptions(options)
    this.dependencies = resolveDependencies(dependencies)
  }

  supports(requirement: SlotRequirement): boolean {
    return this.options.slots.some((slot) => slot.useHttps === requirement.useHttps)
  }

  open(): Promise<void> {
    if (this.closePromise) {
      return Promise.reject(new Error('The Cloudflare transport is already closing or closed.'))
    }
    if (!this.openPromise) {
      this.openController = new AbortController()
      this.openPromise = this.openInternal(this.openController.signal)
    }
    return this.openPromise
  }

  acquireSlot(requirement: SlotRequirement): TransportSlot | undefined {
    if (this.processState?.failure) {
      throw this.processState.failure
    }

    const index = this.freeSlots.findIndex((slot) => slot.useHttps === requirement.useHttps)
    if (index === -1) {
      return undefined
    }
    return this.freeSlots.splice(index, 1)[0]
  }

  releaseSlot(slot: TransportSlot): void {
    this.freeSlots.push(slot)
  }

  close(): Promise<void> {
    if (!this.closePromise) {
      this.openController?.abort(createAbortError('Cloudflare tunnel operation was aborted.'))
      this.closePromise = (async () => {
        if (this.processState) {
          await stopProcess(
            this.processState,
            this.options.shutdownTimeoutMs,
            this.options.onLog,
            this.dependencies.timers,
          )
        }
        await this.openPromise?.catch(() => undefined)
      })()
    }
    return this.closePromise
  }

  private async openInternal(signal: AbortSignal): Promise<void> {
    const availableConfigs = await this.filterAvailableSlotConfigs()
    throwIfAborted(signal)

    this.freeSlots = availableConfigs.map((config) => ({
      id: config.hostname,
      localPort: config.port,
      publicOrigin: `${config.useHttps ? 'https' : 'http'}://${config.hostname}`,
      useHttps: config.useHttps,
    }))

    if (this.freeSlots.length === 0) {
      throw new Error('No Cloudflare slots are available (all local ports are busy).')
    }

    await this.startCloudflared(signal)
  }

  private async filterAvailableSlotConfigs(): Promise<CloudflareSlotConfig[]> {
    const checks = await Promise.all(
      this.options.slots.map(async (slot) => ({
        slot,
        error: await this.dependencies.checkPortAvailability(slot.port),
      })),
    )

    const unavailable = checks.filter((check) => check.error !== null)
    if (unavailable.length > 0) {
      this.options.onLog(
        `Skipping Cloudflare slots with busy ports: ${unavailable
          .map(({ slot, error }) => `${slot.hostname} -> localhost:${slot.port} (${error})`)
          .join(', ')}`,
      )
    }

    return checks.filter((check) => check.error === null).map((check) => check.slot)
  }

  private async startCloudflared(signal: AbortSignal): Promise<void> {
    let lastError: unknown

    for (let attempt = 1; attempt <= this.options.startupAttempts; attempt += 1) {
      throwIfAborted(signal)
      let state: ProcessState | undefined

      try {
        const metricsPort = await this.dependencies.allocateFreePort()
        throwIfAborted(signal)
        state = this.spawnCloudflared(metricsPort)
        this.processState = state
        await waitUntilReady(
          state,
          `http://${metricsHost}:${metricsPort}/ready`,
          this.options,
          signal,
          this.dependencies,
        )
        return
      } catch (error) {
        lastError = error
        if (state) {
          await stopProcess(state, this.options.shutdownTimeoutMs, this.options.onLog, this.dependencies.timers)
          if (this.processState === state) {
            this.processState = null
          }
        }

        throwIfAborted(signal)
        if (isMissingExecutable(error)) {
          throw error
        }

        if (attempt < this.options.startupAttempts) {
          this.options.onLog(
            `  [cloudflared] Startup attempt ${attempt}/${this.options.startupAttempts} failed: ${errorMessage(error)}`,
          )
          await abortableDelay(this.options.retryBackoffMs * attempt, {
            signal,
            timers: this.dependencies.timers,
          })
        }
      }
    }

    throw new Error(
      `Cloudflare tunnel failed to start after ${this.options.startupAttempts} attempt(s): ${errorMessage(lastError)}`,
      { cause: lastError },
    )
  }

  private spawnCloudflared(metricsPort: number): ProcessState {
    const childEnv: NodeJS.ProcessEnv = { ...this.dependencies.env, TUNNEL_TOKEN: this.options.token }
    delete childEnv.CLOUDFLARE_TUNNEL_TOKEN

    let child: CloudflaredProcess
    try {
      child = this.dependencies.spawn(
        this.options.cloudflaredPath,
        ['tunnel', '--no-autoupdate', '--metrics', `${metricsHost}:${metricsPort}`, 'run'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: childEnv,
        },
      )
    } catch (error) {
      throw makeSpawnError(this.options.cloudflaredPath, error)
    }

    const attachOutput = (stream: NodeJS.ReadableStream | null) => {
      const forwarder = createLineForwarder((line) =>
        this.options.onLog(`  [cloudflared] ${redactSecrets(line, [this.options.token])}`),
      )
      stream?.on('data', forwarder.write)
      stream?.on('end', forwarder.flush)
      return forwarder
    }
    const stdoutForwarder = attachOutput(child.stdout)
    const stderrForwarder = attachOutput(child.stderr)

    return observeProcess(child, this.options.cloudflaredPath, () => {
      stdoutForwarder.flush()
      stderrForwarder.flush()
    })
  }
}

function resolveOptions(options: CloudflareTransportOptions): ResolvedOptions {
  if (!options.token.trim()) {
    throw new Error('Cloudflare tunnel token must not be empty.')
  }

  const cloudflaredPath = options.cloudflaredPath ?? 'cloudflared'
  if (!cloudflaredPath.trim()) {
    throw new Error('cloudflaredPath must not be empty.')
  }

  return {
    token: options.token,
    slots: [...options.slots],
    readyTimeoutMs: integerOption(options.readyTimeoutMs, 30_000, 'readyTimeoutMs', 1),
    startupAttempts: integerOption(options.startupAttempts, 3, 'startupAttempts', 1),
    readinessPollIntervalMs: integerOption(options.readinessPollIntervalMs, 250, 'readinessPollIntervalMs', 1),
    retryBackoffMs: integerOption(options.retryBackoffMs, 1_000, 'retryBackoffMs', 0),
    shutdownTimeoutMs: integerOption(options.shutdownTimeoutMs, 5_000, 'shutdownTimeoutMs', 0),
    cloudflaredPath,
    // eslint-disable-next-line no-console
    onLog: options.onLog ?? ((line) => console.log(line)),
  }
}

function resolveDependencies(dependencies: CloudflareTransportDependencies): ResolvedDependencies {
  return {
    env: dependencies.env ?? process.env,
    spawn:
      dependencies.spawn ??
      ((command, args, options) => nodeSpawn(command, args, options) as unknown as CloudflaredProcess),
    fetch: dependencies.fetch ?? ((url, init) => fetch(url, init)),
    allocateFreePort: dependencies.allocateFreePort ?? allocateFreePort,
    checkPortAvailability: dependencies.checkPortAvailability ?? checkPortAvailability,
    timers: dependencies.timers ?? defaultTimers,
  }
}

function integerOption(value: number | undefined, fallback: number, name: string, minimum: 0 | 1): number {
  const resolved = value ?? fallback
  const valid = minimum === 0 ? isNonNegativeSafeInteger(resolved) : isPositiveSafeInteger(resolved)
  if (!valid) {
    throw new Error(`${name} must be a ${minimum === 0 ? 'non-negative' : 'positive'} integer.`)
  }
  return resolved
}

function validateSlotConfigs(slots: CloudflareSlotConfig[]): void {
  const seenHosts = new Set<string>()
  const seenPorts = new Set<number>()

  for (const slot of slots) {
    if (!slot.hostname.trim()) {
      throw new Error('Cloudflare slot hostname must not be empty.')
    }
    if (!isPort(slot.port)) {
      throw new Error(`Invalid Cloudflare slot port "${slot.port}" for host "${slot.hostname}".`)
    }
    if (seenHosts.has(slot.hostname)) {
      throw new Error(`Duplicate Cloudflare slot hostname "${slot.hostname}".`)
    }
    if (seenPorts.has(slot.port)) {
      throw new Error(`Duplicate Cloudflare slot port "${slot.port}".`)
    }
    seenHosts.add(slot.hostname)
    seenPorts.add(slot.port)
  }
}

function parsePorts(value: string | undefined, envName: string): number[] {
  return parseCsv(value).map((part) => {
    const port = Number(part)
    if (!isPort(port)) {
      throw new Error(`Invalid ${envName} entry "${part}". Expected an integer port between 1 and 65535.`)
    }
    return port
  })
}

function zipSlots(kind: string, hosts: string[], ports: number[], useHttps: boolean): CloudflareSlotConfig[] {
  if (hosts.length !== ports.length) {
    throw new Error(`Cloudflare ${kind} slot hosts (${hosts.length}) must match ports (${ports.length}).`)
  }

  return hosts.map((hostname, index) => ({ hostname, port: ports[index] as number, useHttps }))
}

function hasExited(child: CloudflaredProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function observeProcess(child: CloudflaredProcess, binary: string, onClose: () => void): ProcessState {
  let resolveTerminated: () => void = () => undefined
  let resolveClosed: () => void = () => undefined
  const state: ProcessState = {
    child,
    terminated: new Promise<void>((resolve) => {
      resolveTerminated = resolve
    }),
    closed: new Promise<void>((resolve) => {
      resolveClosed = resolve
    }),
    didTerminate: false,
    didClose: false,
    failure: null,
    closing: false,
  }
  const finishTermination = () => {
    if (state.didTerminate) {
      return
    }
    state.didTerminate = true
    resolveTerminated()
  }
  const finishClose = () => {
    if (state.didClose) {
      return
    }
    state.didClose = true
    onClose()
    resolveClosed()
  }

  child.once('error', (error) => {
    state.failure = makeSpawnError(binary, error)
    finishTermination()
  })
  child.once('exit', (code, signal) => {
    if (!state.closing) {
      state.failure = new Error(
        code !== null
          ? `cloudflared exited early with code ${code}.`
          : `cloudflared exited early with signal ${signal ?? 'unknown'}.`,
      )
    }
    finishTermination()
  })
  child.once('close', () => {
    finishTermination()
    finishClose()
  })

  if (hasExited(child)) {
    finishTermination()
  }

  return state
}

function makeSpawnError(binary: string, error: unknown): Error {
  if (isErrorWithCode(error, 'ENOENT')) {
    return Object.assign(
      new Error(
        `The "${binary}" binary was not found. Install cloudflared ` +
          '(https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) ' +
          'or pass its location via the cloudflaredPath option.',
        { cause: error },
      ),
      { code: 'ENOENT' },
    )
  }

  return new Error(`Failed to start cloudflared: ${errorMessage(error)}`, { cause: error })
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}

function isMissingExecutable(error: unknown): boolean {
  return isErrorWithCode(error, 'ENOENT')
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
  const deadline = dependencies.timers.now() + options.readyTimeoutMs

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
      await abortableDelay(waitMs, { signal, timers: dependencies.timers })
    }
  }

  if (state.failure) {
    throw state.failure
  }
  throw new Error(`Timed out after ${options.readyTimeoutMs}ms waiting for cloudflared readiness at ${readyUrl}.`)
}

function waitForProcessEvent(
  event: Promise<void>,
  alreadyOccurred: () => boolean,
  timeoutMs: number,
  timers: CloudflareTransportTimers,
): Promise<boolean> {
  if (alreadyOccurred()) {
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
    void event.then(() => finish(true))
  })
}

function stopProcess(
  state: ProcessState,
  shutdownTimeoutMs: number,
  onLog: (line: string) => void,
  timers: CloudflareTransportTimers,
): Promise<void> {
  if (!state.stopPromise) {
    state.stopPromise = (async () => {
      state.closing = true
      const waitForTermination = () =>
        waitForProcessEvent(
          state.terminated,
          () => state.didTerminate || hasExited(state.child),
          shutdownTimeoutMs,
          timers,
        )
      if (!state.didTerminate && !hasExited(state.child)) {
        state.child.kill('SIGTERM')
        const exitedGracefully = await waitForTermination()
        if (!exitedGracefully && !hasExited(state.child)) {
          onLog('  [cloudflared] Did not exit after SIGTERM, sending SIGKILL')
          state.child.kill('SIGKILL')
          await waitForTermination()
        }
      }
      await waitForProcessEvent(state.closed, () => state.didClose, shutdownTimeoutMs, timers)
    })()
  }
  return state.stopPromise
}
