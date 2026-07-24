import { access } from 'node:fs/promises'
import type { WebDriver } from 'selenium-webdriver'
import type { BrowserProvider, BrowserProviderOption, TestProject } from 'vitest/node'
import { createDebugger } from 'vitest/node'
import { defineBrowserProvider } from '@vitest/browser'

import type { BrowserStackCapabilities } from '../capabilities.js'
import { providerOwnedCapabilityKeys } from '../capabilities.js'
import type { BrowserStackCredentials } from '../credentials.js'
import type { ChildRunContext } from '../env_contract.js'
import { abortableDelay } from '../internal/abort.js'
import type { QueueWaitOptions } from '../queue.js'
import type { SessionRegistry } from '../session_registry.js'
import { buildCapabilities } from '../capabilities.js'
import { getBrowserStackCredentials } from '../credentials.js'
import { readChildContext } from '../env_contract.js'
import { BrowserStackQueue } from '../queue.js'
import { createWebDriver } from '../webdriver_factory.js'

const debug = createDebugger('vitest:broyster')
const defaultHeartbeatIntervalMs = 18_000

export type BrowserStackProviderOptions = {
  /** BrowserStack capabilities to merge into bstack:options */
  capabilities?: BrowserStackCapabilities
  /** Local WebDriver heartbeat interval, in milliseconds */
  heartbeatIntervalMs?: number
  /** Queue wait options before session creation */
  queue?: QueueWaitOptions
  /** Whether to check queue availability before creating a session (default: true unless orchestrator-managed) */
  checkQueue?: boolean
  /** Defaults to reading BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY */
  credentials?: BrowserStackCredentials
  /** Shared registry the reporters read BrowserStack session IDs from */
  registry?: SessionRegistry
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
  private context: ChildRunContext | undefined
  private driver: WebDriver | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false
  private openingPromise: Promise<void> | null = null
  private closePromise: Promise<void> | null = null
  private driverQuitPromises = new WeakMap<WebDriver, Promise<void>>()
  private lifecycleController = new AbortController()

  constructor(project: TestProject, options: BrowserStackProviderOptions) {
    this.project = project
    this.options = options
    this.context = readChildContext()
  }

  // Required by Vitest's BrowserProvider API; BrowserStack doesn't expose extra browser commands.
  getCommandsContext(): Record<string, unknown> {
    return {}
  }

  async openPage(sessionId: string, url: string, options: { parallel: boolean }): Promise<void> {
    if (this.closing) {
      throw new Error('[browserstack] The provider is closing.')
    }
    if (this.openingPromise || this.driver) {
      throw new Error('[browserstack] The provider already has an active WebDriver session.')
    }

    const openingPromise = this.openPageInternal(sessionId, url, options)
    this.openingPromise = openingPromise
    try {
      await openingPromise
    } finally {
      if (this.openingPromise === openingPromise) {
        this.openingPromise = null
      }
    }
  }

  private async openPageInternal(sessionId: string, url: string, options: { parallel: boolean }): Promise<void> {
    debug?.('[%s] Opening Vitest session %s (parallel=%s)', this.project.name, sessionId, options.parallel)

    const credentials = this.options.credentials ?? getBrowserStackCredentials()

    // Check queue availability (1 slot since instances run sequentially)
    if (this.shouldCheckQueue()) {
      debug?.('[%s] Checking BrowserStack queue availability', this.project.name)
      const queue = new BrowserStackQueue(credentials)
      await queue.waitForAvailability(1, {
        ...this.options.queue,
        signal: this.options.queue?.signal
          ? AbortSignal.any([this.options.queue.signal, this.lifecycleController.signal])
          : this.lifecycleController.signal,
      })
      debug?.('[%s] Queue slot available', this.project.name)
    }
    this.throwIfClosing('before creating the WebDriver session')

    // Build capabilities
    const browserName = this.project.config.browser.name
    const caps = buildCapabilities(browserName, this.resolveCapabilities())
    const heartbeatIntervalMs = this.resolveHeartbeatInterval()

    const pageUrl = this.resolvePageUrl(url)
    await this.waitForSlotReady()
    this.throwIfClosing('before creating the WebDriver session')
    debug?.('[%s] Creating WebDriver session for %s', this.project.name, browserName)

    const driver = await createWebDriver(caps, credentials)
    if (this.closing) {
      await this.quitDriver(driver)
      throw new Error('[browserstack] The provider was closed while creating the WebDriver session.')
    }
    this.driver = driver

    try {
      const session = await driver.getSession()
      const bsSessionId = session.getId()
      this.options.registry?.setSessionId(this.project.name, bsSessionId)
      debug?.('[%s] BrowserStack session %s created', this.project.name, bsSessionId)

      // Navigate to the page served through the transport.
      this.throwIfClosing('before navigation')
      debug?.('[%s] Starting navigation to %s', this.project.name, pageUrl)
      await driver.get(pageUrl)
      this.throwIfClosing('during navigation')
      debug?.('[%s] Finished navigation to %s', this.project.name, pageUrl)

      // Start heartbeat
      this.startHeartbeat(heartbeatIntervalMs)
    } catch (error) {
      this.closing = true
      this.stopHeartbeat()
      await this.quitDriver(driver)
      throw error
    }
  }

  private shouldCheckQueue(): boolean {
    if (this.options.checkQueue !== undefined) {
      return this.options.checkQueue
    }
    return !this.context?.queueManagedExternally
  }

  private resolveCapabilities(): BrowserStackCapabilities | undefined {
    const transportCapabilities = this.context?.capabilities
    if (!transportCapabilities) {
      return this.options.capabilities
    }
    return mergeTransportCapabilities(this.options.capabilities, transportCapabilities)
  }

  private resolveHeartbeatInterval(): number {
    const heartbeatIntervalMs = this.options.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs
    return Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0
      ? heartbeatIntervalMs
      : defaultHeartbeatIntervalMs
  }

  private resolvePageUrl(url: string): string {
    const publicOrigin = this.context?.publicOrigin
    if (publicOrigin) {
      const pageUrl = new URL(url)
      const publicUrl = new URL(publicOrigin)
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

  private async waitForSlotReady(): Promise<void> {
    const readyFile = this.context?.readyFile
    if (!readyFile) {
      return
    }

    const deadline = Date.now() + 30_000
    debug?.('[%s] Waiting for the transport readiness marker', this.project.name)

    while (Date.now() < deadline) {
      this.throwIfClosing('while waiting for the transport to become ready')
      try {
        await access(readyFile)
        debug?.('[%s] Transport readiness marker detected', this.project.name)
        return
      } catch {
        await abortableDelay(250, { signal: this.lifecycleController.signal })
      }
    }

    throw new Error(`[browserstack] Timed out waiting for the transport to become ready.`)
  }

  private startHeartbeat(interval: number): void {
    this.stopHeartbeat()
    const scheduleNextHeartbeat = () => {
      if (this.closing || !this.driver) {
        return
      }
      this.heartbeatTimer = setTimeout(async () => {
        try {
          if (this.driver && !this.closing) {
            await this.driver.getTitle()
          }
          scheduleNextHeartbeat()
        } catch {
          debug?.('[%s] Heartbeat failed, stopping', this.project.name)
          this.stopHeartbeat()
        }
      }, interval)
      this.heartbeatTimer.unref()
    }

    scheduleNextHeartbeat()
    debug?.('[%s] Heartbeat started (every %dms)', this.project.name, interval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise
    }

    debug?.('[%s] Closing provider', this.project.name)
    this.closing = true
    this.lifecycleController.abort(new Error('[browserstack] The provider is closing.'))
    this.stopHeartbeat()

    const openingPromise = this.openingPromise
    this.closePromise = (async () => {
      const activeDriver = this.driver
      if (activeDriver) {
        await this.quitDriver(activeDriver)
      }

      await openingPromise?.catch(() => undefined)

      const lateDriver = this.driver
      if (lateDriver) {
        await this.quitDriver(lateDriver)
      }
    })()
    return this.closePromise
  }

  private throwIfClosing(stage: string): void {
    if (this.closing) {
      throw new Error(`[browserstack] The provider was closed ${stage}.`)
    }
  }

  private quitDriver(driver: WebDriver): Promise<void> {
    const existingPromise = this.driverQuitPromises.get(driver)
    if (existingPromise) {
      return existingPromise
    }

    if (this.driver === driver) {
      this.driver = null
    }
    const quitPromise = Promise.resolve().then(async () => {
      try {
        await driver.quit()
      } catch (err) {
        debug?.('[%s] Error quitting driver: %s', this.project.name, err)
      }
    })
    this.driverQuitPromises.set(driver, quitPromise)
    return quitPromise
  }
}

function mergeTransportCapabilities(
  runnerCapabilities: BrowserStackCapabilities | undefined,
  transportCapabilities: BrowserStackCapabilities,
): BrowserStackCapabilities {
  const { bstackOptions: runnerRawOptions, ...runnerFields } = runnerCapabilities ?? {}
  const { bstackOptions: transportRawOptions, ...transportFields } = transportCapabilities
  const fields: Record<string, unknown> = { ...runnerFields, ...transportFields }

  for (const key of providerOwnedCapabilityKeys) {
    if (Object.prototype.hasOwnProperty.call(runnerFields, key)) {
      fields[key] = runnerFields[key as keyof typeof runnerFields]
    } else {
      delete fields[key]
    }
  }

  const rawOptions = { ...runnerRawOptions, ...transportRawOptions }
  for (const key of providerOwnedCapabilityKeys) {
    delete rawOptions[key]
  }

  return {
    ...fields,
    ...(Object.keys(rawOptions).length > 0 && { bstackOptions: rawOptions }),
  } as BrowserStackCapabilities
}
