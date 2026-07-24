// Vitest-side entry: import from '@fpjs-incubator/broyster/vitest' inside
// Vitest configs. Requires the vitest and @vitest/browser peer dependencies.

export { createBrowserStackConfig, type BrowserStackConfigOptions } from './config.js'
export { browserstack, BrowserStackProvider, type BrowserStackProviderOptions } from './provider.js'
export { BrowserStackReporter, type BrowserStackReporterOptions } from './reporters/browserstack_reporter.js'
export { FailedFilesReporter } from './reporters/failed_files_reporter.js'
export { FailureSummaryReporter } from './reporters/failure_summary_reporter.js'
export { contentSecurityPolicy, defaultBrowserTestServerHeaders } from './server_headers.js'
export { SessionRegistry } from '../session_registry.js'
export type { BrowserDef } from '../browsers.js'
export type { BrowserStackCapabilities } from '../capabilities.js'
