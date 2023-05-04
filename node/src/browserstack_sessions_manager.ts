import * as AsyncLock from 'async-lock'
import { Logger } from './karma_logger'
import { QueueState } from './queue_state'
import { QueueError } from './queue_error'
import { KarmaLauncher } from './karma_launcher'
import { BrowserStackCredentials, canNewBrowserBeQueued } from './browserstack_helpers'
import { ConfigOptions } from 'karma'

export class BrowserStackSessionsManager {
  private _lock = new AsyncLock()
  private _timeout: number
  private _state = QueueState.Pending
  private _requiredSlots: number
  private _queueTimeout: number

  constructor(config: ConfigOptions, private _credentials: BrowserStackCredentials) {
    this._queueTimeout = config.browserStack?.queueTimeout ?? 300_000
    this._timeout = Date.now() + this._queueTimeout
    this._requiredSlots = config.concurrency ?? 1
  }

  async canNewSessionBeLaunched(log: Logger): Promise<boolean> {
    return await this.checkIfCanLaunchSessions(1, log)
  }

  async ensureQueue(launcher: KarmaLauncher, log: Logger): Promise<void> {
    const isAvailable = await this.getQueue(launcher, log)
    if (isAvailable) {
      await this.getNewLauncher(log)
    }
  }

  private async getNewLauncher(log: Logger): Promise<void> {
    const timeout = Date.now() + this._queueTimeout
    while (!(await this.canNewSessionBeLaunched(log))) {
      if (Date.now() > timeout) {
        log.debug('launcher timeout exceeded')
        throw new QueueError('Queue for new launcher timed out. Browser will not launch')
      }
      log.debug('waiting for launcher')
      await new Promise((r) => setTimeout(r, 1_000))
    }
  }

  private async getQueue(launcher: KarmaLauncher, log: Logger): Promise<boolean> {
    if (this._state === QueueState.Pending) {
      await this._lock.acquire('queueLock', async () => {
        return await this.waitForQueue(log)
      })
    }
    if (this._state === QueueState.Timedout) {
      launcher.kill()
      log.info('queue timed out')
      throw new QueueError('Queue not available within timeout. Browser will not launch: ' + launcher.id)
    }
    return true
  }

  private async waitForQueue(log: Logger): Promise<void> {
    log.debug('queue state is ' + this._state)
    if (this._state !== QueueState.Pending) {
      log.debug('returning')
      return
    }
    log.info('waiting for BrowserStack to have free slots: ' + this._requiredSlots)
    log.info('expected timeout to be at ' + new Date(this._timeout).toISOString())
    while (!(await this.checkIfNewSessionCanBeQueued(log))) {
      if (Date.now() > this._timeout) {
        log.info('queue timeout exceeded, failing')
        this.setTimedout()
        return
      }
      log.debug('waiting for queue')
      await new Promise((r) => setTimeout(r, 1_000))
    }
    log.info('enough slots free')
    this.setFree()
  }

  private setFree(): void {
    this._state = QueueState.Available
    this._timeout = Date.now() + 60_000
  }

  private setTimedout(): void {
    this._state = QueueState.Timedout
    this._timeout = Date.now() - 60_000
  }

  private checkIfNewSessionCanBeQueued(log: Logger): Promise<boolean> {
    return this.checkIfCanLaunchSessions(this._requiredSlots, log)
  }

  private checkIfCanLaunchSessions(slots: number, log: Logger): Promise<boolean> {
    return this._lock.acquire('sessionsLock', async () => {
      return await canNewBrowserBeQueued(this._credentials, slots, log)
    })
  }
}

export function makeBrowserStackSessionsManager(
  config: ConfigOptions,
  browserStackCredentials: BrowserStackCredentials,
): BrowserStackSessionsManager {
  return new BrowserStackSessionsManager(config, browserStackCredentials)
}
