import { describe, expect, it } from 'vitest'

// Validates the retry mechanism: both example configs set `retry: 2`, so this
// test fails twice and passes on the third attempt.
let attempt = 0
describe('Running', () => {
  describe('a failing test', () => {
    it('will retry up to 3 times', () => {
      attempt++
      expect(attempt).toBe(3)
    })
  })
})
