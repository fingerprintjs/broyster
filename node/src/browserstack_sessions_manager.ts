const AsyncLock = require('async-lock')
import { Logger } from './karma_logger'
import { canNewBrowserBeQueued } from './browserstack_helpers'

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
}
