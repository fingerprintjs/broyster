import { LoggerFactory } from './karma_logger'
import { ConfigOptions } from 'karma'
import { BrowserSession, Result } from './browser_session'
import { BrowserMap } from './browser_map'
import { createBrowserStackClient } from './browserstack_helpers'

export function BrowserStackReporter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  config: ConfigOptions,
  logger: LoggerFactory,
  browserMap: BrowserMap,
) {
  const log = logger.create('Browserstack Reporter')

  let pendingUpdates = 0

  let callWhenFinished = () => undefined as void

  const exitIfAllFinished = () => {
    if (pendingUpdates === 0) {
      callWhenFinished()
    }
  }
  const browserstackClient = createBrowserStackClient()

  this.onRunComplete = function (browsers: { browsers: BrowserSession[] }): void {
    const browsersLaunched = browsers.browsers
    const browsersScheduled = Object.keys(config.customLaunchers ?? {})
    log.info('Executed ' + browsersLaunched.length + ' launchers out of ' + browsersScheduled.length)
    if (browsersLaunched.length !== browsersScheduled.length) {
      log.info(
        'Browsers launched: ' +
          browsersLaunched
            .map((browser: BrowserSession) => {
              return browser.name + ' (' + browser.id + ')'
            })
            .join(', '),
      )
      log.info('Browsers that were configured: ' + browsersScheduled.join(', '))
    }
  }

  this.onBrowserComplete = function (browser: BrowserSession): void {
    const result: Result = browser.lastResult

    if (result.disconnected) {
      if (result.success + result.failed + result.skipped < result.total) {
        log.error('Test disconnected')
      } else {
        result.disconnected = false
        log.warn('Test reported as disconnected, but actually all tests executed')
      }
    }

    if (result.error) {
      log.error('Test errored')
    }

    const browserId = browser.launchId || browser.id
    if (browserMap.has(browserId)) {
      pendingUpdates++
      const apiStatus = !(result.failed || result.error || result.disconnected) ? 'passed' : 'error'
      browserstackClient.updateSession(
        browserMap.get(browserId)?.session ?? '',
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
  this.onExit = function (done: () => void): void {
    callWhenFinished = done
    exitIfAllFinished()
  }
}
