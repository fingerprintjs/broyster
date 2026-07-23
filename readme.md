# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

Broyster helps you run **Vitest browser tests** on **local browsers** and **BrowserStack**, with queue management, session status reporting, and multi-browser orchestration.

Project structure:

- [node](node) — published as [@fpjs-incubator/broyster](https://npmjs.com/package/@fpjs-incubator/broyster)
- [example_project](example_project) — usage example

## Quick start

Requires [Node.js](https://nodejs.org) 18+ and [pnpm](https://pnpm.io) 9+.

```bash
pnpm install
pnpm build
```

```bash
# Local browsers (Playwright)
pnpm playwright:install
pnpm test:local

# BrowserStack (requires credentials + browserstack-local)
BROWSERSTACK_USERNAME=your-username BROWSERSTACK_ACCESS_KEY=your-key \
  pnpm test:browserstack
```

### Consumer setup

```ts
// vitest.config.ts
import { makeVitestConfigurator } from '@fpjs-incubator/broyster'

export default makeVitestConfigurator({
  projectName: 'My project',
  include: ['src/**/*.test.ts'],
})
```

```bash
# Local
vitest run --config vitest.config.ts

# All BrowserStack browsers (parallel processes + BrowserStack Local)
BROWSERSTACK_USERNAME=… BROWSERSTACK_ACCESS_KEY=… \
  broyster-vitest --config vitest.config.ts --concurrency 5
```

Peer dependencies: `vitest`, `@vitest/browser`.  
Local preset: `@vitest/browser-playwright`, `playwright`.  
HTTPS BrowserStack browsers: `@vitejs/plugin-basic-ssl`.

See [node/readme.md](node/readme.md) for the full API.

## Contributing

See the [Contribution guidelines](contributing.md) to learn how to contribute to the project or run the project locally.
Please read it carefully before making a pull request.
