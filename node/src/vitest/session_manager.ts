export class BrowserStackSessionManager {
  private static sessionIds = new Map<string, string>()
  private static tunnelIdentifier: string | null = null

  static setSessionId(projectName: string, bsSessionId: string): void {
    this.sessionIds.set(projectName, bsSessionId)
  }

  static getAllSessionIds(): Map<string, string> {
    return new Map(this.sessionIds)
  }

  static setTunnelIdentifier(identifier: string | null): void {
    this.tunnelIdentifier = identifier
  }

  static getTunnelIdentifier(): string | null {
    return this.tunnelIdentifier
  }

  static clear(): void {
    this.sessionIds.clear()
    this.tunnelIdentifier = null
  }
}
