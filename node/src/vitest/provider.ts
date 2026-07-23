import { access } from 'node:fs/promises'

import { defineBrowserProvider } from '@vitest/browser'
import { Builder, type WebDriver } from 'selenium-webdriver'
import type { BrowserProvider, BrowserProviderOption, TestProject } from 'vitest/node'
import { createDebugger } from 'vitest/node'

import { getBrowserStackCredentials, type BrowserStackCredentials } from '../core/credentials.js'
import { BrowserStackRuntime } from './runtime.js'
import { writeBrowserStackSessionFile, type BrowserStackSessionTarget } from './session_file.js'

const debug = createDebugger('vitest:browser:broyster')
const DEFAULT_HEARTBEAT_INTERVAL_MS = 18_000
const DEFAULT_READINESS_TIMEOUT_MS = 30_000

export type BrowserStackWebDriverFactory = (
  capabilities: Record<string, unknown>,
  credentials: BrowserStackCredentials,
  hubUrl: string,
) => Promise<WebDriver>

export type BrowserStackProviderOptions = {
  capabilities?: Record<string, unknown>
  publicBaseUrl: string
  readinessFile: string
  hubUrl: string
  heartbeatIntervalMs?: number
  readinessTimeoutMs?: number
  sessionTarget?: BrowserStackSessionTarget
  runtime?: BrowserStackRuntime
  createWebDriver?: BrowserStackWebDriverFactory
}

export function browserstack(options: BrowserStackProviderOptions): BrowserProviderOption {
  const runtime = options.runtime ?? new BrowserStackRuntime()
  const resolvedOptions = { ...options, runtime }
  return defineBrowserProvider<BrowserStackProviderOptions>({
    name: 'browserstack',
    options: resolvedOptions,
    providerFactory(project: TestProject) {
      return new BrowserStackProvider(project, resolvedOptions)
    },
  })
}

export class BrowserStackProvider implements BrowserProvider {
  readonly name = 'browserstack'
  readonly supportsParallelism = false

  private driver: WebDriver | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false
  private closePromise: Promise<void> | null = null

  constructor(
    private readonly project: TestProject,
    private readonly options: BrowserStackProviderOptions,
  ) {}

  getCommandsContext(): Record<string, unknown> {
    return {}
  }

  async openPage(sessionId: string, url: string, options: { parallel: boolean }): Promise<void> {
    if (this.closing) {
      throw new Error('[broyster] The BrowserStack provider is closing.')
    }
    if (this.driver) {
      throw new Error('[broyster] The BrowserStack provider already has an active WebDriver session.')
    }

    debug?.('[%s] Opening Vitest session %s (parallel=%s)', this.project.name, sessionId, options.parallel)
    await waitForReadinessFile(this.options.readinessFile, this.resolveReadinessTimeout())
    if (this.closing) {
      throw new Error('[broyster] The BrowserStack provider was closed before the route became ready.')
    }

    const credentials = getBrowserStackCredentials()
    const createDriver = this.options.createWebDriver ?? createBrowserStackWebDriver
    const driver = await createDriver(this.options.capabilities ?? {}, credentials, this.options.hubUrl)
    if (this.closing) {
      await driver.quit().catch(() => undefined)
      throw new Error('[broyster] The BrowserStack provider was closed while creating the WebDriver session.')
    }
    this.driver = driver

    try {
      const session = await driver.getSession()
      const browserStackSessionId = session.getId()
      this.options.runtime?.setSession(this.project.name, browserStackSessionId)
      if (this.options.sessionTarget) {
        await writeBrowserStackSessionFile(this.options.sessionTarget, browserStackSessionId)
      }
      debug?.('[%s] BrowserStack session %s created', this.project.name, browserStackSessionId)

      const pageUrl = rewritePublicUrl(url, this.options.publicBaseUrl)
      debug?.('[%s] Navigating to %s', this.project.name, pageUrl)
      await driver.get(pageUrl)
      this.startHeartbeat(this.resolveHeartbeatInterval())
    } catch (error) {
      await this.close()
      throw error
    }
  }

  close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise
    }

    this.closing = true
    this.stopHeartbeat()
    const driver = this.driver
    this.driver = null
    this.closePromise = (async () => {
      if (!driver) {
        return
      }
      try {
        await driver.quit()
      } catch (error) {
        debug?.('[%s] Failed to quit WebDriver: %s', this.project.name, getErrorMessage(error))
      }
    })()
    return this.closePromise
  }

  private resolveHeartbeatInterval(): number {
    return positiveIntervalOrDefault(this.options.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS)
  }

  private resolveReadinessTimeout(): number {
    return positiveIntervalOrDefault(this.options.readinessTimeoutMs, DEFAULT_READINESS_TIMEOUT_MS)
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat()

    const schedule = () => {
      if (this.closing || !this.driver) {
        return
      }
      this.heartbeatTimer = setTimeout(() => {
        void this.sendHeartbeat().then(schedule)
      }, intervalMs)
      this.heartbeatTimer.unref()
    }

    schedule()
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.closing || !this.driver) {
      return
    }
    try {
      await this.driver.getTitle()
    } catch (error) {
      debug?.('[%s] WebDriver heartbeat stopped: %s', this.project.name, getErrorMessage(error))
      this.stopHeartbeat()
      this.closing = true
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

export async function createBrowserStackWebDriver(
  capabilities: Record<string, unknown>,
  credentials: BrowserStackCredentials,
  hubUrl: string,
): Promise<WebDriver> {
  const bstackOptions = isRecord(capabilities['bstack:options']) ? capabilities['bstack:options'] : {}
  return new Builder()
    .usingServer(hubUrl)
    .withCapabilities({
      ...capabilities,
      'bstack:options': {
        ...bstackOptions,
        userName: credentials.username,
        accessKey: credentials.accessKey,
      },
    })
    .build()
}

export function rewritePublicUrl(localUrl: string, publicBaseUrl: string): string {
  const local = new URL(localUrl)
  const publicBase = new URL(publicBaseUrl)
  const basePath = publicBase.pathname === '/' ? '' : publicBase.pathname.replace(/\/$/, '')

  publicBase.pathname = `${basePath}${local.pathname.startsWith('/') ? local.pathname : `/${local.pathname}`}`
  publicBase.search = local.search
  publicBase.hash = local.hash
  return publicBase.toString()
}

export async function waitForReadinessFile(path: string, timeoutMs = DEFAULT_READINESS_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + positiveIntervalOrDefault(timeoutMs, DEFAULT_READINESS_TIMEOUT_MS)
  while (Date.now() < deadline) {
    try {
      await access(path)
      return
    } catch {
      await delay(250)
    }
  }
  throw new Error(`[broyster] Timed out waiting for the browser route readiness marker at "${path}".`)
}

function positiveIntervalOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
