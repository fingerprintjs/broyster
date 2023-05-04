import * as browserStack from 'browserstack-local'
import { promisify } from 'util'
import { ConfigOptions } from 'karma'
import { getBrowserStackAccessKey } from './browserstack_helpers'
import { Logger } from './karma_logger'

export class BrowserStackLocalManager {
  isRunning = false
  bsLocal: browserStack.Local = new browserStack.Local()
  switchPromise = Promise.resolve()

  run(logger: Logger, localIdentifier: LocalIdentifier): Promise<void> {
    if (!this.isRunning) {
      this.isRunning = true
      const bsAccesskey = getBrowserStackAccessKey()
      const bsLocalArgs = {
        key: bsAccesskey,
        localIdentifier: localIdentifier,
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

export function makeBrowserStackLocalManagerFactory(): BrowserStackLocalManager {
  return new BrowserStackLocalManager()
}

export type LocalIdentifier = string

export function makeLocalIdentifier(config: ConfigOptions): LocalIdentifier {
  return config.browserStack?.localIdentifier ?? Math.random().toString(36).slice(2)
}
