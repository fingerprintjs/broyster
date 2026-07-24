import basicSsl from '@vitejs/plugin-basic-ssl'
import { join } from 'node:path'
import { mergeConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'
import type { BrowserInstanceOption } from 'vitest/node'

import type { BrowserDef } from '../browsers.js'
import type { BrowserStackCapabilities } from '../capabilities.js'
import { browserIdentityCapabilityKeys, hasCredentialOptions, transportRoutingCapabilityKeys } from '../capabilities.js'
import type { ChildRunContext } from '../env_contract.js'
import type { QueueWaitOptions } from '../queue.js'
import { platformToOs } from '../browsers.js'
import { CHILD_CONTEXT_ENV, readChildContext } from '../env_contract.js'
import { unique } from '../internal/collections.js'
import { SessionRegistry } from '../session_registry.js'
import { browserstack } from './provider.js'
import { BrowserStackReporter } from './reporters/browserstack_reporter.js'
import { FailedFilesReporter } from './reporters/failed_files_reporter.js'
import { FailureSummaryReporter } from './reporters/failure_summary_reporter.js'
import { defaultBrowserTestServerHeaders } from './server_headers.js'

export type BrowserStackConfigOptions = {
  /** Project name shown in the BrowserStack Automate UI */
  projectName: string
  /**
   * @deprecated The orchestrator's catalog is authoritative and is serialized
   * into the child context. Retained temporarily for source compatibility.
   */
  browsers?: Record<string, BrowserDef>
  /** Capability overrides merged into every session */
  capabilities?: BrowserStackCapabilities
  /** Local WebDriver heartbeat interval, in milliseconds (default: 18000) */
  heartbeatIntervalMs?: number
  /** Queue wait options before session creation */
  queue?: QueueWaitOptions
  /** Vitest-level per-test retries (default: 1) */
  retry?: number
  /** Extra/override server headers, or false to disable broyster's permissive defaults */
  serverHeaders?: Record<string, string> | false
  /** Domains for the self-signed HTTPS certificate (default: ['bs-local.com']) */
  sslDomains?: string[]
  /** Consumer test options (include globs, setupFiles, ...) merged with broyster's runner-owned settings */
  test?: NonNullable<ViteUserConfig['test']>
  /** Arbitrary extra Vite config (plugins etc.) merged with broyster's runner-owned settings */
  vite?: ViteUserConfig
}

/**
 * Builds a Vitest config that runs the browser assigned to this child process
 * on BrowserStack. Must run under the broyster orchestrator (`broyster run` or
 * `runBrowserStackTests`), which assigns the browser and transport slot via
 * the environment.
 */
export function createBrowserStackConfig(options: BrowserStackConfigOptions): ViteUserConfig {
  const context = readChildContext()
  if (!context) {
    throw new Error(
      `${CHILD_CONTEXT_ENV} is not set. BrowserStack configs must run under the broyster orchestrator: ` +
        'use "broyster run --config <this config>" or call runBrowserStackTests() from @fpjs-incubator/broyster.',
    )
  }

  const browserDef = context.browser

  const registry = new SessionRegistry()
  const publicHost = new URL(context.publicOrigin).hostname
  const sslDomains = options.sslDomains ?? ['bs-local.com']
  const userConfig = mergeConfig(options.test ? { test: options.test } : {}, options.vite ?? {})
  const headers =
    options.serverHeaders === false
      ? userConfig.server?.headers
      : {
          ...defaultBrowserTestServerHeaders,
          ...options.serverHeaders,
          ...userConfig.server?.headers,
        }
  const cacheDirSuffix = [context.browserKey, context.useHttps ? 'https' : 'http'].join('-')
  const userTest = userConfig.test ?? {}
  const userBrowser = userTest.browser ?? {}
  const {
    enabled: _enabled,
    api: _api,
    connectTimeout: _connectTimeout,
    fileParallelism: _browserFileParallelism,
    instances: _instances,
    provider: _provider,
    ...safeBrowserOptions
  } = userBrowser
  const userReporters = normalizeReporters(userTest.reporters)

  return {
    ...userConfig,
    plugins: [...(context.useHttps ? [basicSsl({ domains: sslDomains })] : []), ...(userConfig.plugins ?? [])],
    server: {
      ...userConfig.server,
      host: '0.0.0.0',
      allowedHosts: mergeAllowedHosts(userConfig.server?.allowedHosts, publicHost),
      ...(headers && { headers }),
    },
    cacheDir: join(userConfig.cacheDir ?? 'node_modules/.vite', 'broyster', cacheDirSuffix),
    test: {
      ...userTest,
      retry: options.retry ?? userTest.retry ?? 1,
      fileParallelism: false,
      browser: {
        ...safeBrowserOptions,
        enabled: true,
        api: {
          port: context.apiPort,
          strictPort: true,
        },
        connectTimeout: 120_000,
        fileParallelism: false,
        instances: [makeBrowserInstance(context, browserDef, registry, options)],
      },
      reporters: [
        ...userReporters,
        new FailureSummaryReporter(),
        new FailedFilesReporter(),
        new BrowserStackReporter({ registry }),
      ],
    },
  }
}

function mergeAllowedHosts(current: true | string[] | undefined, publicHost: string): true | string[] {
  if (current === true) {
    return true
  }
  return unique([...(current ?? []), publicHost])
}

function normalizeReporters(reporters: NonNullable<ViteUserConfig['test']>['reporters']): unknown[] {
  if (reporters === undefined) {
    return ['default']
  }
  return Array.isArray(reporters) ? reporters : [reporters]
}

function makeBrowserInstance(
  context: ChildRunContext,
  browserDef: BrowserDef,
  registry: SessionRegistry,
  options: BrowserStackConfigOptions,
): BrowserInstanceOption {
  const { os } = platformToOs(browserDef.platform)
  const capabilities = makeBrowserCapabilities(context, browserDef, os, options)

  return {
    // BrowserStack accepts more browser names (e.g. "samsung") than Vitest's typed union.
    // The provider validates the value at runtime, so we widen the type here intentionally.
    browser: browserDef.browserName.toLowerCase() as BrowserInstanceOption['browser'],
    name: context.browserKey.replace(/_/g, ' '),
    provider: browserstack({
      capabilities,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      queue: options.queue,
      registry,
    }),
  }
}

function makeBrowserCapabilities(
  context: ChildRunContext,
  browserDef: BrowserDef,
  os: string,
  options: BrowserStackConfigOptions,
): BrowserStackCapabilities {
  const { bstackOptions, ...additionalCapabilities } = options.capabilities ?? {}
  rejectCredentialCapabilityFields(bstackOptions)

  return {
    ...additionalCapabilities,
    ...(bstackOptions && { bstackOptions: omitRunnerOwnedCapabilityFields(bstackOptions) }),
    os,
    osVersion: browserDef.osVersion,
    browserVersion: browserDef.browserVersion,
    deviceName: browserDef.deviceName,
    buildName: context.buildName,
    projectName: options.projectName,
    sessionName: context.browserKey,
    idleTimeoutSeconds: options.capabilities?.idleTimeoutSeconds ?? 300,
  }
}

function rejectCredentialCapabilityFields(fields: Record<string, unknown> | undefined): void {
  if (fields && hasCredentialOptions(fields)) {
    throw new Error('BrowserStack credentials must be provided separately, not embedded in capabilities.')
  }
}

function omitRunnerOwnedCapabilityFields(fields: Record<string, unknown>): Record<string, unknown> {
  const safeFields = { ...fields }
  for (const key of [...browserIdentityCapabilityKeys, ...transportRoutingCapabilityKeys]) {
    delete safeFields[key]
  }
  return safeFields
}
