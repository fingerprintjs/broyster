# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

Broyster gives you the ability to run your Vitest browser tests on BrowserStack using Selenium WebDriver and Cloudflare Tunnels to execute the tests, giving you high flexibility and performance in cross-browser testing.
It also includes automated retry mechanisms (at both file and browser levels) to combat flaky tests.

Project structure:

- [node](node) — test tools for Node.js projects.
    Published as an [@fpjs-incubator/broyster](https://npmjs.com/package/@fpjs-incubator/broyster) Node package.
- [example_project](example_project) — an example project that uses the testing tools.

## Quick start

Make sure you have Node.js 18 or newer and pnpm installed.

```bash
pnpm install
pnpm --filter @fpjs-incubator/broyster build
```

Open a terminal and run:

```bash
# Run example tests in local browsers
pnpm --cwd example_project test:local

# Or run example tests on BrowserStack
BROWSERSTACK_USERNAME=your-username BROWSERSTACK_ACCESS_KEY=your-key CLOUDFLARE_TUNNEL_TOKEN=your-token pnpm --cwd example_project test:browserstack
```

## Contributing

See the [Contribution guidelines](contributing.md) to learn how to contribute to the project or run the project locally.
Please read it carefully before making a pull request.
