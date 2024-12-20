import * as path from 'path'
import { promises as fs } from 'fs'
import type { Config, ConfigOptions, CustomLauncher } from 'karma'
import type { KarmaTypescriptConfig } from 'karma-typescript'
import { Arguments as BrowserFlags } from './arguments'
import karmaPlugin from './karma_plugin'
import { setHttpsAndServerForKarma } from './karma_https_config'

declare module 'karma' {
  interface ConfigOptions {
    karmaTypescriptConfig?: KarmaTypescriptConfig | undefined
  }

  interface Config extends ConfigOptions {
    preset?: string
  }
}

interface KarmaConfiguratorOptions {
  /** Will be shown in the BrowserStack Automation UI */
  projectName: string
  /** List of files/patterns to load in the browser. Don't forget the necessary .d.ts files. */
  includeFiles: ConfigOptions['files']
  /** Path to the tsconfig.json file that will be used to compile the TS files given in `includeFiles` */
  tsconfigPath?: string
  /** Retries of failed tests are disabled in local (not CI) environment. Set this to `true` to enable. */
  alwaysRetryTests?: boolean
  /** A callback to add custom configuration. It's called when the basic configuration is complete. */
  configureCustom?: (karmaConfig: Config) => void | Promise<void>
}

/**
 * Makes a function that applies an opinionated configuration, used by Fingerprint's projects, to Karma.
 *
 * When a Karma configuration file is created, add `--preset local`, `--preset browserstack` or
 * `--preset browserstack-beta` to the Karma command to choose where to run the tests.
 *
 * @example karma.conf.ts in the project's root directory
 * module.exports = makeKarmaConfigurator({ ... })
 *
 * @example Run tests in the local browsers
 * karma start --preset local --single-run
 */
export function makeKarmaConfigurator(options: KarmaConfiguratorOptions): (karmaConfig: Config) => void {
  return async (karmaConfig) => {
    switch (karmaConfig.preset) {
      case 'local':
        await setupLocal(karmaConfig, options)
        break
      case 'browserstack':
        await setupBrowserstack(karmaConfig, options)
        break
      case 'browserstack-beta':
        await setupBrowserstack(karmaConfig, options, true)
        break
      default:
        throw new Error('No --preset option is set or an unknown value is set')
    }

    await options.configureCustom?.(karmaConfig)
  }
}

async function setupLocal(
  karmaConfig: Config,
  { alwaysRetryTests = false, includeFiles = [], tsconfigPath = 'tsconfig.json' }: KarmaConfiguratorOptions,
) {
  const createdFiles = await createFilesToInject()
  const files: ConfigOptions['files'] = []
  if (process.env.CI || alwaysRetryTests) {
    files.push(createdFiles.setupJasmineRetries)
  }
  files.push(...includeFiles)

  karmaConfig.set({
    frameworks: ['jasmine', 'karma-typescript'],
    files,
    preprocessors: {
      '**/*.ts': 'karma-typescript',
    },
    reporters: ['spec', 'summary'],
    browsers: ['ChromeHeadless', 'FirefoxHeadless'],
    concurrency: 3,

    karmaTypescriptConfig: {
      tsconfig: tsconfigPath,
      compilerOptions: {
        module: 'commonjs',
        sourceMap: true,
      },
      // The `include` and `exclude` options of tsconfig.json are not inherited, because every given `includeFiles` file
      // must be compiled, and it makes no sense to compile anything else.
      include: {
        mode: 'replace',
        values: files.filter((file): file is string => typeof file === 'string' && /(\*|\.ts)$/.test(file)),
      },
      exclude: { mode: 'replace', values: [] },
    },

    specReporter: {
      suppressSummary: true,
      suppressErrorSummary: true,
      suppressPassed: true,
      suppressSkipped: true,
    },
  })
}

async function setupBrowserstack(karmaConfig: Config, options: KarmaConfiguratorOptions, onlyBetaBrowsers = false) {
  await setupLocal(karmaConfig, options)

  const customLaunchers: Record<string, CustomLauncher> = {}
  for (const [key, data] of Object.entries(browserstackBrowsers)) {
    if (onlyBetaBrowsers && !('browserVersion' in data && /beta/i.test(data.browserVersion))) {
      continue
    }
    customLaunchers[key] = {
      base: 'BrowserStack',
      name: key.replace(/_/g, ' '),
      ...data,
    }
  }

  karmaConfig.set({
    reporters: [...(karmaConfig.reporters || []), 'BrowserStack'],
    plugins: [...(karmaConfig.plugins || []), karmaPlugin],
    browsers: Object.keys(customLaunchers),
    customLaunchers,
    concurrency: 5,
    retryLimit: 3,
    captureTimeout: 15_000,
    browserDisconnectTolerance: 2,
    browserDisconnectTimeout: 15_000,
    browserStack: {
      project: options.projectName,
      // A build number is required to group testing sessions in the BrowserStack UI.
      // GitHub Actions will add a value for GITHUB_RUN_ID. More on the environment variables:
      // https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables#default-environment-variables
      build: process.env.GITHUB_RUN_ID || makeBuildNumber(),
      // The timeout is reduced for testing sessions to not hold the BrowserStack queue long in case of problems.
      idleTimeout: 20_000,
      queueTimeout: 300_000,
    },
  })

  setHttpsAndServerForKarma(karmaConfig)
}

async function createFilesToInject() {
  // `package.json` is imported using `require` to prevent TypeScript from putting it into `dist`
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { name: packageName } = require('../package.json')
  // The injected files must be within the current working directory, otherwise karma-typescript won't compile them
  const temporaryDirectory = path.join('node_modules', '.tmp', packageName)
  await fs.mkdir(temporaryDirectory, { recursive: true })

  const filesToCreate = {
    setupJasmineRetries: {
      name: 'setup_jasmine_retries.ts',
      content: `import { retryFailedTests } from '${packageName}/browser'; retryFailedTests(3, 100)`,
    },
  }
  const createdFiles = {} as Record<keyof typeof filesToCreate, string>
  await Promise.all(
    (Object.keys(filesToCreate) as Array<keyof typeof filesToCreate>).map(async (id) => {
      createdFiles[id] = path.join(temporaryDirectory, filesToCreate[id].name)
      await fs.writeFile(createdFiles[id], filesToCreate[id].content)
    }),
  )
  return createdFiles
}

// The shapes of these objects are taken from:
// https://github.com/SeleniumHQ/selenium/tree/d8ddb4d83972df0f565ef65264bcb733e7a94584/javascript/node/selenium-webdriver
// It doesn't work, trying to work it out with BrowserStack support.
/*
const chromeIncognitoCapabilities = {
  'goog:chromeOptions': {
    args: ['--incognito'],
  },
}
const firefoxIncognitoCapabilities = {
  'moz:firefoxOptions': {
    prefs: {
      'browser.privatebrowsing.autostart': true,
    },
  },
}
*/

/*
 * You can find values for any supported browsers in the interactive form at
 * https://www.browserstack.com/docs/automate/javascript-testing/configure-test-run-options
 * The keys are arbitrary values.
 *
 * Only Chrome is supported on Android, only Safari is supported on iOS: https://www.browserstack.com/question/659
 */
/* eslint-disable max-len */
// prettier-ignore
const browserstackBrowsers = {
  Windows10_Chrome73: { platform: 'Windows', osVersion: '10', browserName: 'Chrome', browserVersion: '73', useHttps: true },
  // Windows10_Chrome73_Incognito: { platform: 'Windows', osVersion: '10', browserName: 'Chrome', browserVersion: '73', ...chromeIncognitoCapabilities },
  Windows11_ChromeLatest: { platform: 'Windows', osVersion: '11', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  // Windows11_ChromeLatest_Incognito: { platform: 'Windows', osVersion: '11', browserName: 'Chrome', browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  Windows10_Firefox89: { platform: 'Windows', osVersion: '10', browserName: 'Firefox', browserVersion: '89', useHttps: true, firefoxCapabilities: [['security.csp.enable', true] as [string, boolean]] }, // CSP is off by default in Firefox ≤98
  // Windows10_Firefox89_Incognito: { platform: 'Windows', osVersion: '10', browserName: 'Firefox', browserVersion: '89', ...firefoxIncognitoCapabilities },
  Windows11_FirefoxLatest: { platform: 'Windows', osVersion: '11', browserName: 'Firefox', browserVersion: 'latest-beta', useHttps: true },
  // Windows11_FirefoxLatest_Incognito: { platform: 'Windows', osVersion: '11', browserName: 'Firefox', browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  Windows11_EdgeLatest: { platform: 'Windows', osVersion: '11', browserName: 'Edge', browserVersion: 'latest-beta', useHttps: true },
  'OSX10.15_Safari13': { platform: 'OS X', osVersion: 'Catalina', browserName: 'Safari', browserVersion: '13', useHttps: true },
  OSX12_Safari15: { platform: 'OS X', osVersion: 'Monterey', browserName: 'Safari', browserVersion: '15', useHttps: false },
  OSX15_Safari18: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Safari', browserVersion: '18', useHttps: false },
  OSX15_ChromeLatest: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true },
  // OSX15_ChromeLatest_Incognito: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Chrome', browserVersion: 'latest-beta, ...chromeIncognitoCapabilities },
  OSX15_FirefoxLatest: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Firefox', browserVersion: 'latest-beta', useHttps: true },
  // OSX15_FirefoxLatest_Incognito: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Firefox', browserVersion: 'latest-beta, ...firefoxIncognitoCapabilities },
  OSX15_EdgeLatest: { platform: 'OS X', osVersion: 'Sequoia', browserName: 'Edge', browserVersion: 'latest-beta', useHttps: true },
  Android14_ChromeLatest: { platform: 'Android', osVersion: '14.0', browserName: 'Chrome', browserVersion: 'latest-beta', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  Android14_SamsungLatest: { platform: 'Android', osVersion: '14.0', browserName: 'Samsung', browserVersion: 'latest-beta', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  iOS13_Safari: { platform: 'iOS', osVersion: '13', browserName: 'Safari', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  iOS14_Safari: { platform: 'iOS', osVersion: '14', browserName: 'Safari', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  iOS15_Safari: { platform: 'iOS', osVersion: '15', browserName: 'Safari', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  iOS16_Safari: { platform: 'iOS', osVersion: '16', browserName: 'Safari', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  iOS17_Safari: { platform: 'iOS', osVersion: '17', browserName: 'Safari', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
  iOS18_Safari: { platform: 'iOS', osVersion: '18', browserName: 'Safari', useHttps: true, flags: [BrowserFlags.MobileUserAgent] },
}
/* eslint-enable max-len */

function makeBuildNumber() {
  return `No CI ${Math.floor(Math.random() * 1e10)}`
}
