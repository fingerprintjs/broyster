import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tsImport } from 'tsx/esm/api'

import type { BroysterConfig } from '../core/types.js'

const defaultConfigNames = ['broyster.config.ts', 'broyster.config.mts', 'broyster.config.js', 'broyster.config.mjs']

export type LoadedConfig = {
  config: BroysterConfig
  configPath: string
  baseDir: string
}

export async function loadBroysterConfig(configPath: string | undefined, cwd = process.cwd()): Promise<LoadedConfig> {
  const resolvedPath = configPath ? resolve(cwd, configPath) : await discoverConfig(cwd)
  const module = (await tsImport(pathToFileURL(resolvedPath).href, import.meta.url)) as {
    default?: unknown
  }
  if (!isObject(module.default)) {
    throw new Error(`Broyster config ${resolvedPath} must have a default object export.`)
  }

  return {
    config: module.default as unknown as BroysterConfig,
    configPath: resolvedPath,
    baseDir: dirname(resolvedPath),
  }
}

async function discoverConfig(cwd: string): Promise<string> {
  for (const name of defaultConfigNames) {
    const candidate = resolve(cwd, name)
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue looking for the next supported extension.
    }
  }
  throw new Error(`No Broyster config found in ${cwd}. Expected one of: ${defaultConfigNames.join(', ')}.`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
