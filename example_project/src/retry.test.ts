import { describe, expect, it } from 'vitest'

let number = 0

describe('Running', () => {
  describe('a failing test', () => {
    it('will retry up to 3 times', { retry: 3 }, () => {
      number++
      expect(number).toBe(3)
    })
  })

  // Vitest: use skip/todo instead of Jasmine `pending`
  describe('a pending test', () => {
    it.skip('will not be retried', () => {
      // intentionally skipped
    })
    // or:
    // it.todo('will not be retried');
  })
})
