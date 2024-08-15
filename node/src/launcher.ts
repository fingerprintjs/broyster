import type * as browserstack from 'browserstack'
import { WebDriver } from 'selenium-webdriver'
import { BrowserMap } from './browser_map'
import { BrowserStackLocalManager } from './browserstack_local_manager'
import { BrowserStackSessionFactory } from './browserstack_session_factory'
import { Logger, LoggerFactory } from './karma_logger'
import { calculateHttpsPort } from './custom_servers'
import { BrowserStackSessionsManager } from './browserstack_sessions_manager'
import { CustomLauncher, ConfigOptions } from 'karma'
import { CaptureTimeout } from './capture_timeout_handler'
import { BrowserStackBrowsers } from './browserstack_browsers'

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
  browserStackBrowsers: BrowserStackBrowsers,
) {
  baseLauncherDecorator(this)
  retryLauncherDecorator(this)
  const log = logger.create('Browserstack ' + this.id)
  const bsLocalManagerPromise = browserStackLocalManager.run(log)
  const deviceNamesPromise = getDeviceNames(browserStackBrowsers, args, log)
  const captureTimeout = new CaptureTimeout(this, config, log)
  let startAttempt = 0

  this.name = makeLauncherName(args)

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

  this.on('start', async (pageUrl: string) => {
    try {
      await bsLocalManagerPromise
      const [deviceName] = await Promise.all([chooseDeviceName(), browserStackSessionsManager.ensureQueue(this, log)])

      log.debug(`creating browser with attributes: ${JSON.stringify(args)}`)
      log.debug(`attempt: ${startAttempt}`)
      log.debug(`device name: ${deviceName}`)

      startAttempt += 1
      browser = await browserStackSessionFactory.createBrowser(args, deviceName, this.id, log)
      captureTimeout.onStart()
      const sessionId = (await browser.getSession()).getId()
      log.debug(`WebDriver SessionId: ${sessionId}`)
      browserMap.set(this.id, { browser, sessionId })
      pageUrl = makeUrl(pageUrl, args.useHttps)
      await browser.get(pageUrl)
      heartbeat()
    } catch (err) {
      log.error(`Failed to start ${this.name}:`)
      log.error(err as Error | string)
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

  const chooseDeviceName = async () => {
    const deviceNames = await deviceNamesPromise
    if (!deviceNames) {
      return null
    }

    if (deviceNames.length === 0) {
      throw new Error('No device available for the given configuration')
    }

    const deviceName = deviceNames[startAttempt % deviceNames.length]
    log.info(`Using ${deviceName} for the browser ${this.name}`)
    return deviceName
  }
}

/**
 * Returns the list of devices for the given launcher configuration.
 * Returns `null` when the given configuration doesn't need a device name.
 */
async function getDeviceNames(browserStackBrowsers: BrowserStackBrowsers, args: CustomLauncher, log: Logger) {
  let devices: browserstack.Browser[] | null = null

  switch (args.platform) {
    case 'iOS':
      devices = await browserStackBrowsers.getIOSDevices(
        args.osVersion ?? null,
        args.deviceType === 'iPad' ? 'ipad' : 'iphone',
        args.browserName?.toLowerCase() === 'chrome' ? 'chrome' : 'safari',
        true,
        log,
      )
      break
    case 'Android':
      devices = await browserStackBrowsers.getAndroidDevices(
        args.osVersion ?? null,
        args.browserName?.toLowerCase() === 'samsung' ? 'samsung' : 'chrome',
        true,
        log,
      )
      break
  }

  const deviceNames = devices
    ? devices.map((device) => device.device).filter((name): name is string => name !== null)
    : null
  log.debug(`device names for attributes ${JSON.stringify(args)}: ${JSON.stringify(deviceNames)}`)

  return deviceNames
}

function makeLauncherName(args: CustomLauncher) {
  const components = [args.browserName]
  if (args.browserVersion) {
    components.push(args.browserVersion)
  }
  if (args.deviceType) {
    components.push(`on ${args.deviceType}`)
  }
  if (args.platform) {
    components.push(`on ${args.platform}`)
    if (args.osVersion) {
      components.push(args.osVersion)
    }
  }
  components.push('on BrowserStack')
  return components.join(' ')
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
