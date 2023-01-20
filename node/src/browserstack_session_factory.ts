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
  private _idleTimeout: number

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
    this._idleTimeout = config.browserStack.idleTimeout ?? 60
    this._capsFactory = new CapabilitiesFactory(this._username, this._accessKey)
  }

  async tryCreateBrowser(browsers: CustomLauncher, attempt: number, log: Logger) {
    if (Array.isArray(browsers.deviceName)) {
      const device = browsers.deviceName[attempt]
      return await this.makeFromDevicesSet(browsers, device, log)
    }
    return await this.createBrowser(browsers, log)
  }

  private async makeFromDevicesSet(browsers: CustomLauncher, device: string, log: Logger) {
    try {
      log.info('creating session for ' + browsers.browserName + ' on ' + device)
      const launcher = Object.assign({}, browsers)
      launcher.deviceName = device
      const browser = await this.createBrowser(launcher, log)
      log.info('created succesfully')
      return browser
    } catch (err) {
      log.error('could not create session, trying next configuration')
      throw err
    }
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
      this._idleTimeout,
    )
    log.debug('created capabilities: ' + JSON.stringify(caps))
    const opts = OptionsBuilder.create(browser.browserName, browser.flags)
    log.debug('created options: ' + JSON.stringify(opts))
    if (browser.firefoxCapabilities) {
      log.debug('using firefox capabilities: ' + browser.firefoxCapabilities)
    }
    return WebDriverFactory.createFromOptions(opts, caps, browser.firefoxCapabilities)
  }
}

export function makeBrowserStackSessionFactory(config: ConfigOptions) {
  return new BrowserStackSessionFactory(config)
}
