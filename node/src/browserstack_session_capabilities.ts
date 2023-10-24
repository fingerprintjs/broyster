import { BstackOptions } from './bstack_options'

export interface BrowserStackSessionCapabilities {
  'bstack:options': BstackOptions & Record<string, unknown>
  browserName?: string | undefined
  browserVersion?: string | undefined
  acceptInsecureCerts: boolean
  safariOptions?: string[]
}
