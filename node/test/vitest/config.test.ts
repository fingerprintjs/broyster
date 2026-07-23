import { describe, expect, it } from 'vitest'

import { createBrowserStackVitestConfig } from '../../src/vitest/config.js'
import type { BrowserStackRunContext } from '../../src/vitest/run_context.js'

describe('createBrowserStackVitestConfig', () => {
  it('binds the browser API to the exact transport slot port', () => {
    const config = createBrowserStackVitestConfig({}, createContext())

    expect(config.test?.browser?.api).toEqual({
      port: 7_201,
      strictPort: true,
    })
  })
})

function createContext(): BrowserStackRunContext {
  return {
    schemaVersion: 1,
    run: {
      id: 'run-id',
      projectName: 'project',
      buildName: 'build',
    },
    browser: {
      id: 'chrome',
      name: 'Chrome',
      browser: 'chrome',
      capabilities: {},
    },
    slot: {
      publicUrl: 'https://browser.example.test',
      localPort: 7_201,
      protocol: 'https',
    },
    browserStack: {
      hubUrl: 'https://hub-cloud.browserstack.com/wd/hub',
      apiBaseUrl: 'https://api.browserstack.com/automate',
    },
    apiPort: 7_201,
    providerConnectTimeoutMs: 120_000,
    attempt: {
      number: 1,
      kind: 'initial',
    },
    resultFile: '/tmp/result.json',
    readinessFile: '/tmp/ready',
    sessionFile: '/tmp/session.json',
  }
}
