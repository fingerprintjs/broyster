/* eslint-disable no-console */
import { WebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { LoggerFactory } from './karma_logger'
import { calculateHttpsPort } from './custom_servers'
import { BrowserStackSessionsManager } from './browserstack_sessions_manager'
import { CustomLauncher, ConfigOptions } from 'karma'
import { CaptureTimeout } from './capture_timeout_handler'
import { env } from 'process'

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
  const identifier = env.HELLO ?? env.hello
  const log = logger.create('Browserstack ' + this.id)
  const run = browserStackLocalManager.run(log, identifier)

  log.error('this is the identifier')
  log.error(identifier ?? 'could not get hello')
  const captureTimeout = new CaptureTimeout(this, config, log)

  const makeName = (device: string | undefined) => {
    this.name = args.browserName + ' ' + device + ' for ' + args.platform + ' ' + args.osVersion + ' on BrowserStack'
  }
  const device =
    args.browserVersion ??
    (args.deviceName instanceof Array ? 'on any of ' + args.deviceName.join(', ') : args.deviceName)
  makeName(device)

  let browser: WebDriver
  let pendingHeartBeat: NodeJS.Timeout | undefined
  const timeout = Date.now() + (config.browserStack?.queueTimeout ?? 60_000)
  const heartbeat = () => {
    pendingHeartBeat = setTimeout(async () => {
      if (!browser) {
        return
      }
      if (Date.now() > timeout) {
        clearTimeout(pendingHeartBeat)
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

  this.on('start', async (pageUrl: string) => {
    try {
      await run
      await browserStackSessionsManager.ensureQueue(this, log)

      log.debug('creating browser with attributes: ' + JSON.stringify(args))
      const [browserPromise, name] = browserStackSessionFactory.tryCreateBrowser(args, this.id, this.attempt++, log)
      if (name) {
        makeName(name)
      }
      browser = await browserPromise
      captureTimeout.onStart()
      const session = (await browser.getSession()).getId()
      log.debug(this.id + ' has webdriver SessionId: ' + session)
      browserMap.set(this.id, { browser, session })
      pageUrl = makeUrl(pageUrl, args.useHttps)
      await browser.get(pageUrl)
      heartbeat()
    } catch (err) {
      log.error((err as Error) ?? String(err))
      this._done('failure') // this may end up hanging the process
      // however it is very unlikely as it requires all attempts to fail and never create a driver
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

function makeUrl(karmaUrl: string, isHttps?: boolean | undefined): string {
  if (isHttps === undefined) {
    return karmaUrl
  }
  const url = new URL(karmaUrl)
  url.protocol = isHttps ? 'https' : 'http'
  if (isHttps) {
    url.port = calculateHttpsPort(parseInt(url.port)).toString()
  }
  return url.href
}
