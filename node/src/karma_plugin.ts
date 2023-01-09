import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { makeBrowserStackSessionFactory } from './browserstack_session_factory'
import { BrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'

const karmaPlugin: InlinePluginDef = {
  'launcher:BrowserStack': ['type', BrowserStackLauncher],
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
  }

  interface CustomLauncher {
    name: string
    osVersion: string
    deviceName?: string | string[] | undefined
    browserVersion?: string | null | undefined
    firefoxCapabilities?: Array<[string, string | number | boolean]>
    useHttps: boolean
    //extraSettings: string[]; //TODO things like timezone, locale
  }
}

export default karmaPlugin
