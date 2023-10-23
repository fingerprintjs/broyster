import { createButton } from './dom'
import * as UAParser from 'ua-parser-js'

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
      if (!isSecureContextUnsupported()) {
        const isSecureContext = window.isSecureContext
        if (isSecureContext !== undefined) {
          expect(isSecureContext).toBeTrue()
        }
      }

      function isSecureContextUnsupported(): boolean {
        const result = new UAParser().getResult()
        const isSafari = /^(Mobile )?Safari$/.test(result.browser.name ?? '')
        const isMacOS = result.os.name === 'Mac OS'
        const isIOS = result.os.name === 'iOS'
        const browserVersion = parseInt(result.browser.version ?? '0')
        return isSafari && ((isMacOS && browserVersion >= 15) || (isIOS && browserVersion >= 17))
      }
    })
  })
})
