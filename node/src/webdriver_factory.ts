import * as edge from 'selenium-webdriver/edge'
import * as firefox from 'selenium-webdriver/firefox'
import * as safari from 'selenium-webdriver/safari'
import * as chrome from 'selenium-webdriver/chrome'
import * as webdriver from 'selenium-webdriver'
import { BrowserStackSessionCapabilities } from './browserstack_session_capabilities'
import { SauceLabsSessionCapabilities } from './saucelabs_session_capabilities'
import { SauceLabsCredentials } from './saucelabs_helpers'

export type FirefoxProfile = ReadonlyArray<readonly [string, string | number | boolean]>

export class WebDriverFactory {
  private static browserStackUrl = 'https://hub-cloud.browserstack.com/wd/hub'
  private static sauceLabsUrl = ''

  static makeSauceLabsUrl(credentials: SauceLabsCredentials) {
    this.sauceLabsUrl = `https://${credentials.username}:${credentials.accessKey}@${credentials.region}.com:443/wd/hub`
  }

  static createFromOptions(
    options: chrome.Options | firefox.Options | safari.Options | edge.Options,
    sessionCapabilities: BrowserStackSessionCapabilities | SauceLabsSessionCapabilities,
    firefoxProfile?: FirefoxProfile,
  ) {
    const url = 'bstack:options' in sessionCapabilities ? this.browserStackUrl : this.sauceLabsUrl
    const builder = new webdriver.Builder().usingServer(url)
    switch (options.getBrowserName()?.toLowerCase()) {
      case 'firefox': {
        const firefoxOptions = options as firefox.Options

        if (firefoxProfile) {
          for (let index = 0; index < firefoxProfile.length; index++) {
            const preference = firefoxProfile[index]
            firefoxOptions.setPreference(preference[0], preference[1])
          }
        }

        builder.setFirefoxOptions(firefoxOptions)
        break
      }
      case 'edge': {
        builder.setEdgeOptions(options as edge.Options)
        break
      }
      case 'chrome': {
        builder.setChromeOptions(options as chrome.Options)
        break
      }
      case 'safari': {
        builder.setSafariOptions(options as safari.Options)
        break
      }
    }
    const driver = builder.withCapabilities(sessionCapabilities).build()
    return driver
  }
}
