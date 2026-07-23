import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WebDriver } from 'selenium-webdriver'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TestProject } from 'vitest/node'

import { BrowserStackProvider, rewritePublicUrl } from '../../src/vitest/provider.js'
import { BrowserStackRuntime } from '../../src/vitest/runtime.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('rewritePublicUrl', () => {
  it('replaces the origin, prefixes the public base path, and preserves the local path and query', () => {
    expect(
      rewritePublicUrl(
        'http://127.0.0.1:7201/@vitest/browser/?sessionId=abc#frame',
        'https://browser.example.test/tunnel/',
      ),
    ).toBe('https://browser.example.test/tunnel/@vitest/browser/?sessionId=abc#frame')
  })

  it('does not retain query or hash data from the configured public base URL', () => {
    expect(
      rewritePublicUrl('http://127.0.0.1:7201/tests?local=1', 'https://browser.example.test/base?secret=no#old'),
    ).toBe('https://browser.example.test/base/tests?local=1')
  })
})

describe('BrowserStackProvider', () => {
  it('records the remote session, navigates through the public URL, and closes idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'broyster-provider-'))
    temporaryDirectories.push(directory)
    const readinessFile = join(directory, 'ready')
    const sessionFile = join(directory, 'session.json')
    await writeFile(readinessFile, '')
    vi.stubEnv('BROWSERSTACK_USERNAME', 'username')
    vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'access-key')

    const navigate = vi.fn(async () => undefined)
    const quit = vi.fn(async () => undefined)
    const driver = {
      getSession: async () => ({ getId: () => 'session-123' }),
      get: navigate,
      getTitle: async () => 'Vitest',
      quit,
    } as unknown as WebDriver
    const createWebDriver = vi.fn(async () => driver)
    const runtime = new BrowserStackRuntime()
    const provider = new BrowserStackProvider({ name: 'chrome-latest' } as TestProject, {
      capabilities: { browserName: 'chrome' },
      publicBaseUrl: 'https://browser.example.test/base',
      readinessFile,
      hubUrl: 'https://hub-cloud.browserstack.com/wd/hub',
      heartbeatIntervalMs: 60_000,
      sessionTarget: {
        file: sessionFile,
        runId: 'run-1',
        browserId: 'chrome-latest',
        attempt: { number: 1, kind: 'initial' },
      },
      runtime,
      createWebDriver,
    })

    await provider.openPage('vitest-session', 'http://127.0.0.1:7201/@vitest/?sessionId=abc', {
      parallel: false,
    })
    await Promise.all([provider.close(), provider.close()])

    expect(createWebDriver).toHaveBeenCalledWith(
      { browserName: 'chrome' },
      { username: 'username', accessKey: 'access-key' },
      'https://hub-cloud.browserstack.com/wd/hub',
    )
    expect(runtime.getSession('chrome-latest')).toEqual({
      projectName: 'chrome-latest',
      sessionId: 'session-123',
    })
    expect(JSON.parse(await readFile(sessionFile, 'utf8'))).toEqual({
      schemaVersion: 1,
      runId: 'run-1',
      browserId: 'chrome-latest',
      attempt: { number: 1, kind: 'initial' },
      sessionId: 'session-123',
    })
    expect(navigate).toHaveBeenCalledWith('https://browser.example.test/base/@vitest/?sessionId=abc')
    expect(quit).toHaveBeenCalledOnce()
  })
})
