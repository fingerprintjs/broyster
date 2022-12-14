import { LoggerFactory } from './karma_logger'
import { createAutomateClient } from 'browserstack'
import { BrowserSession } from './browser_session'
import { BrowserMap } from './browser_map'

declare module 'browserstack' {
  export type AutomateClient = {
    updateSession(id: string, options: object, fn: () => void): void
  }
}

export function BrowserStackReporter(
  logger: LoggerFactory,
  browserMap: BrowserMap,
  /* BrowserStack:sessionMapping */ sessionMapping: BrowserSession,
) {
  const log = logger.create('Browserstack Selenium Reporter')

  let pendingUpdates = 0
  // eslint-disable-next-line @typescript-eslint/ban-types
  let callWhenFinished: () => {}

  const exitIfAllFinished = function () {
    if (pendingUpdates === 0) {
      callWhenFinished()
    }
  }

  this.onBrowserComplete = function (browser: BrowserSession) {
    const result = browser.lastResult

    if (result.disconnected) {
      log.error('Test Disconnected')
    }

    if (result.error) {
      log.error('Test Errored')
    }

    const browserId = browser.launchId || browser.id
    if (browserId in sessionMapping) {
      pendingUpdates++
      const browserstackClient = createAutomateClient(sessionMapping.credentials)
      const apiStatus = !(result.failed || result.error || result.disconnected) ? 'passed' : 'error'
      browserMap.get(browserId)
      browserstackClient.updateSession(
        sessionMapping[browserId],
        {
          status: apiStatus,
        },
        function (err: string) {
          if (err) {
            log.error('Could not update BrowserStack status')
            log.debug(err)
          }
          pendingUpdates--
          exitIfAllFinished()
        },
      )
    }
  }

  // Wait until all updates have been pushed to Browserstack
  this.onExit = function (done: () => object) {
    callWhenFinished = done
    exitIfAllFinished()
  }
}
