# Contributing to Broyster

## Working with the code

Make sure you have [Yarn](https://yarnpkg.com) installed.

### Development

The project requires little start-up efforts and verification of most enhancement work.
It is a [Karma](https://karma-runner.github.io) plugin that provides a launcher that uses Selenium WebDriver and BrowserStack for tests as well as a reporter, and a retry metchanism for [Jasmine](https://jasmine.github.io) tests.
Broyster comes with an example project including tests aimed at testing the essential features, but feel free to add your own as you see fit.

### Code style

The code style is controlled by [ESLint](https://eslint.org) and [Prettier](https://prettier.io).
Run to check that the code style is ok:

```bash
yarn lint
```

You aren't required to run the check manually, the CI will do it.
Run this to fix code style mistakes (not all mistakes can be fixed automatically):

```bash
yarn lint:fix
```

### How to build

To build the distribution files of the library, run:

```bash
yarn install
yarn --cwd node build:watch
```

The results will be placed in the `dist` folder by default.

### Pitfalls

The project uses Karma and Jasmine, which means not everything is in our control.
For some problems you will need to dig into Karma or Jasmine to figure out if and how you can work around it.

### How to test

The project contains an example project that contains tests.
To run the tests in a browser on your machine, build the project:

```bash
yarn install
yarn --cwd node build:watch
```

and run:

```bash
# Run example tests in local browsers
yarn --cwd example_project test:local
```

To run the tests in browsers on [BrowserStack](https://www.browserstack.com), get a BrowserStack access key and run:

```bash
# For Linux, macOS and WSL (Linux on Windows)
BROWSERSTACK_USERNAME=your-username BROWSERSTACK_ACCESS_KEY=your-key yarn --cwd example_project test:browserstack
```

If you face `Error: spawn Unknown system error -86` on macOS, try installing Rosetta:

```bash
softwareupdate --install-rosetta
```

Alternatively, make a PR to this repository, the test will run on BrowserStack automatically.
But the test won't run when the PR is made from a fork repository, in this case a member will run the tests manually.
