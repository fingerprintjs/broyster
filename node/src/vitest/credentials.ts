export type BrowserStackCredentials = {
  username: string
  accessKey: string
}

export function getCredentials(): BrowserStackCredentials {
  const username = process.env.BROWSERSTACK_USERNAME
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY

  if (!username || !accessKey) {
    throw new Error(
      'BrowserStack credentials missing. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables.',
    )
  }

  return { username, accessKey }
}
