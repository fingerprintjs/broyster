import { createButton } from './dom'
import { retryFailedTests } from '@fpjs-incubator/broyster/browser'
import * as UAParser from 'ua-parser-js'

retryFailedTests(3, 100)
describe('DOM', () => {
  describe('createButton', () => {
    it('creates a button', () => {
      const button = createButton('Click me!')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(button.textContent).toBe('Click me!')
    })

    it('attaches ad onClick handler', () => {
      const onClick = jasmine.createSpy()
      const button = createButton('Click me!', onClick)
      button.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('has a secure context', () => {
      const parser = new UAParser()
      const result = parser.getResult()
      if (!(isDesktopSafari(result) || isMobileSafari11(result))) {
        expect(window.isSecureContext).toBeTrue()
      }

      function isDesktopSafari(result: UAParser.IResult): boolean {
        return (
          result.browser.name!.startsWith('Safari') &&
          result.os.name === 'Mac OS' &&
          parseInt(result.browser.version ?? '0') >= 15
        )
      }

      function isMobileSafari11(result: UAParser.IResult): boolean {
        return result.browser.name!.startsWith('Mobile Safari') && result.browser.version === '11.0'
      }
    })
  })
})
