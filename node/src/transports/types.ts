export type BrowserProtocol = 'http' | 'https'

export interface TunnelSlot {
  readonly id: string
  readonly publicUrl: string
  readonly localPort: number
  readonly protocol: BrowserProtocol
}

export interface ActiveBrowserTransport {
  readonly slots: readonly TunnelSlot[]
  /** Environment variables owned by the transport that must not reach test children. */
  readonly sensitiveEnvKeys?: readonly string[]
  close(): Promise<void>
}

export interface BrowserTransport {
  start(signal: AbortSignal): Promise<ActiveBrowserTransport>
}
