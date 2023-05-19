/* eslint-disable @typescript-eslint/no-unused-vars */
import { Logger } from './karma_logger'

export interface SauceLabsCredentials {
  username: string
  accessKey: string
  region?: string
}

/**
 * Don't use this function directly. Instead, inject the credentials as a dependency.
 */
export function getSauceLabsCredentials(): SauceLabsCredentials {
  return {
    username:
      process.env.SAUCELABS_USERNAME ||
      process.env.SAUCE_LABS_USERNAME ||
      (() => {
        throw new Error('SauceLabs username is empty')
      })(),
    accessKey:
      process.env.SAUCELABS_ACCESS_KEY ||
      process.env.SAUCE_LABS_ACCESS_KEY ||
      (() => {
        throw new Error('SauceLabs access key is empty')
      })(),
  }
}

export async function canNewBrowserBeQueued(
  _credentials: SauceLabsCredentials,
  _slots: number,
  _log: Logger,
): Promise<boolean> {
  throw new Error('not implemented')
}
