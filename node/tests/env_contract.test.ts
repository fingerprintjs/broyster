import { describe, expect, it } from 'vitest'

import {
  CHILD_CONTEXT_ENV,
  readChildContext,
  serializeChildContext,
  type ChildRunContext,
} from '../src/env_contract.js'

const validContext: ChildRunContext = {
  browserKey: 'Windows11_ChromeLatest',
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
    ['browserKey', { browserKey: '' }, /"browserKey"/],
    ['publicOrigin URL', { publicOrigin: 'not a url' }, /"publicOrigin"/],
    ['apiPort', { apiPort: 0 }, /"apiPort"/],
    ['apiPort type', { apiPort: '7201' }, /"apiPort"/],
    ['attempt', { attempt: 'third' }, /"attempt"/],
    ['useHttps', { useHttps: 'yes' }, /"useHttps"/],
    ['capabilities', { capabilities: 'chrome' }, /"capabilities"/],
    ['readyFile', { readyFile: 5 }, /"readyFile"/],
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
})
