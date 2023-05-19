function tryCreateBrowser(
  launcher: CustomLauncher,
  _name: string,
  _arg2: number,
  _logger: FakeLogger,
): ThenableWebDriver {
  const capabilities = create(launcher.browserName, 'saucedemo', 'whatever', launcher.osVersion!, 'dev', 'browsers')
  return new webdriver.Builder()
    .usingServer(
      `https://zbieramspamsony:74a6ed7b-eace-45d2-9d1e-2aae94a22c8c@ondemand.eu-central-1.saucelabs.com:443/wd/hub`,
    )
    .withCapabilities({
      ...capabilities,
      ...(capabilities['browser'] && { browserName: capabilities['browser'] }),
      // Because NodeJS language binding requires browserName to be defined
    })
    .build()
}


import { ConfigOptions } from 'karma'
import { SauceLabsCapabilitiesFactory } from './saucelabs_capabilities_factory'
import { CustomLauncher } from 'karma'
import { Logger } from './karma_logger'
import { OptionsBuilder } from './options_builder'
import { WebDriverFactory } from './webdriver_factory'
import { SauceLabsCredentials } from './saucelabs_helpers'
import { ThenableWebDriver } from 'selenium-webdriver'
import { LocalIdentifier } from './saucelabs_local_manager'

export interface SauceLabsSessionFactoryConfig {
  project: string
  build: string
  idleTimeout?: number
  capabilitiesFactory: SauceLabsCapabilitiesFactory
  localIdentifier?: LocalIdentifier
}

export class SauceLabsSessionFactory {
  private _project: string
  private _build: string
  private _capsFactory: SauceLabsCapabilitiesFactory
  private _idleTimeout: number
  private _localIdentifier: LocalIdentifier | undefined

  constructor(config: SauceLabsSessionFactoryConfig) {
    this._project = config.project
    this._build = config.build
    this._idleTimeout = config.idleTimeout ?? 60_000
    this._capsFactory = config.capabilitiesFactory
    this._localIdentifier = config.localIdentifier
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
      this._localIdentifier,
    )
    if (browser.browserName?.toLowerCase().includes('safari') && browser.flags) {
      caps.safariOptions = OptionsBuilder.createSafariArguments(browser.flags)
    }
    log.debug('created capabilities: ' + JSON.stringify(caps))
    const opts = OptionsBuilder.create(browser.browserName, browser.flags)
    log.debug('created options: ' + JSON.stringify(opts))
    if (browser.firefoxCapabilities) {
      log.debug('using firefox capabilities: ' + browser.firefoxCapabilities)
    }
    return WebDriverFactory.createFromOptions(opts, caps, browser.firefoxCapabilities)
  }
}

export function makeSauceLabsSessionFactory(
  config: ConfigOptions,
  SauceLabsCredentials: SauceLabsCredentials,
  localIdentifier?: LocalIdentifier,
): SauceLabsSessionFactory {
  if (!config.sauceLabs) {
    throw new Error('SauceLabs options are not set')
  }

  return new SauceLabsSessionFactory({
    capabilitiesFactory: new SauceLabsCapabilitiesFactory(SauceLabsCredentials, true),
    project: config.sauceLabs.project,
    build: config.sauceLabs.build.toString(),
    idleTimeout: config.sauceLabs.idleTimeout,
    localIdentifier,
  })
}

declare module 'karma' {
    interface ConfigOptions {
      sauceLabs?: {
        project: string
        build: string | number
        idleTimeout?: number
        queueTimeout?: number
        localIdentifier?: string | undefined
      }
    }
  