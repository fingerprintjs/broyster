import * as browserStack from 'browserstack-local'
import { promisify } from 'util'
import { ConfigOptions } from 'karma'
import { BrowserStackCredentials } from './browserstack_helpers'
import { Logger } from './karma_logger'

export class BrowserStackLocalManager {
  private isRunning = false
  private bsLocal: browserStack.Local = new browserStack.Local()
  private switchPromise = Promise.resolve()

  constructor(private credentials: BrowserStackCredentials, private localIdentifier?: LocalIdentifier) {}

  run(logger: Logger): Promise<void> {
    if (!this.isRunning) {
      this.isRunning = true
      const bsLocalArgs = {
        key: this.credentials.accessKey,
        localIdentifier: this.localIdentifier,
        forceLocal: true,
        force: true,
      }
      logger.debug('Starting BrowserStackLocal')
      this.switchPromise = promisify(this.bsLocal.start)
        .bind(this.bsLocal)(bsLocalArgs)
        .then(() => {
          logger.debug('Started BrowserStackLocal')
        })
    }
    return this.switchPromise
  }

  kill(logger: Logger): Promise<void> {
    if (this.isRunning) {
      logger.debug('Stopping BrowserStackLocal')
      this.isRunning = false
      this.switchPromise = promisify(this.bsLocal.stop)
        .bind(this.bsLocal)()
        .then(() => {
          logger.debug('Stopped BrowserStackLocal')
        })
    }
    return this.switchPromise
  }
}

export function makeBrowserStackLocalManagerFactory(
  browserStackCredentials: BrowserStackCredentials,
  localIdentifier?: LocalIdentifier,
): BrowserStackLocalManager {
  return new BrowserStackLocalManager(browserStackCredentials, localIdentifier)
}

export type LocalIdentifier = string

export function makeLocalIdentifier(config: ConfigOptions): LocalIdentifier {
  return config.browserStack?.localIdentifier ?? Math.random().toString(36).slice(2)
}
