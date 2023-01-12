import { Config, CustomLauncher } from 'karma'
import { KarmaTypescriptConfig } from 'karma-typescript'
import { karmaPlugin, setHttpsAndServerForKarma } from '@fpjs-incubator/broyster/node'

declare module 'karma' {
  interface ConfigOptions {
    karmaTypescriptConfig?: KarmaTypescriptConfig | undefined
  }

  interface Config {
    preset?: string
    reporters: string[]
  }
}

const browsers = {
  OSXMonterey_Safari15: {
    platform: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Safari',
    browserVersion: '15.0',
    useHttps: false,
  },

  //IE11: { platform: 'Windows', osVersion: '7', browserName: 'IE', browserVersion: '11.0', useHttps: true },

  Windows11_EdgeLatest: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  Windows10_Chrome49: {
    platform: 'Windows',
    osVersion: '10',
    browserName: 'Chrome',
    browserVersion: '49.0',
    useHttps: true,
  },
  // Windows10_Chrome49_Incognito: { platform: 'Windows', osVersion: '10',
  //browserName: 'Chrome', browserVersion: '49.0', ...chromeIncognitoCapabilities },
  Windows11_ChromeLatest: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // Windows11_ChromeLatest_Incognito: { platform: 'Windows', osVersion: '11', browserName: 'Chrome',
  //browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  Windows10_Firefox52: {
    platform: 'Windows',
    osVersion: '10',
    browserName: 'Firefox',
    browserVersion: '52.0',
    useHttps: true,
  },
  // Windows10_Firefox52_Incognito: { platform: 'Windows', osVersion: '10', browserName: 'Firefox',
  //browserVersion: '52.0', ...firefoxIncognitoCapabilities },
  Windows11_FirefoxLatest: {
    platform: 'Windows',
    osVersion: '11',
    browserName: 'Firefox',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // Windows11_FirefoxLatest_Incognito: { platform: 'Windows', osVersion: '11', browserName: 'Firefox',
  //browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  OSXMojave_Safari12: {
    platform: 'OS X',
    osVersion: 'Mojave',
    browserName: 'Safari',
    browserVersion: '12.1',
    useHttps: true,
  },
  //OSXMonterey_Safari15: { platform: 'OS X', osVersion: 'Monterey', browserName: 'Safari', browserVersion: '15.0' },
  OSXMonterey_ChromeLatest: {
    platform: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // OSXMonterey_ChromeLatest_Incognito: { platform: 'OS X', osVersion: 'Monterey', browserName: 'Chrome',
  //browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  OSXMonterey_FirefoxLatest: {
    platform: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Firefox',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  // OSXMonterey_FirefoxLatest_Incognito: { platform: 'OS X', osVersion: 'Monterey', browserName: 'Firefox',
  //browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  OSXMonterey_EdgeLatest: {
    platform: 'OS X',
    osVersion: 'Monterey',
    browserName: 'Edge',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  Android11_ChromeLatest: {
    deviceName: 'Google Pixel 4',
    platform: 'Android',
    osVersion: '11.0',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
  //iOS10_Safari: { deviceName: 'iPhone 7', platform: 'iOS', osVersion: '10', browserName: 'Safari', useHttps: true },
  // disabled temporarily because of issues with creating the session
  // TODO: Investigate failing iOS builds
  iOS11_Safari: {
    deviceName: 'iPhone 8 Plus',
    platform: 'iOS',
    osVersion: '11',
    browserName: 'Safari',
    useHttps: true,
  },
  iOS12_Safari: { deviceName: 'iPhone XS', platform: 'iOS', osVersion: '12', browserName: 'Safari', useHttps: true },
  iOS13_Safari: {
    deviceName: 'iPhone 11 Pro',
    platform: 'iOS',
    osVersion: '13',
    browserName: 'Safari',
    useHttps: true,
  },
  iOS14_Safari: { deviceName: 'iPhone 11', platform: 'iOS', osVersion: '14', browserName: 'Safari', useHttps: true },
  /*
  iOS15_Safari: {
    deviceName: 'iPhone 11 Pro',
    platform: 'iOS',
    osVersion: '15',
    browserName: 'Safari',
    useHttps: true,
  }, // disabled temporarily because of issues with creating the session
  TODO: Investigate failing iOS builds
  */
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
    client: {
      jasmine: {
        random: true,
        seed: '4321',
        timeoutInterval: 1000,
        helpers: 'helpers/*.ts',
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
    reporters: [...config.reporters, 'BrowserStack'],
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
