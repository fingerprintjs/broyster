/* eslint-disable max-len */
export type BrowserDef = {
  platform: string
  osVersion: string
  browserName: string
  browserVersion?: string
  useHttps: boolean
}

// Default BrowserStack browser matrix
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
  OSX15_Safari18: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Safari', browserVersion: '18', useHttps: false },
  OSX26_ChromeLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  OSX26_FirefoxLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Firefox', browserVersion: 'latest-beta', useHttps: true },
  OSX26_EdgeLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Edge', browserVersion: 'latest-beta', useHttps: true },
  OSX26_SafariLatest: { platform: 'OS X', osVersion: 'Tahoe', browserName: 'Safari', browserVersion: '26', useHttps: true },

  // Android
  Android16_ChromeLatest: { platform: 'Android', osVersion: '16.0', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  Android16_SamsungLatest: { platform: 'Android', osVersion: '16.0', browserName: 'Samsung', browserVersion: 'latest-beta', useHttps: true },

  // iOS
  iOS16_Safari: { platform: 'iOS', osVersion: '16', browserName: 'Safari', useHttps: true },
  iOS17_Safari: { platform: 'iOS', osVersion: '17', browserName: 'Safari', useHttps: true },
  iOS18_Safari: { platform: 'iOS', osVersion: '18', browserName: 'Safari', useHttps: true },
  iOS26_Safari: { platform: 'iOS', osVersion: '26', browserName: 'Safari', useHttps: true },
}

/**
 * Maps platform strings to BrowserStack bstack:options OS values.
 */
export function platformToOs(platform: string): { os: string; osVersion?: string } {
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
