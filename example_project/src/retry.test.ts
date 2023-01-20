import { retryFailedTests } from '@fpjs-incubator/broyster/browser'

retryFailedTests(3, 100)

let number = 0
describe('Running', () => {
  describe('a failing test', () => {
    it('will retry up to 3 times', () => {
      number++
      expect(number).toBe(2)
    })
  })
})
