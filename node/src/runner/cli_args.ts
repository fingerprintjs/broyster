import { parseArgs } from 'node:util'

export type CliRunOptions = {
  configPath?: string
  browserIds?: string[]
  browserFilter?: RegExp
  fileFilters?: string[]
  testNamePattern?: string
  concurrency?: number
  buildName?: string
  resultsFile?: string
  debug: boolean
  failOnFlaky: boolean
}

export type CliArguments = { action: 'help' } | { action: 'version' } | { action: 'run'; options: CliRunOptions }

const options = {
  config: { type: 'string' },
  browsers: { type: 'string' },
  filter: { type: 'string' },
  files: { type: 'string' },
  test: { type: 'string' },
  concurrency: { type: 'string' },
  build: { type: 'string' },
  results: { type: 'string' },
  debug: { type: 'boolean', default: false },
  'fail-on-flaky': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
} as const

export function parseCliArguments(argv: string[]): CliArguments {
  const command = argv[0]
  const commandArguments = command === 'run' ? argv.slice(1) : argv
  const parsed = parseArgs({ args: commandArguments, options, strict: true, allowPositionals: false })

  if (parsed.values.help) {
    return { action: 'help' }
  }
  if (parsed.values.version) {
    return { action: 'version' }
  }
  if (command !== 'run') {
    throw new Error(`Expected the "run" command${command ? `, received "${command}"` : ''}.`)
  }
  if (parsed.values.browsers !== undefined && parsed.values.filter !== undefined) {
    throw new Error('--browsers and --filter cannot be used together.')
  }

  const concurrency = parsePositiveInteger(parsed.values.concurrency, '--concurrency')
  const browserIds = parseCsv(parsed.values.browsers, '--browsers')
  const fileFilters = parseCsv(parsed.values.files, '--files')
  const testNamePattern = nonEmptyValue(parsed.values.test, '--test')
  const buildName = nonEmptyValue(parsed.values.build, '--build')
  const resultsFile = nonEmptyValue(parsed.values.results, '--results')
  const configPath = nonEmptyValue(parsed.values.config, '--config')
  let browserFilter: RegExp | undefined

  if (parsed.values.filter !== undefined) {
    const pattern = nonEmptyValue(parsed.values.filter, '--filter')
    if (pattern === undefined) {
      throw new Error('--filter must not be empty.')
    }
    try {
      browserFilter = new RegExp(pattern, 'i')
    } catch (error) {
      throw new Error(`Invalid --filter regular expression: ${errorMessage(error)}`)
    }
  }

  return {
    action: 'run',
    options: {
      ...(configPath === undefined ? {} : { configPath }),
      ...(browserIds === undefined ? {} : { browserIds }),
      ...(browserFilter === undefined ? {} : { browserFilter }),
      ...(fileFilters === undefined ? {} : { fileFilters }),
      ...(testNamePattern === undefined ? {} : { testNamePattern }),
      ...(concurrency === undefined ? {} : { concurrency }),
      ...(buildName === undefined ? {} : { buildName }),
      ...(resultsFile === undefined ? {} : { resultsFile }),
      debug: parsed.values.debug,
      failOnFlaky: parsed.values['fail-on-flaky'],
    },
  }
}

function parseCsv(value: string | undefined, flag: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  const values = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (values.length === 0) {
    throw new Error(`${flag} must contain at least one value.`)
  }
  return [...new Set(values)]
}

function parsePositiveInteger(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`)
  }
  return parsed
}

function nonEmptyValue(value: string | undefined, flag: string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value.trim() === '') {
    throw new Error(`${flag} must not be empty.`)
  }
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const cliHelp = `Usage: broyster run [options]

Run a configured Vitest browser suite on BrowserStack.

Options:
  --config <path>         Broyster config (default: broyster.config.*)
  --browsers <ids>       Comma-separated browser IDs
  --filter <regex>        Select browser IDs with a case-insensitive regex
  --files <filters>       Comma-separated Vitest file filters
  --test <pattern>        Vitest test-name pattern
  --concurrency <number>  Maximum parallel browser processes
  --build <name>          BrowserStack build name
  --results <path>        Aggregate JSON result path
  --debug                 Enable Broyster and provider debug output
  --fail-on-flaky         Exit 1 when a retry passes
  -h, --help              Show help
  -v, --version           Show version
`
