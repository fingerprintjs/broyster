import type { BrowserStackCredentials } from './credentials'
import { createBrowserStackAutomateClient } from './browserstack_client'

export function reportSessionStatus(
  credentials: BrowserStackCredentials,
  sessionId: string,
  status: 'passed' | 'failed',
  callback?: (error: string | null) => void,
): void {
  const client = createBrowserStackAutomateClient({
    username: credentials.username,
    password: credentials.accessKey,
  })
  client.updateSession(sessionId, { status }, (err: string | null) => {
    callback?.(err || null)
  })
}

export function reportSessionStatusAsync(
  credentials: BrowserStackCredentials,
  sessionId: string,
  status: 'passed' | 'failed',
): Promise<void> {
  return new Promise((resolve, reject) => {
    reportSessionStatus(credentials, sessionId, status, (err) => {
      if (err) {
        reject(new Error(`Failed to update BrowserStack session ${sessionId}: ${err}`))
      } else {
        resolve()
      }
    })
  })
}
