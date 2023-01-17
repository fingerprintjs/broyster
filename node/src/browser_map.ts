import { WebDriver } from 'selenium-webdriver'

export type BrowserMap = Map<string, { browser: WebDriver; session: string }>
