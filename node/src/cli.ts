import { runBrowserStackSuiteCli } from './runner/run_suite'

runBrowserStackSuiteCli().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
