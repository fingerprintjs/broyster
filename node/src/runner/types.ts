export type BrowserStackRunOverrides = {
  /** Exact browser IDs to run. */
  browserIds?: readonly string[]
  /** Browser ID filter. Cannot be combined with browserIds. */
  browserFilter?: RegExp
  /** Vitest positional file filters. */
  fileFilters?: readonly string[]
  /** Vitest test-name pattern passed with -t. */
  testNamePattern?: string
  concurrency?: number
  buildName?: string
  resultsFile?: string
  failOnFlaky?: boolean
  debug?: boolean
  signal?: AbortSignal
  /** Config file used as the base for relative paths. Primarily used by the CLI loader. */
  configFilePath?: string
}

export class BroysterRunError extends Error {
  readonly code: 'CONFIGURATION' | 'SETUP' | 'INTERRUPTED'
  readonly cause: unknown
  readonly result: import('../core/results.js').BroysterResult | undefined

  constructor(
    code: BroysterRunError['code'],
    message: string,
    cause?: unknown,
    result?: import('../core/results.js').BroysterResult,
  ) {
    super(message)
    this.name = 'BroysterRunError'
    this.code = code
    this.cause = cause
    this.result = result
  }
}
