#!/usr/bin/env node
// Checked-in wrapper for the "broyster" binary. package.json points bin here
// instead of at dist/cli.js so package managers can link the binary during a
// clean workspace install, before the build has produced dist/.
import { existsSync } from 'node:fs'

const cli = new URL('../dist/cli.js', import.meta.url)

if (!existsSync(cli)) {
  // eslint-disable-next-line no-console
  console.error(
    'broyster: the compiled CLI was not found. Build @fpjs-incubator/broyster first (pnpm --dir node build).',
  )
  process.exit(1)
}

await import(cli.href)
