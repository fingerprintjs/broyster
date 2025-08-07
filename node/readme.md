# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

**Broyster** is a tiny toolkit that makes it easy to run **all tests in real browsers**.

- **Vitest Browser Mode** for running tests in a real browser (not `jsdom`).
- **Local** runs via Vitest’s **WebdriverIO** provider (Chromium headless by default).
- **Remote** runs on **BrowserStack** via a small provider that plugs into Vitest.
- Automatic BrowserStack session naming, annotations, and pass/fail status.

This repo is the **vNext** refactor away from Karma/Selenium and away from `jsdom`-based unit tests. The goal is a
single way to run tests: **in a browser**, locally or on BrowserStack.

---

## Packages

- **[`node/`](./node)** — published as [`@fpjs-incubator/broyster`](https://npmjs.com/package/@fpjs-incubator/broyster)
    - `@fpjs-incubator/broyster/vitest` → Vitest preset + BrowserStack provider

- **[`example_project/`](./example_project)** — minimal example using Vitest Browser Mode locally and on BrowserStack

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
# Local browser (Chromium headless via WebdriverIO)
bun run test               # runs example_project tests in a real browser

# Remote on BrowserStack
export BROWSERSTACK=1
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
bun run test:bs
```

> If you prefer Yarn:
>
> ```bash
> yarn install
> yarn build
> yarn --cwd example_project test:local
> BROWSERSTACK=1 BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... \
>   yarn --cwd example_project test:browserstack
> ```

---

## Use in your project

Install:

```bash
# pick your tool
npm i -D @fpjs-incubator/broyster
# or
yarn add -D @fpjs-incubator/broyster
# or
bun add -d @fpjs-incubator/broyster
```

### Vitest config (browser mode)

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { vitestPreset } from '@fpjs-incubator/broyster/vitest'

export default defineConfig({
    ...vitestPreset({
        projectName: 'MyProject',
        includeFiles: ['src/**/*.{test,spec}.ts?(x)'],
        // When BROWSERSTACK is set, tests run remotely. Otherwise they run locally via WebdriverIO (Chromium headless).
        // Optional: override default instances/capabilities
        browser: {
            enabled: true,
            provider: 'webdriverio',
            instances: [{ browser: 'chrome' }, { browser: 'firefox' }],
        },
        retries: 2,
        globals: true,
    }),
})
```

Add scripts:

```json
{
    "scripts": {
        "test": "vitest --browser",
        "test:run": "vitest run --browser",
        "test:bs": "BROWSERSTACK=1 vitest run --browser"
    }
}
```

### Running on BrowserStack

Set credentials (in your shell or CI):

```bash
export BROWSERSTACK=1
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
```

Optional environment toggles:

- `BS_BROWSERS` — comma‑separated filter of browsers to run remotely (e.g. `chrome,firefox,safari,microsoftedge`).
- `BS_DEBUG` — `true|false` (BrowserStack debug mode).
- `BS_NETWORK_LOGS` — `true|false` (capture network logs).
- `BS_CONSOLE_LOGS` — `disable|info|warn|error`.

Build metadata is inferred when running in GitHub Actions (branch, SHA, run id) and used to name the build/session.

Broyster also auto‑adds a small setup file that:

- Sets the session name to the current spec.
- Annotates each test start/pass/fail in BrowserStack.
- Marks the session **passed/failed** based on the test run.

### Running locally

If `BROWSERSTACK` is not set, the preset configures Vitest’s WebdriverIO provider to run **Chromium headless** locally.
You can customize the local instances by passing `browser.instances` in the preset options.

> Why not `jsdom`? This package intentionally avoids it — everything runs in a real browser to match production
> behavior.

---

## Example test

```ts
import { test, expect } from 'vitest'

// Runs inside the real browser context

test('renders a button', () => {
    document.body.innerHTML = `<button>Click me</button>`
    expect(document.querySelector('button')?.textContent).toBe('Click me')
})
```

You can also use DOM Testing Library if you prefer (Vitest Browser Mode bundles the necessary bits):

```ts
import { screen } from '@testing-library/dom'
import { test, expect } from 'vitest'

test('find by role', () => {
    document.body.innerHTML = `<button>Save</button>`
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
})
```

---

## Troubleshooting

- **No browser opened / tests hang** – ensure you’re running with `--browser` and not `jsdom`/`node` environment.
- **Remote run didn’t trigger** – set `BROWSERSTACK=1` alongside credentials.
- **Wrong set of browsers on BrowserStack** – set `BS_BROWSERS` (e.g. `BS_BROWSERS=chrome,firefox`).
- **Console/Network logs missing** – set `BS_CONSOLE_LOGS` / `BS_NETWORK_LOGS`.
- **Session stuck / Local tunnel errors** – we don’t start BrowserStack Local automatically; if your app needs
  localhost access, configure it in your app under test (or CI) and re‑run.

---

## Contributing

See [contributing.md](contributing.md) for how to develop and run the project locally. We welcome issues and PRs that
improve the preset, the BrowserStack provider, or the example.

---

## License

MIT © FingerprintJS, Inc.
