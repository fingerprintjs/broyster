import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackReporter } from './browser_stack_reporter'
import { makeBrowserStackSessionFactory } from './browserstack_session_factory'
import { BrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'

const karmaPlugin: InlinePluginDef = {
  'launcher:BrowserStackSelenium': ['type', BrowserStackLauncher],
  browserStackSessionFactory: ['type', makeBrowserStackSessionFactory],
  browserStackLocalManager: ['value', new BrowserStackLocalManager()],
  browserMap: ['value', new Map<string, { browser: ThenableWebDriver; sessionId: string }>() as BrowserMap],
  'reporter:BrowserStackSelenium': ['type', BrowserStackReporter],
}

export default karmaPlugin
