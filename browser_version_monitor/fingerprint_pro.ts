export interface Confidence {
  score: number
}

export interface Meta {
  version: string
}

export interface FingerprintPro {
  requestId: string
  confidence: Confidence
  meta: Meta
  visitorFound: boolean
  visitorId: string
}

// types

declare module 'karma' {
  interface ConfigOptions {
    browserStack?: {
      project: string
      build: string | number
      idleTimeout?: number
      queueTimeout?: number
    }
  }

  interface CustomLauncher {
    name?: string | undefined
    osVersion?: string | undefined
    deviceName?: string | string[] | undefined
    browserVersion?: string | null | undefined
    firefoxCapabilities?: Array<[string, string | number | boolean]>
    useHttps?: boolean | undefined
    //extraSettings?: string[] | undefined; //TODO things like timezone, locale
  }
}
