import { describe, expect, it } from 'vitest'

import { fingerprintBrowserPreset } from '../../src/presets/fingerprint.js'

describe('fingerprintBrowserPreset', () => {
  it('contains the active 17-browser POC matrix', () => {
    const browsers = fingerprintBrowserPreset()
    expect(Object.keys(browsers)).toHaveLength(17)
    expect(browsers.OSX15_Safari18?.protocol).toBe('http')
    expect(browsers.iOS26_Safari?.capabilities?.['bstack:options']).toMatchObject({
      os: 'ios',
      osVersion: '26',
      deviceName: 'iPhone 17',
    })
  })

  it('can select latest-beta browser entries and returns fresh data', () => {
    const beta = fingerprintBrowserPreset({ channel: 'beta' })
    expect(Object.keys(beta)).toHaveLength(8)
    expect(Object.values(beta).every((browser) => browser.capabilities?.browserVersion === 'latest-beta')).toBe(true)

    const first = fingerprintBrowserPreset()
    const second = fingerprintBrowserPreset()
    expect(first).not.toBe(second)
    expect(first.Windows11_ChromeLatest?.capabilities).not.toBe(second.Windows11_ChromeLatest?.capabilities)
  })
})
