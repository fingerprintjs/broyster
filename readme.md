# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

**Broyster** is a small toolkit to standardize testing across projects:

- **Unit & integration tests** via **Vitest** in **real browsers** (local or remote)
- **Cross-browser E2E** using **WebdriverIO** (WDIO) with **BrowserStack**
- A **Vitest provider** that merges WDIO's BrowserStack service into Vitest's `browser` mode — no jsdom here
- Optional **BrowserStack Local** tunnel management with auto-start/stop for local testing

This is the **vNext** refactor away from Karma/Selenium to **Vitest + WDIO (browser mode)**.

---

## Packages

- **[`node/`](./node)** — published as [`@fpjs-incubator/broyster`](https://npmjs.com/package/@fpjs-incubator/broyster)
  Exposes:
    - `@fpjs-incubator/broyster/vitest` → Vitest preset for local or BrowserStack runs
    - Internal helpers for BrowserStack provider integration
    - CLI: `broyster` (legacy WDIO runner, may be removed in future)

- **[`example_project/`](./example_project)** — minimal usage example for the Vitest + BrowserStack setup

---

## Quick start (this monorepo)

Requirements: **Node 18+** (Node 20+ recommended). Use **bun** or Yarn Berry — examples below use bun.

```bash
# at repo root
bun install
bun run build              # builds the package and the example project
```

Run the example tests:

```bash
# Local browser run (Chrome by default)
bun run test               # runs example_project tests in a real local browser

# Remote on BrowserStack (needs credentials)
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
bun run test:bs
```

> If you prefer Yarn:
>
> ```bash
> yarn install
> yarn build
> yarn --cwd example_project test
> BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... yarn --cwd example_project test:bs
> ```

---

## Using Broyster in your project

Install:

```bash
npm i -D @fpjs-incubator/broyster
# or
yarn add -D @fpjs-incubator/broyster
# or
bun add -d @fpjs-incubator/broyster
```

### 1) Vitest preset

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { vitestPreset } from '@fpjs-incubator/broyster/vitest'

export default defineConfig(
    vitestPreset({
        projectName: 'MyProject',
        includeFiles: ['**/*.{test,spec}.ts?(x)'],
        retries: 2,
        globals: true,
        watch: false,
        browser: {
            enabled: true,
            provider: 'webdriverio', // or auto-switched to our BrowserStack provider if env vars set
            instances: [
                {
                    browser: 'chrome',
                    capabilities: {
                        browserVersion: 'latest',
                        'bstack:options': { os: 'Windows', osVersion: '11' },
                    },
                },
                {
                    browser: 'firefox',
                    capabilities: {
                        browserVersion: 'latest',
                        'bstack:options': { os: 'Windows', osVersion: '11' },
                    },
                },
            ],
        },
    }),
)
```

Scripts:

```json
{
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest",
        "test:bs": "BROWSERSTACK=1 vitest run"
    }
}
```

### 2) Environment variables for BrowserStack

```bash
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
# Optional toggles
export BS_DEBUG=1
export BS_NETWORK_LOGS=1
export BS_CONSOLE_LOGS=info
```

---

## Helpers

We expose some utility functions internally (for the preset and provider), such as:

```ts
import { envMeta, boolEnv, strEnv } from '@fpjs-incubator/broyster/vitest/utils'

const { buildName, buildIdentifier, tags } = envMeta('MyProject')
```

---

## Troubleshooting

- **Tests run in jsdom instead of real browser**
  Ensure your `vitest.config.ts` uses `browser` config, not `environment: 'jsdom'`.

- **BrowserStack Local tunnel issues**
  We auto-stop tunnels on `SIGINT`/`SIGTERM`. If ports conflict, stop old processes or set a unique `localIdentifier`.

- **WDIO type errors**
  Align your `@wdio/*` versions with Vitest's expectations, or loosen consumer TS checks.

---

## Contributing

See [contributing.md](contributing.md) for how to develop and run the project locally.
We welcome issues and PRs that improve the preset, provider, or examples.

---

## License

MIT © FingerprintJS, Inc.
