# Contributing to Broyster

Thanks for taking the time to contribute!
Here you can find ways to make Broyster better, as well as tips and guidelines.

This project and everyone participating in it is governed by the [Code of Conduct](code_of_conduct.md).
By participating, you are expected to uphold this code.

## How you can contribute

### Reporting an issue

If you've noticed a bug, have an idea or a question,
feel free to [create an issue](https://github.com/fingerprintjs/broyster/issues/new/choose) or [start a discussion](https://github.com/fingerprintjs/broyster/discussions/new/choose).

Before you start, please [search](https://github.com/search?q=repo%3Afingerprintjs%2Fbroyster) for your topic.
There is a chance it has already been discussed.

When you create an issue, please provide all the information needed to reproduce your situation, it will help us solve your issue faster.
If you want to share a piece of code or the library output with us, please wrap it in a ` ``` ` block and make sure you include all the information.

### Creating a pull request

If you want to fix a bug or make any other code contribution, please [create a pull request](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project).

After you clone the repository, check the [Working with code](#working-with-code) section to learn how to run, check, and build the code.

In order for us to review and accept your code contributions, please follow these rules:
- Your code quality should be at least as good as the code you modify.
- Your code style (syntax, naming, coding patterns, etc) should follow the Broyster style.
- All the checks described in the [Working with code](#working-with-code) section must pass successfully.
  You may create a draft pull request in this repository to run the checks automatically by GitHub Actions,
  but the tests won't run on BrowserStack until a Broyster maintainer approves them.
- Broyster comes with an [example project](example_project) including tests aimed at testing the essential features.
  If you add a new feature, please add it to the example project.
  It will allow to test your new feature and show its usage example to other developers.
- The changes should be backward compatible, ensuring Broyster users continue to use the library without any modifications.
- Don't add dependencies (such as Node packages) unless necessary.
- Don't make changes unrelated to the stated purpose of your pull request. Please strive to introduce as few changes as possible.
- Don't change Broyster code style, its TypeScript configuration, or other subjective things.

If you want to do something more complex than fixing a small bug, or if you're not sure if your changes meet the project requirements, please [start a discussion](https://github.com/fingerprintjs/broyster/discussions/new/choose).
We encourage starting a discussion if you want to propose violating a rule from this guide.
Doing so ensures we discuss all opinions, creating a good contribution experience for everyone.

### Helping with existing issues

If you want to help, but don't know where to start, take a look at the ["help wanted" issues](https://github.com/fingerprintjs/broyster/labels/help%20wanted).
You can help by sharing knowledge or creating a pull request.
Feel free to ask questions in the issues if you need more details.

## Working with code

This section describes how to deploy the repository locally, make changes to the code, and verify your work.

First, make sure you have [Git](https://git-scm.com), [Node.js](https://nodejs.org) and [Yarn](https://yarnpkg.com) installed.
Then clone the repository and install the dependencies:

```bash
git clone https://github.com/fingerprintjs/broyster.git
cd broyster
yarn install
```

### Code style

Follow the repository's code style.
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

To build the distribution files of the Node package, run:

```bash
# Build once:
yarn --cwd node build

# Or build once and then rebuild when the code changes:
yarn --cwd node build:watch
```

The files will be saved to the `node/dist` directory.

### Pitfalls

The project uses Karma and Jasmine, which means not everything is in our control.
For some problems you will need to dig into Karma or Jasmine to figure out if and how you can work around it.

### How to test

The repository contains an [example project](example_project) that contains tests.
To run the tests in a browser on your machine, build the project:

```bash
yarn --cwd node build:watch
```

and run in a separate terminal tab or window:

```bash
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
But the test won't run when the PR is made from a fork repository, in this case, a member will run the tests manually.

BrowserStack sessions are unstable, so a session can fail for no reason;
restart the testing when you see no clear errors related to the tests.
If you run the test command multiple times in parallel, BrowserStack will lose access to the Karma server
(for some reason), which will cause the tests to hang infinitely, so try to run a single test command at once.
