import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Local browser run: real Chromium via Playwright. Headless by default so it
// works in CI; run `pnpm test:local:headed` to watch the browser.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    retry: 2,
    browser: {
      enabled: true,
      headless: process.env.VITEST_BROWSER_HEADLESS !== '0',
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
