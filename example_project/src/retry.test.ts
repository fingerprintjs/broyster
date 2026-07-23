import { describe, it, expect } from 'vitest'

describe('Running', () => {
  describe('a passing test', () => {
    it('runs successfully', () => {
      expect(true).toBe(true)
    })
  })

  describe('a skipped test', () => {
    it.skip('will not be run', () => {
      expect(false).toBe(true)
    })
  })
})
