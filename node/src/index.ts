// Root entry: everything needed to orchestrate BrowserStack runs.
// Importable without vitest installed; the Vitest-side helpers (provider,
// reporters, createBrowserStackConfig) live in '@fpjs-incubator/broyster/vitest'.

export { browserstackBrowsers, platformToOs, type BrowserDef } from './browsers.js'
export { getBrowserStackCredentials, type BrowserStackCredentials } from './credentials.js'
export { BrowserStackApiClient, type AutomatePlan, type SessionStatus } from './api_client.js'
export { BrowserStackQueue, type QueueWaitOptions } from './queue.js'
export { buildCapabilities, type BrowserStackCapabilities } from './capabilities.js'
export {
  CHILD_CONTEXT_ENV,
  CHILD_CONTEXT_SCHEMA_VERSION,
  readChildContext,
  serializeChildContext,
  type ChildRunContext,
} from './env_contract.js'
export { defineBroysterConfig, runBrowserStackTests, type BroysterConfig, type RunOptions } from './orchestrator/run.js'
export {
  BROYSTER_RESULTS_SCHEMA_VERSION,
  createRunSummary,
  formatRunResult,
  formatSummary,
  mergeAttemptModules,
  normalizeRunResult,
  writeRunSummary,
  type RetryScope,
  type RunAttemptName,
  type RunAttemptResult,
  type RunResult,
  type RunStatus,
  type RunSummary,
  type SerializedError,
  type TestCaseResult,
  type TestModuleResult,
} from './orchestrator/results.js'
export type { SlotRequirement, Transport, TransportSlot } from './transports/transport.js'
export {
  cloudflareTransport,
  cloudflareTransportFromEnv,
  type CloudflaredProcess,
  type CloudflareSlotConfig,
  type CloudflareTransportDependencies,
  type CloudflareTransportOptions,
  type CloudflareTransportTimers,
} from './transports/cloudflare.js'
export { browserStackLocalTransport, type BrowserStackLocalTransportOptions } from './transports/browserstack_local.js'
