import { afterEach, describe, expect, it, vi } from 'vitest'

import { abortableDelay, abortError, abortReason, throwIfAborted } from '../src/internal/abort.js'
import { compareById, unique, uniqueSorted } from '../src/internal/collections.js'
import { errorMessage, errorStack } from '../src/internal/errors.js'
import { formatJson } from '../src/internal/json.js'
import { createLineForwarder } from '../src/internal/line_forwarder.js'
import { redactSecrets } from '../src/internal/secrets.js'
import {
  finiteNonNegative,
  isNonNegativeInteger,
  isNonNegativeSafeInteger,
  isPort,
  isPositiveInteger,
  isPositiveSafeInteger,
  isRecord,
  parseCsv,
} from '../src/internal/validation.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('internal collection utilities', () => {
  it('deduplicates predictably and sorts non-empty strings', () => {
    expect(unique(['b', 'a', 'b'])).toEqual(['b', 'a'])
    expect(uniqueSorted(['b', '', 'a', 'b'])).toEqual(['a', 'b'])
    expect([{ id: 'b' }, { id: 'a' }].sort(compareById)).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})

describe('internal error formatting', () => {
  it('uses Error messages and preserves stacks when requested', () => {
    const error = new Error('broken')
    expect(errorMessage(error)).toBe('broken')
    expect(errorMessage('broken')).toBe('broken')
    expect(errorStack(error)).toContain('Error: broken')
  })
})

describe('internal line forwarding', () => {
  it('buffers partial chunks and flushes a final unterminated line', () => {
    const lines: string[] = []
    const forwarder = createLineForwarder((line) => lines.push(line))

    forwarder.write('first\nsec')
    forwarder.write('ond\r\n\nthird')
    expect(lines).toEqual(['first', 'second'])

    forwarder.flush()
    forwarder.flush()
    expect(lines).toEqual(['first', 'second', 'third'])
  })

  it('decodes a multi-byte character split across Buffer chunks', () => {
    const lines: string[] = []
    const forwarder = createLineForwarder((line) => lines.push(line))
    const encoded = Buffer.from('before 🙂 after\n')

    forwarder.write(encoded.subarray(0, 9))
    forwarder.write(encoded.subarray(9))

    expect(lines).toEqual(['before 🙂 after'])
  })
})

describe('internal secret redaction', () => {
  it('redacts the longest overlapping secrets first and ignores empty values', () => {
    expect(redactSecrets('token-long token', ['', 'token', 'token-long'])).toBe('[REDACTED] [REDACTED]')
  })
})

describe('internal JSON formatting', () => {
  it('uses stable indentation and a trailing newline', () => {
    expect(formatJson({ value: 1 })).toBe('{\n  "value": 1\n}\n')
  })
})

describe('internal abort utilities', () => {
  it('preserves arbitrary reasons and can normalize them when an Error is required', () => {
    const errorController = new AbortController()
    const reason = new Error('stop')
    errorController.abort(reason)
    expect(abortReason(errorController.signal)).toBe(reason)
    expect(() => throwIfAborted(errorController.signal)).toThrow(reason)

    const stringController = new AbortController()
    stringController.abort('cancelled')
    expect(abortReason(stringController.signal)).toBe('cancelled')
    expect(abortError(stringController.signal)).toMatchObject({
      name: 'AbortError',
      message: 'cancelled',
    })
    let thrown: unknown
    try {
      throwIfAborted(stringController.signal)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe('cancelled')
  })

  it('cancels a pending delay without waiting for its timer', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new Error('cancelled')
    const waiting = abortableDelay(60_000, { signal: controller.signal })

    controller.abort(reason)

    await expect(waiting).rejects.toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a timer for a zero delay so callers yield to the event loop', async () => {
    vi.useFakeTimers()
    let resolved = false
    const waiting = abortableDelay(0).then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(0)
    await waiting
    expect(resolved).toBe(true)
  })
})

describe('internal validation utilities', () => {
  it('shares numeric, object, and CSV validation semantics', () => {
    expect(finiteNonNegative(Number.NaN)).toBe(0)
    expect(finiteNonNegative(-1)).toBe(0)
    expect(finiteNonNegative(2.5)).toBe(2.5)
    expect(isPositiveInteger(1)).toBe(true)
    expect(isPositiveInteger(0)).toBe(false)
    expect(isPositiveInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(true)
    expect(isPositiveSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
    expect(isNonNegativeInteger(0)).toBe(true)
    expect(isNonNegativeSafeInteger(0)).toBe(true)
    expect(isPort(65_535)).toBe(true)
    expect(isPort(65_536)).toBe(false)
    expect(isRecord({ key: 'value' })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(parseCsv(' chrome, , safari,firefox ')).toEqual(['chrome', 'safari', 'firefox'])
  })
})
