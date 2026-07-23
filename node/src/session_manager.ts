/**
 * Shared state between provider instances and the reporter.
 *
 * Each browser.instances entry creates a separate TestProject with its own
 * provider instance. The reporter is a single instance across all projects.
 * They need to share BrowserStack session IDs for status reporting.
 *
 * Shutdown note: clear() is called via vitest.onClose(), which runs
 * concurrently with provider.close() via Promise.allSettled(). This is
 * safe because provider.close() does not read from SessionManager.
 */
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
