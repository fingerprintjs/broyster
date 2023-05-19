import { SauceLabsSessionCapabilities } from './saucelabs_session_capabilities'

export class SauceLabsCapabilitiesFactory {
  constructor(private _tunnel = true) {}

  create(
    browserName: string | undefined,
    buildName: string,
    sessionName: string,
    projectName: string,
    deviceName: string | undefined,
    os: string | undefined,
    idleTimeout: number,
    osVersion?: string | undefined,
    browserVersion?: string | null | undefined,
    localIdentifier?: string | undefined,
  ): SauceLabsSessionCapabilities {
    return {
      'sauce:options': {
        name: sessionName,
        build: buildName,
        tunnelName: localIdentifier ?? '',
      },
      browserName: browserName?.toLowerCase(),
      browserVersion: browserVersion || 'dev',
      platformName: os,
      acceptInsecureCerts: true,
    }
  }
}
