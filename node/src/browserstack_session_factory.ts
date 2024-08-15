import { ConfigOptions } from 'karma'
import { BrowserStackCapabilitiesFactory } from './browserstack_capabilities_factory'
import { CustomLauncher } from 'karma'
import { Logger } from './karma_logger'
import { OptionsBuilder } from './options_builder'
import { WebDriverFactory } from './webdriver_factory'
import { BrowserStackCredentials } from './browserstack_helpers'
import { WebDriver } from 'selenium-webdriver'
import { LocalIdentifier } from './browserstack_local_manager'

export interface BrowserStackSessionFactoryConfig {
  project: string
  build: string
  idleTimeout?: number
  capabilitiesFactory: BrowserStackCapabilitiesFactory
  localIdentifier?: LocalIdentifier
}

export class BrowserStackSessionFactory {
  private _project: string
  private _build: string
  private _capsFactory: BrowserStackCapabilitiesFactory
  private _idleTimeout: number
  private _localIdentifier: LocalIdentifier | undefined

  constructor(config: BrowserStackSessionFactoryConfig) {
    this._project = config.project
    this._build = config.build
    this._idleTimeout = config.idleTimeout ?? 60_000
    this._capsFactory = config.capabilitiesFactory
    this._localIdentifier = config.localIdentifier
  }

  public async createBrowser(
    browser: CustomLauncher,
    deviceName: string | null,
    id: string,
    log: Logger,
  ): Promise<WebDriver> {
    log.debug('creating session')
    try {
      const caps = this._capsFactory.create(
        browser.browserName,
        this._build,
        id,
        this._project,
        deviceName ?? undefined,
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
      const webdriver = await WebDriverFactory.createFromOptions(opts, caps, browser.firefoxCapabilities)
      log.debug('session created successfully')
      return webdriver
    } catch (error) {
      log.debug('session creation failed')
      throw error
    }
  }
}

export function makeBrowserStackSessionFactory(
  config: ConfigOptions,
  browserStackCredentials: BrowserStackCredentials,
  localIdentifier?: LocalIdentifier,
): BrowserStackSessionFactory {
  if (!config.browserStack) {
    throw new Error('BrowserStack options are not set')
  }

  return new BrowserStackSessionFactory({
    capabilitiesFactory: new BrowserStackCapabilitiesFactory(browserStackCredentials, true),
    project: config.browserStack.project,
    build: config.browserStack.build.toString(),
    idleTimeout: config.browserStack.idleTimeout,
    localIdentifier,
  })
}
