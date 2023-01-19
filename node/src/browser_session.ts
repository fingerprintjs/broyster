export interface Result {
  startTime: number
  total: number
  success: number
  failed: number
  skipped: number
  totalTime: number
  netTime: number
  error: boolean
  disconnected: boolean
}

export interface BrowserSession {
  id: string
  launchId: string
  lastResult: Result
}
