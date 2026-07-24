import * as net from 'node:net'

import { createAbortError } from '../internal/abort.js'

export function waitForPort(port: number, timeoutMs = 30_000, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    let settled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let socket: ReturnType<typeof net.connect> | undefined
    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      socket?.destroy()
      signal?.removeEventListener('abort', onAbort)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const onAbort = () => {
      finish(createAbortError('Waiting for the local server was cancelled.'))
    }
    const tryConnect = () => {
      if (signal?.aborted) {
        onAbort()
        return
      }
      socket = net.connect({
        host: '127.0.0.1',
        port,
      })

      socket.once('connect', () => {
        finish()
      })

      socket.once('error', () => {
        socket?.destroy()
        if (Date.now() >= deadline) {
          finish(new Error(`Timed out waiting for local server on port ${port}`))
          return
        }
        retryTimer = setTimeout(tryConnect, 250)
      })
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    tryConnect()
  })
}

/** Resolves with null when the port can be bound, or the bind error message otherwise. */
export function checkPortAvailability(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.message)
    })
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        resolve(error ? error.message : null)
      })
    })
  })
}

/** Asks the OS for a free ephemeral port. */
export function allocateFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port.')))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve(port)
        }
      })
    })
  })
}
