declare module 'browserstack' {
  // API reference @ https://github.com/scottgonzalez/node-browserstack#api
  export type AutomateClient = {
    updateSession(id: string, options: object, fn: (err: string) => void): void
    getPlan(fn: (err: string, data: GetPlanResponse) => void): void
    getBrowsers(fn: (err: string, browsers: Browser[]) => void): void
  }

  export function createAutomateClient(credentials: unknown): AutomateClient

  export interface GetPlanResponse {
    automate_plan: string
    parallel_sessions_running: number
    team_parallel_sessions_max_allowed: number
    parallel_sessions_max_allowed: number
    queued_sessions: number
    queued_sessions_max_allowed: number
  }

  export interface Browser {
    os: 'Windows' | 'OS X' | 'android' | 'ios'
    os_version: string
    browser: 'chrome' | 'opera' | 'firefox' | 'ie' | 'edge' | 'chromium' | 'iphone' | 'ipad' | 'android' | 'samsung'
    device: string | null
    browser_version: string | null
    real_mobile: boolean | null
  }
}
