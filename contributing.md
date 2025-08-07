# Contributing to Broyster

Thanks for taking the time to contribute! Here you’ll find ways to help and a few practical guidelines.

This project and everyone participating in it is governed by the [Code of Conduct](code_of_conduct.md). By
participating, you agree to uphold it.

---

## How you can contribute

### Reporting an issue

If you’ve found a bug, have an idea, or a question,
please [open an issue](https://github.com/fingerprintjs/broyster/issues/new/choose)
or [start a discussion](https://github.com/fingerprintjs/broyster/discussions/new/choose).

Before filing, please [search](https://github.com/search?q=repo%3Afingerprintjs%2Fbroyster) – it may already exist.

When creating an issue, include enough detail to reproduce the problem (versions, OS, logs, steps). Wrap code or logs in
triple backticks (\`\`\`).

### Creating a pull request

If you want to fix a bug or add a feature, open a PR. See GitHub’s guide
on [contributing to a project](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project).

**PR checklist**

- Code quality should be at least as good as the surrounding code.
- Follow the project’s style and patterns.
- All checks described in **Working with code** must pass.
- Add or update the example in [`example_project/`](example_project) to demonstrate new features.
- Keep changes focused—avoid unrelated edits.
- Minimize new dependencies unless necessary.
- Prefer backward compatibility for the published package.
- If unsure about an approach, please start a discussion first.

### Helping with existing issues

Browse [help wanted](https://github.com/fingerprintjs/broyster/labels/help%20wanted). You can share context, reduce
repro steps, or pick one up and open a PR. Ask questions in the issue if something is unclear.

---

## Working with code

### Requirements

- **Node.js 18+** (Node 20+ recommended)
- **bun** or **Yarn Berry** (examples use bun)
- **Git**

### Setup

```bash
git clone https://github.com/fingerprintjs/broyster.git
cd broyster
bun install
```

### Code style

We use **ESLint** + **Prettier**.

```bash
# Lint
bun run lint

# Auto-fix
bun run lint:fix
```

### Building

Build the published package (`node/`) and the example project:

```bash
bun run build          # builds node/ then example_project/
# or watch in the package only
(cd node && bun run dev)
```

The distributables for the package are written to `node/dist`.

### Testing

This repo contains an example that exercises both **Vitest browser mode** (unit) and **WebdriverIO + BrowserStack** (
E2E).

**Unit tests (Vitest):**

```bash
bun run test           # runs example_project tests locally in browser mode
```

**E2E tests on BrowserStack:**

```bash
# set your credentials
export BROWSERSTACK_USERNAME=your-username
export BROWSERSTACK_ACCESS_KEY=your-access-key
export BROWSERSTACK=1

# run the E2E matrix via the broyster preset
bun run test
```

By default, `localIdentifier` is automatically generated per run to prevent port clashes across multiple E2E sessions.

---

## Pitfalls & tips

- **BrowserStack Local tunnel**
    - Automatically enabled in remote mode with unique `localIdentifier`.
    - If you don’t need Local, disable it in your BrowserStack capabilities.

- **Spec discovery**
    - Vitest browser mode runs `.ts` specs directly; no need for a separate TS runtime.

- **TypeScript in WDIO**
    - WDIO v9 types can be strict. Broyster avoids direct dependency on them; align `@wdio/*` versions and
      `typescript` ≥ 5.4.

- **Flaky sessions**
    - Remote grids can be flaky. Re-run jobs when failures aren’t attributable to your tests.

---

## Continuous Integration

If you add CI, remember to set `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` as secrets. Example GitHub Actions:

```yaml
- run: bun run build
- run: bun run test
- env:
      BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
      BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
      BROWSERSTACK: 1
  run: bun run test
```

---

Thanks again for helping make Broyster better!
