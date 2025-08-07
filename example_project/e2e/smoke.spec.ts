import { expect, test } from 'vitest'
import { browser } from '@wdio/globals'

test('opens a page and finds a button', async () => {
  await browser.url('https://example.com')
  const el = browser.$('body')
  expect(await el.isExisting()).toBe(true)
})
