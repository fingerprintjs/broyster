import { retryFailedTests } from '@fpjs-incubator/broyster/browser'
import { createButton } from './dom'

retryFailedTests(3, 100)
let number = 0
describe('DOM', () => {
  describe('createButton', () => {
    it('retries failed tests', () => {
      number++
      expect(number).toBe(2)
    })

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
