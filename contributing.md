# Contributing to Broyster

## Working with the code

Make sure you have [Yarn](https://yarnpkg.com) installed.

### Development

The project is self-working.
It is a [Karma](https://karma-runner.github.io) plugin that provides a launcher that uses Selenium WebDriver and BrowserStack for tests as well as a reporter, and a retry metchanism for [Jasmine](https://jasmine.github.io) tests.
The project comes with am example project with tests aimed at testing the essential features, but feel free to add your own as you see fit.

### Code style

The code style is controlled by [ESLint](https://eslint.org) and [Prettier](https://prettier.io).
Run to check that the code style is ok:

```bash
yarn lint
```

You aren't required to run the check manually, the CI will do it.
Run to fix code style mistakes (not all mistakes can be fixed automatically):

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

Working with Karma and Jasmine, which means not everything is in our control.
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

### How to publish

This section is for repository maintainers.

1. Bump the version. Search the current version number in the code to know where to change it.
2. Build and test the project.
3. See what will get into the NPM package, make sure it contains the distributive files and no excess files.
    To see, run `yarn pack`, an archive will appear nearby, open it with any archive browser.
4. Run

    ```bash
    # Add '--tag beta' (without the quotes) if you release a beta version
    # Add '--tag dev' if you release a development version (which is expected to get new features)
    yarn publish --access public
    ```

5. Push the changes to the repository, and a version tag like `v1.3.4` to the commit.
