import { ConfigOptions } from 'karma'
import { CapabilitiesFactory } from './capabilities_factory'
import { CustomLauncher } from 'karma'
import { Logger } from './karma_logger'
import { OptionsBuilder } from './options_builder'
import { WebDriverFactory } from './webdriver_factory'

export class BrowserStackSessionFactory {
  private _username: string
  private _accessKey: string
  private _project: string
  private _build: string
  private _capsFactory: CapabilitiesFactory
  private _maxDeviceRetries: number

  constructor(config: ConfigOptions) {
    if (!config.browserStack) {
      throw new Error('BrowserStack options are not set')
    }
    this._username =
      process.env.BROWSERSTACK_USERNAME ||
      process.env.BROWSER_STACK_USERNAME ||
      (() => {
        throw new Error('BrowserStack username is empty')
      })()
    this._accessKey =
      process.env.BROWSERSTACK_ACCESS_KEY ||
      process.env.BROWSER_STACK_ACCESS_KEY ||
      (() => {
        throw new Error('BrowserStack access key is empty')
      })()
    this._project = config.browserStack.project
    this._build = config.browserStack.build.toString()
    this._maxDeviceRetries = config.retryLimit || 1
    this._capsFactory = new CapabilitiesFactory(this._username, this._accessKey)
  }

  async tryCreateBrowser(browsers: CustomLauncher, log: Logger) {
    if (browsers.deviceName) {
      return await this.makeFromDeviceName(browsers, log)
    }
    return await this.createBrowser(browsers, log)
  }

  private async makeFromDeviceName(browsers: CustomLauncher, log: Logger) {
    const devices = []
    const names = Array.isArray(browsers.deviceName) ? browsers.deviceName : [browsers.deviceName]
    for (let index = 0; index < this._maxDeviceRetries; index += 0) {
      for (const name of names) {
        devices.push(name)
        index++
      }
    }
    for (const device of devices) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configuration: any = {}
      Object.keys(browsers).forEach((key) => {
        if (key === 'deviceName') {
          configuration[key] = device
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          configuration[key] = (browsers as any)[key]
        }
      })
      try {
        log.info('creating session for ' + browsers.browserName + ' on ' + device)
        const browser = this.createBrowser(configuration, log)
        log.info('created succesfully')
        return browser
      } catch (err) {
        log.error('could not create session, trying next configuration')
        log.error((err as Error) ?? String(err))
        await new Promise((r) => setTimeout(r, 5_000))
      }
    }
    throw new Error('Could not create browser for configuration: ' + JSON.stringify(browsers))
  }

  private async createBrowser(browser: CustomLauncher, log: Logger) {
    const caps = this._capsFactory.create(
      browser.browserName,
      this._build,
      this._build,
      this._project,
      browser.deviceName as string,
      browser.platform,
      browser.osVersion,
      browser.browserVersion,
    )
    log.debug('created capabilities: ' + JSON.stringify(caps))
    const opts = OptionsBuilder.create(browser.browserName, browser.flags)
    log.debug('created options: ' + JSON.stringify(opts))
    if (browser.firefoxCapabilities) {
      log.debug('using firefox capabilities: ' + browser.firefoxCapabilities)
    }
    return WebDriverFactory.createFromOptions(opts, caps, log, browser.firefoxCapabilities)
  }
}

export function makeBrowserStackSessionFactory(config: ConfigOptions) {
  return new BrowserStackSessionFactory(config)
}
