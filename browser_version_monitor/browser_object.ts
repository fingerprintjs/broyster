import { By, WebDriver } from 'selenium-webdriver'
import { FingerprintPro } from './fingerprint_pro'

export class BrowserObject {
  private fingerprintResult: FingerprintPro
  private loadFingerprintTime: number
  private getFingerprintTime: number
  constructor(private driver: WebDriver) {
    this.fingerprintResult = new Object() as FingerprintPro
    this.loadFingerprintTime = 0
    this.getFingerprintTime = 0
  }

  async setTimeouts(): Promise<void> {
    await this.driver.manage().setTimeouts({ implicit: 20_000 })
  }

  async goToTestPage(url: string): Promise<void> {
    await this.driver.get(url)
    await this.driver.wait(async () => {
      const result = (await this.driver.findElements(By.id('Fingerprint-done'))).length
      return result > 0
    })
    this.fingerprintResult = JSON.parse(await this.driver.findElement(By.id('Fingerprint-result')).getText())
    this.loadFingerprintTime = parseFloat(await this.driver.findElement(By.id('Fingerprint-loadTime')).getText())
    this.getFingerprintTime = parseFloat(await this.driver.findElement(By.id('Fingerprint-getTime')).getText())
  }

  getFingerprintResult(): FingerprintPro {
    return this.fingerprintResult
  }

  getVisitorId(): string {
    return this.fingerprintResult.visitorId
  }

  getRequestId(): string {
    return this.fingerprintResult.requestId
  }

  getLoadTime(): number {
    return this.loadFingerprintTime
  }

  getGetTime(): number {
    return this.getFingerprintTime
  }

  async quitSession(): Promise<void> {
    await this.driver.quit()
  }
}
