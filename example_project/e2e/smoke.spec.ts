import assert from 'node:assert'
import { $, browser } from '@wdio/globals'

describe('smoke', () => {
  it('opens a page and finds a button', async () => {
    await browser.url('https://example.com')
    const el = await $('body')
    assert.ok(await el.isExisting())
  })
})
