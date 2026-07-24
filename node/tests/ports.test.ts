import { describe, expect, it } from 'vitest'

import { waitForPort } from '../src/orchestrator/ports.js'

describe('waitForPort', () => {
  it('rejects immediately when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(waitForPort(7_201, 30_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
