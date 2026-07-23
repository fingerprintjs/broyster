import { describe, expect, it } from 'vitest'

import { browserStackLocalTransport } from '../src/transports/browserstack_local.js'

// acquireSlot allocates a local port and needs no tunnel, so these tests run
// without BrowserStack credentials as long as open() is not called.
const noLog = { onLog: () => undefined }

describe('browserStackLocalTransport', () => {
  it('supports both protocols', () => {
    const transport = browserStackLocalTransport(noLog)
    expect(transport.supports({ useHttps: true })).toBe(true)
    expect(transport.supports({ useHttps: false })).toBe(true)
  })

  it('hands out slots up to maxConcurrency and reuses freed capacity', async () => {
    const transport = browserStackLocalTransport({ ...noLog, maxConcurrency: 1 })

    const first = await transport.acquireSlot({ useHttps: true })
    expect(first).toBeDefined()
    expect(await transport.acquireSlot({ useHttps: true })).toBeUndefined()

    transport.releaseSlot(first as NonNullable<typeof first>)
    expect(await transport.acquireSlot({ useHttps: true })).toBeDefined()
  })

  it('builds bs-local.com origins with tunnel capabilities', async () => {
    const transport = browserStackLocalTransport(noLog)
    const slot = await transport.acquireSlot({ useHttps: true, browserName: 'Chrome', platform: 'Windows' })

    expect(slot?.publicOrigin).toBe(`https://bs-local.com:${slot?.localPort}`)
    expect(slot?.useHttps).toBe(true)
    expect(slot?.capabilities?.local).toBe(true)
    expect(slot?.capabilities?.localIdentifier).toMatch(/^broyster-/)
  })

  it('downgrades WebKit browsers from HTTPS to HTTP by default', async () => {
    const logs: string[] = []
    const transport = browserStackLocalTransport({ onLog: (line) => logs.push(line) })

    const safari = await transport.acquireSlot({ useHttps: true, browserName: 'Safari', platform: 'OS X' })
    expect(safari?.useHttps).toBe(false)
    expect(safari?.publicOrigin).toMatch(/^http:/)

    const iosChrome = await transport.acquireSlot({ useHttps: true, browserName: 'Chrome', platform: 'iOS' })
    expect(iosChrome?.useHttps).toBe(false)

    expect(logs.join('\n')).toContain('Serving over HTTP')
  })

  it('does not downgrade non-WebKit browsers or HTTP requirements', async () => {
    const transport = browserStackLocalTransport(noLog)

    const chrome = await transport.acquireSlot({ useHttps: true, browserName: 'Chrome', platform: 'Windows' })
    expect(chrome?.useHttps).toBe(true)

    const safariHttp = await transport.acquireSlot({ useHttps: false, browserName: 'Safari', platform: 'OS X' })
    expect(safariHttp?.useHttps).toBe(false)
  })

  it('keeps HTTPS for WebKit when the downgrade is disabled', async () => {
    const transport = browserStackLocalTransport({ ...noLog, downgradeWebKitHttps: false })

    const safari = await transport.acquireSlot({ useHttps: true, browserName: 'Safari', platform: 'OS X' })
    expect(safari?.useHttps).toBe(true)
  })
})
