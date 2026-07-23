import { describe, expect, it } from 'vitest'

import {
  buildBrowserStackCapabilities,
  mergeBrowserStackCapabilities,
  redactSecrets,
} from '../../src/core/capabilities.js'
import {
  BrowserStackCredentialsError,
  createSecretRedactor,
  getBrowserStackCredentials,
} from '../../src/core/credentials.js'

describe('BrowserStack credentials', () => {
  it('supports primary and legacy environment aliases', () => {
    expect(
      getBrowserStackCredentials({
        BROWSERSTACK_USERNAME: 'primary-user',
        BROWSERSTACK_ACCESS_KEY: 'primary-key',
        BROWSER_STACK_USERNAME: 'legacy-user',
        BROWSER_STACK_ACCESS_KEY: 'legacy-key',
      }),
    ).toEqual({ username: 'primary-user', accessKey: 'primary-key' })

    expect(
      getBrowserStackCredentials({
        BROWSER_STACK_USERNAME: 'legacy-user',
        BROWSER_STACK_ACCESS_KEY: 'legacy-key',
      }),
    ).toEqual({ username: 'legacy-user', accessKey: 'legacy-key' })
  })

  it('reports missing fields without including environment values', () => {
    expect(() => getBrowserStackCredentials({})).toThrow(BrowserStackCredentialsError)
  })

  it('ignores blank primary aliases and trims the selected credentials', () => {
    expect(
      getBrowserStackCredentials({
        BROWSERSTACK_USERNAME: '   ',
        BROWSERSTACK_ACCESS_KEY: '\t',
        BROWSER_STACK_USERNAME: ' legacy-user ',
        BROWSER_STACK_ACCESS_KEY: ' legacy-key ',
      }),
    ).toEqual({ username: 'legacy-user', accessKey: 'legacy-key' })
  })

  it('redacts overlapping secret values longest-first', () => {
    const redact = createSecretRedactor(['abc', 'abcdef'])
    expect(redact('key=abcdef user=abc')).toBe('key=[REDACTED] user=[REDACTED]')
  })
})

describe('BrowserStack capabilities', () => {
  it('preserves arbitrary W3C fields and only deep-merges bstack:options', () => {
    const merged = mergeBrowserStackCapabilities(
      {
        custom: { from: 'defaults' },
        'bstack:options': { os: 'Windows', networkLogs: true },
      },
      {
        custom: { from: 'browser' },
        'bstack:options': { osVersion: '11' },
      },
    )

    expect(merged).toEqual({
      custom: { from: 'browser' },
      'bstack:options': { os: 'Windows', networkLogs: true, osVersion: '11' },
    })
  })

  it('enforces runner metadata last without putting credentials in child capabilities', () => {
    const capabilities = buildBrowserStackCapabilities({
      browser: 'Chrome',
      shared: {
        webSocketUrl: true,
        'bstack:options': { projectName: 'wrong', idleTimeout: 120 },
      },
      browserCapabilities: {
        browserVersion: 'latest-beta',
        'bstack:options': { buildName: 'also-wrong' },
      },
      metadata: {
        projectName: 'project',
        buildName: 'build',
        sessionName: 'session',
      },
    })

    expect(capabilities).toMatchObject({
      browserName: 'chrome',
      browserVersion: 'latest-beta',
      webSocketUrl: true,
      'bstack:options': {
        projectName: 'project',
        buildName: 'build',
        sessionName: 'session',
        idleTimeout: 120,
      },
    })
    expect(JSON.stringify(capabilities)).not.toMatch(/userName|accessKey/)
  })

  it('rejects credentials supplied through raw capabilities', () => {
    expect(() =>
      buildBrowserStackCapabilities({
        browser: 'chrome',
        browserCapabilities: { 'bstack:options': { accessKey: 'must-not-enter-context' } },
        metadata: { projectName: 'project', buildName: 'build', sessionName: 'session' },
      }),
    ).toThrow(/must not contain BrowserStack credentials/)
  })

  it('redacts nested secrets without mutating the source', () => {
    const source = { nested: { accessKey: 'secret', ordinary: 'visible' }, token: 'tunnel-secret' }
    expect(redactSecrets(source)).toEqual({
      nested: { accessKey: '[REDACTED]', ordinary: 'visible' },
      token: '[REDACTED]',
    })
    expect(source.nested.accessKey).toBe('secret')
  })
})
