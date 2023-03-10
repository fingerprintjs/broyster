# Broyster 🕶️🦪

<sup>(browser + oyster)</sup>

[WIP] A monorepo of testing tools

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
