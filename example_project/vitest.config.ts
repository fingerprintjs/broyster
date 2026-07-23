import { createBroysterVitestConfig } from '@fpjs-incubator/broyster'

export default createBroysterVitestConfig({
  projectName: 'example_project',
  include: ['src/**/*.test.ts'],
})
