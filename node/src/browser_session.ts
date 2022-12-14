export interface BrowserSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
  credentials: BrowserstackCredentials
  lastResult: Result
  launchId: string
  id: string
}

export interface Result {
  error: object | undefined
  disconnected: object | undefined
  failed: boolean
}

export interface BrowserstackCredentials {
  username: string
  password: string
  proxy: string
}
