import { describe, expect, it, vi } from 'vitest'

import { BrowserStackApiError, BrowserStackClient } from '../../src/core/browserstack_client.js'

const credentials = { username: 'user', accessKey: 'secret-key' }

describe('BrowserStackClient', () => {
  it('normalizes plan capacity and authenticates with Basic auth', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return JSON.stringify({
          parallel_sessions_max_allowed: 5,
          parallel_sessions_running: 3,
          queued_sessions: 2,
        })
      },
    }))
    const client = new BrowserStackClient({ credentials, fetch })

    await expect(client.getPlan()).resolves.toEqual({
      parallelSessionsMaxAllowed: 5,
      parallelSessionsRunning: 3,
      queuedSessions: 2,
      availableSessions: 0,
    })
    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://api.browserstack.com/automate/plan.json')
    expect(init?.headers.Authorization).toMatch(/^Basic /)
    expect(init?.headers.Authorization).not.toContain('secret-key')
  })

  it('updates session status and reason', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return '{}'
      },
    }))
    const client = new BrowserStackClient({ credentials, fetch })

    await client.updateSession('session/id', { status: 'failed', reason: 'Tests failed' })

    const [url, init] = fetch.mock.calls[0]
    expect(String(url).endsWith('/sessions/session%2Fid.json')).toBe(true)
    expect(init).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ status: 'failed', reason: 'Tests failed' }),
    })
  })

  it('redacts credentials echoed by an error response', async () => {
    const client = new BrowserStackClient({
      credentials,
      fetch: async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        async text() {
          return 'Rejected secret-key for user'
        },
      }),
    })

    await expect(client.getPlan()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(BrowserStackApiError)
      expect(String(error)).not.toContain('secret-key')
      return true
    })
  })
})
