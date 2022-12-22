import { KarmaTypescriptConfig } from 'karma-typescript/dist/api/configuration'

declare module 'karma' {
  export interface ConfigOptions {
    karmaTypescriptConfig?: KarmaTypescriptConfig | undefined
    browserStack?: {
      project: string
      build: string | number
      timeout: number
    }
  }

  export interface Config {
    preset?: string
    reporters: string[]
  }

  export interface CustomLauncher {
    name: string
  }
}
