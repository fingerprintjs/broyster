#!/usr/bin/env node
/* eslint-disable no-console */
import { parseArgs } from 'node:util'

import { browserstackBrowsers } from './browsers.js'
import { formatSummary } from './orchestrator/results.js'
import { runBrowserStackTests } from './orchestrator/run.js'
import { browserStackLocalTransport } from './transports/browserstack_local.js'
import { cloudflareTransportFromEnv } from './transports/cloudflare.js'
import type { Transport } from './transports/transport.js'

const helpText = `broyster — run Vitest browser-mode tests on BrowserStack

Usage:
  broyster run --config <vitest config> [options]
  broyster browsers

Commands:
  run          Run the configured browsers on BrowserStack
  browsers     List the default browser catalog keys

Options for "run":
  --config <path>          Vitest config that calls createBrowserStackConfig (required)
  --transport <name>       "browserstack-local" (default) or "cloudflare"
  --browsers <k1,k2,...>   Catalog keys to run (default: all)
  --filter <regex>         Case-insensitive regex over catalog keys
  --concurrency <n>        Max browsers running at once (default: 5)
  --build <name>           BrowserStack build name
  --no-retry               Disable the automatic retry of failed files
  --debug                  Verbose provider logging (DEBUG=vitest:broyster)
  --help                   Show this message

Environment:
  BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY   BrowserStack credentials (always required)
  CLOUDFLARE_TUNNEL_TOKEN                           Cloudflare transport: tunnel token
  BROYSTER_CLOUDFLARE_HTTPS_HOSTS / _PORTS          Cloudflare transport: CSV slot hostnames/ports
  BROYSTER_CLOUDFLARE_HTTP_HOSTS / _PORTS           Cloudflare transport: CSV slot hostnames/ports

For custom browser catalogs or transports, call runBrowserStackTests() from
@fpjs-incubator/broyster in your own script instead of using this CLI.
`

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      transport: { type: 'string', default: 'browserstack-local' },
      browsers: { type: 'string' },
      filter: { type: 'string' },
      concurrency: { type: 'string' },
      build: { type: 'string' },
      'no-retry': { type: 'boolean', default: false },
      debug: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  const command = positionals[0]

  if (values.help || command === undefined || command === 'help') {
    console.log(helpText)
    process.exit(command === undefined && !values.help ? 1 : 0)
  }

  if (command === 'browsers') {
    for (const [key, def] of Object.entries(browserstackBrowsers)) {
      const version = def.browserVersion ? ` ${def.browserVersion}` : ''
      const device = def.deviceName ? ` (${def.deviceName})` : ''
      const protocol = def.useHttps ? 'https' : 'http'
      console.log(`${key}: ${def.browserName}${version} on ${def.platform} ${def.osVersion}${device} [${protocol}]`)
    }
    return
  }

  if (command !== 'run') {
    console.error(`Unknown command "${command}". Run "broyster --help" for usage.`)
    process.exit(1)
  }

  if (!values.config) {
    console.error('The --config option is required. Run "broyster --help" for usage.')
    process.exit(1)
  }

  let concurrency: number | undefined
  if (values.concurrency !== undefined) {
    concurrency = Number(values.concurrency)
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      console.error(`Invalid concurrency "${values.concurrency}". Expected a positive integer.`)
      process.exit(1)
    }
  }

  const summary = await runBrowserStackTests({
    configPath: values.config,
    transport: createTransport(values.transport as string),
    browsers: values.browsers
      ?.split(',')
      .map((key) => key.trim())
      .filter(Boolean),
    filter: values.filter,
    concurrency,
    buildName: values.build,
    retryFailed: !values['no-retry'],
    debug: values.debug,
  })

  console.log(formatSummary(summary))
  process.exit(summary.ok ? 0 : 1)
}

function createTransport(name: string): Transport {
  switch (name) {
    case 'browserstack-local':
      return browserStackLocalTransport()
    case 'cloudflare':
      return cloudflareTransportFromEnv()
    default:
      console.error(`Unknown transport "${name}". Supported: browserstack-local, cloudflare.`)
      process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
