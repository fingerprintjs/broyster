import { WebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { LoggerFactory } from './karma_logger'
import { calculateHttpsPort } from './custom_servers'
import { BrowserStackSessionsManager } from './browserstack_sessions_manager'
import { CustomLauncher, ConfigOptions } from 'karma'
import { CaptureTimeout } from './capture_timeout_handler'

export function BrowserStackLauncher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  args: CustomLauncher,
  browserMap: BrowserMap,
  logger: LoggerFactory,
  config: ConfigOptions,
  baseLauncherDecorator: (arg: object) => void,
  retryLauncherDecorator: (arg: object) => void,
  browserStackSessionFactory: BrowserStackSessionFactory,
  browserStackLocalManager: BrowserStackLocalManager,
  browserStackSessionsManager: BrowserStackSessionsManager,
) {
  baseLauncherDecorator(this)
  retryLauncherDecorator(this)
  const log = logger.create('Browserstack ' + this.id)
  const run = browserStackLocalManager.run(log)
  const captureTimeout = new CaptureTimeout(this, config, log)

  this.name =
    args.browserName +
    ' ' +
    (args.browserVersion ??
      (Array.isArray(args.deviceName) ? 'on any of ' + args.deviceName.join(', ') : args.deviceName)) +
    ' for ' +
    args.platform +
    ' ' +
    args.osVersion +
    ' on BrowserStack'

  let browser: WebDriver
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
    }, (config.browserStack?.idleTimeout ?? 10_000) * 0.9)
  }
  this.attempt = 0

  this.pendingTimeoutId = null

  this.on('start', async (pageUrl: string) => {
    try {
      await run

      const queue = await browserStackSessionsManager.waitForQueue(log)
      if (!queue) {
        log.info(`the BrowserStack Automate queue is at full capacity, browser ${this.id} will fail.`)
        this.kill()
        this._retryLimit = 0
        throw Error('browser ' + this.id + ' will not launch due to queue hitting timeout')
      }
      /*
      TODO: with a capture timeout of 10 seconds, the browser will often times take a bit more,
      perhaps this should be moved into a callback upon the browser being created to eliminate the retry decorator
      firing off?
      the bulk of the problem is in not loding the karma server anyway, BStack is more reliable
      */
      captureTimeout.onStart()

      log.debug('creating browser with attributes: ' + JSON.stringify(args))
      browser = await browserStackSessionFactory.tryCreateBrowser(args, this.attempt++, log)
      const session = (await browser.getSession()).getId()
      log.debug(this.id + ' has webdriver SessionId: ' + session)
      browserMap.set(this.id, { browser, session })
      pageUrl = makeUrl(pageUrl, args.useHttps)
      await browser.get(pageUrl)
      heartbeat()
    } catch (err) {
      log.error((err as Error) ?? String(err))
      this._done('failure')
    }
  })

  this.on('done', () => {
    captureTimeout.onDone()
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
      log.error(`Could not quit the BrowserStack connection for ${this.name}. Failure message:`)
      log.error((err as Error) ?? String(err))
    }

    browserMap.delete(this.id)

    this._done()
    return process.nextTick(done)
  })

  this.on('exit', async (done: () => void) => {
    await browserStackLocalManager.kill(log)
    done()
  })
}

function makeUrl(karmaUrl: string, isHttps: boolean) {
  const url = new URL(karmaUrl)
  url.protocol = isHttps ? 'https' : 'http'
  if (isHttps) {
    url.port = calculateHttpsPort(parseInt(url.port)).toString()
  }
  return url.href
}
