import { ThenableWebDriver } from 'selenium-webdriver'

export type BrowserMap = Map<string, { browser: ThenableWebDriver; session: string }>
