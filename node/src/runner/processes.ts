import type { ChildProcess } from 'node:child_process'
import { createConnection, createServer } from 'node:net'

const shutdownGraceMs = 5_000

export class ChildProcessRegistry {
  readonly #children = new Set<ChildProcess>()

  add(child: ChildProcess): void {
    this.#children.add(child)
    child.once('close', () => this.#children.delete(child))
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#children].map((child) => stopChild(child)))
  }
}

export async function stopChild(child: ChildProcess, graceMs = shutdownGraceMs): Promise<void> {
  if (hasExited(child)) {
    return
  }
  child.kill('SIGTERM')
  const exited = await Promise.race([waitForExit(child).then(() => true), delay(graceMs).then(() => false)])
  if (!exited && !hasExited(child)) {
    child.kill('SIGKILL')
    await waitForExit(child)
  }
}

export async function waitForPort(port: number, timeoutMs: number, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    throwIfAborted(signal)
    if (await canConnect(port)) {
      return
    }
    await abortableDelay(250, signal)
  }
  throw new Error(`Timed out waiting for the Vitest server on 127.0.0.1:${port}.`)
}

export async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.once('error', (error) => reject(new Error(`Local port ${port} is unavailable: ${error.message}`)))
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })
}

export async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', abort, { once: true })

    function finish(): void {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    function abort(): void {
      clearTimeout(timer)
      reject(abortError(signal))
    }
  })
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError(signal)
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The Broyster run was cancelled.')
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (hasExited(child)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => child.once('close', () => resolve()))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    timer.unref()
  })
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let settled = false
    const finish = (result: boolean) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(500, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}
