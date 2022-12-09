import * as edge from 'selenium-webdriver/edge'
import * as ie from 'selenium-webdriver/ie'
import * as firefox from 'selenium-webdriver/firefox'
import * as safari from 'selenium-webdriver/safari'
import * as chrome from 'selenium-webdriver/chrome'
import * as webdriver from 'selenium-webdriver'
import { SessionCapabilities } from './session_capabilities'
import { Logger } from './karma_logger'

export class WebDriverFactory {
  private static url = 'https://hub-cloud.browserstack.com/wd/hub'

  static createFromOptions(
    options: chrome.Options | firefox.Options | safari.Options | edge.Options | ie.Options,
    browserStack: SessionCapabilities,
    log: Logger,
    firefoxProfile?: Array<[string, string | number | boolean]>,
  ) {
    const builder = new webdriver.Builder().usingServer(this.url)
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
      case 'ie': {
        builder.setIeOptions(options as ie.Options)
        break
      }
    }
    for (let i = 0; i < 3; i++) {
      try {
        // possibly could let us capture the error we're getting creating sessions where it
        // auto retries and hides the exception
        return builder.withCapabilities(browserStack).build()
      } catch (err) {
        log.error((err as Error) ?? String(err))
        setTimeout(() => {
          log.debug('failed to create session, waiting for new attempt')
        }, 5000)
      }
    }
    return builder.withCapabilities(browserStack).build() // 4th time's the charm?
  }
}
