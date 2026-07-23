import type { ViteUserConfig } from 'vitest/config'
import type { BrowserInstanceOption } from 'vitest/node'

import type { BrowserDef } from '../browsers'
import { browserstackBrowsers, filterBetaBrowsers, platformToOs, resolveDeviceName } from '../browsers'
import { browserstack } from '../provider'
import { BrowserStackReporter, FailedFilesReporter, FailureSummaryReporter } from '../reporters'

export type VitestPreset = 'local' | 'browserstack' | 'browserstack-beta'

export type VitestConfiguratorOptions = {
  /** Shown in the BrowserStack Automation UI */
  projectName: string
  /** Glob patterns for test files */
  include: string[]
  /**
   * Where to run tests. Defaults to `process.env.BROYSTER_PRESET` or `local`.
   * The multi-browser orchestrator sets `browserstack` / `browserstack-beta` via env.
   */
  preset?: VitestPreset
  /** When true, enable Vitest retries even outside CI (local preset) */
  alwaysRetryTests?: boolean
  /** BrowserStack build name (defaults to BS_BUILD_NAME or a timestamp) */
  buildName?: string
  /** Override the default browser matrix */
  browsers?: Record<string, BrowserDef>
  /**
   * Local browser names for the local preset (default: chrome, firefox).
   * Requires `@vitest/browser-playwright` (and `playwright`) as peer dependencies.
   */
  localBrowsers?: Array<'chromium' | 'firefox' | 'webkit' | 'chrome' | 'edge' | 'safari'>
  /** Extra Vite/Vitest config merged last */
  configureCustom?: (config: ViteUserConfig) => void | ViteUserConfig | Promise<void | ViteUserConfig>
}

function resolvePreset(explicit?: VitestPreset): VitestPreset {
  if (explicit) {
    return explicit
  }
  const fromEnv = process.env.BROYSTER_PRESET ?? process.env.BS_PRESET
  if (fromEnv === 'browserstack' || fromEnv === 'browserstack-beta' || fromEnv === 'local') {
    return fromEnv
  }
  // Orchestrator always sets BS_BROWSER for BrowserStack child processes.
  if (process.env.BS_BROWSER) {
    return 'browserstack'
  }
  return 'local'
}

function makeBrowserstackInstance(
  key: string,
  def: BrowserDef,
  projectName: string,
  buildName: string,
  queueManagedExternally: boolean,
): BrowserInstanceOption {
  const { os } = platformToOs(def.platform)
  const isMobile = def.platform === 'iOS' || def.platform === 'Android'
  const deviceName = isMobile ? resolveDeviceName(def) : undefined

  return {
    // BrowserStack accepts more browser names than Vitest's typed union.
    browser: def.browserName.toLowerCase() as BrowserInstanceOption['browser'],
    name: key.replace(/_/g, ' '),
    provider: browserstack({
      capabilities: {
        os,
        osVersion: def.osVersion,
        browserVersion: def.browserVersion,
        buildName,
        projectName,
        consoleLogs: 'verbose',
        idleTimeoutSeconds: 300,
        ...(deviceName && { deviceName }),
      },
      heartbeatIntervalMs: 18_000,
      checkQueue: !queueManagedExternally,
    }),
  }
}

/**
 * Opinionated Vitest configuration used by Fingerprint projects.
 *
 * @example
 * import { makeVitestConfigurator } from '@fpjs-incubator/broyster/vitest'
 * export default makeVitestConfigurator({ projectName: 'My project', include: ['src/tests.ts'] })
 */
export async function makeVitestConfigurator(options: VitestConfiguratorOptions): Promise<ViteUserConfig> {
  const preset = resolvePreset(options.preset)
  const buildName = options.buildName ?? process.env.BS_BUILD_NAME ?? `vitest-bs-${Date.now()}`
  const matrix = options.browsers ?? browserstackBrowsers
  const queueManagedExternally = process.env.BS_QUEUE_MANAGED_EXTERNALLY === '1'
  const retry = process.env.CI || options.alwaysRetryTests ? 2 : 0

  let config: ViteUserConfig

  if (preset === 'local') {
    config = await makeLocalConfig(options, retry)
  } else {
    const browsers = preset === 'browserstack-beta' ? filterBetaBrowsers(matrix) : matrix
    config = makeBrowserstackConfig(options, browsers, buildName, queueManagedExternally, retry)
  }

  if (options.configureCustom) {
    const custom = await options.configureCustom(config)
    if (custom) {
      config = custom
    }
  }

  return config
}

async function makeLocalConfig(options: VitestConfiguratorOptions, retry: number): Promise<ViteUserConfig> {
  let playwrightProvider: ReturnType<typeof import('@vitest/browser-playwright').playwright>
  try {
    // Optional peer: only required for the local preset.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@vitest/browser-playwright') as typeof import('@vitest/browser-playwright')
    playwrightProvider = mod.playwright()
  } catch {
    throw new Error(
      'Local Vitest preset requires `@vitest/browser-playwright` (and `playwright`). ' +
        'Install them as devDependencies, or use the browserstack preset.',
    )
  }

  const localBrowsers = options.localBrowsers ?? ['chromium', 'firefox']
  const headless = process.env.VITEST_BROWSER_HEADLESS !== '0'

  return {
    test: {
      globals: true,
      clearMocks: true,
      restoreMocks: true,
      retry,
      include: options.include,
      browser: {
        enabled: true,
        provider: playwrightProvider,
        screenshotFailures: false,
        instances: localBrowsers.map((browser) => ({
          browser: browser as BrowserInstanceOption['browser'],
          name: browser,
          headless: browser === 'safari' || browser === 'webkit' ? false : headless,
        })),
      },
    },
  }
}

function makeBrowserstackConfig(
  options: VitestConfiguratorOptions,
  browsers: Record<string, BrowserDef>,
  buildName: string,
  queueManagedExternally: boolean,
  retry: number,
): ViteUserConfig {
  const browserKey = process.env.BS_BROWSER
  let selected: [string, BrowserDef][]

  if (browserKey) {
    const def = browsers[browserKey]
    if (!def) {
      const available = Object.keys(browsers).join(', ')
      throw new Error(`Unknown browser "${browserKey}". Available: ${available}`)
    }
    selected = [[browserKey, def]]
  } else {
    selected = Object.entries(browsers)
  }

  const httpsModes = new Set(selected.map(([, def]) => def.useHttps))
  if (httpsModes.size > 1) {
    throw new Error(
      'The selected BrowserStack browsers require mixed HTTP and HTTPS server modes. ' +
        'Run one browser per process via the Broyster orchestrator, ' +
        'or select only browsers with the same useHttps value.',
    )
  }

  const instances = selected.map(([key, def]) =>
    makeBrowserstackInstance(key, def, options.projectName, buildName, queueManagedExternally),
  )

  const apiPort = process.env.BS_API_PORT ? Number(process.env.BS_API_PORT) : undefined
  const useHttps = httpsModes.has(true)
  const plugins: NonNullable<ViteUserConfig['plugins']> = []

  if (useHttps) {
    try {
      // Optional peer: only needed when the browser matrix requests HTTPS.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const basicSslMod = require('@vitejs/plugin-basic-ssl') as {
        default: (options?: { domains?: string[] }) => unknown
      }
      const basicSsl = basicSslMod.default
      plugins.push(basicSsl({ domains: ['bs-local.com', 'localhost'] }) as never)
    } catch {
      throw new Error(
        'HTTPS BrowserStack browsers require `@vitejs/plugin-basic-ssl`. ' +
          'Install it as a devDependency, or select only HTTP browsers.',
      )
    }
  }

  return {
    plugins,
    server: {
      host: '0.0.0.0',
      // Remote BrowserStack sessions reach the machine via bs-local.com (Local) or a public host.
      allowedHosts: ['bs-local.com', '.bs-local.com', 'localhost', 'all'],
    },
    test: {
      globals: true,
      clearMocks: true,
      restoreMocks: true,
      retry,
      fileParallelism: false,
      isolate: false,
      include: options.include,
      browser: {
        enabled: true,
        // Safari / mobile sessions are slower to attach through BrowserStack Local.
        connectTimeout: 180_000,
        ...(apiPort && Number.isInteger(apiPort) ? { api: apiPort } : {}),
        provider: browserstack({
          capabilities: {
            buildName,
            projectName: options.projectName,
            idleTimeoutSeconds: 300,
            acceptInsecureCerts: true,
          },
          heartbeatIntervalMs: 18_000,
          checkQueue: !queueManagedExternally,
        }),
        instances,
      },
      reporters: ['default', new FailureSummaryReporter(), new FailedFilesReporter(), new BrowserStackReporter()],
    },
  }
}
