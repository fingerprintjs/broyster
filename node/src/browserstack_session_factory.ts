import { ConfigOptions } from 'karma'
import { CapabilitiesFactory, makeCapabilitiesFactory } from './capabilities_factory'
import { CustomLauncher } from 'karma'
import { Logger } from './karma_logger'
import { OptionsBuilder } from './options_builder'
import { WebDriverFactory } from './webdriver_factory'
import { ThenableWebDriver } from 'selenium-webdriver'
import { getBrowserStackAccessKey, getBrowserStackUserName } from './browserstack_helpers'

export interface BrowserStackSessionFactoryConfig {
  project: string
  build: string
  idleTimeout?: number
  capabilitiesFactory: CapabilitiesFactory
}

export class BrowserStackSessionFactory {
  private _project: string
  private _build: string
  private _capsFactory: CapabilitiesFactory
  private _idleTimeout: number

  constructor(config: BrowserStackSessionFactoryConfig) {
    this._project = config.project
    this._build = config.build
    this._idleTimeout = config.idleTimeout ?? 60_000
    this._capsFactory = config.capabilitiesFactory
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

export function makeBrowserStackSessionFactory(config: ConfigOptions): BrowserStackSessionFactory {
  if (!config.browserStack) {
    throw new Error('BrowserStack options are not set')
  }

  const username = getBrowserStackUserName()
  const accessKey = getBrowserStackAccessKey()

  const capabilitiesFactory = makeCapabilitiesFactory(username, accessKey, true)

  return new BrowserStackSessionFactory({
    capabilitiesFactory,
    project: config.browserStack.project,
    build: config.browserStack.build.toString(),
    idleTimeout: config.browserStack.idleTimeout,
  })
}
