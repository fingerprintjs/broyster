import { makeBrowserMapFactory } from './browser_map'
import { makeBrowserStackLocalManagerFactory, makeLocalIdentifier } from './browserstack_local_manager'
import { makeBrowserStackSessionFactory } from './browserstack_session_factory'
import { makeBrowserStackSessionsManager } from './browserstack_sessions_manager'
import { makeBrowserStackBrowsers } from './browserstack_browsers'
import { getBrowserStackCredentials } from './browserstack_helpers'
import { BrowserStackLauncher } from './launcher'
import { InlinePluginDef } from 'karma'
import { BrowserStackReporter } from './browserstack_reporter'
import type { FirefoxProfile } from './webdriver_factory'

const karmaPlugin: InlinePluginDef = {
  'launcher:BrowserStack': ['type', BrowserStackLauncher],
  'reporter:BrowserStack': ['type', BrowserStackReporter],
  browserStackSessionFactory: ['factory', makeBrowserStackSessionFactory],
  browserStackLocalManager: ['factory', makeBrowserStackLocalManagerFactory],
  browserStackSessionsManager: ['factory', makeBrowserStackSessionsManager],
  browserStackCredentials: ['factory', getBrowserStackCredentials],
  browserStackBrowsers: ['factory', makeBrowserStackBrowsers],
  browserMap: ['factory', makeBrowserMapFactory],
  localIdentifier: ['factory', makeLocalIdentifier],
}

declare module 'karma' {
  interface ConfigOptions {
    browserStack?: {
      project: string
      build: string | number
      idleTimeout?: number
      queueTimeout?: number
      localIdentifier?: string | undefined
    }
  }

  interface CustomLauncher {
    name?: string | undefined
    /** Actually required, but left optional to avoid clashes with launcher types provided by other Karma plugins */
    osVersion?: string | undefined
    deviceType?: 'iPhone' | 'iPad' | undefined
    browserVersion?: string | null | undefined
    firefoxCapabilities?: FirefoxProfile
    useHttps?: boolean | undefined
    //extraSettings?: string[] | undefined; //TODO things like timezone, locale
  }
}

export default karmaPlugin
