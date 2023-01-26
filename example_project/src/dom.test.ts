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
      if (
        !(
          result.browser.name?.match('Safari') &&
          ((result.browser.name.match('Mobile') && result.browser.version === '11.0') ||
            parseInt(result.browser.version ?? '0') >= 15)
        )
      ) {
        expect(window.isSecureContext).toBeTrue()
      }
    })
  })
})
