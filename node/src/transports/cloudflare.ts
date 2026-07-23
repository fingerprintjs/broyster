import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

import { checkPortAvailability } from '../orchestrator/ports.js'
import type { SlotRequirement, Transport, TransportSlot } from './transport.js'

export type CloudflareSlotConfig = {
  hostname: string
  port: number
  useHttps: boolean
}

export type CloudflareTransportOptions = {
  /** Cloudflare tunnel token (`cloudflared tunnel run --token <token>`) */
  token: string
  /** Public hostname → local port pairs, each pre-configured in the Cloudflare tunnel */
  slots: CloudflareSlotConfig[]
  /** How long to wait for the tunnel to start serving, in milliseconds */
  readyTimeoutMs?: number
  /** Path to the cloudflared binary (default: "cloudflared" on PATH) */
  cloudflaredPath?: string
  onLog?: (line: string) => void
}

const publicUrlTimeoutMs = 3_000
const childShutdownTimeoutMs = 5_000

/**
 * Routes BrowserStack traffic to local Vitest servers through a Cloudflare
 * tunnel. Requires the `cloudflared` binary and a tunnel pre-configured with
 * public hostnames mapped to the given local ports.
 */
export function cloudflareTransport(options: CloudflareTransportOptions): Transport {
  return new CloudflareTransport(options)
}

/**
 * Builds a Cloudflare transport from environment variables:
 * - CLOUDFLARE_TUNNEL_TOKEN
 * - BROYSTER_CLOUDFLARE_HTTPS_HOSTS / BROYSTER_CLOUDFLARE_HTTPS_PORTS (CSV, same length)
 * - BROYSTER_CLOUDFLARE_HTTP_HOSTS / BROYSTER_CLOUDFLARE_HTTP_PORTS (CSV, same length, optional)
 */
export function cloudflareTransportFromEnv(env: NodeJS.ProcessEnv = process.env): Transport {
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

  return new CloudflareTransport({ token, slots })
}

class CloudflareTransport implements Transport {
  readonly name = 'cloudflare'

  private options: CloudflareTransportOptions
  private freeSlots: TransportSlot[] = []
  private child: ChildProcess | null = null
  private closing = false
  private exitError: Error | null = null
  private onLog: (line: string) => void

  constructor(options: CloudflareTransportOptions) {
    validateSlotConfigs(options.slots)
    this.options = options
    // eslint-disable-next-line no-console
    this.onLog = options.onLog ?? ((line) => console.log(line))
  }

  supports(requirement: SlotRequirement): boolean {
    return this.options.slots.some((slot) => slot.useHttps === requirement.useHttps)
  }

  async open(): Promise<void> {
    const availableConfigs = await this.filterAvailableSlotConfigs()
    this.freeSlots = availableConfigs.map((config) => ({
      id: config.hostname,
      localPort: config.port,
      publicOrigin: `${config.useHttps ? 'https' : 'http'}://${config.hostname}`,
      useHttps: config.useHttps,
    }))

    const readySlot = this.freeSlots.find((slot) => slot.useHttps) ?? this.freeSlots[0]
    if (!readySlot) {
      throw new Error('No Cloudflare slots are available (all local ports are busy).')
    }

    await this.startCloudflared(`${readySlot.publicOrigin}/`)
  }

  acquireSlot(requirement: SlotRequirement): TransportSlot | undefined {
    const index = this.freeSlots.findIndex((slot) => slot.useHttps === requirement.useHttps)
    if (index === -1) {
      return undefined
    }
    return this.freeSlots.splice(index, 1)[0]
  }

  releaseSlot(slot: TransportSlot): void {
    this.freeSlots.push(slot)
  }

  async close(): Promise<void> {
    this.closing = true
    if (this.child) {
      await stopChildProcess(this.child, this.onLog)
      this.child = null
    }
  }

  private async filterAvailableSlotConfigs(): Promise<CloudflareSlotConfig[]> {
    const checks = await Promise.all(
      this.options.slots.map(async (slot) => ({
        slot,
        error: await checkPortAvailability(slot.port),
      })),
    )

    const unavailable = checks.filter((check) => check.error !== null)
    if (unavailable.length > 0) {
      this.onLog(
        `Skipping Cloudflare slots with busy ports: ${unavailable
          .map(({ slot, error }) => `${slot.hostname} -> localhost:${slot.port} (${error})`)
          .join(', ')}`,
      )
    }

    return checks.filter((check) => check.error === null).map((check) => check.slot)
  }

  private async startCloudflared(readyUrl: string): Promise<void> {
    const binary = this.options.cloudflaredPath ?? 'cloudflared'
    const child = spawn(binary, ['tunnel', 'run', '--token', this.options.token], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    this.child = child

    const forwardOutput = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) {
          this.onLog(`  [cloudflared] ${line}`)
        }
      }
    }
    child.stdout?.on('data', forwardOutput)
    child.stderr?.on('data', forwardOutput)

    child.on('error', (error: NodeJS.ErrnoException) => {
      this.exitError =
        error.code === 'ENOENT'
          ? new Error(
              `The "${binary}" binary was not found. Install cloudflared ` +
                '(https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) ' +
                'or pass its location via the cloudflaredPath option.',
            )
          : error
    })

    child.on('exit', (code, signal) => {
      if (!this.closing) {
        this.exitError = new Error(
          code !== null
            ? `cloudflared exited early with code ${code}.`
            : `cloudflared exited early with signal ${signal ?? 'unknown'}.`,
        )
      }
    })

    const deadline = Date.now() + (this.options.readyTimeoutMs ?? 30_000)
    let ready = false

    while (Date.now() < deadline && !ready) {
      if (this.exitError) {
        throw this.exitError
      }

      try {
        await requestPublicUrl(readyUrl)
        ready = true
      } catch {
        if (Date.now() < deadline) {
          await wait(1_000)
        }
      }
    }

    if (this.exitError) {
      throw this.exitError
    }

    if (!ready) {
      this.closing = true
      await stopChildProcess(child, this.onLog)
      this.child = null
      throw new Error(`Timed out waiting for the Cloudflare tunnel to serve ${readyUrl}`)
    }
  }
}

function validateSlotConfigs(slots: CloudflareSlotConfig[]): void {
  const seenHosts = new Set<string>()
  const seenPorts = new Set<number>()

  for (const slot of slots) {
    if (!Number.isInteger(slot.port) || slot.port < 1) {
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

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parsePorts(value: string | undefined, envName: string): number[] {
  return parseCsv(value).map((part) => {
    const port = Number(part)
    if (!Number.isInteger(port) || port < 1) {
      throw new Error(`Invalid ${envName} entry "${part}". Expected a positive integer port.`)
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (hasExited(child)) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })
}

async function stopChildProcess(child: ChildProcess, onLog: (line: string) => void): Promise<void> {
  if (hasExited(child)) {
    return
  }

  child.kill('SIGTERM')
  const killTimer = setTimeout(() => {
    if (!hasExited(child)) {
      onLog('  [cloudflared] Did not exit after SIGTERM, sending SIGKILL')
      child.kill('SIGKILL')
    }
  }, childShutdownTimeoutMs)
  killTimer.unref()

  try {
    await waitForExit(child)
  } finally {
    clearTimeout(killTimer)
  }
}

function requestPublicUrl(readyUrl: string): Promise<void> {
  const url = new URL(readyUrl)
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        method: 'HEAD',
        path: `${url.pathname}${url.search}`,
        port: url.port || undefined,
      },
      (res) => {
        res.resume()
        resolve()
      },
    )

    req.setTimeout(publicUrlTimeoutMs, () => {
      req.destroy(new Error(`Timed out waiting for Cloudflare URL ${readyUrl} to respond.`))
    })
    req.on('error', reject)
    req.end()
  })
}
