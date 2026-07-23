/* eslint-disable max-len */
/**
 * Default BrowserStack browser matrix used by Fingerprint projects.
 * Consumers can pass their own map to the configurator / orchestrator.
 */

export type BrowserDef = {
  platform: string
  osVersion: string
  browserName: string
  browserVersion?: string
  useHttps: boolean
  deviceType?: 'iPhone' | 'iPad'
}

// prettier-ignore
export const browserstackBrowsers: Record<string, BrowserDef> = {
  // Windows
  Windows10_Chrome100: { platform: 'Windows', osVersion: '10', browserName: 'Chrome', browserVersion: '100', useHttps: true },
  Windows11_ChromeLatest: { platform: 'Windows', osVersion: '11', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  Windows10_Firefox115: { platform: 'Windows', osVersion: '10', browserName: 'Firefox', browserVersion: '115', useHttps: true },
  Windows11_FirefoxLatest: { platform: 'Windows', osVersion: '11', browserName: 'Firefox', browserVersion: 'latest-beta', useHttps: true },
  Windows10_Edge105: { platform: 'Windows', osVersion: '10', browserName: 'Edge', browserVersion: '105', useHttps: true },
  Windows11_EdgeLatest: { platform: 'Windows', osVersion: '11', browserName: 'Edge', browserVersion: 'latest-beta', useHttps: true },

  // macOS
  // Safari over self-signed HTTPS does not complete Vitest browser WebSocket handshake on BrowserStack.
  // Use HTTP with BrowserStack Local (bs-local.com); use public-url + trusted certs for HTTPS Safari.
  OSX15_Safari18: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Safari', browserVersion: '18', useHttps: false },
  OSX26_ChromeLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  OSX26_FirefoxLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Firefox', browserVersion: 'latest-beta', useHttps: true },
  OSX26_EdgeLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Edge', browserVersion: 'latest-beta', useHttps: true },
  OSX26_SafariLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Safari', browserVersion: '26', useHttps: false },

  // Android
  Android16_ChromeLatest: { platform: 'Android', osVersion: '16.0', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  Android16_SamsungLatest: { platform: 'Android', osVersion: '16.0', browserName: 'Samsung', browserVersion: 'latest-beta', useHttps: true },

  // iOS — same Safari/self-signed HTTPS limitation as desktop Safari
  iOS16_Safari: { platform: 'iOS', osVersion: '16', browserName: 'Safari', useHttps: false },
  iOS17_Safari: { platform: 'iOS', osVersion: '17', browserName: 'Safari', useHttps: false },
  iOS18_Safari: { platform: 'iOS', osVersion: '18', browserName: 'Safari', useHttps: false },
  iOS26_Safari: { platform: 'iOS', osVersion: '26', browserName: 'Safari', useHttps: false },
}

export function filterBetaBrowsers(browsers: Record<string, BrowserDef>): Record<string, BrowserDef> {
  return Object.fromEntries(
    Object.entries(browsers).filter(([, def]) => def.browserVersion && /beta/i.test(def.browserVersion)),
  )
}

/**
 * Maps platform strings from broyster config to BrowserStack bstack:options OS values.
 */
export function platformToOs(platform: string): { os: string } {
  switch (platform) {
    case 'Windows':
      return { os: 'Windows' }
    case 'OS X':
      return { os: 'OS X' }
    case 'Android':
      return { os: 'android' }
    case 'iOS':
      return { os: 'ios' }
    default:
      return { os: platform }
  }
}

/**
 * Best-effort default device names for mobile BrowserStack sessions.
 * Override via capabilities.deviceName when you need a specific device.
 */
export function resolveDeviceName(def: BrowserDef): string | undefined {
  if (def.platform === 'iOS') {
    const ver = Number.parseInt(def.osVersion, 10)
    if (ver >= 26) {
      return 'iPhone 17'
    }
    if (ver >= 17) {
      return 'iPhone 15'
    }
    if (ver >= 16) {
      return 'iPhone 14'
    }
    return 'iPhone 13'
  }
  if (def.platform === 'Android') {
    return 'Samsung Galaxy S24'
  }
  return undefined
}
