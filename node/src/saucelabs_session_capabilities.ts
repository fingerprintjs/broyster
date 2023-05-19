import { SauceOptions } from './sauce_options'
import { SauceLabsCredentials } from './saucelabs_helpers'

export interface SauceLabsSessionCapabilities {
  'sauce:options': SauceOptions
  browserName?: string | undefined
  browserVersion?: string | undefined
  acceptInsecureCerts: boolean
  safariOptions?: string[]
  platformName: string | undefined
  browser?: string | undefined
}

export interface SauceLabsCapabilities {
  capabilities: SauceLabsSessionCapabilities
  credentials: SauceLabsCredentials
}
