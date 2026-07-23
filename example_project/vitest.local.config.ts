import { webdriverio } from '@vitest/browser-webdriverio'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: webdriverio({
        capabilities: {
          'wdio:enforceWebDriverClassic': true,
        },
      }),
      instances: [{ browser: 'chrome', headless: true }],
    },
  },
})
