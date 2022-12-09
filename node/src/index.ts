export * from './launcher'

import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { BrowserStackLauncher } from './launcher'

module.exports = {
  'launcher:BrowserStackSelenium': ['type', BrowserStackLauncher],
  browserStackSessionFactory: ['type', BrowserStackSessionFactory],
  browserStackLocalManager: ['value', new BrowserStackLocalManager()],
  browserMap: ['value', new Map<string, ThenableWebDriver>() as BrowserMap],
}
