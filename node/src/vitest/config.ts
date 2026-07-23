import basicSsl from '@vitejs/plugin-basic-ssl'
import { mergeConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'
import type { BrowserInstanceOption } from 'vitest/node'

import type { BrowserDef } from '../browsers.js'
import type { BrowserStackCapabilities } from '../capabilities.js'
import type { ChildRunContext } from '../env_contract.js'
import type { QueueWaitOptions } from '../queue.js'
import { browserstackBrowsers, platformToOs } from '../browsers.js'
import { CHILD_CONTEXT_ENV, readChildContext } from '../env_contract.js'
import { SessionRegistry } from '../session_registry.js'
import { browserstack } from './provider.js'
import { BrowserStackReporter } from './reporters/browserstack_reporter.js'
import { FailedFilesReporter } from './reporters/failed_files_reporter.js'
import { FailureSummaryReporter } from './reporters/failure_summary_reporter.js'
import { defaultBrowserTestServerHeaders } from './server_headers.js'

export type BrowserStackConfigOptions = {
  /** Project name shown in the BrowserStack Automate UI */
  projectName: string
  /** Browser catalog; keys must match what the orchestrator schedules (default: browserstackBrowsers) */
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
  /** Consumer test options (include globs, setupFiles, ...) merged over broyster's defaults */
  test?: NonNullable<ViteUserConfig['test']>
  /** Arbitrary extra Vite config (plugins etc.), merged last */
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

  const catalog = options.browsers ?? browserstackBrowsers
  const browserDef = catalog[context.browserKey]
  if (!browserDef) {
    throw new Error(
      `Unknown browser "${context.browserKey}". Available: ${Object.keys(catalog).join(', ')}. ` +
        'Pass the same catalog to createBrowserStackConfig and the orchestrator.',
    )
  }

  const registry = new SessionRegistry()
  const publicHost = new URL(context.publicOrigin).hostname
  const sslDomains = options.sslDomains ?? ['bs-local.com']
  const headers =
    options.serverHeaders === false ? undefined : { ...defaultBrowserTestServerHeaders, ...options.serverHeaders }
  const cacheDirSuffix = [context.browserKey, context.useHttps ? 'https' : 'http'].join('-')

  const baseConfig: ViteUserConfig = {
    plugins: context.useHttps ? [basicSsl({ domains: sslDomains })] : [],
    server: {
      host: '0.0.0.0',
      allowedHosts: [publicHost],
      ...(headers && { headers }),
    },
    cacheDir: `node_modules/.vite/broyster/${cacheDirSuffix}`,
    test: {
      retry: options.retry ?? 1,
      fileParallelism: false,
      browser: {
        enabled: true,
        api: context.apiPort,
        connectTimeout: 120_000,
        instances: [makeBrowserInstance(context, browserDef, registry, options)],
      },
      reporters: [
        'default',
        new FailureSummaryReporter(),
        new FailedFilesReporter(),
        new BrowserStackReporter({ registry }),
      ],
    },
  }

  const withTestOptions = options.test ? mergeConfig(baseConfig, { test: options.test }) : baseConfig
  return options.vite ? mergeConfig(withTestOptions, options.vite) : withTestOptions
}

function makeBrowserInstance(
  context: ChildRunContext,
  browserDef: BrowserDef,
  registry: SessionRegistry,
  options: BrowserStackConfigOptions,
): BrowserInstanceOption {
  const { os } = platformToOs(browserDef.platform)

  return {
    // BrowserStack accepts more browser names (e.g. "samsung") than Vitest's typed union.
    // The provider validates the value at runtime, so we widen the type here intentionally.
    browser: browserDef.browserName.toLowerCase() as BrowserInstanceOption['browser'],
    name: context.browserKey.replace(/_/g, ' '),
    provider: browserstack({
      capabilities: {
        os,
        osVersion: browserDef.osVersion,
        browserVersion: browserDef.browserVersion,
        deviceName: browserDef.deviceName,
        buildName: context.buildName,
        projectName: options.projectName,
        sessionName: context.browserKey,
        idleTimeoutSeconds: 300,
        ...options.capabilities,
      },
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      queue: options.queue,
      registry,
    }),
  }
}
