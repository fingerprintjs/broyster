// Root entry: everything needed to orchestrate BrowserStack runs.
// Importable without vitest installed; the Vitest-side helpers (provider,
// reporters, createBrowserStackConfig) live in '@fpjs-incubator/broyster/vitest'.

export { browserstackBrowsers, platformToOs, type BrowserDef } from './browsers.js'
export { getBrowserStackCredentials, type BrowserStackCredentials } from './credentials.js'
export { BrowserStackApiClient, type AutomatePlan, type SessionStatus } from './api_client.js'
export { BrowserStackQueue, type QueueWaitOptions } from './queue.js'
export { buildCapabilities, type BrowserStackCapabilities } from './capabilities.js'
export { CHILD_CONTEXT_ENV, readChildContext, serializeChildContext, type ChildRunContext } from './env_contract.js'
export { runBrowserStackTests, type RunOptions } from './orchestrator/run.js'
export {
  formatRunResult,
  formatSummary,
  type RetryScope,
  type RunAttemptName,
  type RunAttemptResult,
  type RunResult,
  type RunStatus,
  type RunSummary,
} from './orchestrator/results.js'
export type { SlotRequirement, Transport, TransportSlot } from './transports/transport.js'
export {
  cloudflareTransport,
  cloudflareTransportFromEnv,
  type CloudflareSlotConfig,
  type CloudflareTransportOptions,
} from './transports/cloudflare.js'
export { browserStackLocalTransport, type BrowserStackLocalTransportOptions } from './transports/browserstack_local.js'
