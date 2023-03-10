import { Logger } from './karma_logger'
import { ConfigOptions } from 'karma'

export class CaptureTimeout {
  private _pendingTimeoutId: NodeJS.Timeout | null

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _launcher: any,
    private _config: ConfigOptions,
    private _log: Logger,
  ) {
    this._pendingTimeoutId = null
  }

  onStart() {
    setTimeout(() => {
      this._pendingTimeoutId = null
      if (this._launcher.state !== this._launcher.STATE_BEING_CAPTURED) {
        return
      }

      this._log.warn(`${this._launcher.name} has not captured in ${this._config.captureTimeout} ms, killing.`)
      this._launcher.error = 'timeout'
      this._launcher.kill()
    }, this._config.captureTimeout)
  }

  onDone() {
    if (this._pendingTimeoutId) {
      clearTimeout(this._pendingTimeoutId)
    }
  }
}
