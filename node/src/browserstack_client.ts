type BrowserStackClientSettings = {
  username: string
  password: string
}

type BrowserStackAutomatePlan = {
  parallel_sessions_max_allowed: number
  parallel_sessions_running: number
}

type BrowserStackAutomateClient = {
  getPlan(callback: (error: unknown, result: BrowserStackAutomatePlan) => void): void
  updateSession(
    sessionId: string,
    options: { status: 'passed' | 'failed' },
    callback: (error: string | null) => void,
  ): void
}

type BrowserStackModule = {
  createAutomateClient(settings: BrowserStackClientSettings): BrowserStackAutomateClient
}

// browserstack is CommonJS-only and does not ship TypeScript declarations.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const browserstack = require('browserstack') as BrowserStackModule

export const createBrowserStackAutomateClient = browserstack.createAutomateClient
