import { vitestPreset } from '@fpjs-incubator/broyster/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  vitestPreset({
    projectName: 'BroysterExample',
    includeFiles: ['**/*.{test,spec}.ts?(x)'],
    exclude: ['e2e/**', 'node_modules/**'],
    retries: 2,
    globals: true,
    watch: false,
    browser: {
      enabled: true,
      provider: 'webdriverio',
      instances: [
        {
          browser: 'chrome',
          capabilities: {
            browserVersion: 'latest',
            'bstack:options': { os: 'Windows', osVersion: '11' },
          },
        },
        {
          browser: 'firefox',
          capabilities: {
            browserVersion: 'latest',
            'bstack:options': { os: 'Windows', osVersion: '11' },
          },
        },
        {
          browser: 'edge',
          capabilities: {
            browserName: 'MicrosoftEdge', // correct WebDriver name
            browserVersion: 'latest',
            'bstack:options': { os: 'Windows', osVersion: '11' },
          },
        },
      ],
    },
  }),
)
