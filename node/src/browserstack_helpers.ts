import { AutomateClient, createAutomateClient } from 'browserstack'
import { promisify } from 'util'
import { Logger } from './karma_logger'

export interface BrowserStackCredentials {
  username: string
  accessKey: string
}

/**
 * Don't use this function directly. Instead, inject the credentials as a dependency.
 */
export function getBrowserStackCredentials(): BrowserStackCredentials {
  return {
    username:
      process.env.BROWSERSTACK_USERNAME ||
      process.env.BROWSER_STACK_USERNAME ||
      (() => {
        throw new Error('BrowserStack username is empty')
      })(),
    accessKey:
      process.env.BROWSERSTACK_ACCESS_KEY ||
      process.env.BROWSER_STACK_ACCESS_KEY ||
      (() => {
        throw new Error('BrowserStack access key is empty')
      })(),
  }
}

export function createBrowserStackClient(credentials: BrowserStackCredentials): AutomateClient {
  return createAutomateClient({
    username: credentials.username,
    password: credentials.accessKey,
  })
}

export async function canNewBrowserBeQueued(
  credentials: BrowserStackCredentials,
  slots: number,
  log: Logger,
): Promise<boolean> {
  const browserstackClient = createBrowserStackClient(credentials)
  log.debug('calling getPlan')
  const result = await promisify(browserstackClient.getPlan).call(browserstackClient)
  log.debug('getPlan returned:')
  log.debug(JSON.stringify(result))
  const max = result.parallel_sessions_max_allowed
  const running = result.parallel_sessions_running

  const canRun = max - running >= slots
  log.debug('Max queue: ' + max + '. Running: ' + running + '. Required ' + slots + '. Returning: ' + canRun)
  return canRun
}
