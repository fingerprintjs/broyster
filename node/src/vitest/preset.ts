import type { UserConfigExport } from 'vitest/config'
import { fileURLToPath, resolve } from 'node:url'
import { dirname } from 'node:path'
import { boolEnv, envMeta, strEnv } from './utils'

export type VitestPresetOptions = {
  projectName: string
  includeFiles?: string[]
  exclude?: string[]
  browser?: {
    enabled: boolean
    provider: 'playwright' | 'webdriverio'
    instances: Array<{
      browser: string
      browserVersion?: string
      protocol?: string
      hostname?: string
      port?: number
      path?: string
      user?: string
      key?: string
      capabilities?: Record<string, any>
    }>
  }
  retries?: number
  globals?: boolean
  setupFiles?: string[]
  watch?: boolean
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const browserstackProviderPath = resolve(__dirname, '../../node/dist/vitest/browserstack-provider.js')

export function vitestPreset(opts: VitestPresetOptions): UserConfigExport {
  const isRemote = !!process.env.BROWSERSTACK

  if (isRemote) {
    if (!process.env.BROWSERSTACK_USERNAME || !process.env.BROWSERSTACK_ACCESS_KEY) {
      throw new Error('BROWSERSTACK=1 but BROWSERSTACK_USERNAME/BROWSERSTACK_ACCESS_KEY are not set.')
    }
  }

  const { buildName, buildIdentifier, tags } = envMeta(opts.projectName)

  const browserConfig = isRemote
    ? {
        enabled: true,
        provider: browserstackProviderPath,
        instances: (opts.browser?.instances ?? [{ browser: 'chrome' }]).map((instance) => {
          const cap = instance.capabilities ?? {}
          const existingBstack = (cap['bstack:options'] ?? {}) as Record<string, any>
          const debug = boolEnv('BS_DEBUG') // true/false/undefined
          const networkLogs = boolEnv('BS_NETWORK_LOGS')
          const consoleLogs = strEnv('BS_CONSOLE_LOGS', ['disable', 'info', 'warn', 'error'])
          const mergedBstack = {
            ...existingBstack,
            projectName: opts.projectName,
            buildName,
            ...(buildIdentifier ? { buildIdentifier } : null),
            sessionName: `${instance.browser} • Vitest`,
            local: true,
            ...(tags.length ? { tags } : null),
            os: existingBstack.os ?? cap?.['bstack:options']?.os,
            osVersion: existingBstack.osVersion ?? cap?.['bstack:options']?.osVersion,
            ...(debug !== undefined ? { debug } : null),
            ...(networkLogs !== undefined ? { networkLogs } : null),
            ...(consoleLogs ? { consoleLogs } : null),
          }

          return {
            ...instance,
            protocol: instance.protocol ?? 'https',
            hostname: instance.hostname ?? 'hub-cloud.browserstack.com',
            port: instance.port ?? 443,
            path: instance.path ?? '/wd/hub',
            user: instance.user ?? process.env.BROWSERSTACK_USERNAME!,
            key: instance.key ?? process.env.BROWSERSTACK_ACCESS_KEY!,
            capabilities: {
              browserName: cap.browserName ?? instance.browser,
              browserVersion: cap.browserVersion ?? instance['browserVersion'] ?? 'latest',
              ...cap,
              'bstack:options': mergedBstack,
            },
          }
        }),
      }
    : {
        enabled: true,
        provider: 'webdriverio' as const,
        name: 'chrome',
        headless: true,
      }

  return {
    test: {
      name: opts.projectName,
      include: opts.includeFiles ?? ['**/*.{test,spec}.ts?(x)'],
      exclude: opts.exclude ?? ['e2e/**', 'node_modules/**'],
      retry: opts.retries ?? 2,
      globals: opts.globals ?? true,
      watch: opts.watch ?? false,
      reporters: ['default'],
      browser: browserConfig as any,
    },
  }
}

export default vitestPreset
