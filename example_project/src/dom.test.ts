import { describe, expect, it, vi } from 'vitest'

import { createButton } from './dom.js'

describe('DOM', () => {
  describe('createButton', () => {
    it('creates a button', () => {
      const button = createButton('Click me!')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      expect(button.textContent).toBe('Click me!')
    })

    it('attaches ad onClick handler', () => {
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
        const userAgent = navigator.userAgent
        const isSafari = /Safari\//.test(userAgent) && !/(?:Chrome|Chromium|CriOS|Android)\//.test(userAgent)
        return isSafari && /Macintosh/.test(userAgent)
      }
    })
  })
})
