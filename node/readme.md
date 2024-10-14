# Broyster Node.js tools

```bash
npm install --save-dev @fpjs-incubator/broyster
# or
yarn add --dev @fpjs-incubator/broyster
```

```js
import * as broysterForBrowser from '@fpjs-incubator/broyster/browser'
import * as broysterForNode from '@fpjs-incubator/broyster/node'

// ...
```

## Usage

This package exports the following:

-   `@fpjs-incubator/broyster/node`:
    -   `karmaPlugin` That can be used for launching and reporting tests.
    -   `setHttpsAndServerForKarma` That configures karma for HTTP and HTTPS testing without any additional work.
    -   `BrowserFlags` Is a collection of currently supported browser arguments that are uniformed for convenience (for
        example: Incognito will add launching the browser in incognito mode for Chrome and Edge, but private mode for Firefox).
    -   `makeKarmaConfigurator` Makes a function that applies an opinionated full configuration, used by Fingerprint's projects, to Karma.
-   `@fpjs-incubator/broyster/browser`:
    -   `retryFailedTests` That allows overriding the different behavior of Jasmine specs. The new behavior will retry a failed test up until the maximum specified in the first parameter, with a delay between each such attempt, indicated by the second parameter (in miliseconds). Call this function in the root of any executable file, involved in your testing code, for example, in a Jasmine helper file. Once called, it affects all tests Jasmine runs, even in the other files. For Karma, you can add a file that contains the invocation and point it in your `files`, that way you will not have it tied to one specific test file.

Use `node` exports when using Node.js contexts, like configuring Karma.
Use `browser` exports when using browser contexts, like Jasmine.

To use mixed HTTP/HTTPS testing, in your Karma config file you need to use:

```js
import { setHttpsAndServerForKarma } from '@fpjs-incubator/broyster'

setHttpsAndServerForKarma(config)
```

## Launchers

The launcher provides additional properties:
_useHttps_ to specify if this launcher is supposed to connect to the HTTPS server (_true_) or not.

```js
useHttps: true
```

_deviceType_ is used only on iOS and allows to choose from `iPhone` (default) and `iPad`.
You don't need to set a specific device name, the launcher chooses a device automatically. Same on Android.

```js
  Android11_ChromeLatest: {
    platform: 'iOS',
    deviceType: 'iPhone',
    osVersion: '17',
    browserName: 'Safari',
    useHttps: true,
  },
```

_firefoxCapabilities_ an array of extra capabilities specifically for Firefox.

```js
firefoxCapabilities: [
  ['key', 1],
  ['key2', true],
  ['key3', 'value'],
],
```

_osVersion_ selects the given OS version and also it's beta counterpart. For example, setting the OS version to `17` will choose either `17` or `17 Beta`.

### Reporters

There is a dedicated reporter that will mark successful tests as passed in BrowserStack.

```js
config.set({
  reporters: [...config.reporters, 'BrowserStack'],
})
```

### BrowserStack specific settings

The following config options are available inside the browserStack section of the config:

-   `idleTimeout`: expressed in miliseconds, specifies the amount of time that BrowserStack is supposed to keep the session alive without any activity before automatically killing it.

### Launcher specific settings

The following config options are available inside the browserStack section of the config:

-   `queueTimeout`: expressed in miliseconds, specifies the maximum amount of time to wait for a the BrowserStack queue to free up a slot.
-   `flags`: a unified set of extra arguments that will be passed to the browser. For example passing _incognito_ will apply the relevant seting to the browsers for which the flags were specified (incongnito in Chrome, private mode in Firefox or nothing in the case of Safari). Currently supported flags can be found under the BrowserFlags export. Example:

```js
  import { BrowserFlags } from '@fpjs-incubator/broyster/node'

  ...

  Incognito_Chrome: {
    platform: 'Windows',
    osVersion: '10',
    browserName: 'Chrome',
    browserVersion: '57',
    useHttps: true,
    flags: [BrowserFlags.Incognito],
  },
```

## Full Karma configuration

`makeKarmaConfigurator` is an alternative to creating a Karma configuration from scratch.
The function creates an opinionated configuration used by Fingerprint's projects, but has few options and easy to use.
The configuration is aimed to run **TypeScript** tests with **Jasmine**.

Example:

- `karma.conf.ts`
    ```ts
    import { makeKarmaConfigurator } from '@fpjs-incubator/broyster/node'

    module.exports = makeKarmaConfigurator({
        projectName: 'My project',
        includeFiles: ['src/**/*.ts'],
    })
    ```
- Run tests in browsers on the current machine:
    ```bash
    karma start --preset local --single-run
    ```
- Run tests in browsers, supported by Fingerprint, on BrowserStack:
    ```bash
    karma start --preset browserstack --single-run
    ```
    Or only beta versions of these browsers:
    ```bash
    karma start --preset browserstack-beta --single-run
    ```

You can also view [its source code](src/karma_configuration.ts) to see what capabilities the Karma plugin provides.
