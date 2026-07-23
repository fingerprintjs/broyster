import { makeVitestConfigurator } from '@fpjs-incubator/broyster'

export default makeVitestConfigurator({
  projectName: 'Broyster',
  include: ['src/**/*.test.ts'],
  alwaysRetryTests: true,
})
