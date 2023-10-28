import { BrowserStackSessionCapabilities } from './browserstack_session_capabilities'
import { BrowserStackCredentials } from './browserstack_helpers'

export class BrowserStackCapabilitiesFactory {
  constructor(private _credentials: BrowserStackCredentials, private _local = true) {}

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
  ): BrowserStackSessionCapabilities {
    return {
      'bstack:options': {
        os: os,
        osVersion: osVersion,
        deviceName: deviceName,
        projectName: projectName,
        sessionName: sessionName,
        buildName: buildName,
        local: this._local,
        userName: this._credentials.username,
        accessKey: this._credentials.accessKey,
        idleTimeout: idleTimeout,
        localIdentifier: localIdentifier,
        networkLogs: true,
        networkLogsOptions: {
          captureContent: 'true',
        },
        consoleLogs: 'verbose',
      },
      browserName: browserName?.toLowerCase(),
      browserVersion: browserVersion || 'latest',
      acceptInsecureCerts: true,
    }
  }
}
