import { makeBrowserMapFactory } from './browser_map'
import { makeBrowserStackLocalManagerFactory } from './browserstack_local_manager'
import { makeBrowserStackSessionFactory } from './browserstack_session_factory'
import { makeBrowserStackSessionsManager } from './browserstack_sessions_manager'
import { BrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'
import { BrowserStackReporter } from './browserstack_reporter'

const karmaPlugin: InlinePluginDef = {
  'launcher:BrowserStack': ['type', BrowserStackLauncher],
  'reporter:BrowserStack': ['type', BrowserStackReporter],
  browserStackSessionFactory: ['factory', makeBrowserStackSessionFactory],
  browserStackLocalManager: ['factory', makeBrowserStackLocalManagerFactory],
  browserStackSessionsManager: ['factory', makeBrowserStackSessionsManager],
  browserMap: ['factory', makeBrowserMapFactory],
}

declare module 'karma' {
  interface ConfigOptions {
    browserStack?: {
      project: string
      build: string | number
      idleTimeout?: number
      queueTimeout?: number
    }
  }

  interface CustomLauncher {
    name?: string | undefined
    osVersion?: string | undefined
    deviceName?: string | string[] | undefined
    browserVersion?: string | null | undefined
    firefoxCapabilities?: Array<[string, string | number | boolean]>
    useHttps?: boolean | undefined
    //extraSettings?: string[] | undefined; //TODO things like timezone, locale
  }
}

export default karmaPlugin
