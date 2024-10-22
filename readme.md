# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

<p align="center">
  <a href="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml"><img src="https://github.com/fingerprintjs/broyster/actions/workflows/test.yml/badge.svg" alt="Build status"></a>
  <a href="https://www.npmjs.com/package/@fpjs-incubator/broyster"><img src="https://img.shields.io/npm/v/@fpjs-incubator/broyster.svg" alt="Current NPM version"></a>
</p>

Broyster gives you the ability to run your Karma tests in Browserstack using Selenium WebDriver as the means to execute the tests, as opposed to the regular tunnel for JS testing, giving you more flexibility in creating your test setup.
It also comes with a Jasmine retry mechanism to help you combat flaky tests so that you can rely on your tests more.

Project structure:

- [node](node) — test tools for Node.js projects.
    Published as an [@fpjs-incubator/broyster](https://npmjs.com/package/@fpjs-incubator/broyster) Node package.
- [example_project](example_project) — an example project that uses the testing tools.

## Quick start

Make sure you have Node.js 16 or newer and Yarn installed.

```bash
yarn install
yarn --cwd node build:watch
```

Open a new terminal tab and run:

```bash
# Run example tests in local browsers
yarn --cwd example_project test:local

# Or run example tests on BrowserStack
# For Linux, macOS and WSL (Linux on Windows)
BROWSERSTACK_USERNAME=your-username BROWSERSTACK_ACCESS_KEY=your-key yarn --cwd example_project test:browserstack
```

## Contributing

See the [Contribution guidelines](contributing.md) to learn how to contribute to the project or run the project locally.
Please read it carefully before making a pull request.
