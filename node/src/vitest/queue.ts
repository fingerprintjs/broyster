import { promisify } from 'node:util'

import type { BrowserStackCredentials } from './credentials'
import { createBrowserStackAutomateClient } from './browserstack_client'

export type QueueWaitOptions = {
  pollInterval?: number
  timeout?: number
}

export class BrowserStackQueue {
  private credentials: BrowserStackCredentials

  constructor(credentials: BrowserStackCredentials) {
    this.credentials = credentials
  }

  async canRun(requiredSlots: number): Promise<boolean> {
    return (await this.getAvailableSlots()) >= requiredSlots
  }

  async getAvailableSlots(): Promise<number> {
    const client = createBrowserStackAutomateClient({
      username: this.credentials.username,
      password: this.credentials.accessKey,
    })
    const result = await promisify(client.getPlan).call(client)
    const max: number = result.parallel_sessions_max_allowed
    const running: number = result.parallel_sessions_running
    return Math.max(0, max - running)
  }

  async waitForAvailability(requiredSlots: number, options?: QueueWaitOptions): Promise<void> {
    await this.waitForAvailableSlots(requiredSlots, options)
  }

  async waitForAvailableSlots(requiredSlots: number, options?: QueueWaitOptions): Promise<number> {
    const pollInterval = options?.pollInterval ?? 10_000
    const timeout = options?.timeout ?? 600_000
    const start = Date.now()

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const availableSlots = await this.getAvailableSlots()
      if (availableSlots >= requiredSlots) {
        return availableSlots
      }
      if (Date.now() - start > timeout) {
        throw new Error(
          `Timed out waiting for BrowserStack queue availability. ` +
            `Need ${requiredSlots} session(s) but none available after ${timeout}ms.`,
        )
      }
      await new Promise<void>((r) => setTimeout(r, pollInterval))
    }
  }
}
