import { access } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { NormalizedBroysterConfig } from '../../src/core/types.js'
import { resolveVitestExecutable } from '../../src/runner/attempt.js'

describe('resolveVitestExecutable', () => {
  it('resolves the executable declared by the consumer-installed Vitest package', async () => {
    const packageRoot = fileURLToPath(new URL('../../', import.meta.url))

    const executable = resolveVitestExecutable({ baseDir: packageRoot } as NormalizedBroysterConfig)

    expect(basename(executable)).toBe('vitest.mjs')
    await expect(access(executable)).resolves.toBeUndefined()
  })

  it('uses an explicit executable override unchanged', () => {
    expect(
      resolveVitestExecutable({
        baseDir: '/consumer',
        vitestExecutable: '/custom/bin/vitest.mjs',
      } as NormalizedBroysterConfig),
    ).toBe('/custom/bin/vitest.mjs')
  })
})
