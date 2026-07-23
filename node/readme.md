# Broyster Node.js tools

```bash
npm install --save-dev @fpjs-incubator/broyster vitest @vitest/browser
# Local browsers also need:
npm install --save-dev @vitest/browser-playwright playwright
# HTTPS BrowserStack browsers also need:
npm install --save-dev @vitejs/plugin-basic-ssl
# or
pnpm add -D @fpjs-incubator/broyster vitest @vitest/browser @vitest/browser-playwright playwright @vitejs/plugin-basic-ssl
```

## Usage

```ts
import {
  makeVitestConfigurator,
  browserstack,
  browserstackBrowsers,
  runBrowserStackSuite,
  BrowserStackReporter,
} from '@fpjs-incubator/broyster'
// Alias still works:
// import { ... } from '@fpjs-incubator/broyster/vitest'
```

### Opinionated configurator

```ts
// vitest.config.ts
import { makeVitestConfigurator } from '@fpjs-incubator/broyster'

export default makeVitestConfigurator({
  projectName: 'My project',
  include: ['src/**/*.test.ts'],
  alwaysRetryTests: true,
})
```

Presets (via `BROYSTER_PRESET` / `BS_PRESET`, or auto-detected from `BS_BROWSER`):

| Preset | Behavior |
| --- | --- |
| `local` (default) | Playwright provider, chromium + firefox |
| `browserstack` | BrowserStack provider for one browser (`BS_BROWSER`) or the full matrix |
| `browserstack-beta` | Same, beta browsers only |

### Multi-browser BrowserStack runs

Vitest runs one browser per process. Use the orchestrator (starts **BrowserStack Local** by default):

```bash
BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=… \
  broyster-vitest --config vitest.config.ts --concurrency 5
```

Useful flags: `--filter Safari`, `--browsers Windows11_ChromeLatest,iOS17_Safari`, `--build my-build`, `--results browserstack_results.json`, `--debug`, `--tunnel browserstack-local|public-url|none`.

Programmatic API:

```ts
import { runBrowserStackSuite } from '@fpjs-incubator/broyster'

const results = await runBrowserStackSuite({
  configPath: 'vitest.config.ts',
  concurrency: 5,
  tunnel: 'browserstack-local', // default
})
```

### Public-URL tunnel mode (advanced)

For consumers that expose the Vitest server via their own tunnel (e.g. Cloudflare):

```ts
await runBrowserStackSuite({
  configPath: 'vitest.config.ts',
  tunnel: 'public-url',
  publicUrlSlots: [
    { hostname: 'slot-1.example.com', port: 7201, useHttps: true },
  ],
})
```

Or set env on a single Vitest process: `BS_PUBLIC_BASE_URL`, optional `BS_TUNNEL_READY_FILE`, `BS_LOCAL_IDENTIFIER` (when still using Local).

### Building blocks

| Export | Role |
| --- | --- |
| `browserstack(options)` | Vitest `BrowserProvider` for BrowserStack WebDriver sessions |
| `BrowserStackReporter` | Marks sessions passed/failed in BrowserStack UI |
| `FailedFilesReporter` | Writes failed module ids for orchestrator retries (`BS_FAILED_FILES_OUT`) |
| `FailureSummaryReporter` | Console failure summary |
| `BrowserStackQueue` | Waits for free BrowserStack slots via `getPlan()` |
| `browserstackBrowsers` / `platformToOs` / `resolveDeviceName` | Default browser matrix helpers |
| `startBrowserStackLocal` | Start/stop Local tunnel with retries |

### Environment variables

| Variable | Purpose |
| --- | --- |
| `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY` | Credentials |
| `BS_BROWSER` | Single browser key for a Vitest child process |
| `BS_BUILD_NAME` | BrowserStack build name |
| `BS_LOCAL_IDENTIFIER` | Shared Local tunnel id |
| `BS_PUBLIC_BASE_URL` | Rewrite Vitest page URL for public tunnels |
| `BS_TUNNEL_READY_FILE` | Optional ready marker for public tunnels |
| `BS_QUEUE_MANAGED_EXTERNALLY` | Skip per-process queue wait (orchestrator owns it) |
| `BS_FAILED_FILES_OUT` | Path for failed-files JSON |
| `BS_API_PORT` | Vitest browser API port |
| `BROYSTER_PRESET` | `local` \| `browserstack` \| `browserstack-beta` |

### Notes

- **Safari / iOS** default to HTTP on BrowserStack Local. Self-signed HTTPS breaks Vitest’s browser WebSocket handshake on Safari; use `public-url` mode with trusted certs for HTTPS Safari.
- Non-Safari browsers with `useHttps: true` use `@vitejs/plugin-basic-ssl` and `bs-local.com`.

## Breaking change (v1)

Karma / Jasmine support (`@fpjs-incubator/broyster/node`, `@fpjs-incubator/broyster/browser`, `makeKarmaConfigurator`, `retryFailedTests`) was **removed**. Migrate to Vitest browser mode with the API above.
