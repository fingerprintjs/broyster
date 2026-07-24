import { describe, expect, it } from 'vitest'

import {
  CHILD_CONTEXT_ENV,
  CHILD_CONTEXT_SCHEMA_VERSION,
  readChildContext,
  serializeChildContext,
  type ChildRunContext,
} from '../src/env_contract.js'

const validContext: ChildRunContext = {
  schemaVersion: CHILD_CONTEXT_SCHEMA_VERSION,
  browserKey: 'Windows11_ChromeLatest',
  browser: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  buildName: 'build-1',
  publicOrigin: 'https://slot-1.example.com',
  useHttps: true,
  apiPort: 7201,
  readyFile: '/tmp/ready',
  failedFilesOut: '/tmp/failed.json',
  attempt: 'initial',
  queueManagedExternally: true,
  capabilities: { local: true, localIdentifier: 'tunnel-1' },
}

describe('child run context', () => {
  it('round-trips through the environment variable', () => {
    const env = serializeChildContext(validContext)

    expect(Object.keys(env)).toEqual([CHILD_CONTEXT_ENV])
    expect(readChildContext(env)).toEqual(validContext)
  })

  it('returns undefined when the variable is not set', () => {
    expect(readChildContext({})).toBeUndefined()
  })

  it('rejects invalid JSON', () => {
    expect(() => readChildContext({ [CHILD_CONTEXT_ENV]: '{oops' })).toThrow(/invalid JSON/)
  })

  it.each([
    ['schemaVersion', { schemaVersion: 2 }, /"schemaVersion"/],
    ['browserKey', { browserKey: '' }, /"browserKey"/],
    ['browser', { browser: null }, /"browser"/],
    ['publicOrigin URL', { publicOrigin: 'not a url' }, /"publicOrigin"/],
    ['publicOrigin protocol', { publicOrigin: 'ftp://slot.example.com' }, /HTTP or HTTPS/],
    ['publicOrigin credentials', { publicOrigin: 'https://user:secret@slot.example.com' }, /credentials/],
    ['protocol mismatch', { publicOrigin: 'http://slot.example.com' }, /useHttps/],
    ['apiPort', { apiPort: 0 }, /"apiPort"/],
    ['apiPort maximum', { apiPort: 65_536 }, /"apiPort"/],
    ['apiPort type', { apiPort: '7201' }, /"apiPort"/],
    ['attempt', { attempt: 'third' }, /"attempt"/],
    ['useHttps', { useHttps: 'yes' }, /"useHttps"/],
    ['capabilities', { capabilities: 'chrome' }, /"capabilities"/],
    [
      'credential capabilities',
      { capabilities: { bstackOptions: { accessKey: 'secret' } } },
      /must not contain BrowserStack credentials/,
    ],
    ['readyFile', { readyFile: 5 }, /"readyFile"/],
    ['relative readyFile', { readyFile: 'ready' }, /absolute path/],
  ])('rejects a malformed %s', (_name, override, message) => {
    const env = { [CHILD_CONTEXT_ENV]: JSON.stringify({ ...validContext, ...override }) }
    expect(() => readChildContext(env)).toThrow(message)
  })

  it('accepts a context without optional fields', () => {
    const { readyFile, failedFilesOut, capabilities, ...required } = validContext
    void readyFile
    void failedFilesOut
    void capabilities
    const env = { [CHILD_CONTEXT_ENV]: JSON.stringify(required) }

    expect(readChildContext(env)).toEqual(required)
  })

  it('accepts an HTTP slot when the transport downgrades an HTTPS browser request', () => {
    const downgraded = {
      ...validContext,
      publicOrigin: 'http://bs-local.com:7201',
      useHttps: false,
    }

    expect(readChildContext(serializeChildContext(downgraded))).toEqual(downgraded)
  })
})
