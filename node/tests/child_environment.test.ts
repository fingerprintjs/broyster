import { describe, expect, it } from 'vitest'

import { parseAttemptReport } from '../src/contracts/attempt_report.js'
import { sanitizeChildEnvironment } from '../src/orchestrator/child.js'

describe('sanitizeChildEnvironment', () => {
  it('removes transport-owned secrets without mutating the input environment', () => {
    const original = {
      CLOUDFLARE_TUNNEL_TOKEN: 'source-secret',
      TUNNEL_TOKEN: 'spawn-secret',
      BROWSERSTACK_ACCESS_KEY: 'provider-secret',
      KEEP_ME: 'value',
    }

    const sanitized = sanitizeChildEnvironment(original, ['CLOUDFLARE_TUNNEL_TOKEN', 'TUNNEL_TOKEN'])

    expect(sanitized).toEqual({
      BROWSERSTACK_ACCESS_KEY: 'provider-secret',
      KEEP_ME: 'value',
    })
    expect(original.CLOUDFLARE_TUNNEL_TOKEN).toBe('source-secret')
  })
})

describe('parseAttemptReport', () => {
  it('drops malformed nested records instead of letting them break the parent artifact', () => {
    const report = parseAttemptReport({
      schemaVersion: 1,
      failedModuleIds: ['broken.test.ts', 42],
      modules: [
        null,
        { id: 'missing-tests.test.ts', status: 'failed' },
        {
          id: 'valid.test.ts',
          status: 'passed',
          duration: Number.NaN,
          errors: [{ message: 'module warning' }, null],
          tests: [
            null,
            {
              id: 'test-1',
              name: 'works',
              fullName: 'suite works',
              status: 'passed',
              duration: -5,
              errors: [{ message: 'ignored result detail' }],
            },
          ],
        },
      ],
      unhandledErrors: [null, { name: 'Error', message: 'safe' }],
      warnings: ['warning', 1],
    })

    expect(report).toEqual({
      failedModuleIds: ['broken.test.ts'],
      modules: [
        {
          id: 'valid.test.ts',
          status: 'passed',
          duration: 0,
          errors: [{ message: 'module warning' }],
          tests: [
            {
              id: 'test-1',
              name: 'works',
              fullName: 'suite works',
              status: 'passed',
              duration: 0,
              errors: [{ message: 'ignored result detail' }],
            },
          ],
        },
      ],
      unhandledErrors: [{ name: 'Error', message: 'safe' }],
      warnings: ['warning'],
    })
  })

  it('rejects an unsupported or incomplete top-level contract', () => {
    expect(parseAttemptReport({ schemaVersion: 2, failedModuleIds: [] })).toBeUndefined()
    expect(parseAttemptReport({ schemaVersion: 1 })).toBeUndefined()
  })
})
