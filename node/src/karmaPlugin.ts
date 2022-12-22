import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { makeBrowserStackSessionFactory } from './browserstack_session_factory'
import { BroysterBrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'

const karmaPlugin: InlinePluginDef = {
  'launcher:BroysterBrowserStack': ['type', BroysterBrowserStackLauncher],
  browserStackSessionFactory: ['type', makeBrowserStackSessionFactory],
  browserStackLocalManager: ['value', new BrowserStackLocalManager()],
  browserMap: ['value', new Map<string, { browser: ThenableWebDriver; session: string }>() as BrowserMap],
}

export default karmaPlugin
