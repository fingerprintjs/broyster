export interface SessionMap {
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
