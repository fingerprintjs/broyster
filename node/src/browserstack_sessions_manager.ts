import * as AsyncLock from 'async-lock'
import { Logger } from './karma_logger'
import { QueueState } from './queue_state'
import { QueueError } from './queue_error'
import { canNewBrowserBeQueued } from './browserstack_helpers'
import { ConfigOptions, Launcher } from 'karma'

export class BrowserStackSessionsManager {
  private _lock = new AsyncLock()
  private _timeout: number
  private _state: QueueState
  private _requiredSlots: number
  private _queueTimeout: number

  constructor(config: ConfigOptions) {
    this._queueTimeout = config.browserStack?.queueTimeout ?? 300_000
    this._timeout = Date.now() + this._queueTimeout
    this._requiredSlots = config.concurrency ?? 1
    this._state = QueueState.Pending
  }

  async canNewSessionBeLaunched(log: Logger) {
    return await this.checkIfCanLaunchSessions(1, log)
  }

  async ensureQueue(launcher: Launcher, log: Logger) {
    const isAvailable = await this.getQueue(launcher, log)
    if (isAvailable) {
      await this.getNewLauncher(log)
    }
  }

  private async getNewLauncher(log: Logger) {
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

  private async getQueue(launcher: Launcher, log: Logger) {
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

  private async waitForQueue(log: Logger) {
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

  private checkIfNewSessionCanBeQueued(log: Logger) {
    return this.checkIfCanLaunchSessions(this._requiredSlots, log)
  }

  private checkIfCanLaunchSessions(slots: number, log: Logger) {
    return this._lock.acquire('sessionsLock', async function () {
      return await canNewBrowserBeQueued(slots, log)
    })
  }
}

export function makeBrowserStackSessionsManager(config: ConfigOptions) {
  return new BrowserStackSessionsManager(config)
}
