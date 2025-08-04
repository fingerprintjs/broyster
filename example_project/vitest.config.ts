import { vitestPreset } from '@fpjs-incubator/broyster/vitest'

export default vitestPreset({
  projectName: 'BroysterExample',
  includeFiles: ['**/*.{test,spec}.ts?(x)'],
  exclude: ['e2e/**', 'dist-e2e/**', 'node_modules/**'],
  environment: 'jsdom',
  retries: 2,
})
