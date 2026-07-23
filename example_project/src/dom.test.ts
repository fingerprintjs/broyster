import { describe, it, expect, vi } from 'vitest'
import { createButton } from './dom'
import UAParser from 'ua-parser-js'

describe('DOM', () => {
  describe('createButton', () => {
    it('creates a button', () => {
      const button = createButton('Click me!')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(button.textContent).toBe('Click me!')
    })

    it('attaches an onClick handler', () => {
      const onClick = vi.fn()
      const button = createButton('Click me!', onClick)
      button.click()
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('has a secure context', () => {
      if (!isSecureContextUnsupported()) {
        const isSecureContext = window.isSecureContext
        if (isSecureContext !== undefined) {
          expect(isSecureContext).toBe(true)
        }
      }

      function isSecureContextUnsupported(): boolean {
        const result = new UAParser().getResult()
        const isSafari = /^(Mobile )?Safari$/.test(result.browser.name ?? '')
        const isMacOS = result.os.name === 'Mac OS'
        const browserVersion = parseInt(result.browser.version ?? '0', 10)
        return isSafari && isMacOS && browserVersion >= 15
      }
    })
  })
})
