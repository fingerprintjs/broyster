# Broyster Node.js tools (vNext)

Unified test utilities for **Vitest** (unit) and **WebdriverIO + BrowserStack** (E2E).

## Install

```bash
# npm	npm i -D @fpjs-incubator/broyster
# pnpm	pnpm add -D @fpjs-incubator/broyster
# yarn	yarn add -D @fpjs-incubator/broyster
# bun	bun add -d @fpjs-incubator/broyster
```

## What this package exports

- `@fpjs-incubator/broyster/vitest`
    - `vitestPreset(options)` → minimal Vitest config preset.

- `@fpjs-incubator/broyster/wdio`
    - `makeWdioConfig(options)` → return a WDIO **Testrunner** config tailored for BrowserStack.
    - `makeBrowserMatrix(names, base?)` → convenience helper to build a capabilities matrix.
    - `enableLocal(config, { id? })` → turn on BrowserStack Local with `forcedStop` and a unique id.

- CLI
    - `broyster` → a tiny wrapper around `@wdio/cli` that auto-registers a TS runtime (`tsx` or `ts-node`) so you can
      run `.ts` specs directly.

> **Note:** The old Karma/Jasmine helpers (`makeKarmaConfigurator`, `karmaPlugin`, `retryFailedTests`, etc.) were
> removed in vNext. Use Vitest for unit tests and WDIO for E2E.

---

## Usage

### 1) Vitest preset

`vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import { vitestPreset } from '@fpjs-incubator/broyster/vitest'

export default defineConfig({
    ...vitestPreset({
        projectName: 'MyProject',
        includeFiles: ['src/**/*.ts', 'tests/**/*.ts'],
        environment: 'jsdom',
        retries: 2,
    }),
})
```

### 2) WDIO + BrowserStack

`wdio.conf.ts`

```ts
import type { Options } from '@wdio/types'
import { makeWdioConfig, makeBrowserMatrix, enableLocal } from '@fpjs-incubator/broyster/wdio'

const config = makeWdioConfig({
    projectName: 'MyProject',
    specs: ['./e2e/**/*.spec.ts'],
    maxInstances: 3,
    matrix: makeBrowserMatrix(['chrome', 'firefox', 'safari']),
    timeoutMs: 120_000,
}) as Options.Testrunner

// If you need BrowserStack Local (localhost testing)
enableLocal(config)

export const { config: exported } = { config }
export default config
```

**Running**

```bash
# Set your BrowserStack creds (or use your shell profile)
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key

# Execute E2E matrix
broyster --config wdio.conf.ts
```

> The CLI auto-loads `tsx` or `ts-node` if present. If neither is installed, install one: `bun add -d tsx`.

### Example E2E spec

`e2e/smoke.spec.ts`

```ts
describe('smoke', () => {
    it('opens a page and finds a button', async () => {
        await browser.url('https://example.com')
        const el = await $('body')
        await expect(el).toBeExisting()
    })
})
```

---

## Helper reference

### `vitestPreset(options)`

- `projectName` **(string, required)** – used for the Vitest project name.
- `includeFiles` **(string\[], default:** \`\['src/**/\*.ts','tests/**/\*.ts']**)** – test file globs.
- `environment` **('node'|'jsdom', default: 'jsdom')**.
- `retries` **(number, default: 2)** – Vitest retry count.

### `makeWdioConfig(options)`

- `projectName` **(string)** – surfaced in BrowserStack metadata.
- `specs` **(string\[], default: `['./e2e/**/\*.spec.ts']`)\*\* – spec globs.
- `maxInstances` **(number, default: 5)** – per capability.
- `matrix` **(Capabilities\[], default: chrome, firefox, safari)** – browser matrix.
- `timeoutMs` **(number, default: 120000)** – Mocha timeout.

Internally sets:

- `framework: 'mocha'`, `reporters: ['spec']`
- BrowserStack service and credentials via `BROWSERSTACK_USERNAME`/`BROWSERSTACK_ACCESS_KEY`

### `makeBrowserMatrix(names, base?)`

Convenience to create a matrix from browser aliases. `base` merges into each entry (e.g., platformName, versions).

```ts
makeBrowserMatrix(['chrome', 'firefox'], { 'bstack:options': { os: 'Windows', osVersion: '11' } })
```

### `enableLocal(config, { id })`

Adds BrowserStack Local with a unique `localIdentifier`, `browserstackLocal: true`, and `forcedStop: true` to avoid
orphan tunnels.

```ts
enableLocal(config, { id: 'my-ci-job-123' })
```

---

## Migrating from Karma/Jasmine

- Replace Karma config + Jasmine helpers with:
    - **Vitest** for unit tests (`vitest.config.ts` using `vitestPreset`).
    - **WDIO** for cross-browser E2E (`wdio.conf.ts` using `makeWdioConfig`).

- Specs migrate 1:1 in most cases, but Jasmine APIs like `pending()` map to `it.skip()` or `it.todo()` in Vitest.
- Remove Karma-specific launchers, reporters, and BrowserStack tunnel logic. Use `enableLocal()` when you need localhost
  with WDIO.

---

## Troubleshooting

- **No specs found**: ensure your `specs` glob matches actual files. If compiling TS → JS first, point to the built
  output.
- **TS runtime not found**: install `tsx` (recommended) or `ts-node` in your project.
- **Local tunnel conflict**: “Either another browserstack local client is running…” – stop other tunnels or run a single
  job, or provide a different id via `enableLocal()`.

---

## License

MIT
