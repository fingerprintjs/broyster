# Broyster Node.js tools

This file will be published to NPM

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

The pacakge requires nodeResolution in `tsconfig.json` to *node16*.

This package exports the following:

- `@fpjs-incubator/broyster/node`:
    - `karmaPlugin` That can be used for launching and reporting tests.
    - `sslConfiguration` That provides a self-signed certificate for HTTPS testing on localhost.
    - `httpHttpsServer` That gives you a set of two servers - one with HTTP and one with HTTP capabilities.
        Newer versions of Safari do not work nor have workarounds for self-signed certificates, however their behavior is the same for both HTTP and HTTPS. Depending on your entry's *useHttps*, the launcher will redirect respectively.
        The HTTP server runs on the port provided by Karma, while the HTTPS port will run on +1 from that.
    - `setHttpsAndServerForKarma` That configures karma for HTTP and HTTPS testing without any additional work.
- `@fpjs-incubator/broyster/browser`:
    - `retryFailedTests` That allows overriding the different behavior of Jasmine specs. The new behavior will retry a failed test up until the maximum specified in the first parameter, with a delay between each such attempt, indicated by the second parameter (in miliseconds). There is a safety mechanism to prevent recurring apply, however you may also place it in your `helpers` in Jasmine, otherwise the call to this function should be placed before your most top-level `describe` block.

Use `node` exports when using Node.js contexts, like configuring Karma.
Use `browser` exports when using browser contexts, like Jasmine.

To use mixed HTTP/HTTPS testing, in your Karma config file you need to:
Set the protocol to https

``` js
    protocol: 'https'
```

define *httpServerOptions* and use the provided keys

``` js
import { sslConfiguration } from '@fpjs-incubator/broyster/node'

httpsServerOptions: {
  key: sslConfiguration.key,
  cert: sslConfiguration.cert,
  requestCert: false,
  rejectUnauthorized: false,
}
```

and use the provided server:

``` js
import { karmaPlugin, sslConfiguration, httpHttpsServer } from '@fpjs-incubator/broyster/node'

httpModule: httpHttpsServer as any
```

or use

``` js
import { setHttpsAndServerForKarma } from '@fpjs-incubator/broyster'

setHttpsAndServerForKarma(config)
```

## Launchers

The launcher provides additional properties:
*useHttps* to specify if this launcher is supposed to connect to the HTTPS server (*true*) or not.

``` js
useHttps: true
```

*deviceName* is now a union type of `string | string[] | undefined`. In case of passing an array, it will mean there is a list of devices that are acceptable and any of them will be good to use. The list of devices will be iterated only in an attempt to launch a session, so the first succesful configuration to run will be the one that the tests run against. Tests will not run against all devices in the list. Note that the compatibility between the devices and the rest of the specified config is your responsibility.

``` js
  Android11_ChromeLatest: {
    deviceName: 'Google Pixel 4',
    platform: 'Android',
    osVersion: '11.0',
    browserName: 'Chrome',
    browserVersion: 'latest-beta',
    useHttps: true,
  },
```

or

``` js
  iOS15_Safari: {
    deviceName: ['iPhone 8 Plus', 'iPhone 11 Pro', 'iPhone 11'],
    platform: 'iOS',
    osVersion: '15',
    browserName: 'Safari',
    useHttps: true,
  },
```

*firefoxCapabilities* an array of extra capabilities specifically for Firefox.

``` js
firefoxCapabilities: [
  ['key', 1],
  ['key2', true],
  ['key3', 'value'],
],
```

### Reporters

There is a dedicated reproter that will mark successful tests as passed in BrowserStack.

``` js
  config.set({
    reporters: [...config.reporters, 'BrowserStack'],
```

### BrowserStack specific settings

The following config options are available inside the browserStack section of the config:

- `idleTimeout`: expressed in miliseconds, specifies the amount of time that BrowserStack is supposed to keep the session alive without any activity before automatically killing it.

### Launcher specific settings

The following config options are available inside the browserStack section of the config:

- `queueTimeout`: expressed in miliseconds, specifies the maximum amount of time to wait for a the BrowserStack queue to free up a slot.
- `flags`: a unified set of extra arguments that will be passed to the browser. For example passing *incognito' will apply the relevant seting to the browsers for which the flags were specified (incongnito in Chrome, private mode in Firefox or nothing in the case of Safari):

``` js
  Incognito_Chrome: {
    platform: 'Windows',
    osVersion: '10',
    browserName: 'Chrome',
    browserVersion: '57',
    useHttps: true,
    flags: ['incognito']
  },
```

Currently supported flags: Incognito, Headless (case insensitive). Multiword flags will be stripped of dashes.
