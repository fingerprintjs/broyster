import * as edge from 'selenium-webdriver/edge'
import * as firefox from 'selenium-webdriver/firefox'
import * as safari from 'selenium-webdriver/safari'
import * as chrome from 'selenium-webdriver/chrome'
import * as webdriver from 'selenium-webdriver'
import { BrowserStackSessionCapabilities } from './browserstack_session_capabilities'

export type FirefoxProfile = ReadonlyArray<readonly [string, string | number | boolean]>

export class WebDriverFactory {
  private static browserStackUrl = 'https://hub-cloud.browserstack.com/wd/hub'

  static async createFromOptions(
    options: chrome.Options | firefox.Options | safari.Options | edge.Options,
    sessionCapabilities: BrowserStackSessionCapabilities,
    firefoxProfile?: FirefoxProfile,
  ) {
    const url = this.browserStackUrl
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
    const driver = await builder.withCapabilities(sessionCapabilities).build()
    return driver
  }
}
