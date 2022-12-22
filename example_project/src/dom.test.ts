import { retryFailedTests } from '../jasmine_retry'
import { createButton } from './dom'

describe('DOM', () => {
  beforeAll(() => retryFailedTests(3, 100))

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
  })
})
