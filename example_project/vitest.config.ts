import { vitestPreset } from '@fpjs-incubator/broyster/vitest'

export default vitestPreset({
  projectName: 'BroysterExample',
  includeFiles: ['src/**/*.ts', 'tests/**/*.ts'],
  environment: 'jsdom',
  retries: 2,
})
