import { BstackOptions } from './bstack_options'

export interface SessionCapabilities {
  'bstack:options': BstackOptions
  browserName?: string | undefined
  browserVersion?: string | undefined
  acceptInsecureCerts: boolean
  safariOptions?: string[]
}
