declare module 'browserstack' {
  export type AutomateClient = {
    updateSession(id: string, options: object, fn: (err: string) => void): void
    getPlan(): GetPlanResponse
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
