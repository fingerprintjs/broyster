import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { makeBrowserStackSessionFactory } from './browserstack_session_factory'
import { BrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'
import { BrowserStackReporter } from './browserstack_reporter'

const karmaPlugin: InlinePluginDef = {
  'launcher:BrowserStack': ['type', BrowserStackLauncher],
  'reporter:BrowserStack': ['type', BrowserStackReporter],
  browserStackSessionFactory: ['type', makeBrowserStackSessionFactory],
  browserStackLocalManager: ['value', new BrowserStackLocalManager()],
  browserMap: ['value', new Map<string, { browser: ThenableWebDriver; session: string }>() satisfies BrowserMap],
}

declare module 'karma' {
  interface ConfigOptions {
    browserStack?: {
      project: string
      build: string | number
      timeout: number
    }
    client?: ClientOptions | undefined
  }

  interface CustomLauncher {
    name: string
    osVersion: string
    deviceName?: string | undefined
    browserVersion?: string | null | undefined
    firefoxCapabilities?: Array<[string, string | number | boolean]>
    useHttps: boolean
    //extraSettings: string[]; //TODO things like timezone, locale
  }
}

export default karmaPlugin
