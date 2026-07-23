import { Builder, type WebDriver } from 'selenium-webdriver'

import type { BrowserStackCredentials } from './credentials'
import { BROWSERSTACK_HUB } from './constants'

export async function createWebDriver(
  capabilities: Record<string, unknown>,
  credentials: BrowserStackCredentials,
): Promise<WebDriver> {
  const bstackOptions = (capabilities['bstack:options'] as Record<string, unknown>) || {}

  const driver = await new Builder()
    .usingServer(BROWSERSTACK_HUB)
    .withCapabilities({
      ...capabilities,
      'bstack:options': {
        ...bstackOptions,
        userName: credentials.username,
        accessKey: credentials.accessKey,
      },
    })
    .build()

  return driver
}
