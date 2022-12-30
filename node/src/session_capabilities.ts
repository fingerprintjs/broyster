import { BstackOptions } from './bstack_options'

export interface SessionCapabilities {
  'bstack:options': BstackOptions
  browserName: string
  browserVersion: string
  acceptInsecureCerts: boolean
}
