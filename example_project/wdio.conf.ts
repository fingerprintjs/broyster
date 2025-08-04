import { makeBrowserMatrix, makeWdioConfig } from '@fpjs-incubator/broyster/wdio'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)

export const config: WdioConfig.Config = makeWdioConfig({
  projectName: 'BroysterExample',
  specs: ['./e2e/**/*.spec.ts'],
  maxInstances: 3,
  matrix: makeBrowserMatrix(['chrome', 'firefox', 'safari']),
  timeoutMs: 120000,
})

config.mochaOpts = {
  ...config.mochaOpts,
  require: [req.resolve('ts-node/register/transpile-only')],
}

config.services = [['browserstack', { browserstackLocal: false }]]

config.capabilities = config.capabilities!.map((c: WdioConfig.Config) => ({
  ...c,
  'bstack:options': {
    buildName: `broyster-e2e-${new Date().toISOString().slice(0, 10)}`,
    projectName: 'Broyster',
  },
}))

// If/when you need localhost testing:
// enableLocal(config); // optional: { id: 'my-ci-build-123' }
