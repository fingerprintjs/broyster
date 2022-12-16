import { ThenableWebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { DesiredBrowser } from './desired_browser'
import { LoggerFactory } from './karma_logger'

export function BrowserStackLauncher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  args: DesiredBrowser,
  browserMap: BrowserMap,
  logger: LoggerFactory,
  baseLauncherDecorator: (arg: object) => void,
  captureTimeoutLauncherDecorator: (arg: object) => void,
  retryLauncherDecorator: (arg: object) => void,
  browserStackSessionFactory: BrowserStackSessionFactory,
  browserStackLocalManager: BrowserStackLocalManager,
) {
  baseLauncherDecorator(this)
  captureTimeoutLauncherDecorator(this)
  retryLauncherDecorator(this)

  const log = logger.create('Selenium Browserstack')
  browserStackLocalManager.run(log)

  this.name =
    args.browserName +
    ' ' +
    (args.browserVersion ?? args.deviceName) +
    ' ' +
    args.os +
    ' ' +
    args.osVersion +
    ' on BrowserStack'

  let browser: ThenableWebDriver
  let pendingHeartBeat: NodeJS.Timeout | undefined
  const heartbeat = () => {
    pendingHeartBeat = setTimeout(async () => {
      if (!browser) {
        return
      }
      try {
        await browser.getTitle()
        heartbeat()
      } catch (e) {
        clearTimeout(pendingHeartBeat)
      }
      return
    }, 60000)
  }

  this.on('start', async (pageUrl: string) => {
    try {
      browserStackLocalManager.run(log)
      log.debug('creating browser with attributes: ' + JSON.stringify(args))
      browser = browserStackSessionFactory.createBrowser(args, log)
      const httpsUrl = 'https://localhost:2138'
      const httpUrl = 'http://localhost:2137'
      const regexpForLocalhost = /https:\/\/localhost:\d*/
      pageUrl = args.useHttps
        ? pageUrl.replace(regexpForLocalhost, httpsUrl)
        : pageUrl.replace(regexpForLocalhost, httpUrl)
      await browser.get(pageUrl)
      const sessionId = (await browser.getSession()).getId()
      browserMap.set(this.id, { browser, sessionId })
      log.debug(this.id + ' has webdriver SessionId: ' + sessionId)
      heartbeat()
    } catch (err) {
      log.error((err as Error) ?? String(err))
      this._done('failure')
      return
    }
  })

  this.on('kill', async (done: () => void) => {
    if (pendingHeartBeat) {
      clearTimeout(pendingHeartBeat)
    }
    try {
      log.debug('killing browser ' + this.id)
      const browser = browserMap.get(this.id)?.browser
      if (browser) {
        await browser.quit()
        log.debug('killed')
      } else {
        log.debug('browser not found, cannot kill')
      }
    } catch (err) {
      log.error('Could not quit the BrowserStack Selenium connection. Failure message:')
      log.error((err as Error) ?? String(err))
    }

    browserMap.delete(this.id)

    this._done()
    return process.nextTick(done)
  })

  this.on('exit', async (done: () => void) => {
    browserStackLocalManager.kill(log)
    done()
  })
}
