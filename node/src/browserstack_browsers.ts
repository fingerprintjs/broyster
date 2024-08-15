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
    browserType: 'safari' | 'chromium' | null,
    realDevices: boolean | null,
    log: Logger,
  ): Promise<Browser[]> {
    const allBrowsers = await this.getAllBrowsers(log)
    return allBrowsers.filter((browser) => {
      if (browser.os !== 'ios') {
        return false
      }
      if (osVersion !== null && browser.os_version !== osVersion) {
        return false
      }
      if (deviceType !== null && browser.device?.slice(0, deviceType.length).toLowerCase() !== deviceType) {
        return false
      }
      if (browserType === 'safari' && browser.browser !== 'iphone' && browser.browser !== 'ipad') {
        return false
      }
      if (browserType === 'chromium' && browser.browser !== 'chromium') {
        return false
      }
      if (realDevices !== null && !!browser.real_mobile !== realDevices) {
        return false
      }
      return true
    })
  }

  /*public async getAndroidDeviceNames() {

  }*/

  private async getAllBrowsers(log: Logger) {
    this._allBrowsersPromise ??= getBrowsers(this._credentials, log)
    return await this._allBrowsersPromise
  }
}

export function makeBrowserStackBrowsers(browserStackCredentials: BrowserStackCredentials): BrowserStackBrowsers {
  return new BrowserStackBrowsers(browserStackCredentials)
}
