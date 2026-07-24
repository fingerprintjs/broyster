import type { BrowserStackCapabilities } from '../capabilities.js'

export type SlotRequirement = {
  useHttps: boolean
  /** Catalog key of the browser this slot is requested for */
  browserKey?: string
  browserName?: string
  platform?: string
}

/**
 * A reserved routing slot: a localhost port the child's Vitest server listens
 * on, paired with the public origin remote browsers use to reach it.
 */
export type TransportSlot = {
  id: string
  /** Localhost port the child's Vitest server must bind */
  localPort: number
  /** Origin remote BrowserStack browsers use to reach that server */
  publicOrigin: string
  useHttps: boolean
  /** Capabilities merged into every session running on this slot, e.g. { local: true, localIdentifier } */
  capabilities?: BrowserStackCapabilities
}

/**
 * A transport makes local Vitest servers reachable from BrowserStack browsers.
 * Implementations: `cloudflareTransport` (Cloudflare tunnel) and
 * `browserStackLocalTransport` (BrowserStack Local tunnel).
 */
export interface Transport {
  readonly name: string
  /** Environment variables owned by the transport that must never reach Vitest child processes. */
  readonly sensitiveEnvKeys?: readonly string[]
  /** Start shared infrastructure once, before any slot is acquired. */
  open(): Promise<void>
  /** Tear down shared infrastructure. The orchestrator always calls this in a finally block. */
  close(): Promise<void>
  /** Whether this transport can ever serve the requirement. Used for fail-fast validation before scheduling. */
  supports(requirement: SlotRequirement): boolean
  /**
   * Reserve a free compatible slot, or return undefined if all compatible
   * slots are busy (the scheduler retries as running children finish).
   * The child process follows the returned slot's protocol, so a transport may
   * return a slot whose useHttps differs from the requirement when it cannot
   * serve the requested protocol faithfully for that browser.
   */
  acquireSlot(requirement: SlotRequirement): TransportSlot | undefined | Promise<TransportSlot | undefined>
  releaseSlot(slot: TransportSlot): void
  /**
   * Optional hook called after the orchestrator observed the child listening
   * on slot.localPort; resolves when the remote browser can reach
   * slot.publicOrigin. The ready marker file is written afterwards. Custom
   * transports should stop pending readiness work when the signal aborts.
   */
  waitForSlotRouting?(slot: TransportSlot, signal?: AbortSignal): Promise<void>
}
