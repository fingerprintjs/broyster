declare module 'browserstack' {
  // API reference @ https://www.browserstack.com/docs/automate/api-reference/selenium/introduction
  export type AutomateClient = {
    updateSession(id: string, options: object, fn: (err: string) => void): void
    getPlan(fn: (err: string, data: GetPlanResponse) => void): void
  }
  export function createAutomateClient(credentials: unknown): AutomateClient
  export function canNewBrowserBeQueued(): boolean
  export interface GetPlanResponse {
    automate_plan: string
    parallel_sessions_running: number
    team_parallel_sessions_max_allowed: number
    parallel_sessions_max_allowed: number
    queued_sessions: number
    queued_sessions_max_allowed: number
  }
}
