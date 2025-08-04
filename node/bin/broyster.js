#!/usr/bin/env node

import { createRequire } from 'node:module'

const req = createRequire(process.cwd() + '/package.json')

function tryRegister(id) {
  try {
    req.resolve(id)
    req(id)
    return true
  } catch {
    return false
  }
}

;(async () => {
  try {
    // Prefer tsx; then ts-node
    const registered =
      tryRegister('tsx/register') || tryRegister('ts-node/register') || tryRegister('ts-node/register/transpile-only')

    if (!registered) {
      console.warn('[broyster] No TS runtime found. Install "tsx" or "ts-node" in your project.')
    }

    const { run } = await import('@wdio/cli')
    await run()
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()
