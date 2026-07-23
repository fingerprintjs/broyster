export type BrowserStackRuntimeSession = {
  projectName: string
  sessionId: string
}

/** Per-config state shared by the provider and reporters. */
export class BrowserStackRuntime {
  private readonly sessions = new Map<string, string>()
  private readonly warnings = new Set<string>()
  private statusUpdate: Promise<void> = Promise.resolve()

  setSession(projectName: string, sessionId: string): void {
    this.sessions.set(projectName, sessionId)
  }

  getSession(projectName: string): BrowserStackRuntimeSession | undefined {
    const sessionId = this.sessions.get(projectName)
    return sessionId === undefined ? undefined : { projectName, sessionId }
  }

  getSessions(): BrowserStackRuntimeSession[] {
    return [...this.sessions].map(([projectName, sessionId]) => ({ projectName, sessionId }))
  }

  addWarning(warning: string): void {
    this.warnings.add(warning)
  }

  getWarnings(): string[] {
    return [...this.warnings]
  }

  trackStatusUpdate(update: Promise<void>): void {
    this.statusUpdate = update
  }

  async waitForStatusUpdate(): Promise<void> {
    await this.statusUpdate
  }

  clear(): void {
    this.sessions.clear()
    this.warnings.clear()
    this.statusUpdate = Promise.resolve()
  }
}
