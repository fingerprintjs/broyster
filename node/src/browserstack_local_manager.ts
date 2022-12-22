import * as browserStack from 'browserstack-local'
import { promisify } from 'util'
import { Logger } from './karma_logger'

export class BrowserStackLocalManager {
  isRunning = false
  bsLocal: browserStack.Local = new browserStack.Local()
  switchPromise = Promise.resolve()

  run(logger: Logger): Promise<void> {
    if (!this.isRunning) {
      this.isRunning = true
      const bsAccesskey = process.env.BROWSERSTACK_ACCESS_KEY || process.env.BROWSER_STACK_ACCESS_KEY
      const bsLocalArgs = {
        key: bsAccesskey,
        localIdentifier: undefined,
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
  /*
  run(logger: Logger) {
    if (!this.isRunning) {
      const bsAccesskey = process.env.BROWSERSTACK_ACCESS_KEY || process.env.BROWSER_STACK_ACCESS_KEY
      const bsLocalArgs = {
        key: bsAccesskey,
        localIdentifier: undefined,
        forceLocal: true,
        force: true,
      }
      logger.debug('Starting BrowserStackLocal')
      this.bsLocal.start(bsLocalArgs, function () {
        logger.debug('Started BrowserStackLocal')
        //todo: investigate why the log does not print anything, maybe the callback is not called?
        //console.log('started')
      })

      this.isRunning = true
    }
  }
*/
  kill(logger: Logger) {
    if (this.isRunning) {
      logger.debug('Stopping BrowserStackLocal')
      this.bsLocal.stop(function () {
        logger.debug('Stopped BrowserStackLocal')
      })
      this.isRunning = false
    }
  }
}
