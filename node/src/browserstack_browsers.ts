import { Browser } from 'browserstack'
import { Logger } from './karma_logger'
import { BrowserStackCredentials, getBrowsers } from './browserstack_helpers'

/**
 * Loads and caches the list of browsers supported by BrowserStack
 */
export class BrowserStackBrowsers {
  private _allBrowsersPromise?: Promise<Browser[]>
  constructor(private _credentials: BrowserStackCredentials) {}

  public async getIOSDevices(
    osVersion: string | null,
    deviceType: 'iphone' | 'ipad' | null,
    browserType: 'safari' | 'chrome' | null,
    realDevices: boolean | null,
    log: Logger,
  ): Promise<Browser[]> {
    const allBrowsers = await this.getAllBrowsers(log)
    return allBrowsers.filter(
      (browser) =>
        browser.os === 'ios' &&
        ignoreNullExpected(doesOSVersionMatch, browser, osVersion) &&
        ignoreNullExpected(doesDeviceTypeMatch, browser, deviceType) &&
        ignoreNullExpected(doesIOSBrowserTypeMatch, browser, browserType) &&
        ignoreNullExpected(doesRealDeviceMatch, browser, realDevices),
    )
  }

  public async getAndroidDevices(
    osVersion: string | null,
    browserType: 'chrome' | 'samsung' | null,
    realDevices: boolean | null,
    log: Logger,
  ): Promise<Browser[]> {
    const allBrowsers = await this.getAllBrowsers(log)
    return allBrowsers.filter(
      (browser) =>
        browser.os === 'android' &&
        ignoreNullExpected(doesOSVersionMatch, browser, osVersion) &&
        ignoreNullExpected(doesAndroidBrowserTypeMatch, browser, browserType) &&
        ignoreNullExpected(doesRealDeviceMatch, browser, realDevices),
    )
  }

  private async getAllBrowsers(log: Logger) {
    this._allBrowsersPromise ??= getBrowsers(this._credentials, log)
    return await this._allBrowsersPromise
  }
}

export function makeBrowserStackBrowsers(browserStackCredentials: BrowserStackCredentials): BrowserStackBrowsers {
  return new BrowserStackBrowsers(browserStackCredentials)
}

function doesOSVersionMatch(browser: Browser, expectedOSVersion: string) {
  return (
    // Direct match
    browser.os_version === expectedOSVersion ||
    // Beta version match
    (browser.os_version.startsWith(expectedOSVersion) &&
      /^[ \-_]beta$/i.test(browser.os_version.slice(expectedOSVersion.length)))
  )
}

function doesDeviceTypeMatch(browser: Browser, expectedDeviceType: string) {
  return browser.device?.slice(0, expectedDeviceType.length).toLowerCase() === expectedDeviceType.toLowerCase()
}

function doesRealDeviceMatch(browser: Browser, expectedRealDevice: boolean) {
  return browser.real_mobile === expectedRealDevice
}

function doesIOSBrowserTypeMatch(browser: Browser, expectedBrowserType: 'safari' | 'chrome') {
  if (expectedBrowserType === 'safari') {
    return browser.browser === 'iphone' || browser.browser === 'ipad'
  } else if (expectedBrowserType === 'chrome') {
    // The browser name accepted by BrowserStack is "Chrome" despite returning "chromium" from /automate/browsers.json
    return browser.browser === 'chromium'
  } else {
    return browser.browser === expectedBrowserType
  }
}

function doesAndroidBrowserTypeMatch(browser: Browser, expectedBrowserType: 'chrome' | 'samsung') {
  if (expectedBrowserType === 'chrome') {
    return browser.browser === 'android'
  } else {
    return browser.browser === expectedBrowserType
  }
}

function ignoreNullExpected<T>(
  criterion: (browser: Browser, expected: T) => boolean,
  browser: Browser,
  expected: T | null,
): boolean {
  if (expected === null) {
    return true
  }
  return criterion(browser, expected)
}
