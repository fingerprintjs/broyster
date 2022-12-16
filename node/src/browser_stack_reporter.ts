import { LoggerFactory } from './karma_logger'
import { createAutomateClient } from 'browserstack'
import { BrowserSession, Result } from './browser_session'
import { BrowserMap } from './browser_map'

export function BrowserStackReporter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  logger: LoggerFactory,
  browserMap: BrowserMap,
) {
  const log = logger.create('Browserstack Selenium Reporter')

  let pendingUpdates = 0
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let callWhenFinished = () => {}

  const exitIfAllFinished = function () {
    if (pendingUpdates === 0) {
      callWhenFinished()
    }
  }
  const browserstackClient = createAutomateClient({
    username:
      process.env.BROWSERSTACK_USERNAME ||
      process.env.BROWSER_STACK_USERNAME ||
      (() => {
        throw new Error('BrowserStack username is empty')
      })(),
    password:
      process.env.BROWSERSTACK_ACCESS_KEY ||
      process.env.BROWSER_STACK_ACCESS_KEY ||
      (() => {
        throw new Error('BrowserStack access key is empty')
      })(),
  })

  this.onBrowserComplete = function (browser: BrowserSession) {
    const result: Result = browser.lastResult

    if (result.disconnected) {
      log.error('Test disconnected')
    }

    if (result.error) {
      log.error('Test errored')
    }

    const browserId = browser.launchId || browser.id
    if (browserMap.has(browserId)) {
      pendingUpdates++
      const apiStatus = !(result.failed || result.error || result.disconnected) ? 'passed' : 'error'
      browserstackClient.updateSession(
        browserMap.get(browserId)?.sessionId ?? '',
        {
          status: apiStatus,
        },
        (err: string) => {
          if (err) {
            log.error('Could not update BrowserStack status:')
            log.error(err)
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
