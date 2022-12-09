export interface DesiredBrowser {
  os: string | undefined
  osVersion: string
  deviceName: string | undefined
  browserName: string
  browserVersion: string | null | undefined
  flags: string[]
  firefoxCapabilities?: Array<[string, string | number | boolean]>
  useHttps: boolean
  //extraSettings: string[]; //TODO things like timezone, locale
}
