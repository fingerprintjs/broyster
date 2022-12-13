import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { BrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'

const karmaPlugin: InlinePluginDef = {
  'launcher:BrowserStackSelenium': ['type', BrowserStackLauncher],
  browserStackSessionFactory: ['type', BrowserStackSessionFactory.makeBrowserStackSessionFactory],
  browserStackLocalManager: ['value', new BrowserStackLocalManager()],
  browserMap: ['value', new Map<string, { browser: ThenableWebDriver; session: string }>() as BrowserMap],
}

export default karmaPlugin
