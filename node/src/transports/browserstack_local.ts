import { randomBytes } from 'node:crypto'
import { Local } from 'browserstack-local'

import type { BrowserStackCredentials } from '../credentials.js'
import { getBrowserStackCredentials } from '../credentials.js'
import { allocateFreePort } from '../orchestrator/ports.js'
import type { SlotRequirement, Transport, TransportSlot } from './transport.js'

export type BrowserStackLocalTransportOptions = {
  /** Defaults to reading BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY */
  credentials?: BrowserStackCredentials
  /** How many slots can be handed out at once (default: 5) */
  maxConcurrency?: number
  /**
   * Serve WebKit browsers (Safari, everything on iOS) over HTTP even when they
   * request HTTPS (default: true). WebKit rejects WebSocket connections to
   * origins with self-signed certificates — acceptInsecureCerts covers page
   * loads but not WebSockets — so the Vitest client can never connect over
   * this transport's HTTPS. Disable only if you know your setup avoids that;
   * for trusted-certificate HTTPS on WebKit, use the Cloudflare transport.
   */
  downgradeWebKitHttps?: boolean
  onLog?: (line: string) => void
}

/**
 * Routes BrowserStack traffic to local Vitest servers through a BrowserStack
 * Local tunnel. Remote browsers reach the local machine via bs-local.com,
 * which BrowserStack resolves through the tunnel — including HTTPS with the
 * self-signed certificate, thanks to acceptInsecureCerts.
 *
 * Requires no infrastructure beyond BrowserStack credentials.
 */
export function browserStackLocalTransport(options: BrowserStackLocalTransportOptions = {}): Transport {
  return new BrowserStackLocalTransport(options)
}

class BrowserStackLocalTransport implements Transport {
  readonly name = 'browserstack-local'

  private options: BrowserStackLocalTransportOptions
  private localIdentifier: string
  private tunnel: Local | null = null
  private activeSlots = 0
  private onLog: (line: string) => void

  constructor(options: BrowserStackLocalTransportOptions) {
    const maxConcurrency = options.maxConcurrency ?? 5
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error(`Invalid maxConcurrency "${maxConcurrency}". Expected a positive integer.`)
    }
    this.options = { ...options, maxConcurrency }
    this.localIdentifier = `broyster-${randomBytes(8).toString('hex')}`
    // eslint-disable-next-line no-console
    this.onLog = options.onLog ?? ((line) => console.log(line))
  }

  supports(): boolean {
    return true
  }

  async open(): Promise<void> {
    const credentials = this.options.credentials ?? getBrowserStackCredentials()
    const tunnel = new Local()

    await new Promise<void>((resolve, reject) => {
      tunnel.start(
        {
          key: credentials.accessKey,
          forceLocal: true,
          localIdentifier: this.localIdentifier,
        },
        (error) => (error ? reject(error) : resolve()),
      )
    })

    this.tunnel = tunnel
  }

  async acquireSlot(requirement: SlotRequirement): Promise<TransportSlot | undefined> {
    if (this.activeSlots >= (this.options.maxConcurrency as number)) {
      return undefined
    }

    const useHttps = this.resolveProtocol(requirement)
    this.activeSlots += 1
    try {
      const localPort = await allocateFreePort()
      return {
        id: `bs-local-${localPort}`,
        localPort,
        publicOrigin: `${useHttps ? 'https' : 'http'}://bs-local.com:${localPort}`,
        useHttps,
        capabilities: {
          local: true,
          localIdentifier: this.localIdentifier,
        },
      }
    } catch (error) {
      this.activeSlots -= 1
      throw error
    }
  }

  private resolveProtocol(requirement: SlotRequirement): boolean {
    if (!requirement.useHttps || this.options.downgradeWebKitHttps === false || !isWebKit(requirement)) {
      return requirement.useHttps
    }

    const browser = requirement.browserKey ?? requirement.browserName ?? 'WebKit browser'
    this.onLog(
      `  [${browser}] Serving over HTTP: WebKit cannot open WebSockets to the self-signed HTTPS ` +
        'certificate of the BrowserStack Local transport. Use the Cloudflare transport for trusted HTTPS.',
    )
    return false
  }

  releaseSlot(): void {
    this.activeSlots = Math.max(0, this.activeSlots - 1)
  }

  async close(): Promise<void> {
    const tunnel = this.tunnel
    this.tunnel = null
    if (!tunnel) {
      return
    }

    await new Promise<void>((resolve) => {
      tunnel.stop(() => resolve())
    })
  }
}

// Everything on iOS is WebKit regardless of the browser brand.
function isWebKit(requirement: SlotRequirement): boolean {
  return requirement.platform === 'iOS' || requirement.browserName?.toLowerCase() === 'safari'
}
