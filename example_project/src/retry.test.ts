import { describe, expect, it } from 'vitest'

let number = 0

describe('Retry behavior', () => {
  it('will retry up to 3 times', { retry: 3 }, () => {
    number++
    expect(number).toBe(3)
  })

  it('runs without retry and passes', () => {
    expect(true).toBe(true)
  })

  it.skip('will not be retried', () => {
    // This test is intentionally skipped
  })
})
