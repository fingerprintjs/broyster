import { BrowserStackApiClient } from './api_client.js'
import type { BrowserStackCredentials } from './credentials.js'

export type QueueWaitOptions = {
  pollInterval?: number
  timeout?: number
}

/**
 * Tracks free parallel-session slots on the BrowserStack Automate plan.
 */
export class BrowserStackQueue {
  private client: BrowserStackApiClient

  constructor(credentials: BrowserStackCredentials, client?: BrowserStackApiClient) {
    this.client = client ?? new BrowserStackApiClient(credentials)
  }

  async getAvailableSlots(): Promise<number> {
    const plan = await this.client.getPlan()
    return Math.max(0, plan.parallelSessionsMaxAllowed - plan.parallelSessionsRunning)
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
