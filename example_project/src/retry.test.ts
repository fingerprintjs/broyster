import { describe, expect, it } from 'vitest'

let number = 0

describe('Running', () => {
  describe('a failing test', () => {
    // Vitest retries are configured via makeVitestConfigurator (retry: 2 → 3 total attempts).
    it('will retry up to 3 times', () => {
      number++
      expect(number).toBe(3)
    })
  })

  describe('a pending test', () => {
    it.skip('will not be retried', () => {
      expect(true).toBe(false)
    })
  })
})
