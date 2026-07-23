import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrowserStackApiClient } from '../src/api_client.js'

const credentials = { username: 'user', accessKey: 'key' }
const expectedAuthorization = `Basic ${Buffer.from('user:key').toString('base64')}`

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    ...response,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BrowserStackApiClient', () => {
  it('fetches and parses the Automate plan', async () => {
    const fetchMock = mockFetch({
      json: () => Promise.resolve({ parallel_sessions_max_allowed: 5, parallel_sessions_running: 2 }),
    })

    const client = new BrowserStackApiClient(credentials)
    const plan = await client.getPlan()

    expect(plan).toEqual({ parallelSessionsMaxAllowed: 5, parallelSessionsRunning: 2 })
    expect(fetchMock).toHaveBeenCalledWith('https://api.browserstack.com/automate/plan.json', {
      method: 'GET',
      headers: { Authorization: expectedAuthorization },
    })
  })

  it('rejects an unexpected plan payload', async () => {
    mockFetch({ json: () => Promise.resolve({ something: 'else' }) })

    const client = new BrowserStackApiClient(credentials)
    await expect(client.getPlan()).rejects.toThrow(/Unexpected BrowserStack plan response/)
  })

  it('updates the session status', async () => {
    const fetchMock = mockFetch({})

    const client = new BrowserStackApiClient(credentials)
    await client.setSessionStatus('abc/123', 'passed')

    expect(fetchMock).toHaveBeenCalledWith('https://api.browserstack.com/automate/sessions/abc%2F123.json', {
      method: 'PUT',
      headers: { Authorization: expectedAuthorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'passed' }),
    })
  })

  it('throws a descriptive error on non-2xx responses', async () => {
    mockFetch({ ok: false, status: 401, text: () => Promise.resolve('unauthorized') })

    const client = new BrowserStackApiClient(credentials)
    await expect(client.setSessionStatus('abc', 'failed')).rejects.toThrow(
      /PUT \/sessions\/abc\.json failed with status 401: unauthorized/,
    )
  })
})
