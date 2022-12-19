export interface DesiredBrowser extends BrowserBase {
  os: string[] | undefined
  deviceName: string[] | undefined
}

export interface BrowserToCreate extends BrowserBase {
  os: string | undefined
  deviceName: string | undefined
}

export interface BrowserBase {
  osVersion: string
  browserName: string
  browserVersion: string | null | undefined
  flags: string[]
  firefoxCapabilities?: Array<[string, string | number | boolean]>
  useHttps: boolean
  //extraSettings: string[]; //TODO things like timezone, locale
}
