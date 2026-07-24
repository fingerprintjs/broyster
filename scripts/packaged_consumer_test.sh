#!/usr/bin/env bash
# Contract test for the packaged @fpjs-incubator/broyster artifact: packs the
# built package, installs the tarball into a fresh consumer project outside the
# workspace, and verifies the public surface — both entry points, the bin, and
# the guided error of createBrowserStackConfig.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
temporary_root="$(mktemp -d)"
workdir="$temporary_root/clean consumer project with spaces"
mkdir -p "$workdir"
trap 'rm -rf "$temporary_root"' EXIT

echo "Packing @fpjs-incubator/broyster..."
(cd "$root/node" && pnpm pack --pack-destination "$temporary_root" >/dev/null)
tarball="$(find "$temporary_root" -maxdepth 1 -name '*.tgz' -print -quit)"

echo "Installing the tarball into a fresh consumer project..."
cd "$workdir"
cat > package.json <<'JSON'
{
  "private": true,
  "name": "broyster-consumer-contract-test",
  "type": "module"
}
JSON
npm install --no-audit --no-fund --loglevel=error \
  "$tarball" \
  'vitest@^4.1.0' \
  '@vitest/browser@^4.1.0' \
  'typescript@^5.9.0' \
  '@types/node@^20.19.0' >/dev/null

echo "Checking the packed package contract..."
node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const packageRoot = resolve('node_modules/@fpjs-incubator/broyster')
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))

assert.equal(manifest.type, 'module')
assert.equal(manifest.bin.broyster, './bin/broyster.js')
assert.deepEqual(Object.keys(manifest.exports), ['.', './vitest', './package.json'])

for (const exported of Object.values(manifest.exports)) {
  const targets = typeof exported === 'string' ? [exported] : Object.values(exported)
  for (const target of targets) {
    await access(resolve(packageRoot, target))
  }
}

async function listFiles(directory, relativeDirectory = '') {
  const files = []
  for (const entry of await readdir(join(directory, relativeDirectory), { withFileTypes: true })) {
    const relativePath = join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(directory, relativePath))
    } else {
      files.push(relativePath.replaceAll('\\', '/'))
    }
  }
  return files.sort()
}

const files = await listFiles(packageRoot)
assert.ok(files.includes('LICENSE'), 'LICENSE must be packed')
assert.ok(files.some((file) => /^readme\.md$/i.test(file)), 'README must be packed')
assert.ok(files.includes('bin/broyster.js'), 'CLI wrapper must be packed')
assert.ok(files.some((file) => file.endsWith('.d.ts')), 'declarations must be packed')
assert.ok(!files.some((file) => file.startsWith('src/')), 'source files must not be packed')
assert.ok(!files.some((file) => file.startsWith('tests/')), 'test files must not be packed')

for (const relativeFile of files.filter((file) => file.endsWith('.js') || file.endsWith('.d.ts'))) {
  const absoluteFile = join(packageRoot, relativeFile)
  const source = await readFile(absoluteFile, 'utf8')
  const specifiers = [...source.matchAll(/(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)]
    .map((match) => match[1])
  for (const specifier of specifiers) {
    assert.match(specifier, /\.js$/, `${relativeFile} has an extensionless relative import: ${specifier}`)
    await access(resolve(dirname(absoluteFile), specifier))
  }
}
NODE

echo "Checking the root entry..."
node --input-type=module -e "
import assert from 'node:assert/strict'
import * as broyster from '@fpjs-incubator/broyster'

for (const name of [
  'defineBroysterConfig',
  'runBrowserStackTests',
  'browserStackLocalTransport',
  'cloudflareTransport',
  'cloudflareTransportFromEnv',
  'getBrowserStackCredentials',
  'BrowserStackApiClient',
  'BrowserStackQueue',
  'serializeChildContext',
  'readChildContext',
  'formatSummary',
  'createRunSummary',
  'writeRunSummary',
]) {
  assert.equal(typeof broyster[name], 'function', name + ' must be exported as a function')
}
assert.equal(typeof broyster.browserstackBrowsers, 'object', 'browserstackBrowsers must be exported')
assert.ok(Object.keys(broyster.browserstackBrowsers).length > 0, 'browser catalog must not be empty')
"

echo "Checking the /vitest entry..."
node --input-type=module -e "
import assert from 'node:assert/strict'
import * as broysterVitest from '@fpjs-incubator/broyster/vitest'

for (const name of ['createBrowserStackConfig', 'browserstack']) {
  assert.equal(typeof broysterVitest[name], 'function', name + ' must be exported as a function')
}
for (const name of ['BrowserStackReporter', 'FailedFilesReporter', 'FailureSummaryReporter', 'SessionRegistry']) {
  assert.equal(typeof broysterVitest[name], 'function', name + ' class must be exported')
}

// Outside the orchestrator the config helper must fail with a guided error.
delete process.env.BROYSTER_CHILD_CONTEXT
assert.throws(
  () => broysterVitest.createBrowserStackConfig({ projectName: 'ContractTest' }),
  /BROYSTER_CHILD_CONTEXT/,
  'createBrowserStackConfig must explain how to run under the orchestrator',
)
"

echo "Checking the broyster bin..."
npx --no-install broyster --help >/dev/null
expected_version="$(node -p "require('./node_modules/@fpjs-incubator/broyster/package.json').version")"
test "$(npx --no-install broyster --version)" = "$expected_version"
npx --no-install broyster browsers | grep -q 'Windows11_ChromeLatest'

echo "Checking NodeNext type declarations..."
cat > consumer.ts <<'TS'
import {
  browserStackLocalTransport,
  browserstackBrowsers,
  defineBroysterConfig,
  runBrowserStackTests,
  type BrowserDef,
  type RunOptions,
  type RunSummary,
  type Transport,
} from '@fpjs-incubator/broyster'
import {
  browserstack,
  createBrowserStackConfig,
  type BrowserStackConfigOptions,
} from '@fpjs-incubator/broyster/vitest'

const browser = browserstackBrowsers.Windows11_ChromeLatest satisfies BrowserDef
const transport: Transport = browserStackLocalTransport()
const config = { projectName: 'ContractTest' } satisfies BrowserStackConfigOptions
const options = defineBroysterConfig({
  configPath: 'vitest.browserstack.config.ts',
  transport,
  browsers: ['Windows11_ChromeLatest'],
} satisfies RunOptions)

declare const summary: RunSummary
void [browser, browserstack, config, createBrowserStackConfig, options, runBrowserStackTests, summary]
TS
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "skipLibCheck": false,
    "strict": true,
    "target": "ES2022",
    "types": ["node"],
    "verbatimModuleSyntax": true
  },
  "include": ["consumer.ts"]
}
JSON
npx --no-install tsc -p tsconfig.json

echo "Packaged consumer contract test passed."
