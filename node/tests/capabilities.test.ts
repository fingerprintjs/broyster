import { describe, expect, it } from 'vitest'

import { buildCapabilities } from '../src/capabilities.js'

describe('buildCapabilities', () => {
  it('builds W3C capabilities with bstack:options', () => {
    const caps = buildCapabilities('Chrome', {
      os: 'Windows',
      osVersion: '11',
      browserVersion: 'latest-beta',
      buildName: 'build-1',
      projectName: 'Project',
    })

    expect(caps.browserName).toBe('chrome')
    expect(caps.browserVersion).toBe('latest-beta')
    expect(caps.acceptInsecureCerts).toBe(true)
    expect(caps['bstack:options']).toMatchObject({
      os: 'Windows',
      osVersion: '11',
      buildName: 'build-1',
      projectName: 'Project',
      local: false,
      idleTimeout: 300,
      acceptInsecureCerts: true,
    })
  })

  it('omits absent optional fields', () => {
    const caps = buildCapabilities('Safari')
    const bstackOptions = caps['bstack:options'] as Record<string, unknown>

    expect(caps).not.toHaveProperty('browserVersion')
    expect(bstackOptions).not.toHaveProperty('os')
    expect(bstackOptions).not.toHaveProperty('deviceName')
    expect(bstackOptions).not.toHaveProperty('localIdentifier')
  })

  it('passes local tunnel settings through', () => {
    const caps = buildCapabilities('Chrome', { local: true, localIdentifier: 'tunnel-1' })

    expect(caps['bstack:options']).toMatchObject({ local: true, localIdentifier: 'tunnel-1' })
  })

  it('enables network log content capture only when network logs are on', () => {
    const withLogs = buildCapabilities('Chrome', { networkLogs: true })
    const withoutLogs = buildCapabilities('Chrome', { networkLogs: false })

    expect(withLogs['bstack:options']).toMatchObject({
      networkLogs: true,
      networkLogsOptions: { captureContent: 'true' },
    })
    expect(withoutLogs['bstack:options']).toMatchObject({ networkLogs: false })
    expect(withoutLogs['bstack:options']).not.toHaveProperty('networkLogsOptions')
  })

  it('lets raw bstackOptions override computed fields', () => {
    const caps = buildCapabilities('Chrome', { idleTimeoutSeconds: 100, bstackOptions: { idleTimeout: 42 } })

    expect((caps['bstack:options'] as Record<string, unknown>).idleTimeout).toBe(42)
  })

  it('respects acceptInsecureCerts=false', () => {
    const caps = buildCapabilities('Chrome', { acceptInsecureCerts: false })

    expect(caps.acceptInsecureCerts).toBe(false)
    expect((caps['bstack:options'] as Record<string, unknown>).acceptInsecureCerts).toBe(false)
  })
})
