import { Config, CustomLauncher } from 'karma'
import { KarmaTypescriptConfig } from 'karma-typescript/dist/api/configuration'
import { karmaPlugin } from '@fpjs-incubator/broyster'
import fs = require('fs')

declare module 'karma' {
  interface ConfigOptions {
    karmaTypescriptConfig?: KarmaTypescriptConfig | undefined
    browserStack?: {
      project: string
      build: string | number
      timeout: number
    }
  }

  interface Config {
    preset?: string
    reporters: string[]
  }
}

interface CustomLauncherExt extends CustomLauncher {
  name: string
}

const browserstackBrowsers = {
  OSXMonterey_Safari15: {
    os: ['OS X'],
    osVersion: 'Monterey',
    browserName: 'Safari',
    browserVersion: '15.0',
    useHttps: false,
  },

  IE11: { os: ['Windows'], osVersion: '7', browserName: 'IE', browserVersion: '11.0', useHttps: true },
  Windows11_EdgeLatest: {
    os: ['Windows'],
    osVersion: '11',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  Windows10_Chrome49: {
    os: ['Windows'],
    osVersion: '10',
    browserName: 'Chrome',
    browserVersion: '49.0',
    useHttps: true,
  },
  Android11_ChromeLatest: {
    deviceName: 'Google Pixel 4',
    os: ['Android'],
    osVersion: '11.0',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  iOS15_Safari: {
    deviceName: ['iPhone 8 Plus', 'iPhone 11 Pro', 'iPhone 11'],
    os: 'iOS',
    osVersion: '15',
    browserName: 'Safari',
    useHttps: true,
  },
}

function makeBuildNumber() {
  return `No CI ${Math.floor(Math.random() * 1e10)}`
}

function setupLocal(config: Config) {
  const files = ['src/**/*.ts']

  config.set({
    frameworks: ['jasmine', 'karma-typescript'],
    files,
    preprocessors: {
      '**/*.ts': 'karma-typescript',
    },
    reporters: ['spec', 'summary'],
    browsers: ['ChromeHeadless', 'FirefoxHeadless'],
    concurrency: 3,

    karmaTypescriptConfig: {
      tsconfig: './tsconfig.json',
      include: files,
      compilerOptions: {
        module: 'commonjs',
        sourceMap: true,
      },
    },

    specReporter: {
      suppressSummary: true,
      suppressErrorSummary: true,
      suppressPassed: true,
      suppressSkipped: true,
    },

    summaryReporter: {
      show: 'skipped',
    },

    protocol: 'https',
    httpsServerOptions: {
      key: fs.readFileSync('key_exp.key', 'utf8'),
      cert: fs.readFileSync('crt_exp.crt', 'utf8'),
      requestCert: false,
      rejectUnauthorized: false,
    },
    httpModule: require('@fpjs-incubator/broyster'),
  })
}

function setupBrowserstack(config: Config) {
  setupLocal(config)
  const customLaunchers: { [key: string]: CustomLauncherExt } = {}
  for (const [key, data] of Object.entries(browserstackBrowsers)) {
    customLaunchers[key] = {
      base: 'BrowserStackSelenium',
      name: key.replace(/_/g, ' '),
      ...data,
    }
  }

  config.set({
    reporters: [...config.reporters], //'BrowserStack'], // todo: Turn on when reporter is done
    browsers: Object.keys(customLaunchers),
    customLaunchers,
    concurrency: 5,
    plugins: [karmaPlugin, 'karma-*'],

    browserStack: {
      project: 'FingerprintJS', // todo: Turn to "Broyster" when the repository is open-sourced
      // A build number is required to group testing sessions in the BrowserStack UI.
      // GitHub Actions will add a value for GITHUB_RUN_ID. More on the environment variables:
      // https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables#default-environment-variables
      build: process.env.GITHUB_RUN_ID || makeBuildNumber(),
      // The timeout is reduced for testing sessions to not hold the BrowserStack queue long in case of problems.
      timeout: 120,
    },
  })
}

/**
 * Add `--preset local` or `--preset browserstack` to the Karma command to choose where to run the tests.
 */
module.exports = (config: Config) => {
  switch (config.preset) {
    case 'local':
      return setupLocal(config)
    case 'browserstack':
      return setupBrowserstack(config)
    default:
      throw new Error('No --preset option is set or an unknown value is set')
  }
}
