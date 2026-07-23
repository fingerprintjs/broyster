import { Buffer } from 'node:buffer'

import type { BrowserStackCredentials } from './credentials.js'
import { browserStackCredentialSecretValues, createSecretRedactor } from './credentials.js'

const DEFAULT_API_BASE_URL = 'https://api.browserstack.com/automate'

export interface BrowserStackPlan {
  readonly parallelSessionsMaxAllowed: number
  readonly parallelSessionsRunning: number
  readonly queuedSessions: number
  readonly availableSessions: number
}

export interface BrowserStackSessionUpdate {
  readonly status: 'passed' | 'failed'
  readonly reason?: string
}

export interface FetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  text(): Promise<string>
}

export interface FetchRequestInit {
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly signal?: AbortSignal
}

export type FetchLike = (input: string | URL, init?: FetchRequestInit) => Promise<FetchResponse>

export interface BrowserStackClientOptions {
  readonly credentials: BrowserStackCredentials
  readonly apiBaseUrl?: string
  readonly fetch?: FetchLike
}

export class BrowserStackApiError extends Error {
  readonly operation: string
  readonly status?: number
  readonly responseBody?: string

  constructor(operation: string, message: string, options: { status?: number; responseBody?: string } = {}) {
    super(`BrowserStack ${operation} failed: ${message}`)
    this.name = 'BrowserStackApiError'
    this.operation = operation
    if (options.status !== undefined) {
      this.status = options.status
    }
    if (options.responseBody !== undefined) {
      this.responseBody = options.responseBody
    }
  }
}

export class BrowserStackClient {
  private readonly credentials: BrowserStackCredentials
  private readonly apiBaseUrl: string
  private readonly fetch: FetchLike

  constructor(options: BrowserStackClientOptions) {
    this.credentials = options.credentials
    this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL)
    this.fetch = options.fetch ?? defaultFetch
  }

  async getPlan(signal?: AbortSignal): Promise<BrowserStackPlan> {
    const body = await this.request('get plan', new URL('plan.json', this.apiBaseUrl), {
      ...(signal !== undefined && { signal }),
    })
    const plan = parseJsonObject(body, 'get plan')
    const max = readNonNegativeNumber(plan, 'parallel_sessions_max_allowed', 'get plan')
    const running = readNonNegativeNumber(plan, 'parallel_sessions_running', 'get plan')
    const queued = readOptionalNonNegativeNumber(plan, ['queued_sessions', 'parallel_sessions_queued'], 'get plan')

    return {
      parallelSessionsMaxAllowed: max,
      parallelSessionsRunning: running,
      queuedSessions: queued,
      availableSessions: Math.max(0, max - running - queued),
    }
  }

  async updateSession(sessionId: string, update: BrowserStackSessionUpdate, signal?: AbortSignal): Promise<void> {
    if (sessionId.trim().length === 0) {
      throw new BrowserStackApiError('update session', 'sessionId must not be empty')
    }
    if (update.status !== 'passed' && update.status !== 'failed') {
      throw new BrowserStackApiError('update session', 'status must be "passed" or "failed"')
    }

    await this.request('update session', new URL(`sessions/${encodeURIComponent(sessionId)}.json`, this.apiBaseUrl), {
      method: 'PUT',
      body: JSON.stringify({
        status: update.status,
        ...(update.reason !== undefined && { reason: update.reason }),
      }),
      ...(signal !== undefined && { signal }),
    })
  }

  private async request(operation: string, url: URL, init: FetchRequestInit): Promise<string> {
    let response: FetchResponse
    try {
      response = await this.fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: makeBasicAuthorization(this.credentials),
          ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
          ...init.headers,
        },
      })
    } catch (error) {
      throw new BrowserStackApiError(operation, redactResponseBody(errorMessage(error), this.credentials))
    }

    const responseBody = await response.text().catch(() => '')
    if (!response.ok) {
      const safeBody = truncate(redactResponseBody(responseBody.trim(), this.credentials), 1_000)
      throw new BrowserStackApiError(
        operation,
        `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}${
          safeBody ? `: ${safeBody}` : ''
        }`,
        { status: response.status, ...(safeBody && { responseBody: safeBody }) },
      )
    }

    return responseBody
  }
}

function makeBasicAuthorization(credentials: BrowserStackCredentials): string {
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.accessKey}`, 'utf8').toString('base64')}`
}

function parseJsonObject(body: string, operation: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('response is not an object')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    throw new BrowserStackApiError(operation, `invalid JSON response (${errorMessage(error)})`)
  }
}

function readNonNegativeNumber(object: Record<string, unknown>, field: string, operation: string): number {
  const value = object[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BrowserStackApiError(operation, `response field ${field} must be a non-negative number`)
  }
  return value
}

function readOptionalNonNegativeNumber(
  object: Record<string, unknown>,
  fields: readonly string[],
  operation: string,
): number {
  for (const field of fields) {
    if (object[field] !== undefined) {
      return readNonNegativeNumber(object, field, operation)
    }
  }
  return 0
}

function normalizeBaseUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/`
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function redactResponseBody(body: string, credentials: BrowserStackCredentials): string {
  return createSecretRedactor(browserStackCredentialSecretValues(credentials))(body)
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init as RequestInit) as Promise<FetchResponse>
