import { AutomateClient, createAutomateClient } from 'browserstack'
import { promisify } from 'util'
import { Logger } from './karma_logger'

export function getBrowserStackUserName(): string {
  const username =
    process.env.BROWSERSTACK_USERNAME ||
    process.env.BROWSER_STACK_USERNAME ||
    (() => {
      throw new Error('BrowserStack username is empty')
    })()
  return username
}

export function getBrowserStackAccessKey(): string {
  const username =
    process.env.BROWSERSTACK_ACCESS_KEY ||
    process.env.BROWSER_STACK_ACCESS_KEY ||
    (() => {
      throw new Error('BrowserStack access key is empty')
    })()
  return username
}

export function createBrowserStackClient(): AutomateClient {
  return createAutomateClient({
    username: getBrowserStackUserName(),
    password: getBrowserStackAccessKey(),
  })
}

export async function canNewBrowserBeQueued(log: Logger): Promise<boolean> {
  const browserstackClient = createBrowserStackClient()
  log.debug('calling getPlan')
  const result = await promisify(browserstackClient.getPlan).call(browserstackClient)
  log.debug('getPlan returned:')
  log.debug(JSON.stringify(result))
  const max = result.parallel_sessions_max_allowed
  const running = result.parallel_sessions_running

  const canRun = running < max
  log.debug('Max queue: ' + max + '. Running: ' + running + '. Returning: ' + canRun)
  return canRun
}
