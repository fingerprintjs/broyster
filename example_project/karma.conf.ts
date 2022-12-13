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
    os: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Safari',
    browserVersion: '15.0',
    useHttps: false,
  },

  IE11: { os: 'Windows', osVersion: '7', browserName: 'IE', browserVersion: '11.0', useHttps: true },

  Windows11_EdgeLatest: {
    os: 'Windows',
    osVersion: '11',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  Windows10_Chrome49: { os: 'Windows', osVersion: '10', browserName: 'Chrome', browserVersion: '49.0', useHttps: true },
  // Windows10_Chrome49_Incognito: { os: 'Windows', osVersion: '10', browserName: 'Chrome', browserVersion: '49.0', ...chromeIncognitoCapabilities },
  Windows11_ChromeLatest: {
    os: 'Windows',
    osVersion: '11',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // Windows11_ChromeLatest_Incognito: { os: 'Windows', osVersion: '11', browserName: 'Chrome', browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  Windows10_Firefox52: {
    os: 'Windows',
    osVersion: '10',
    browserName: 'Firefox',
    browserVersion: '52.0',
    useHttps: true,
  },
  // Windows10_Firefox52_Incognito: { os: 'Windows', osVersion: '10', browserName: 'Firefox', browserVersion: '52.0', ...firefoxIncognitoCapabilities },
  Windows11_FirefoxLatest: {
    os: 'Windows',
    osVersion: '11',
    browserName: 'Firefox',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // Windows11_FirefoxLatest_Incognito: { os: 'Windows', osVersion: '11', browserName: 'Firefox', browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  OSXMojave_Safari12: {
    os: 'OS X',
    osVersion: 'Mojave',
    browserName: 'Safari',
    browserVersion: '12.1',
    useHttps: true,
  },
  //OSXMonterey_Safari15: { os: 'OS X', osVersion: 'Monterey', browserName: 'Safari', browserVersion: '15.0' },
  OSXMonterey_ChromeLatest: {
    os: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // OSXMonterey_ChromeLatest_Incognito: { os: 'OS X', osVersion: 'Monterey', browserName: 'Chrome', browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  OSXMonterey_FirefoxLatest: {
    os: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Firefox',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // OSXMonterey_FirefoxLatest_Incognito: { os: 'OS X', osVersion: 'Monterey', browserName: 'Firefox', browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  OSXMonterey_EdgeLatest: {
    os: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  Android11_ChromeLatest: {
    deviceName: 'Google Pixel 4',
    os: 'Android',
    osVersion: '11.0',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  iOS10_Safari: { deviceName: 'iPhone 7', os: 'iOS', osVersion: '10', browserName: 'Safari', useHttps: true },
  iOS11_Safari: { deviceName: 'iPhone 8 Plus', os: 'iOS', osVersion: '11', browserName: 'Safari', useHttps: true },
  iOS12_Safari: { deviceName: 'iPhone XS', os: 'iOS', osVersion: '12', browserName: 'Safari', useHttps: true },
  iOS13_Safari: { deviceName: 'iPhone 11 Pro', os: 'iOS', osVersion: '13', browserName: 'Safari', useHttps: true },
  iOS14_Safari: { deviceName: 'iPhone 11', os: 'iOS', osVersion: '14', browserName: 'Safari', useHttps: true },
  iOS15_Safari: { deviceName: 'iPhone 11 Pro', os: 'iOS', osVersion: '15', browserName: 'Safari', useHttps: true },
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
