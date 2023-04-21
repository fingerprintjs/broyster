import { ConfigOptions } from 'karma'
import { CapabilitiesFactory } from './capabilities_factory'
import { CustomLauncher } from 'karma'
import { Logger } from './karma_logger'
import { OptionsBuilder } from './options_builder'
import { WebDriverFactory } from './webdriver_factory'
import { getBrowserStackUserName, getBrowserStackAccessKey } from './browserstack_helpers'
import { ThenableWebDriver } from 'selenium-webdriver'
import { env } from 'process'

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
    this._username = getBrowserStackUserName()
    this._accessKey = getBrowserStackAccessKey()
    this._project = config.browserStack.project
    this._build = config.browserStack.build.toString()
    this._idleTimeout = config.browserStack.idleTimeout ?? 60_000
    this._capsFactory = new CapabilitiesFactory(this._username, this._accessKey)
  }

  tryCreateBrowser(
    browsers: CustomLauncher,
    id: string,
    attempt: number,
    log: Logger,
  ): [driver: ThenableWebDriver, name: string | null] {
    if (Array.isArray(browsers.deviceName)) {
      const device = browsers.deviceName[attempt % browsers.deviceName.length]
      return [this.makeFromDevicesSet(browsers, id, device, log), device]
    }
    return [this.createBrowser(browsers, id, log), null]
  }

  private makeFromDevicesSet(browsers: CustomLauncher, id: string, device: string, log: Logger): ThenableWebDriver {
    const name = browsers.browserName + ' on ' + device + ' for ' + browsers.platform + ' ' + browsers.osVersion
    try {
      log.info('creating session for ' + name)
      const launcher = Object.assign({}, browsers)
      launcher.deviceName = device
      const browser = this.createBrowser(launcher, id, log)
      log.info(name + ' created succesfully')
      return browser
    } catch (err) {
      log.error('could not create session for ' + name + ', trying next configuration')
      throw err
    }
  }

  private createBrowser(browser: CustomLauncher, id: string, log: Logger): ThenableWebDriver {
    const caps = this._capsFactory.create(
      browser.browserName,
      this._build,
      id,
      this._project,
      browser.deviceName as string,
      browser.platform,
      this._idleTimeout,
      browser.osVersion,
      browser.browserVersion,
      'whatever',
    )
    log.error('created capabilities: ' + JSON.stringify(caps))
    const opts = OptionsBuilder.create(browser.browserName, browser.flags)
    log.debug('created options: ' + JSON.stringify(opts))
    if (browser.firefoxCapabilities) {
      log.debug('using firefox capabilities: ' + browser.firefoxCapabilities)
    }
    return WebDriverFactory.createFromOptions(opts, caps, browser.firefoxCapabilities)
  }
}

export function makeBrowserStackSessionFactory(config: ConfigOptions): BrowserStackSessionFactory {
  return new BrowserStackSessionFactory(config)
}
