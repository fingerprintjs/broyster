import { Logger } from './karma_logger'
import { ConfigOptions } from 'karma'
import { BrowserStackSessionsManager } from './browserstack_sessions_manager'

export class CaptureTimeout {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private launcher: any,
    private browserStackSessionsManager: BrowserStackSessionsManager,
    private config: ConfigOptions,
    private log: Logger,
  ) {}

  async onQueue() {
    const queue = await this.browserStackSessionsManager.waitForQueue(this.log)
    if (!queue) {
      this.log.info(`the BrowserStack Automate queue is at full capacity, browser ${this.launcher.id} will fail.`)
      this.launcher.kill()
      this.launcher._retryLimit = 0
      throw Error('browser ' + this.launcher.id + ' will not launch due to queue hitting timeout')
    }
  }

  onStart() {
    setTimeout(() => {
      this.launcher.pendingTimeoutId = null
      if (this.launcher.state !== this.launcher.STATE_BEING_CAPTURED) {
        return
      }

      this.log.warn(`${this.launcher.name} has not captured in ${this.config.captureTimeout} ms, killing.`)
      this.launcher.error = 'timeout'
      this.launcher.kill()
    }, this.config.captureTimeout)
  }

  onDone() {
    if (this.launcher.pendingTimeoutId) {
      clearTimeout(this.launcher.pendingTimeoutId)
    }
  }
}
