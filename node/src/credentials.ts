export type BrowserStackCredentials = {
  username: string
  accessKey: string
}

export function getBrowserStackCredentials(env: NodeJS.ProcessEnv = process.env): BrowserStackCredentials {
  const username = env.BROWSERSTACK_USERNAME || env.BROWSER_STACK_USERNAME
  const accessKey = env.BROWSERSTACK_ACCESS_KEY || env.BROWSER_STACK_ACCESS_KEY

  if (!username || !accessKey) {
    throw new Error(
      'BrowserStack credentials not found. ' +
        'Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables.',
    )
  }

  return { username, accessKey }
}
