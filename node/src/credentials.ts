export type BrowserStackCredentials = {
  username: string
  accessKey: string
}

export function getCredentials(): BrowserStackCredentials {
  const username = process.env.BROWSERSTACK_USERNAME || process.env.BROWSER_STACK_USERNAME
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY || process.env.BROWSER_STACK_ACCESS_KEY

  if (!username || !accessKey) {
    throw new Error(
      'BrowserStack credentials not found. ' +
        'Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables.',
    )
  }

  return { username, accessKey }
}
