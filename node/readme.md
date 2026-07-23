# Broyster

Broyster runs a Vitest browser suite across a configurable BrowserStack matrix. It limits concurrency using the BrowserStack plan API, assigns HTTP/HTTPS tunnel slots, retries failed files or browser startup, updates BrowserStack session status, and writes a complete machine-readable result.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- Vitest `4.1.8`
- Vite `8.0.13`
- BrowserStack Automate credentials
- A remotely managed Cloudflare Tunnel with public hostnames already routed to the configured local ports
- `cloudflared` installed on remote-run hosts

Broyster does not create tunnels, DNS records, or ingress routes.

## Install

```bash
pnpm add --save-dev @fpjs-incubator/broyster vitest@4.1.8 vite@8.0.13
```

The package is ESM-only.

## Configure Vitest

Create a dedicated remote config. Broyster merges the runner-owned browser settings with your test paths, plugins, setup files, headers, and other Vite/Vitest options.

```ts
// vitest.browserstack.config.ts
import { defineBrowserStackVitestConfig } from '@fpjs-incubator/broyster/vitest'

export default defineBrowserStackVitestConfig({
    test: {
        include: ['src/**/*.test.ts'],
    },
})
```

If a slot uses HTTPS, configure your Vite server certificate in this consumer config and configure the matching Cloudflare origin route accordingly.

## Configure Broyster

```ts
// broyster.config.ts
import { defineBroysterConfig } from '@fpjs-incubator/broyster'
import { cloudflareTunnel } from '@fpjs-incubator/broyster/transports/cloudflare'

export default defineBroysterConfig({
    projectName: 'My project',
    vitestConfig: './vitest.browserstack.config.ts',
    browsers: {
        chrome: {
            browser: 'chrome',
            name: 'Windows 11 Chrome',
            protocol: 'https',
            capabilities: {
                browserVersion: 'latest',
                'goog:chromeOptions': { args: ['--incognito'] },
                'bstack:options': { os: 'Windows', osVersion: '11' },
            },
        },
        safari: {
            browser: 'safari',
            name: 'macOS Safari',
            protocol: 'http',
            capabilities: {
                browserVersion: '18',
                'bstack:options': { os: 'OS X', osVersion: 'Sequoia' },
            },
        },
    },
    transport: cloudflareTunnel({
        slots: [
            {
                id: 'https-1',
                publicUrl: 'https://browser-https.example.com',
                localPort: 7201,
                protocol: 'https',
            },
            {
                id: 'http-1',
                publicUrl: 'http://browser-http.example.com',
                localPort: 7202,
                protocol: 'http',
            },
        ],
    }),
    resultsFile: './artifacts/browserstack-results.json',
})
```

Relative paths are resolved from the config file. Browser capabilities accept arbitrary W3C fields. Broyster shallow-merges capability sources and separately merges `bstack:options`; protected project, build, and session metadata is applied last. Credentials are added only inside the child provider and are never written to its context or result files.

The built-in Fingerprint matrix is optional:

```ts
import { fingerprintBrowserPreset } from '@fpjs-incubator/broyster/presets/fingerprint'

const allBrowsers = fingerprintBrowserPreset()
const betaBrowsers = fingerprintBrowserPreset({ channel: 'beta' })
```

Both functions return ordinary browser records, so entries can be spread, removed, or overridden.

## Run

Set the credentials and the token for the existing remotely managed tunnel:

```bash
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
export CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token

broyster run
```

Legacy `BROWSER_STACK_USERNAME` and `BROWSER_STACK_ACCESS_KEY` aliases are accepted. The tunnel token is passed to `cloudflared` only as `TUNNEL_TOKEN`; it is never placed on the command line.

The example project keeps the existing Fingerprint tunnel topology as defaults. Override its comma-separated host and port lists with `BS_CLOUDFLARE_HTTPS_HOSTS`, `BS_CLOUDFLARE_HTTPS_PORTS`, `BS_CLOUDFLARE_HTTP_HOSTS`, and `BS_CLOUDFLARE_HTTP_PORTS`; each host list must contain the same number of entries as its matching port list.

Useful filters:

```bash
broyster run --browsers chrome,safari
broyster run --filter 'Safari|Firefox'
broyster run --files dom.test.ts,storage.test.ts --test 'is stable'
broyster run --concurrency 3 --build pull-request-123
broyster run --fail-on-flaky
```

`--browsers` and `--filter` are mutually exclusive. File and test-name filters are preserved on every retry. A failed test run retries only failed modules; a startup failure retries the original file selection or the full suite.

## Results and exit codes

The JSON artifact uses `schemaVersion: 1` and contains run metadata, filters, warnings, aggregate browser/module/test counts, and every browser attempt with its BrowserStack session, timing, modules, tests, errors, and retry scope.

A browser that passes its retry is `flaky`. Flaky runs exit successfully by default; use `--fail-on-flaky` or `failOnFlaky: true` for strict CI.

- `0`: passed, or flaky when allowed
- `1`: final browser/test failure or strict flaky result
- `2`: invalid configuration or setup/transport failure
- `130`: interrupted with SIGINT after cleanup
- `143`: terminated with SIGTERM after cleanup

## Library API

The CLI is a thin wrapper around the same typed API:

```ts
import { runBrowserStack } from '@fpjs-incubator/broyster'

const result = await runBrowserStack(config, {
    browserIds: ['chrome'],
    fileFilters: ['dom.test.ts'],
    testNamePattern: 'creates a button',
})
```

Custom transports implement `BrowserTransport.start(signal)` and return explicit `TunnelSlot` records plus an idempotent `close()` method. Returned slots are runtime-validated before use. A transport that reads a secret from the parent environment should also return `sensitiveEnvKeys`; Broyster removes those variables from Vitest child environments and redacts their values from logs and results. Cloudflare Tunnel is the only built-in transport in v1.

## Defaults

- Concurrency: 5
- BrowserStack queue poll interval: 10 seconds
- Queue and browser timeout: 10 minutes
- Vitest/provider connection timeout: 120 seconds
- WebDriver heartbeat: 18 seconds
- Process retries: 1 (`maxRetries` accepts `0` or `1`)
- Results: `browserstack-results.json`

## Migrating from Broyster 0.x

Broyster v1 intentionally removes the Karma launcher/configurator, Jasmine retry helper, BrowserStack Local integration, and the `/node` and `/browser` subpaths. Convert suites to Vitest, use `defineBrowserStackVitestConfig`, declare the browser matrix in `broyster.config.*`, and move test retry expectations to the process-level result model described above.
