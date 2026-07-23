# Broyster 🕶️🦪

<sup>browser + oyster</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

Broyster runs Vitest browser suites on BrowserStack. It coordinates account concurrency, one isolated Vitest process per browser, externally provisioned Cloudflare Tunnel routes, retries, BrowserStack session status, and a versioned JSON result artifact.

The v1 package is ESM-only and requires Node.js `^20.19.0 || >=22.12.0`. It replaces the former Karma and Jasmine integrations.

## Repository

- [node](node) contains the published [`@fpjs-incubator/broyster`](https://npmjs.com/package/@fpjs-incubator/broyster) package.
- [example_project](example_project) demonstrates local WebdriverIO and remote BrowserStack runs.

## Development

Install pnpm 11.3 and the workspace dependencies:

```bash
corepack enable
pnpm install
```

Run the checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --dir example_project test:local
```

See the [package guide](node/readme.md) for configuration, CLI options, Cloudflare prerequisites, results, and migration notes.

## Contributing

See the [contribution guidelines](contributing.md) and [code of conduct](code_of_conduct.md).
