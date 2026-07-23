import type { BrowserTransport } from '../transports/types.js'

export type { ActiveBrowserTransport, BrowserProtocol, BrowserTransport, TunnelSlot } from '../transports/types.js'

/** Arbitrary W3C capabilities accepted by BrowserStack. */
export type BrowserStackCapabilities = Readonly<Record<string, unknown>> & {
  readonly browserName?: string
  readonly browserVersion?: string
  readonly 'bstack:options'?: Readonly<Record<string, unknown>>
}

export interface BrowserDefinition {
  /** Browser name passed to Vitest and used as the default W3C browserName. */
  readonly browser: string
  /** Optional human-readable name. The browser id is used when omitted. */
  readonly name?: string
  /** Protocol required by the consumer's Vitest server. */
  readonly protocol: 'http' | 'https'
  /** Browser-specific raw W3C capabilities. */
  readonly capabilities?: BrowserStackCapabilities
}

export type BrowserDefinitions = Readonly<Record<string, BrowserDefinition>>

export interface BrowserStackOptions {
  /** BrowserStack Selenium hub URL. */
  readonly hubUrl?: string
  /** BrowserStack Automate REST API base URL. */
  readonly apiBaseUrl?: string
  /** Capabilities shared by every configured browser. */
  readonly capabilities?: BrowserStackCapabilities
}

export interface BroysterConfig {
  readonly projectName: string
  readonly vitestConfig: string
  readonly browsers: BrowserDefinitions
  readonly transport: BrowserTransport
  readonly concurrency?: number
  /** Process-level retries. Broyster v1 supports either no retry or one retry. */
  readonly maxRetries?: 0 | 1
  readonly queuePollIntervalMs?: number
  readonly queueTimeoutMs?: number
  readonly browserTimeoutMs?: number
  readonly providerConnectTimeoutMs?: number
  readonly heartbeatIntervalMs?: number
  readonly buildName?: string
  readonly resultsFile?: string
  readonly failOnFlaky?: boolean
  /** Optional absolute or config-relative path to a Vitest executable. */
  readonly vitestExecutable?: string
  readonly browserStack?: BrowserStackOptions
}

export interface NormalizedBrowserStackOptions {
  readonly hubUrl: string
  readonly apiBaseUrl: string
  readonly capabilities: BrowserStackCapabilities
}

export interface NormalizedBroysterConfig {
  readonly baseDir: string
  readonly projectName: string
  readonly vitestConfig: string
  readonly browsers: BrowserDefinitions
  readonly transport: BrowserTransport
  readonly concurrency: number
  readonly maxRetries: 0 | 1
  readonly queuePollIntervalMs: number
  readonly queueTimeoutMs: number
  readonly browserTimeoutMs: number
  readonly providerConnectTimeoutMs: number
  readonly heartbeatIntervalMs: number
  readonly buildName: string
  readonly resultsFile: string
  readonly failOnFlaky: boolean
  readonly vitestExecutable?: string
  readonly browserStack: NormalizedBrowserStackOptions
}
