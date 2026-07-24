import { createBrowserStackConfig } from '@fpjs-incubator/broyster/vitest'

// BrowserStack run: launched by `broyster run --config vitest.browserstack.config.ts`,
// which spawns one Vitest process per browser in the catalog.
export default createBrowserStackConfig({
  projectName: 'Broyster',
  retry: 2,
  test: {
    include: ['src/**/*.test.ts'],
  },
})
