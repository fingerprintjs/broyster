import { createAutomateClient } from 'browserstack'

export function canNewBrowserBeQueued(): boolean {
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
  const result = browserstackClient.getPlan()
  console.log(result)
  const max = result.queued_sessions_max_allowed + result.team_parallel_sessions_max_allowed
  const running = result.parallel_sessions_running + result.queued_sessions

  return running < max
}
