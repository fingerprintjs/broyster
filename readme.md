# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

**Broyster** is a small toolkit to standardize testing across projects:

- **Unit tests** via **Vitest** (browser-like with `jsdom` or pure `node`)
- **Cross-browser E2E** via **WebdriverIO** (WDIO) on **BrowserStack**
- A minimal **CLI** (`broyster`) that runs WDIO and auto-registers a TS runtime (prefers `tsx`, falls back to `ts-node`)

This is the **vNext** refactor away from Karma/Selenium to **Vitest + WDIO**.

---

## Packages

- **[`node/`](./node)** — published as [`@fpjs-incubator/broyster`](https://npmjs.com/package/@fpjs-incubator/broyster)
  Exposes:
    - `@fpjs-incubator/broyster/vitest` → a tiny Vitest preset
    - `@fpjs-incubator/broyster/wdio` → helpers for WDIO configs (`makeWdioConfig`, `makeBrowserMatrix`, `enableLocal`)
    - CLI: `broyster`

- **[`example_project/`](./example_project)** — minimal usage of both Vitest and WDIO

---

## Quick start (this monorepo)

Requirements: **Node 18+** (Node 20+ recommended). Use **bun** or Yarn Berry — examples below use bun.

```bash
# at repo root
bun install
bun run build              # builds the package and the example
```

Run the example tests:

```bash
# Unit tests (Vitest)
bun run test               # runs example_project tests locally

# E2E on BrowserStack (needs credentials)
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
bun run e2e
```

> If you prefer Yarn:
>
> ```bash
> yarn install
> yarn build
> yarn --cwd example_project test:local
> BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... yarn --cwd example_project test:browserstack
> ```

---

## Using Broyster in your project

Install:

```bash
# pick your tool
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

export default defineConfig({
    ...vitestPreset({
        projectName: 'MyProject',
        includeFiles: ['src/**/*.ts', 'tests/**/*.ts'],
        environment: 'jsdom', // or 'node'
        retries: 2,
    }),
})
```

Scripts:

```json
{
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest"
    }
}
```

### 2) WebdriverIO (BrowserStack) config

`wdio.conf.ts` (TypeScript):

```ts
import { makeWdioConfig, makeBrowserMatrix } from '@fpjs-incubator/broyster/wdio'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)

export const config = makeWdioConfig({
    projectName: 'MyProject',
    specs: ['./e2e/**/*.spec.ts'],
    maxInstances: 3,
    matrix: makeBrowserMatrix(['chrome', 'firefox', 'safari']),
    timeoutMs: 120_000,
})

// Register a TS runtime for WDIO/Mocha workers
config.mochaOpts = {
    ...(config.mochaOpts as any),
    // Prefer tsx; falls back to ts-node if you want
    require: [req.resolve('tsx/dist/register.mjs')],
}

// Optionally enable BrowserStack Local when testing localhost
// import { enableLocal } from '@fpjs-incubator/broyster/wdio'
// enableLocal(config) // adds forcedStop + unique localIdentifier
```

Scripts:

```json
{
    "scripts": {
        "e2e": "broyster --config wdio.conf.ts"
    }
}
```

Set credentials (CI or local shell):

```bash
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
```

> **Note:** The `broyster` CLI tries to register a TS runtime automatically.
>
> - Prefer `tsx` (`bun add -d tsx`)
> - Or use `ts-node` (`npm i -D ts-node`) and swap the `require` path in `mochaOpts`.

---

## Helpers

```ts
import { makeBrowserMatrix, enableLocal } from '@fpjs-incubator/broyster/wdio'

// Build a browser matrix quickly
const caps = makeBrowserMatrix(['chrome', 'firefox', 'safari'], {
    'bstack:options': { projectName: 'MyProject' },
})

// Turn on BrowserStack Local with forced cleanup and a unique id
enableLocal(config, { id: 'my-local-tunnel' })
```

---

## Troubleshooting

- **“pattern ./dist-e2e/**/\*.spec.js did not match any file”\*\*
  If you compile TS before running WDIO, point `specs` at your compiled output. In this repo we run TS directly (via
  `tsx`), so `specs` targets `./e2e/**/*.spec.ts`.

- **`Cannot find module '.../tsx/register'`**
  Use `tsx/dist/register.mjs` (modern export), or switch to `ts-node/register/transpile-only`.

- **BrowserStack Local port in use / “another local client is running”**
  You likely have a stuck tunnel. Either disable Local in the config or run `enableLocal(config)` (sets `forcedStop`)
  and avoid parallel runs with a conflicting port.

- **WDIO type errors around capabilities**
  WDIO v9’s d.ts may vary. Broyster’s helpers avoid tight coupling to internal types; if you still see noise, ensure
  your consumer’s `typescript` is ≥ 5.4 and `@wdio/*` packages are aligned.

---

## Contributing

See [contributing.md](contributing.md) for how to develop and run the project locally.
We welcome issues and PRs that improve the preset, the WDIO helpers, or the example.

---

## License

MIT © FingerprintJS, Inc.
