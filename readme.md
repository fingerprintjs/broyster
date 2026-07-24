# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

Broyster runs your [Vitest browser mode](https://vitest.dev/guide/browser/) tests on real browsers in
[BrowserStack](https://www.browserstack.com), using Selenium WebDriver to drive the remote browsers.
It orchestrates one Vitest process per browser, routes the remote browsers back to your local test
server through a pluggable transport (BrowserStack Local tunnel or Cloudflare Tunnel), retries failed
test files automatically, and marks the BrowserStack sessions as passed or failed.

Project structure:

- [node](node) — the test tools.
    Published as an [@fpjs-incubator/broyster](https://npmjs.com/package/@fpjs-incubator/broyster) Node package.
- [example_project](example_project) — an example project that uses the testing tools.

## Quick start

Make sure you have Node.js 22.13 or newer (the pnpm 11 floor) and [pnpm](https://pnpm.io) installed.

```bash
pnpm install
pnpm --dir node build
```

Then run:

```bash
# Run example tests in a local browser (Chromium via Playwright)
pnpm --dir example_project test:local

# Or run example tests on BrowserStack
# For Linux, macOS and WSL (Linux on Windows)
BROWSERSTACK_USERNAME=your-username BROWSERSTACK_ACCESS_KEY=your-key pnpm --dir example_project test:browserstack
```

See the [package readme](node/readme.md) for usage and configuration.

## Contributing

See the [Contribution guidelines](contributing.md) to learn how to contribute to the project or run the project locally.
Please read it carefully before making a pull request.
