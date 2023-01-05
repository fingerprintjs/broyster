import { createAutomateClient } from 'browserstack'
import { promisify } from 'util'
import { Logger } from './karma_logger'

export async function canNewBrowserBeQueued(log: Logger): Promise<boolean> {
  // TODO: fix when housekeeping
  const browserstackClient = createAutomateClient({
    username:
      process.env.BROWSERSTACK_USERNAME ||
      process.env.BROWSER_STACK_USERNAME ||
      (() => {
        throw new Error('BrowserStack username is empty')
      })(),
    password:
      process.env.BROWSERSTACK_ACCESS_KEY ||
      process.env.BROWSER_STACK_ACCESS_KEY ||
      (() => {
        throw new Error('BrowserStack access key is empty')
      })(),
  })
  log.debug('calling getPlan')
  const result = await promisify(browserstackClient.getPlan).call(browserstackClient)
  log.debug('getPlan returned:')
  log.debug(JSON.stringify(result))
  const max = result.queued_sessions_max_allowed + result.team_parallel_sessions_max_allowed
  const running = result.parallel_sessions_running + result.queued_sessions

  const canRun = running < max
  log.debug('Max queue: ' + max + '. Running: ' + running + '. Returning: ' + canRun)
  return canRun
}
