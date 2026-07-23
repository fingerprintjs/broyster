/* eslint-disable no-console */
import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export type CloudflareTunnelOptions = {
  token: string
  readyUrl: string
  timeoutMs?: number
}

export type CloudflareTunnelHandle = {
  close: () => Promise<void>
}

const publicUrlTimeoutMs = 3_000
const childShutdownTimeoutMs = 5_000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
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

function waitForExit(child: ChildProcess): Promise<void> {
  if (hasExited(child)) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (hasExited(child)) {
    return
  }

  child.kill('SIGTERM')
  const killTimer = setTimeout(() => {
    if (!hasExited(child)) {
      console.error('  [cloudflared] Did not exit after SIGTERM, sending SIGKILL')
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

export async function openCloudflareTunnel(options: CloudflareTunnelOptions): Promise<CloudflareTunnelHandle> {
  const child = spawn('cloudflared', ['tunnel', 'run', '--token', options.token], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  let exitError: Error | null = null
  let closing = false

  child.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) {
        console.log(`  [cloudflared] ${line}`)
      }
    }
  })

  child.stderr.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) {
        console.error(`  [cloudflared] ${line}`)
      }
    }
  })

  child.on('error', (error) => {
    exitError = error
  })

  child.on('exit', (code, signal) => {
    if (!closing) {
      exitError = new Error(
        code !== null
          ? `cloudflared exited early with code ${code}.`
          : `cloudflared exited early with signal ${signal ?? 'unknown'}.`,
      )
    }
  })

  const deadline = Date.now() + (options.timeoutMs ?? 30_000)
  let ready = false

  while (Date.now() < deadline && !ready) {
    if (exitError) {
      throw exitError
    }

    try {
      await requestPublicUrl(options.readyUrl)
      ready = true
    } catch {
      if (Date.now() < deadline) {
        await wait(1_000)
      }
    }
  }

  if (exitError) {
    throw exitError
  }

  if (!ready) {
    closing = true
    await stopChildProcess(child)
    throw new Error(`Timed out waiting for Cloudflare tunnel to serve ${options.readyUrl}`)
  }

  return {
    async close() {
      closing = true
      await stopChildProcess(child)
    },
  }
}
