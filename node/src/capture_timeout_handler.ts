import { Logger } from './karma_logger'
import { ConfigOptions } from 'karma'

export class CaptureTimeout {
  constructor(private launcher: any, private config: ConfigOptions, private log: Logger) {}

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
    this.launcher.kill()
  }

  onDone() {
    if (this.launcher.pendingTimeoutId) {
      clearTimeout(this.launcher.pendingTimeoutId)
    }
  }
}
