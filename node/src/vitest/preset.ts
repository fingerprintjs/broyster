import type { UserConfigExport } from 'vitest/config'

export type VitestPresetOptions = {
  projectName: string
  includeFiles?: string[]
  environment?: 'node' | 'jsdom'
  retries?: number
  globals?: boolean
  setupFiles?: string[]
  watch?: boolean
}

export function vitestPreset(opts: VitestPresetOptions): UserConfigExport {
  return {
    test: {
      name: opts.projectName,
      include: opts.includeFiles ?? ['src/**/*.ts', 'tests/**/*.ts'],
      environment: opts.environment ?? 'jsdom',
      retry: opts.retries ?? 2,
      globals: opts.globals ?? true,
      setupFiles: opts.setupFiles ?? [],
      watch: opts.watch ?? false,
      reporters: ['default'],
    },
  }
}

export default vitestPreset
