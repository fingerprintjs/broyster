import { describe, expect, it, vi } from 'vitest'

import { createButton } from './dom'

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

    it('has a secure context when served over HTTPS', () => {
      // Browsers served over HTTP (e.g. WebKit through the BrowserStack Local
      // transport) can't have a secure context; the assertion only makes sense
      // when broyster claims to serve HTTPS.
      if (location.protocol === 'https:') {
        expect(window.isSecureContext).toBe(true)
      }
    })
  })
})
