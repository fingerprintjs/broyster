import { access } from 'node:fs/promises'
import type { WebDriver } from 'selenium-webdriver'
import type { BrowserProvider, BrowserProviderOption, TestProject } from 'vitest/node'
import { createDebugger } from 'vitest/node'
import { defineBrowserProvider } from '@vitest/browser'

import type { BrowserStackCapabilities } from './capabilities'
import type { QueueWaitOptions } from './queue'
import { buildCapabilities } from './capabilities'
import { getCredentials } from './credentials'
import { BrowserStackQueue } from './queue'
import { BrowserStackSessionManager } from './session_manager'
import { createWebDriver } from './webdriver_factory'

const debug = createDebugger('vitest:browser:browserstack')
const defaultHeartbeatIntervalMs = 18_000

export type BrowserStackProviderOptions = {
  /** BrowserStack capabilities to merge into bstack:options */
  capabilities?: BrowserStackCapabilities
  /** Local WebDriver heartbeat interval, in milliseconds */
  heartbeatIntervalMs?: number
  /** Queue wait options before session creation */
  queue?: QueueWaitOptions
  /** Whether to check queue availability before creating session (default: true) */
  checkQueue?: boolean
}

export function browserstack(
  options: BrowserStackProviderOptions = {},
): BrowserProviderOption<BrowserStackProviderOptions> {
  return defineBrowserProvider({
    name: 'browserstack',
    options,
    providerFactory(project: TestProject) {
      return new BrowserStackProvider(project, options)
    },
  })
}

export class BrowserStackProvider implements BrowserProvider {
  public name = 'browserstack' as const
  public supportsParallelism = false

  private project: TestProject
  private options: BrowserStackProviderOptions
  private driver: WebDriver | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false

  constructor(project: TestProject, options: BrowserStackProviderOptions) {
    this.project = project
    this.options = options
  }

  // Required by Vitest's BrowserProvider API
  getCommandsContext(): Record<string, unknown> {
    return {}
  }

  async openPage(sessionId: string, url: string, options: { parallel: boolean }): Promise<void> {
    if (this.closing) {
      throw new Error('[browserstack] The provider is closing.')
    }

    debug?.('[%s] Opening Vitest session %s (parallel=%s)', this.project.name, sessionId, options.parallel)

    const credentials = getCredentials()

    if (this.options.checkQueue !== false) {
      debug?.('[%s] Checking BrowserStack queue availability', this.project.name)
      const queue = new BrowserStackQueue(credentials)
      await queue.waitForAvailability(1, this.options.queue)
      debug?.('[%s] Queue slot available', this.project.name)
    }

    const browserName = this.project.config.browser.name
    const caps = buildCapabilities(browserName, this.resolveCapabilities())
    const heartbeatIntervalMs = this.resolveHeartbeatInterval()
    debug?.('[%s] Creating WebDriver session for %s', this.project.name, browserName)

    this.driver = await createWebDriver(caps, credentials)
    const session = await this.driver.getSession()
    const bsSessionId = session.getId()
    BrowserStackSessionManager.setSessionId(this.project.name, bsSessionId)
    debug?.('[%s] BrowserStack session %s created', this.project.name, bsSessionId)

    const pageUrl = this.resolvePageUrl(url)
    await this.waitForPublicTunnelReady()
    debug?.('[%s] Starting navigation to %s', this.project.name, pageUrl)
    await this.driver.get(pageUrl)
    debug?.('[%s] Finished navigation to %s', this.project.name, pageUrl)

    this.startHeartbeat(heartbeatIntervalMs)
  }

  private resolveCapabilities(): BrowserStackCapabilities | undefined {
    const sharedLocalIdentifier = BrowserStackSessionManager.getTunnelIdentifier()
    const capabilities = this.options.capabilities
    if (sharedLocalIdentifier && capabilities?.local !== false && capabilities?.localIdentifier === undefined) {
      return {
        ...capabilities,
        local: true,
        localIdentifier: sharedLocalIdentifier,
      }
    }

    return capabilities
  }

  private resolveHeartbeatInterval(): number {
    const heartbeatIntervalMs = this.options.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs
    return Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0
      ? heartbeatIntervalMs
      : defaultHeartbeatIntervalMs
  }

  private resolvePageUrl(url: string): string {
    const publicBaseUrl = process.env.BS_PUBLIC_BASE_URL
    if (publicBaseUrl) {
      const pageUrl = new URL(url)
      const publicUrl = new URL(publicBaseUrl)
      const basePath = publicUrl.pathname === '/' ? '' : publicUrl.pathname.replace(/\/$/, '')
      pageUrl.protocol = publicUrl.protocol
      pageUrl.username = publicUrl.username
      pageUrl.password = publicUrl.password
      pageUrl.hostname = publicUrl.hostname
      pageUrl.port = publicUrl.port
      pageUrl.pathname = `${basePath}${pageUrl.pathname}`
      return pageUrl.toString()
    }

    return url
  }

  private async waitForPublicTunnelReady(): Promise<void> {
    const tunnelReadyFile = process.env.BS_TUNNEL_READY_FILE
    if (!tunnelReadyFile) {
      return
    }

    const deadline = Date.now() + 30_000
    debug?.('[%s] Waiting for public tunnel readiness marker', this.project.name)

    while (Date.now() < deadline) {
      try {
        await access(tunnelReadyFile)
        debug?.('[%s] Public tunnel readiness marker detected', this.project.name)
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }

    throw new Error(`[browserstack] Timed out waiting for the public tunnel to become ready.`)
  }

  private startHeartbeat(interval: number): void {
    this.stopHeartbeat()
    const scheduleNextHeartbeat = () => {
      this.heartbeatTimer = setTimeout(async () => {
        try {
          if (this.driver && !this.closing) {
            await this.driver.getTitle()
            scheduleNextHeartbeat()
          }
        } catch {
          debug?.('[%s] Heartbeat failed, stopping', this.project.name)
          this.stopHeartbeat()
        }
      }, interval)
      this.heartbeatTimer.unref()
    }

    if (!this.closing) {
      scheduleNextHeartbeat()
      debug?.('[%s] Heartbeat started (every %dms)', this.project.name, interval)
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  async close(): Promise<void> {
    debug?.('[%s] Closing provider', this.project.name)
    this.closing = true
    this.stopHeartbeat()

    if (this.driver) {
      try {
        await this.driver.quit()
      } catch (err) {
        debug?.('[%s] Error quitting driver: %s', this.project.name, err)
      }
      this.driver = null
    }
  }
}
