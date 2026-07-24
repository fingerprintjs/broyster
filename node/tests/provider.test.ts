import type { WebDriver } from 'selenium-webdriver'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestProject } from 'vitest/node'

import type { BrowserStackCapabilities } from '../src/capabilities.js'
import { CHILD_CONTEXT_ENV, CHILD_CONTEXT_SCHEMA_VERSION } from '../src/env_contract.js'
import { BrowserStackProvider, type BrowserStackProviderOptions } from '../src/vitest/provider.js'
import { deferred } from './helpers.js'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  createWebDriver: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  access: mocks.access,
}))

vi.mock('../src/webdriver_factory.js', () => ({
  createWebDriver: mocks.createWebDriver,
}))

function makeDriver(options: { navigationError?: Error } = {}) {
  return {
    driver: {
      getSession: vi.fn(async () => ({ getId: () => 'session-123' })),
      get: options.navigationError
        ? vi.fn(async () => {
            throw options.navigationError
          })
        : vi.fn(async () => undefined),
      getTitle: vi.fn(async () => 'Vitest'),
      quit: vi.fn(async () => undefined),
    } as unknown as WebDriver,
  }
}

function makeProvider(
  capabilities?: BrowserStackCapabilities,
  overrides: Partial<BrowserStackProviderOptions> = {},
): BrowserStackProvider {
  const project = {
    name: 'ChromeHttps',
    config: { browser: { name: 'Chrome' } },
  } as unknown as TestProject
  return new BrowserStackProvider(project, {
    checkQueue: false,
    credentials: { username: 'username', accessKey: 'access-key' },
    heartbeatIntervalMs: 60_000,
    capabilities,
    ...overrides,
  })
}

beforeEach(() => {
  mocks.access.mockReset()
  mocks.access.mockRejectedValue(Object.assign(new Error('not ready'), { code: 'ENOENT' }))
  mocks.createWebDriver.mockReset()
  vi.stubEnv(CHILD_CONTEXT_ENV, '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('BrowserStackProvider', () => {
  it('closes concurrently without quitting the WebDriver more than once', async () => {
    const { driver } = makeDriver()
    mocks.createWebDriver.mockResolvedValue(driver)
    const provider = makeProvider()

    await provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', { parallel: false })
    const firstClose = provider.close()
    const secondClose = provider.close()
    await Promise.all([firstClose, secondClose])

    expect(firstClose).toBe(secondClose)
    expect(driver.quit).toHaveBeenCalledOnce()
  })

  it('quits the WebDriver when navigation fails', async () => {
    const navigationError = new Error('Navigation failed')
    const { driver } = makeDriver({ navigationError })
    mocks.createWebDriver.mockResolvedValue(driver)
    const provider = makeProvider()

    await expect(
      provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', { parallel: false }),
    ).rejects.toBe(navigationError)
    await provider.close()

    expect(driver.quit).toHaveBeenCalledOnce()
  })

  it('waits for in-flight WebDriver creation and quits a late driver during close', async () => {
    const creation = deferred<WebDriver>()
    const { driver } = makeDriver()
    mocks.createWebDriver.mockReturnValue(creation.promise)
    const provider = makeProvider()

    const opening = provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', { parallel: false })
    await vi.waitFor(() => expect(mocks.createWebDriver).toHaveBeenCalledOnce())

    const firstClose = provider.close()
    const secondClose = provider.close()
    creation.resolve(driver)

    await expect(opening).rejects.toThrow(/closed while creating/)
    await Promise.all([firstClose, secondClose])
    expect(driver.quit).toHaveBeenCalledOnce()
  })

  it('rejects a second open while WebDriver creation is in progress', async () => {
    const creation = deferred<WebDriver>()
    const { driver } = makeDriver()
    mocks.createWebDriver.mockReturnValue(creation.promise)
    const provider = makeProvider()

    const opening = provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', { parallel: false })
    await vi.waitFor(() => expect(mocks.createWebDriver).toHaveBeenCalledOnce())

    await expect(
      provider.openPage('other-session', 'http://127.0.0.1:7201/@vitest/', { parallel: false }),
    ).rejects.toThrow(/already has an active WebDriver session/)

    creation.resolve(driver)
    await opening
    await provider.close()
    expect(mocks.createWebDriver).toHaveBeenCalledOnce()
    expect(driver.quit).toHaveBeenCalledOnce()
  })

  it('allows transport routing fields without letting them replace runner-owned metadata', async () => {
    vi.stubEnv(
      CHILD_CONTEXT_ENV,
      JSON.stringify({
        schemaVersion: CHILD_CONTEXT_SCHEMA_VERSION,
        browserKey: 'ChromeHttps',
        browser: {
          platform: 'Windows',
          osVersion: '11',
          browserName: 'Chrome',
          useHttps: true,
        },
        buildName: 'runner-build',
        publicOrigin: 'https://example.test',
        useHttps: true,
        apiPort: 7_201,
        attempt: 'initial',
        queueManagedExternally: true,
        capabilities: {
          local: true,
          localIdentifier: 'transport-local',
          buildName: 'transport-build',
          bstackOptions: {
            projectName: 'transport-project',
            transportCustom: true,
          },
        },
      }),
    )
    const { driver } = makeDriver()
    mocks.createWebDriver.mockResolvedValue(driver)
    const provider = makeProvider({
      os: 'Windows',
      osVersion: '11',
      buildName: 'runner-build',
      projectName: 'runner-project',
      sessionName: 'runner-session',
      bstackOptions: { runnerCustom: true },
    })

    await provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', { parallel: false })

    const capabilities = mocks.createWebDriver.mock.calls[0]?.[0] as Record<string, unknown>
    expect(capabilities['bstack:options']).toMatchObject({
      os: 'Windows',
      osVersion: '11',
      buildName: 'runner-build',
      projectName: 'runner-project',
      sessionName: 'runner-session',
      local: true,
      localIdentifier: 'transport-local',
      runnerCustom: true,
      transportCustom: true,
    })
    await provider.close()
  })

  it('cancels a standalone queue wait when close is requested', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        parallel_sessions_max_allowed: 1,
        parallel_sessions_running: 1,
      }),
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = makeProvider(undefined, {
      checkQueue: true,
      queue: { pollInterval: 60_000 },
    })

    const opening = provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', {
      parallel: false,
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const closing = provider.close()

    await expect(opening).rejects.toThrow(/provider is closing/)
    await closing
    expect(mocks.createWebDriver).not.toHaveBeenCalled()
  })

  it('cancels the transport readiness delay immediately when close is requested', async () => {
    vi.stubEnv(
      CHILD_CONTEXT_ENV,
      JSON.stringify({
        schemaVersion: CHILD_CONTEXT_SCHEMA_VERSION,
        browserKey: 'ChromeHttps',
        browser: {
          platform: 'Windows',
          osVersion: '11',
          browserName: 'Chrome',
          useHttps: true,
        },
        buildName: 'runner-build',
        publicOrigin: 'https://example.test',
        useHttps: true,
        apiPort: 7_201,
        readyFile: '/tmp/broyster-not-ready',
        attempt: 'initial',
        queueManagedExternally: true,
      }),
    )
    const provider = makeProvider()
    const opening = provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/', {
      parallel: false,
    })
    await vi.waitFor(() => expect(mocks.access).toHaveBeenCalledOnce())

    const closing = provider.close()

    await expect(opening).rejects.toThrow(/provider is closing/)
    await closing
    expect(mocks.createWebDriver).not.toHaveBeenCalled()
  })
})
