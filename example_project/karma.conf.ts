import { makeKarmaConfigurator } from '@fpjs-incubator/broyster/node'

module.exports = makeKarmaConfigurator({
  projectName: 'Broyster',
  includeFiles: ['src/**/*.ts'],
  alwaysRetryTests: true,
})
