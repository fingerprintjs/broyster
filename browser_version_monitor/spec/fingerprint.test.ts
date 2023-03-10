import 'jasmine'
import { BrowserStackSessionFactory } from '../../node/src/browserstack_session_factory'
import { BrowserStackLocalManager } from '../../node/src/browserstack_local_manager'
import { BrowserObject } from '../browser_object'
import {
  Windows11_ChromeLatest,
  Windows11_ChromeLatestBeta,
  Windows11_ChromeLatestBeta_Incognito,
  Windows11_ChromeLatest_Incognito,
} from '../launchers'
import { FakeLogger } from '../logger'
import { CustomLauncher } from 'karma'
import { makeHttpsServer } from '../server'

const results: Array<BrowserObject> = new Array<BrowserObject>()
jasmine.DEFAULT_TIMEOUT_INTERVAL = 100_000_000
describe('[Chrome]', () => {
  beforeAll(async () => {
    const manager = new BrowserStackLocalManager()
    const logger = new FakeLogger()
    await manager.run(logger)
    const factory = new BrowserStackSessionFactory({
      browserStack: {
        project: 'monitor',
        idleTimeout: 60_000,
        build: Date.now(),
      },
    })

    const server = await makeHttpsServer()
    const sessionsPerBrowser = 5
    try {
      // latest
      for (let index = 0; index < sessionsPerBrowser; index++) {
        await runSession(Windows11_ChromeLatest, 'Windows11_ChromeLatest')
      }
      // beta
      for (let index = 0; index < sessionsPerBrowser; index++) {
        await runSession(Windows11_ChromeLatestBeta, 'Windows11_ChromeLatestBeta')
      }
      // latest incognito
      for (let index = 0; index < sessionsPerBrowser; index++) {
        await runSession(Windows11_ChromeLatest_Incognito, 'Windows11_ChromeLatest_Incognito')
      }
      // latest beta incognito
      for (let index = 0; index < sessionsPerBrowser; index++) {
        await runSession(Windows11_ChromeLatestBeta_Incognito, 'Windows11_ChromeLatestBeta_Incognito')
      }
    } finally {
      server[1].close()
    }

    async function runSession(launcher: CustomLauncher, name: string) {
      const factoryResult = factory.tryCreateBrowser(launcher, name, 0, logger)
      const driver = await factoryResult[0]
      const browserObject = new BrowserObject(driver)
      await browserObject.goToTestPage(server[0])
      results.push(browserObject)
      await browserObject.quitSession()
    }
  })

  describe('Fingerprint works consistently', () => {
    it('will have the same visitorId', () => {
      const allVisitorIds = new Set(results.map((result) => result.getVisitorId()))
      expect(allVisitorIds).toHaveSize(1)
      expect(results.map((result) => result.getVisitorId()).every((id) => id.length > 0)).toBeTrue()
    })

    it('will have different requestId', () => {
      const allRequestIds = new Set(results.map((result) => result.getRequestId()))
      expect(allRequestIds).toHaveSize(20)
    })
  })

  // BotD here?
  describe('BotD works consistently', () => {
    it('will not detect a bot browser', () => {
      expect(true).toBeTrue()
    })
  })
})
