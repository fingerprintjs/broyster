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
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let callWhenFinished = () => {}

  const exitIfAllFinished = function () {
    if (pendingUpdates === 0) {
      callWhenFinished()
    }
  }
  const browserstackClient = createBrowserStackClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.onRunComplete = function (browsers: any) {
    const browsersLaunched = Object.keys(browsers.browsers)
    const browsersScheduled = Object.keys(config.customLaunchers ?? {})
    log.info('Executed ' + browsersLaunched.length + ' launchers out of ' + browsersScheduled.length)
    if (browsersLaunched.length !== browsersScheduled.length) {
      log.info(
        'Browsers launched: ' +
          browsers.browsers
            .map((browser: { name: string; id: string }) => {
              browser.name + ' (' + browser.id + ')'
            })
            .join(', '),
      )
      log.info('Browsers that were configured: ' + browsersScheduled.join(', '))
    }
  }

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
  this.onExit = function (done: () => object) {
    callWhenFinished = done
    exitIfAllFinished()
  }
}
