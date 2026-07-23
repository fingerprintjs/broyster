#!/usr/bin/env node

import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { loadBroysterConfig } from './runner/config_loader.js'
import { cliHelp, parseCliArguments } from './runner/cli_args.js'
import { runBrowserStack } from './runner/run.js'
import { BroysterRunError } from './runner/types.js'

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  let arguments_: ReturnType<typeof parseCliArguments>
  try {
    arguments_ = parseCliArguments(argv)
  } catch (error) {
    logError(errorMessage(error))
    logError('Run "broyster --help" for usage.')
    return 2
  }

  if (arguments_.action === 'help') {
    log(cliHelp)
    return 0
  }
  if (arguments_.action === 'version') {
    log(await readVersion())
    return 0
  }

  const controller = new AbortController()
  let receivedSignal: 'SIGINT' | 'SIGTERM' | undefined
  const onSigint = () => {
    receivedSignal = 'SIGINT'
    controller.abort(new Error('Received SIGINT.'))
  }
  const onSigterm = () => {
    receivedSignal = 'SIGTERM'
    controller.abort(new Error('Received SIGTERM.'))
  }
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  try {
    const loaded = await loadBroysterConfig(arguments_.options.configPath)
    const result = await runBrowserStack(loaded.config, {
      ...arguments_.options,
      configFilePath: loaded.configPath,
      signal: controller.signal,
    })
    if (receivedSignal === 'SIGINT') {
      return 130
    }
    if (receivedSignal === 'SIGTERM') {
      return 143
    }
    if (result.run.status === 'failed' || result.run.status === 'cancelled') {
      return 1
    }
    const failOnFlaky = arguments_.options.failOnFlaky || loaded.config.failOnFlaky === true
    return result.run.status === 'flaky' && failOnFlaky ? 1 : 0
  } catch (error) {
    logError(errorMessage(error))
    if (receivedSignal === 'SIGINT') {
      return 130
    }
    if (receivedSignal === 'SIGTERM') {
      return 143
    }
    return error instanceof BroysterRunError && error.code === 'INTERRUPTED' ? 1 : 2
  } finally {
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
  }
}

async function readVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: unknown
  }
  if (typeof packageJson.version !== 'string') {
    throw new Error('Unable to read the Broyster package version.')
  }
  return packageJson.version
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message)
}

function logError(message: string): void {
  // eslint-disable-next-line no-console
  console.error(message)
}

if (process.argv[1] && isMainModule(process.argv[1])) {
  process.exitCode = await runCli()
}

function isMainModule(argumentPath: string): boolean {
  try {
    return realpathSync(argumentPath) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
