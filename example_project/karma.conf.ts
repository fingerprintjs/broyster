import { Config, CustomLauncher } from 'karma'
import { KarmaTypescriptConfig } from 'karma-typescript'
import { karmaPlugin, setHttpsAndServerForKarma, BrowserFlags } from '@fpjs-incubator/broyster/node'

declare module 'karma' {
  interface ConfigOptions {
    karmaTypescriptConfig?: KarmaTypescriptConfig | undefined
  }

  interface Config extends ConfigOptions {
    preset?: string
  }
}

const browsers = {
  Windows10_Chrome65: {
    platform: 'Windows',
    osVersion: '10',
    browserName: 'Chrome',
    browserVersion: '65',
    useHttps: true,
  },
  // Windows10_Chrome65_Incognito: { platform: 'Windows', osVersion: '10', browserName: 'Chrome',
  //browserVersion: '65', ...chromeIncognitoCapabilities },
  Windows11_ChromeLatest: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // Windows11_ChromeLatest_Incognito: { platform: 'Windows', osVersion: '11', browserName: 'Chrome',
  //browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  Windows10_Firefox75: {
    platform: 'Windows',
    osVersion: '10',
    browserName: 'Firefox',
    browserVersion: '75',
    useHttps: true,
  },
  // Windows10_Firefox75_Incognito: { platform: 'Windows', osVersion: '10', browserName: 'Firefox',
  //browserVersion: '75', ...firefoxIncognitoCapabilities },
  Windows11_FirefoxLatest: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Firefox',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // Windows11_FirefoxLatest_Incognito: { platform: 'Windows', osVersion: '11', browserName: 'Firefox',
  //browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  Windows11_EdgeLatest: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },

  'OSX10.14_Safari12': {
    platform: 'OS X',
    osVersion: 'Mojave',
    browserName: 'Safari',
    browserVersion: '12',
    useHttps: true,
  },
  OSX12_Safari15: {
    platform: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Safari',
    browserVersion: '15',
    useHttps: false,
  },
  OSX14_Safari17: {
    platform: 'OS X',
    osVersion: 'Sonoma',
    browserName: 'Safari',
    browserVersion: '17',
    useHttps: false,
  },
  OSX14_ChromeLatest: {
    platform: 'OS X',
    osVersion: 'Sonoma',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // OSX14_ChromeLatest_Incognito: { platform: 'OS X', osVersion: 'Sonoma', browserName: 'Chrome',
  //browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  OSX14_FirefoxLatest: {
    platform: 'OS X',
    osVersion: 'Sonoma',
    browserName: 'Firefox',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // OSX14_FirefoxLatest_Incognito: { platform: 'OS X', osVersion: 'Sonoma', browserName: 'Firefox',
  //browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  OSX14_EdgeLatest: {
    platform: 'OS X',
    osVersion: 'Sonoma',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  Android13_ChromeLatest: {
    deviceName: 'Google Pixel 7',
    platform: 'Android',
    osVersion: '13.0',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  iOS12_Safari: {
    deviceName: ['iPhone XS', 'iPhone 8', 'iPhone 8 Plus', 'iPhone XR'],
    platform: 'iOS',
    osVersion: '12',
    browserName: 'Safari',
    useHttps: true,
    flags: [BrowserFlags.MobileUserAgent],
  },
  iOS13_Safari: {
    deviceName: ['iPhone 11 Pro', 'iPhone 8', 'iPhone XS', 'iPhone 11 Pro Max'],
    platform: 'iOS',
    osVersion: '13',
    browserName: 'Safari',
    useHttps: true,
    flags: [BrowserFlags.MobileUserAgent],
  },
  iOS14_Safari: {
    deviceName: ['iPhone 11', 'iPhone XS', 'iPhone 12 Pro', 'iPhone 12 mini'],
    platform: 'iOS',
    osVersion: '14',
    browserName: 'Safari',
    useHttps: true,
    flags: [BrowserFlags.MobileUserAgent],
  },
  iOS15_Safari: {
    deviceName: ['iPhone 13', 'iPhone 13 Mini', 'iPhone 11 Pro', 'iPhone 11'],
    platform: 'iOS',
    osVersion: '15',
    browserName: 'Safari',
    useHttps: true,
    flags: [BrowserFlags.MobileUserAgent],
  },
  iOS16_Safari: {
    deviceName: ['iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max'],
    platform: 'iOS',
    osVersion: '16',
    browserName: 'Safari',
    useHttps: true,
    flags: [BrowserFlags.MobileUserAgent],
  },
  iOS17_Safari: {
    deviceName: ['iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max'],
    platform: 'iOS',
    osVersion: '17',
    browserName: 'Safari',
    useHttps: true,
    flags: [BrowserFlags.MobileUserAgent],
  },
}

function makeBuildNumber() {
  return `No CI ${Math.floor(Math.random() * 1e10)}`
}

function setupLocal(config: Config) {
  const files = ['karma_global_setup.ts', 'src/**/*.ts']

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
  })
}

function setupBrowserStack(config: Config) {
  setupLocal(config)
  const customLaunchers: { [key: string]: CustomLauncher } = {}
  for (const [key, data] of Object.entries(browsers)) {
    customLaunchers[key] = {
      base: 'BrowserStack',
      name: key.replace(/_/g, ' '),
      ...data,
    }
  }

  config.set({
    reporters: [...(config.reporters || []), 'BrowserStack'],
    browsers: Object.keys(customLaunchers),
    customLaunchers,
    concurrency: 5,
    plugins: [...(config.plugins || []), karmaPlugin],
    retryLimit: 3,
    captureTimeout: 15_000,
    browserDisconnectTolerance: 1,
    browserStack: {
      project: 'Broyster',
      // A build number is required to group testing sessions in the BrowserStack UI.
      // GitHub Actions will add a value for GITHUB_RUN_ID. More on the environment variables:
      // https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables#default-environment-variables
      build: process.env.GITHUB_RUN_ID || makeBuildNumber(),
      // The timeout is reduced for testing sessions to not hold the BrowserStack queue long in case of problems.
      idleTimeout: 20_000,
      queueTimeout: 300_000,
    },
  })
  setHttpsAndServerForKarma(config)
}

/**
 * Add `--preset local` or `--preset browserstack` to the Karma command to choose where to run the tests.
 */
module.exports = (config: Config) => {
  switch (config.preset) {
    case 'local':
      return setupLocal(config)
    case 'browserstack':
      return setupBrowserStack(config)
    default:
      throw new Error('No --preset option is set or an unknown value is set')
  }
}
