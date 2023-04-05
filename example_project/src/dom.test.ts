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
      const parser = new UAParser()
      const result = parser.getResult()
      if (!isDesktopSafari15OrHigher(result)) {
        const isSecureContext = window.isSecureContext
        if (isSecureContext !== undefined) {
          expect(isSecureContext).toBeTrue()
        }
      }

      function isDesktopSafari15OrHigher(result: UAParser.IResult): boolean {
        return (
          (result.browser.name?.startsWith('Safari') ?? false) &&
          result.os.name === 'Mac OS' &&
          parseInt(result.browser.version ?? '0') >= 15
        )
      }
    })
  })
})
