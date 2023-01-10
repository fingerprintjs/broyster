# Broyster Node.js tools

This file will be published to NPM

```bash
npm install --save-dev @fpjs-incubator/broyster
# or
yarn add --dev @fpjs-incubator/broyster
```

```js
import * as broyster from '@fpjs-incubator/broyster'

// ...
```

## Usage

This pakcage exports the following:
```karmaPlugin```
That can be used for launching and reporting tests.
```sslConfiguration```
That provides a self-signed certificate for HTTPS testing on localhost.
```httpHttpsServer```
That gives you a set of two servers - one with HTTP and one with HTTP capabilities.
Newer versions of Safari do not work nor have workarounds for self-signed certificates, however their behavior is the same for both HTTP and HTTPS. Depending on your entry's *useHttps*, the launcher will redirect respectively.
The HTTP server runs on the port provided by Karma, while the HTTPS port will run on +1 from that.
```setHttpsAndServerForKarma```
That configures karma for HTTP and HTTPS testing without any additional work.

To use mixed HTTP/HTTPS testing, in your karma config file you need to:
Set the protocol to https

``` js
    protocol: 'https'
```

define *httpServerOptions* and use the provided keys

``` js
import { sslConfiguration } from '@fpjs-incubator/broyster'

httpsServerOptions: {
    key: sslConfiguration.key,
    cert: sslConfiguration.cert,
    requestCert: false,
    rejectUnauthorized: false,
}
```

and use the provided server:

``` js
import { karmaPlugin, sslConfiguration, httpHttpsServer } from '@fpjs-incubator/broyster'
    
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

*devices* is a `string[] | undefined`. In case of passing a value, it will mean there is a list of devices that are acceptable and any of them will be good to use. The list of devices will be iterated only in an attempt to launch a session, so the first succesful configuration to run will be the one that the tests run against. Tests will not run against all devices in the list. Note that the compatibility between the devices and the rest of the specified config is your responsibility.

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
    devices: ['iPhone 8 Plus', 'iPhone 11 Pro', 'iPhone 11'],
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