import type { BrowserStackCredentials } from './credentials.js'
import { redactSecrets } from './internal/secrets.js'

const AUTOMATE_API_BASE = 'https://api.browserstack.com/automate'

export type AutomatePlan = {
  parallelSessionsMaxAllowed: number
  parallelSessionsRunning: number
}

export type SessionStatus = 'passed' | 'failed'

/**
 * A minimal client for the two BrowserStack Automate REST endpoints broyster
 * needs: the plan (parallel session limits) and session status updates.
 */
export class BrowserStackApiClient {
  private authorization: string
  private secrets: string[]

  constructor(credentials: BrowserStackCredentials, private baseUrl = AUTOMATE_API_BASE) {
    this.authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.accessKey}`).toString('base64')}`
    this.secrets = [credentials.username, credentials.accessKey, this.authorization]
  }

  async getPlan(signal?: AbortSignal): Promise<AutomatePlan> {
    const response = await this.request('GET', '/plan.json', undefined, signal)
    const plan = (await response.json()) as {
      parallel_sessions_max_allowed?: unknown
      parallel_sessions_running?: unknown
    }
    const max = Number(plan.parallel_sessions_max_allowed)
    const running = Number(plan.parallel_sessions_running)
    if (!Number.isFinite(max) || !Number.isFinite(running)) {
      throw new Error(`Unexpected BrowserStack plan response: ${JSON.stringify(plan)}`)
    }
    return { parallelSessionsMaxAllowed: max, parallelSessionsRunning: running }
  }

  async setSessionStatus(sessionId: string, status: SessionStatus, signal?: AbortSignal): Promise<void> {
    await this.request('PUT', `/sessions/${encodeURIComponent(sessionId)}.json`, { status }, signal)
  }

  private async request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      ...(signal && { signal }),
      headers: {
        Authorization: this.authorization,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `BrowserStack API ${method} ${path} failed with status ${response.status}: ${this.redactAndTruncate(text)}`,
      )
    }

    return response
  }

  private redactAndTruncate(value: string, maxLength = 2_000): string {
    const redacted = redactSecrets(value, this.secrets)
    return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength)}…`
  }
}
