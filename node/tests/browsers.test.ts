import { describe, expect, it } from 'vitest'

import { browserstackBrowsers, platformToOs } from '../src/browsers.js'

describe('browserstackBrowsers catalog', () => {
  it('gives every mobile entry a device name', () => {
    for (const [key, def] of Object.entries(browserstackBrowsers)) {
      if (def.platform === 'iOS' || def.platform === 'Android') {
        expect(def.deviceName, `catalog entry ${key}`).toBeTruthy()
      }
    }
  })

  it('contains at least one HTTP-only browser and one HTTPS browser', () => {
    const defs = Object.values(browserstackBrowsers)
    expect(defs.some((def) => def.useHttps)).toBe(true)
    expect(defs.some((def) => !def.useHttps)).toBe(true)
  })
})

describe('platformToOs', () => {
  it.each([
    ['Windows', 'Windows'],
    ['OS X', 'OS X'],
    ['Android', 'android'],
    ['iOS', 'ios'],
    ['Linux', 'Linux'],
  ])('maps %s to %s', (platform, os) => {
    expect(platformToOs(platform)).toEqual({ os })
  })
})
