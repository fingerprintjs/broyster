const AsyncLock = require('async-lock')
import { Logger } from './karma_logger'
import { canNewBrowserBeQueued } from './browserstack_helpers'
import { ConfigOptions } from 'karma'

export class BrowserStackSessionsManager {
  private _lock
  public constructor() {
    this._lock = new AsyncLock()
  }
  private static _instance?: BrowserStackSessionsManager
  static getInstance() {
    if (!this._instance) {
      this._instance = new BrowserStackSessionsManager()
    }
    return this._instance
  }

  async checkIfNewSessionCanBeQueued(log: Logger) {
    return this._lock.acquire('key1', async function () {
      return await canNewBrowserBeQueued(log)
    })
  }

  async waitForQueue(config: ConfigOptions, log: Logger) {
    const timeout = 1_000 * (config.browserStack?.queueTimeout ?? 60)
    const maxTime = Date.now() + timeout
    log.debug('expected timeout to be at ' + new Date(maxTime).toISOString())
    while (!(await this.checkIfNewSessionCanBeQueued(log))) {
      if (Date.now() > maxTime) {
        return false
      }
      log.debug('waiting for queue')
      await new Promise((r) => setTimeout(r, 1_000))
    }
    log.debug('queue freed up')
    return true
  }
}
