import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrowserDef } from '../src/browsers.js'
import type { BrowserStackCapabilities } from '../src/capabilities.js'
import type { ChildRunContext } from '../src/env_contract.js'
import { CHILD_CONTEXT_ENV, CHILD_CONTEXT_SCHEMA_VERSION } from '../src/env_contract.js'
import { createBrowserStackConfig } from '../src/vitest/config.js'
import { BrowserStackReporter } from '../src/vitest/reporters/browserstack_reporter.js'
import { FailedFilesReporter } from '../src/vitest/reporters/failed_files_reporter.js'
import { FailureSummaryReporter } from '../src/vitest/reporters/failure_summary_reporter.js'
import { defaultBrowserTestServerHeaders } from '../src/vitest/server_headers.js'

const browserKey = 'Android16_Chrome'
const browserDef: BrowserDef = {
  platform: 'Android',
  osVersion: '16.0',
  browserName: 'Chrome',
  browserVersion: 'latest-beta',
  deviceName: 'Samsung Galaxy S26 Ultra',
  useHttps: true,
}
const context: ChildRunContext = {
  schemaVersion: CHILD_CONTEXT_SCHEMA_VERSION,
  browserKey,
  browser: browserDef,
  buildName: 'runner-build',
  publicOrigin: 'https://public.example.test',
  useHttps: true,
  apiPort: 7_201,
  attempt: 'initial',
  queueManagedExternally: true,
  capabilities: {
    local: true,
    localIdentifier: 'runner-local',
  },
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createBrowserStackConfig', () => {
  it('enforces the runner-owned Vitest settings while preserving safe consumer options', () => {
    setContext()
    const consumerPlugin = { name: 'consumer-plugin' }

    const config = createBrowserStackConfig({
      projectName: 'runner-project',
      browsers: { [browserKey]: browserDef },
      retry: 2,
      serverHeaders: {
        'X-Broyster-Option': 'preserved',
      },
      test: {
        include: ['consumer/**/*.test.ts'],
        reporters: ['verbose'],
        fileParallelism: true,
        retry: 98,
        browser: {
          enabled: false,
          api: {
            port: 9_999,
            strictPort: false,
          },
          connectTimeout: 1,
          fileParallelism: true,
          headless: true,
          instances: [],
          provider: { name: 'consumer-provider' } as never,
        },
      },
      vite: {
        cacheDir: 'consumer-cache',
        plugins: [consumerPlugin],
        server: {
          host: '127.0.0.1',
          allowedHosts: ['consumer.example.test', 'public.example.test'],
          cors: false,
          headers: {
            'Content-Security-Policy': "default-src 'none'",
            'X-Consumer': 'preserved',
          },
        },
        test: {
          reporters: ['json'],
          fileParallelism: true,
          retry: 99,
          browser: {
            enabled: false,
            api: 9_998,
            connectTimeout: 2,
            fileParallelism: true,
            instances: [{ browser: 'firefox' }],
            provider: { name: 'consumer-vite-provider' } as never,
          },
        },
      },
    })

    expect(config.server).toMatchObject({
      host: '0.0.0.0',
      allowedHosts: ['consumer.example.test', 'public.example.test'],
      cors: false,
      headers: {
        ...defaultBrowserTestServerHeaders,
        'Content-Security-Policy': "default-src 'none'",
        'X-Broyster-Option': 'preserved',
        'X-Consumer': 'preserved',
      },
    })
    const plugins = config.plugins as { name: string }[]
    expect(plugins.map((plugin) => plugin.name)).toEqual(['vite:basic-ssl', 'consumer-plugin'])
    expect(config.cacheDir).toBe(`consumer-cache/broyster/${browserKey}-https`)
    expect(config.test?.include).toEqual(['consumer/**/*.test.ts'])
    expect(config.test?.retry).toBe(2)
    expect(config.test?.fileParallelism).toBe(false)

    const browser = config.test?.browser
    expect(browser).toMatchObject({
      enabled: true,
      api: {
        port: context.apiPort,
        strictPort: true,
      },
      connectTimeout: 120_000,
      fileParallelism: false,
      headless: true,
    })
    expect(browser?.provider).toBeUndefined()
    expect(browser?.instances).toHaveLength(1)
    expect(browser?.instances?.[0]).toMatchObject({
      browser: 'chrome',
      name: 'Android16 Chrome',
      provider: {
        name: 'browserstack',
      },
    })

    const reporters = config.test?.reporters as unknown[]
    expect(reporters[0]).toBe('verbose')
    expect(reporters[1]).toBe('json')
    expect(reporters[2]).toBeInstanceOf(FailureSummaryReporter)
    expect(reporters[3]).toBeInstanceOf(FailedFilesReporter)
    expect(reporters[4]).toBeInstanceOf(BrowserStackReporter)
  })

  it('keeps browser identity and run metadata ahead of caller capability overrides', () => {
    setContext()
    const config = createBrowserStackConfig({
      projectName: 'runner-project',
      browsers: { [browserKey]: browserDef },
      capabilities: {
        os: 'caller-os',
        osVersion: 'caller-os-version',
        browserVersion: 'caller-browser-version',
        deviceName: 'caller-device',
        projectName: 'caller-project',
        buildName: 'caller-build',
        sessionName: 'caller-session',
        idleTimeoutSeconds: 123,
        networkLogs: true,
        bstackOptions: {
          browserName: 'caller-browser',
          os: 'raw-caller-os',
          osVersion: 'raw-caller-os-version',
          browserVersion: 'raw-caller-browser-version',
          deviceName: 'raw-caller-device',
          projectName: 'raw-caller-project',
          buildName: 'raw-caller-build',
          sessionName: 'raw-caller-session',
          local: false,
          localIdentifier: 'raw-caller-local',
          customCapability: 'preserved',
        },
      },
    })

    const provider = config.test?.browser?.instances?.[0]?.provider
    const providerOptions = provider?.options as { capabilities?: BrowserStackCapabilities }
    expect(providerOptions.capabilities).toEqual({
      os: 'android',
      osVersion: browserDef.osVersion,
      browserVersion: browserDef.browserVersion,
      deviceName: browserDef.deviceName,
      projectName: 'runner-project',
      buildName: context.buildName,
      sessionName: browserKey,
      idleTimeoutSeconds: 123,
      networkLogs: true,
      bstackOptions: {
        customCapability: 'preserved',
      },
    })
  })

  it('rejects BrowserStack credentials embedded in raw capabilities', () => {
    setContext()

    expect(() =>
      createBrowserStackConfig({
        projectName: 'runner-project',
        capabilities: {
          bstackOptions: {
            accessKey: 'must-not-be-serialized',
          },
        },
      }),
    ).toThrow(/credentials must be provided separately/)
  })

  it('can disable Broyster headers without discarding consumer headers', () => {
    setContext()
    const config = createBrowserStackConfig({
      projectName: 'runner-project',
      browsers: { [browserKey]: browserDef },
      serverHeaders: false,
      vite: {
        server: {
          allowedHosts: true,
          headers: {
            'X-Consumer': 'preserved',
          },
        },
      },
    })

    expect(config.server?.allowedHosts).toBe(true)
    expect(config.server?.headers).toEqual({
      'X-Consumer': 'preserved',
    })
  })

  it('uses the effective slot protocol when BrowserStack Local downgrades WebKit to HTTP', () => {
    setContext({
      publicOrigin: 'http://bs-local.com:7201',
      useHttps: false,
    })

    const config = createBrowserStackConfig({ projectName: 'runner-project' })

    expect(config.plugins).toEqual([])
    expect(config.cacheDir).toBe(`node_modules/.vite/broyster/${browserKey}-http`)
    expect(config.test?.browser?.instances?.[0]?.browser).toBe('chrome')
  })
})

function setContext(overrides: Partial<ChildRunContext> = {}): void {
  vi.stubEnv(CHILD_CONTEXT_ENV, JSON.stringify({ ...context, ...overrides }))
}
