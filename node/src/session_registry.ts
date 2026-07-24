/**
 * Shared state between provider instances and the reporters.
 *
 * Each browser.instances entry creates a separate TestProject with its own
 * provider instance, while each reporter is a single instance across all
 * projects. They need to share BrowserStack session IDs for status reporting.
 * `createBrowserStackConfig` creates one registry and injects it into both
 * sides, so no global state is involved.
 */
export class SessionRegistry {
  private sessionIds = new Map<string, string>()

  setSessionId(projectName: string, bsSessionId: string): void {
    this.sessionIds.set(projectName, bsSessionId)
  }

  getAllSessionIds(): Map<string, string> {
    return new Map(this.sessionIds)
  }

  clear(): void {
    this.sessionIds.clear()
  }
}
