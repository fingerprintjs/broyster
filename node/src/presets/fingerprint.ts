import type { BrowserDefinition, BrowserDefinitions, BrowserStackCapabilities } from '../core/types.js'

export interface FingerprintBrowserPresetOptions {
  readonly channel?: 'all' | 'beta'
}

interface FingerprintBrowserDefinition extends BrowserDefinition {
  readonly capabilities: BrowserStackCapabilities
}

const fingerprintBrowsers = {
  Windows10_Chrome100: browser('chrome', 'https', 'Windows', '10', '100'),
  Windows11_ChromeLatest: browser('chrome', 'https', 'Windows', '11', 'latest-beta'),
  Windows10_Firefox115: browser('firefox', 'https', 'Windows', '10', '115'),
  Windows11_FirefoxLatest: browser('firefox', 'https', 'Windows', '11', 'latest-beta'),
  Windows10_Edge105: browser('edge', 'https', 'Windows', '10', '105'),
  Windows11_EdgeLatest: browser('edge', 'https', 'Windows', '11', 'latest-beta'),
  OSX15_Safari18: browser('safari', 'http', 'OS X', 'Sequoia', '18'),
  OSX26_ChromeLatest: browser('chrome', 'https', 'OS X', 'Tahoe', 'latest-beta'),
  OSX26_FirefoxLatest: browser('firefox', 'https', 'OS X', 'Tahoe', 'latest-beta'),
  OSX26_EdgeLatest: browser('edge', 'https', 'OS X', 'Tahoe', 'latest-beta'),
  OSX26_SafariLatest: browser('safari', 'https', 'OS X', 'Tahoe', '26'),
  Android16_ChromeLatest: browser('chrome', 'https', 'android', '16.0', 'latest-beta', 'Samsung Galaxy S26 Ultra'),
  Android16_SamsungLatest: browser('samsung', 'https', 'android', '16.0', 'latest-beta', 'Samsung Galaxy S26 Ultra'),
  iOS16_Safari: browser('safari', 'https', 'ios', '16', undefined, 'iPhone 14'),
  iOS17_Safari: browser('safari', 'https', 'ios', '17', undefined, 'iPhone 15'),
  iOS18_Safari: browser('safari', 'https', 'ios', '18', undefined, 'iPhone 15'),
  iOS26_Safari: browser('safari', 'https', 'ios', '26', undefined, 'iPhone 17'),
} as const satisfies Readonly<Record<string, FingerprintBrowserDefinition>>

export type FingerprintBrowserId = keyof typeof fingerprintBrowsers

export function fingerprintBrowserPreset(options: FingerprintBrowserPresetOptions = {}): BrowserDefinitions {
  const channel = options.channel ?? 'all'
  if (channel !== 'all' && channel !== 'beta') {
    throw new Error(`Unknown Fingerprint browser preset channel "${String(channel)}".`)
  }

  return Object.fromEntries(
    Object.entries(fingerprintBrowsers)
      .filter(([, definition]) => channel === 'all' || definition.capabilities.browserVersion === 'latest-beta')
      .map(([id, definition]) => [id, cloneDefinition(id, definition)]),
  )
}

function browser(
  browserName: string,
  protocol: 'http' | 'https',
  os: string,
  osVersion: string,
  browserVersion?: string,
  deviceName?: string,
): FingerprintBrowserDefinition {
  return {
    browser: browserName,
    protocol,
    capabilities: {
      ...(browserVersion !== undefined && { browserVersion }),
      'bstack:options': {
        os,
        osVersion,
        ...(deviceName !== undefined && { deviceName }),
      },
    },
  }
}

function cloneDefinition(id: string, definition: FingerprintBrowserDefinition): BrowserDefinition {
  return {
    browser: definition.browser,
    name: id.replace(/_/g, ' '),
    protocol: definition.protocol,
    capabilities: {
      ...definition.capabilities,
      'bstack:options': { ...(definition.capabilities['bstack:options'] ?? {}) },
    },
  }
}
