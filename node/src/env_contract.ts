import { isAbsolute } from 'node:path'

import type { BrowserDef } from './browsers.js'
import type { BrowserStackCapabilities } from './capabilities.js'
import { hasCredentialOptions, hasLegacyCredentialCapabilities } from './capabilities.js'
import { isPort, isRecord } from './internal/validation.js'

export const CHILD_CONTEXT_SCHEMA_VERSION = 1 as const

/**
 * The contract between the orchestrator (parent process) and a Vitest child
 * process. Serialized as one JSON environment variable instead of many
 * stringly-typed ones.
 */
export type ChildRunContext = {
  /** Reject incompatible parent/child package combinations explicitly. */
  schemaVersion: typeof CHILD_CONTEXT_SCHEMA_VERSION
  /** Key of the browser in the catalog this child process is responsible for */
  browserKey: string
  /** The selected definition is authoritative, avoiding a duplicated child-side catalog. */
  browser: BrowserDef
  /** BrowserStack build name shown in the Automate UI */
  buildName: string
  /** Public origin the remote browser navigates to, e.g. https://slot-1.example.com or https://bs-local.com:7201 */
  publicOrigin: string
  useHttps: boolean
  /** Port the Vitest browser server must bind on localhost */
  apiPort: number
  /** Marker file the orchestrator touches once the slot is routable; the provider waits for it */
  readyFile?: string
  /** Where FailedFilesReporter writes its JSON report */
  failedFilesOut?: string
  attempt: 'initial' | 'retry'
  /** The orchestrator already holds a queue slot, so the provider must not poll the plan API */
  queueManagedExternally: boolean
  /** Transport-provided capability overrides, e.g. { local: true, localIdentifier } */
  capabilities?: BrowserStackCapabilities
}

export const CHILD_CONTEXT_ENV = 'BROYSTER_CHILD_CONTEXT'

export function serializeChildContext(context: ChildRunContext): Record<string, string> {
  return { [CHILD_CONTEXT_ENV]: JSON.stringify(validateChildContext(context)) }
}

export function readChildContext(env: NodeJS.ProcessEnv = process.env): ChildRunContext | undefined {
  const raw = env[CHILD_CONTEXT_ENV]
  if (!raw) {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV} environment variable (invalid JSON): ${String(error)}`)
  }

  return validateChildContext(parsed)
}

function validateChildContext(value: unknown): ChildRunContext {
  if (!isRecord(value)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: expected an object.`)
  }

  const context = value
  if (context.schemaVersion !== CHILD_CONTEXT_SCHEMA_VERSION) {
    throw new Error(
      `Malformed ${CHILD_CONTEXT_ENV}: unsupported "schemaVersion" ${JSON.stringify(context.schemaVersion)}.`,
    )
  }
  assertString(context, 'browserKey')
  validateBrowser(context.browser)
  assertString(context, 'buildName')
  assertString(context, 'publicOrigin')
  assertType(context, 'useHttps', 'boolean')
  assertType(context, 'queueManagedExternally', 'boolean')
  assertOptionalAbsolutePath(context, 'readyFile')
  assertOptionalAbsolutePath(context, 'failedFilesOut')

  if (!isPort(context.apiPort)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "apiPort" must be an integer from 1 to 65535.`)
  }
  if (context.attempt !== 'initial' && context.attempt !== 'retry') {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "attempt" must be "initial" or "retry".`)
  }
  if (context.capabilities !== undefined && !isRecord(context.capabilities)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "capabilities" must be an object when present.`)
  }

  let publicOrigin: URL
  try {
    publicOrigin = new URL(context.publicOrigin as string)
  } catch {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "publicOrigin" must be a valid URL.`)
  }
  if (publicOrigin.protocol !== 'http:' && publicOrigin.protocol !== 'https:') {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "publicOrigin" must use HTTP or HTTPS.`)
  }
  if (publicOrigin.username || publicOrigin.password || publicOrigin.search || publicOrigin.hash) {
    throw new Error(
      `Malformed ${CHILD_CONTEXT_ENV}: "publicOrigin" must not contain credentials, query parameters, or a fragment.`,
    )
  }
  const expectedProtocol = context.useHttps ? 'https:' : 'http:'
  if (publicOrigin.protocol !== expectedProtocol) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "useHttps" must match the "publicOrigin" protocol.`)
  }

  if (context.capabilities) {
    rejectCredentialCapabilities(context.capabilities as Record<string, unknown>)
  }

  return context as ChildRunContext
}

function validateBrowser(value: unknown): asserts value is BrowserDef {
  if (!isRecord(value)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "browser" must be an object.`)
  }
  const browser = value
  for (const key of ['platform', 'osVersion', 'browserName']) {
    assertString(browser, key)
  }
  assertOptionalString(browser, 'browserVersion')
  assertOptionalString(browser, 'deviceName')
  assertType(browser, 'useHttps', 'boolean')
}

function rejectCredentialCapabilities(capabilities: Record<string, unknown>): void {
  if (hasLegacyCredentialCapabilities(capabilities)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: capabilities must not contain BrowserStack credentials.`)
  }

  const rawOptions = capabilities.bstackOptions
  if (rawOptions === undefined) {
    return
  }
  if (!isRecord(rawOptions)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: capabilities.bstackOptions must be an object.`)
  }
  const options = rawOptions
  if (hasCredentialOptions(options)) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: capabilities must not contain BrowserStack credentials.`)
  }
}

function assertString(context: Record<string, unknown>, key: string): void {
  if (typeof context[key] !== 'string' || context[key] === '') {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "${key}" must be a non-empty string.`)
  }
}

function assertOptionalString(context: Record<string, unknown>, key: string): void {
  if (context[key] !== undefined && typeof context[key] !== 'string') {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "${key}" must be a string when present.`)
  }
}

function assertOptionalAbsolutePath(context: Record<string, unknown>, key: string): void {
  assertOptionalString(context, key)
  const value = context[key]
  if (typeof value === 'string' && (!value || !isAbsolute(value))) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "${key}" must be an absolute path when present.`)
  }
}

function assertType(context: Record<string, unknown>, key: string, type: 'boolean' | 'number'): void {
  if (typeof context[key] !== type) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "${key}" must be a ${type}.`)
  }
}
