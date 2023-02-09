import * as AsyncLock from 'async-lock'
import { Logger } from './karma_logger'
import { QueueState } from './queue_state'
import { QueueError } from './queue_error'
import { canNewBrowserBeQueued } from './browserstack_helpers'
import { ConfigOptions } from 'karma'

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

  async getNewLauncher(log: Logger) {
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

  async getQueue(launcher: { id: string; kill: () => void }, log: Logger) {
    if (this._state === QueueState.Pending) {
      await this._lock.acquire('key1', async () => {
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
    if (this._state !== QueueState.Pending) {
      log.debug('queue state is ' + this._state + ' . Returning')
      return
    }
    log.debug('expected timeout to be at ' + new Date(this._timeout).toISOString())
    while (!(await this.checkIfNewSessionCanBeQueued(log))) {
      if (Date.now() > this._timeout) {
        log.debug('queue timeout exceeded, failing')
        this.setTimedout()
        return
      }
      log.debug('waiting for queue')
      await new Promise((r) => setTimeout(r, 1_000))
    }
    log.debug('queue freed up')
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
    return this._lock.acquire('key2', async function () {
      return await canNewBrowserBeQueued(slots, log)
    })
  }
}

export function makeBrowserStackSessionsManager(config: ConfigOptions) {
  return new BrowserStackSessionsManager(config)
}
