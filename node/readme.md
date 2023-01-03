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

This package exports the following:

- `@fpjs-incubator/broyster/browser`:
    - `karmaPlugin` That can be used for launching and reporting tests.
    - `sslConfiguration` That provides a self-signed certificate for HTTPS testing on localhost.
    - `httpHttpsServer` That gives you a set of two servers - one with HTTP and one with HTTP capabilities.
        Newer versions of Safari do not work nor have workarounds for self-signed certificates, however their behavior is the same for both HTTP and HTTPS. Depending on your entry's *useHttps*, the launcher will redirect respectively.
        The HTTP server runs on the port provided by Karma, while the HTTPS port will run on +1 from that.
- `@fpjs-incubator/broyster/node`:
    - `retryFailedTests` Todo

To use mixed HTTP/HTTPS testing, in your karma config file you need to:
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

## Launchers

The launcher provides additional properties:
*useHttps* to specify if this launcher is supposed to connect to the HTTPS server (*true*) or not.

``` js
useHttps: true
```

*firefoxCapabilities* an array of extra capabilities specifically for Firefox.

``` js
firefoxCapabilities: [
  ['key', 1],
  ['key2', true],
  ['key3', 'value'],
],
```
