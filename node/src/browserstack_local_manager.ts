import * as Q from 'q'
import * as browserStack from 'browserstack-local'
import { Logger } from './karma_logger'

export class BrowserStackLocalManager {
  isRunning = false
  bsLocal: browserStack.Local = new browserStack.Local()

  run(logger: Logger) {
    if (!this.isRunning) {
      const deferred = Q.defer()
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
        deferred.resolve()
      })

      this.isRunning = true
    }
  }

  kill(logger: Logger) {
    if (this.isRunning) {
      const deferred = Q.defer()
      logger.debug('Stopping BrowserStackLocal')
      this.bsLocal.stop(function () {
        logger.debug('Stopped BrowserStackLocal')
        deferred.resolve()
      })
      this.isRunning = false
    }
  }
}
