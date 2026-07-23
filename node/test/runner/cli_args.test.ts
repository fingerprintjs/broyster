import { describe, expect, it } from 'vitest'

import { parseCliArguments } from '../../src/runner/cli_args.js'

describe('parseCliArguments', () => {
  it('parses a run command and preserves orthogonal browser, file, and test filters', () => {
    const parsed = parseCliArguments([
      'run',
      '--config=./config/broyster.config.ts',
      '--filter=chrome|safari',
      '--files=src/a.test.ts, src/b.test.ts,src/a.test.ts',
      '--test',
      '^checkout › submits$',
      '--concurrency=3',
      '--build',
      'pull-request-42',
      '--results=artifacts/results.json',
      '--debug',
      '--fail-on-flaky',
    ])

    expect(parsed.action).toBe('run')
    if (parsed.action !== 'run') {
      throw new Error('Expected run arguments.')
    }

    expect(parsed.options).toMatchObject({
      configPath: './config/broyster.config.ts',
      fileFilters: ['src/a.test.ts', 'src/b.test.ts'],
      testNamePattern: '^checkout › submits$',
      concurrency: 3,
      buildName: 'pull-request-42',
      resultsFile: 'artifacts/results.json',
      debug: true,
      failOnFlaky: true,
    })
    expect(parsed.options.browserFilter).toBeInstanceOf(RegExp)
    expect(parsed.options.browserFilter?.source).toBe('chrome|safari')
    expect(parsed.options.browserFilter?.flags).toContain('i')
  })

  it('trims, removes empty CSV entries, and deduplicates explicit browser IDs', () => {
    const parsed = parseCliArguments(['run', '--browsers', ' chrome, safari ,, chrome '])

    expect(parsed).toEqual({
      action: 'run',
      options: {
        browserIds: ['chrome', 'safari'],
        debug: false,
        failOnFlaky: false,
      },
    })
  })

  it.each([
    {
      argv: ['run', '--browsers=chrome', '--filter=chrome'],
      message: '--browsers and --filter cannot be used together',
    },
    { argv: ['run', '--files=, ,'], message: '--files must contain at least one value' },
    { argv: ['run', '--browsers='], message: '--browsers must contain at least one value' },
    { argv: ['run', '--test=   '], message: '--test must not be empty' },
    { argv: ['run', '--filter=['], message: 'Invalid --filter regular expression' },
    { argv: ['run', '--concurrency=0'], message: '--concurrency must be a positive integer' },
    { argv: ['run', '--concurrency=1.5'], message: '--concurrency must be a positive integer' },
    { argv: ['run', '--unknown'], message: 'Unknown option' },
    { argv: [], message: 'Expected the "run" command' },
  ])('rejects invalid input: $argv', ({ argv, message }) => {
    expect(() => parseCliArguments(argv)).toThrow(message)
  })

  it.each([
    { argv: ['--help'], action: 'help' as const },
    { argv: ['run', '-h'], action: 'help' as const },
    { argv: ['--version'], action: 'version' as const },
    { argv: ['run', '-v'], action: 'version' as const },
  ])('supports top-level and run-scoped help/version: $argv', ({ argv, action }) => {
    expect(parseCliArguments(argv)).toEqual({ action })
  })
})
