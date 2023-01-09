declare module 'browserstack' {
  export type AutomateClient = {
    updateSession(id: string, options: object, fn: (err: string) => void): void
  }
  export function createAutomateClient(credentials: unknown): AutomateClient
}
