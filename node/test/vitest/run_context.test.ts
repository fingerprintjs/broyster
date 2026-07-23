import { describe, expect, it } from 'vitest'

import { parseBrowserStackRunContext } from '../../src/vitest/run_context.js'

function makeContext(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    run: { id: 'run-1', projectName: 'example', buildName: 'build-1' },
    browser: {
      id: 'chrome-latest',
      name: 'Chrome latest',
      browser: 'chrome',
      capabilities: { browserName: 'chrome', 'bstack:options': { os: 'Windows' } },
    },
    slot: { publicUrl: 'https://browser.example.test', localPort: 7_201, protocol: 'https' },
    browserStack: {
      hubUrl: 'https://hub-cloud.browserstack.com/wd/hub',
      apiBaseUrl: 'https://api.browserstack.com/automate',
    },
    apiPort: 7_201,
    providerConnectTimeoutMs: 120_000,
    attempt: { number: 1, kind: 'initial' },
    resultFile: '/tmp/broyster-result.json',
    readinessFile: '/tmp/broyster-ready',
    sessionFile: '/tmp/broyster-session.json',
  }
}

describe('parseBrowserStackRunContext', () => {
  it('accepts and normalizes a sanitized runner context', () => {
    const context = parseBrowserStackRunContext(makeContext())

    expect(context).toMatchObject({
      schemaVersion: 1,
      browser: { id: 'chrome-latest', capabilities: { browserName: 'chrome' } },
      slot: { publicUrl: 'https://browser.example.test/', localPort: 7_201 },
      apiPort: 7_201,
    })
  })

  it('rejects BrowserStack credentials embedded in capabilities', () => {
    const context = makeContext()
    const browser = context.browser as Record<string, unknown>
    browser.capabilities = { 'bstack:options': { accessKey: 'must-not-be-serialized' } }

    expect(() => parseBrowserStackRunContext(context)).toThrow(/credentials must not be stored/i)
  })

  it('rejects a tunnel slot that does not target the Vitest API port', () => {
    const context = makeContext()
    context.apiPort = 7_202

    expect(() => parseBrowserStackRunContext(context)).toThrow(/slot\.localPort must match/i)
  })
})
