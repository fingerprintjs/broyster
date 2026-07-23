import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vite'
import type { BrowserInstanceOption } from 'vitest/node'
import vitejsPluginBasicSsl from '@vitejs/plugin-basic-ssl'

import { browserstackBrowsers, type BrowserDef, platformToOs } from './browsers'
import { browserstack } from './provider'
import { BrowserStackReporter } from './browserstack_reporter'
import { FailedFilesReporter } from './failed_files_reporter'
import { FailureSummaryReporter } from './failure_summary_reporter'

export type BroysterVitestConfigOptions = {
  projectName?: string
  include?: string[]
  plugins?: UserConfig['plugins']
  apiPort?: number
  browsers?: Record<string, BrowserDef>
  serverHeaders?: Record<string, string>
  sslDomains?: string[]
}

function getDeviceName(def: BrowserDef): string | undefined {
  if (def.platform === 'iOS') {
    const ver = Number.parseInt(def.osVersion, 10)
    if (ver >= 26) return 'iPhone 17'
    if (ver >= 17) return 'iPhone 15'
    if (ver >= 16) return 'iPhone 14'
    return 'iPhone 13'
  }
  if (def.platform === 'Android') {
    return 'Samsung Galaxy S26 Ultra'
  }
  return undefined
}

export function createBroysterVitestConfig(options: BroysterVitestConfigOptions = {}) {
  const browserKey = process.env.BS_BROWSER
  const buildName = process.env.BS_BUILD_NAME || `vitest-bs-${Date.now()}`
  const rawApiPort = process.env.BS_API_PORT
  const queueManagedExternally = process.env.BS_QUEUE_MANAGED_EXTERNALLY === '1'
  const apiPort = options.apiPort || (rawApiPort ? Number(rawApiPort) : 8000)
  const publicBaseUrl = process.env.BS_PUBLIC_BASE_URL || `http://localhost:${apiPort}`
  const availableBrowsers = options.browsers || browserstackBrowsers
  const projectName = options.projectName || 'broyster-test'

  const publicHost = new URL(publicBaseUrl).hostname
  const hasCredentials = Boolean(process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY)

  function makeBrowserInstance(key: string, def: BrowserDef): BrowserInstanceOption {
    const { os } = platformToOs(def.platform)
    const isMobile = def.platform === 'iOS' || def.platform === 'Android'

    return {
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
          ...(isMobile && { deviceName: getDeviceName(def) }),
        },
        heartbeatIntervalMs: 18_000,
        checkQueue: !queueManagedExternally,
      }),
    }
  }

  let selectedBrowsers: [string, BrowserDef][]
  if (browserKey) {
    const def = availableBrowsers[browserKey]
    if (!def) {
      const available = Object.keys(availableBrowsers).join(', ')
      throw new Error(`Unknown browser "${browserKey}". Available: ${available}`)
    }
    selectedBrowsers = [[browserKey, def]]
  } else {
    selectedBrowsers = Object.entries(availableBrowsers).filter(([, def]) => def.useHttps)
  }

  const httpsModes = new Set(selectedBrowsers.map(([, def]) => def.useHttps))
  const useHttps = hasCredentials && httpsModes.has(true)
  const instances = hasCredentials ? selectedBrowsers.map(([key, def]) => makeBrowserInstance(key, def)) : []
  const sslDomains = options.sslDomains || ['bs-local.com']
  const sslModule = vitejsPluginBasicSsl as unknown as { default: typeof vitejsPluginBasicSsl }
  const basicSslPlugin = sslModule.default ?? vitejsPluginBasicSsl

  return defineConfig({
    plugins: [...(options.plugins || []), ...(useHttps ? [basicSslPlugin({ domains: sslDomains })] : [])],
    server: {
      host: '0.0.0.0',
      allowedHosts: [publicHost],
      ...(options.serverHeaders && { headers: options.serverHeaders }),
    },
    test: {
      globals: true,
      clearMocks: true,
      restoreMocks: true,
      fileParallelism: false,
      isolate: false,
      include: options.include || ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      ...(hasCredentials
        ? {
            browser: {
              api: apiPort,
              enabled: true,
              connectTimeout: 120_000,
              provider: browserstack({
                capabilities: {
                  buildName,
                  projectName,
                  idleTimeoutSeconds: 300,
                },
                heartbeatIntervalMs: 18_000,
                checkQueue: !queueManagedExternally,
              }),
              instances,
            },
            reporters: ['default', new FailureSummaryReporter(), new FailedFilesReporter(), new BrowserStackReporter()],
          }
        : {
            environment: 'jsdom',
          }),
    },
  })
}
