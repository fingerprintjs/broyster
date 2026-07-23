import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BroysterConfigError, normalizeBroysterConfig, validateBroysterConfig } from '../../src/core/config.js'
import type { BrowserTransport } from '../../src/core/types.js'

const transport: BrowserTransport = {
  async start() {
    return { slots: [], close: () => Promise.resolve() }
  },
}

describe('Broyster configuration', () => {
  it('normalizes defaults relative to the config file', () => {
    const config = normalizeBroysterConfig(
      {
        projectName: ' example ',
        vitestConfig: './vitest.remote.ts',
        browsers: {
          chrome: { browser: 'chrome', protocol: 'https' },
        },
        transport,
      },
      {
        cwd: '/workspace',
        configFilePath: 'config/broyster.config.ts',
        env: { GITHUB_RUN_ID: '123' },
        now: () => 999,
      },
    )

    expect(config.projectName).toBe('example')
    expect(config.vitestConfig).toBe(resolve('/workspace/config/vitest.remote.ts'))
    expect(config.resultsFile).toBe(resolve('/workspace/config/browserstack-results.json'))
    expect(config.buildName).toBe('broyster-123')
    expect(config.concurrency).toBe(5)
    expect(config.maxRetries).toBe(1)
  })

  it('reports all actionable validation issues together', () => {
    expect(() =>
      validateBroysterConfig({
        projectName: '',
        vitestConfig: '',
        browsers: {
          invalid: { browser: '', protocol: 'ftp', capabilities: { 'bstack:options': [] } },
        },
        transport: {},
        concurrency: 0,
      }),
    ).toThrow(BroysterConfigError)

    try {
      validateBroysterConfig({
        projectName: '',
        vitestConfig: '',
        browsers: {},
      })
    } catch (error) {
      expect((error as BroysterConfigError).issues).toEqual(
        expect.arrayContaining([
          'projectName must be a non-empty string',
          'vitestConfig must be a non-empty string',
          'browsers must contain at least one browser',
          'transport must implement start(signal)',
        ]),
      )
    }
  })

  it('rejects credentials and fragments in BrowserStack URLs', () => {
    expect(() =>
      validateBroysterConfig({
        projectName: 'example',
        vitestConfig: './vitest.remote.ts',
        browsers: { chrome: { browser: 'chrome', protocol: 'https' } },
        transport,
        browserStack: {
          hubUrl: 'https://user:password@hub.example.test/wd/hub',
          apiBaseUrl: 'https://api.example.test/automate#private',
        },
      }),
    ).toThrow(/must not contain credentials[\s\S]*must not contain a URL fragment/i)
  })

  it('limits v1 to a single process-level retry', () => {
    expect(() =>
      validateBroysterConfig({
        projectName: 'example',
        vitestConfig: './vitest.remote.ts',
        browsers: { chrome: { browser: 'chrome', protocol: 'https' } },
        transport,
        maxRetries: 2,
      }),
    ).toThrow(/maxRetries must be 0 or 1/)
  })
})
