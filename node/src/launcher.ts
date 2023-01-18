import { WebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { Logger, LoggerFactory } from './karma_logger'
import { calculateHttpsPort } from './custom_servers'
import { CustomLauncher, ConfigOptions, Timer } from 'karma'
import { canNewBrowserBeQueued } from './browserstack_helpers'

export function BrowserStackLauncher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  args: CustomLauncher,
  browserMap: BrowserMap,
  logger: LoggerFactory,
  config: ConfigOptions,
  timer: Timer,
  baseLauncherDecorator: (arg: object) => void,
  retryLauncherDecorator: (arg: object) => void,
  browserStackSessionFactory: BrowserStackSessionFactory,
  browserStackLocalManager: BrowserStackLocalManager,
) {
  baseLauncherDecorator(this)
  retryLauncherDecorator(this)

  const log = logger.create('Browserstack')
  const run = browserStackLocalManager.run(log)

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
    }, 60000)
  }
  this.attempt = 0

  this.pendingTimeoutId = null
  const startTimeout = () => {
    return timer.setTimeout(() => {
      this.pendingTimeoutId = null
      if (this.state !== this.STATE_BEING_CAPTURED) {
        return
      }

      log.warn(`${this.name} has not captured in ${config.captureTimeout} ms, killing.`)
      this.error = 'timeout'
      this.kill()
    }, config.captureTimeout)
  }

  this.on('start', async (pageUrl: string) => {
    try {
      await waitForEmptyQueue(config, log)

      await run

      this.pendingTimeoutId = startTimeout()

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
    if (this.pendingTimeoutId) {
      timer.clearTimeout(this.pendingTimeoutId)
      this.pendingTimeoutId = null
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
      log.error('Could not quit the BrowserStack connection. Failure message:')
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

async function waitForEmptyQueue(config: ConfigOptions, log: Logger) {
  const maxTime = Date.now() + 60_000 * (config.browserStack?.queueTimeout ?? 1)
  // TODO: move to a singleton for managing concurrent attempts
  while (!(await canNewBrowserBeQueued(log))) {
    if (Date.now() > maxTime) {
      throw new Error('Queue has not been freed within the last 5 minutes. Please check BrowserStack and retry later.')
    }
    log.debug('waiting for queue')
    await new Promise((r) => setTimeout(r, 1_000))
  }
}
