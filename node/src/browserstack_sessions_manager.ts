import * as AsyncLock from 'async-lock'
import { Logger } from './karma_logger'
import { canNewBrowserBeQueued } from './browserstack_helpers'
import { ConfigOptions } from 'karma'

export class BrowserStackSessionsManager {
  private _lock = new AsyncLock()
  private _timeout: number
  constructor(config: ConfigOptions) {
    this._timeout = Date.now() + 1_000 * (config.browserStack?.queueTimeout ?? 60)
  }

  private async checkIfNewSessionCanBeQueued(log: Logger) {
    return this._lock.acquire('key1', async function () {
      return await canNewBrowserBeQueued(log)
    })
  }

  async waitForQueue(log: Logger) {
    if (Date.now() > this._timeout) {
      log.debug('queue has timed out')
      return false
    }
    log.debug('expected timeout to be at ' + new Date(this._timeout).toISOString())
    while (!(await this.checkIfNewSessionCanBeQueued(log))) {
      if (Date.now() > this._timeout) {
        log.debug('queue timeout exceeded, failing')
        return false
      }
      log.debug('waiting for queue')
      await new Promise((r) => setTimeout(r, 1_000))
    }
    log.debug('queue freed up')
    return true
  }
}

export function makeBrowserStackSessionsManager(config: ConfigOptions) {
  return new BrowserStackSessionsManager(config)
}
