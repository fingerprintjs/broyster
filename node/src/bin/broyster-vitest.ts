#!/usr/bin/env node
/* eslint-disable no-console */
import { runBroysterVitest } from '../vitest/runner'

const args = process.argv.slice(2)

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}

const rawConcurrency = getArg('concurrency')
const concurrency = rawConcurrency ? Number(rawConcurrency) : undefined
const filter = getArg('filter')
const browserList = getArg('browsers')?.split(',')
const buildName = getArg('build')
const configPath = getArg('config')
const debug = args.includes('--debug')

runBroysterVitest({
  concurrency,
  filter,
  browsers: browserList,
  configPath,
  buildName,
  debug,
})
  .then((results) => {
    const failed = results.filter((r) => r.status === 'FAIL')
    process.exit(failed.length > 0 ? 1 : 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exit(1)
  })
