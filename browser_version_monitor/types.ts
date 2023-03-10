import { ConfigOptions, CustomLauncher } from 'karma'

export type ConfigWithBrowserStackOptions = ConfigOptions & {
  browserStack: {
    project: string
    build: string | number
    idleTimeout?: number
    queueTimeout?: number
  }
}

export type ExtendedCustomLauncher = CustomLauncher & {
  name?: number | undefined
  osVersion?: string | undefined
  deviceName?: string | string[] | undefined
  browserVersion?: string | null | undefined
  firefoxCapabilities?: Array<[string, string | number | boolean]>
  useHttps?: boolean | undefined
}
