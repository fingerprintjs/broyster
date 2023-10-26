export interface BstackOptions {
  os: string | undefined
  osVersion?: string | undefined
  deviceName?: string | undefined
  projectName: string
  buildName: string
  sessionName: string
  local: boolean
  userName: string
  accessKey: string
  idleTimeout: number
  localIdentifier?: string | undefined
  networkLogs?: boolean
  networkLogsOptions?: NetworkLogsOptions
  consoleLogs?: string
}

export interface NetworkLogsOptions {
  captureContent: string
}
