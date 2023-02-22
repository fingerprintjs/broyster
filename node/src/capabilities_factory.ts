import { SessionCapabilities } from './session_capabilities'

export class CapabilitiesFactory {
  _username: string
  _accessKey: string

  constructor(username: string, accessKey: string) {
    this._username = username
    this._accessKey = accessKey
  }

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
  ): SessionCapabilities {
    return {
      'bstack:options': {
        os: os,
        osVersion: osVersion,
        deviceName: deviceName,
        projectName: projectName,
        sessionName: sessionName,
        buildName: buildName,
        local: true,
        userName: this._username,
        accessKey: this._accessKey,
        idleTimeout: idleTimeout,
      },
      browserName: browserName?.toLowerCase(),
      browserVersion: browserVersion || 'latest',
      acceptInsecureCerts: true,
    }
  }
}
