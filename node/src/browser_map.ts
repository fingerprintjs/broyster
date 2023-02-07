import { WebDriver } from 'selenium-webdriver'

export type BrowserMap = Map<string, { browser: WebDriver; session: string }>

export function makeBrowserMapFactory(): BrowserMap {
  return new Map<string, { browser: WebDriver; session: string }>() satisfies BrowserMap
}
