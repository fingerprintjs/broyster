import type { BrowserStackCapabilities } from './capabilities.js'

/**
 * The contract between the orchestrator (parent process) and a Vitest child
 * process. Serialized as one JSON environment variable instead of many
 * stringly-typed ones.
 */
export type ChildRunContext = {
  /** Key of the browser in the catalog this child process is responsible for */
  browserKey: string
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
  return { [CHILD_CONTEXT_ENV]: JSON.stringify(context) }
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
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: expected an object.`)
  }

  const context = value as Record<string, unknown>
  assertString(context, 'browserKey')
  assertString(context, 'buildName')
  assertString(context, 'publicOrigin')
  assertType(context, 'useHttps', 'boolean')
  assertType(context, 'queueManagedExternally', 'boolean')
  assertOptionalString(context, 'readyFile')
  assertOptionalString(context, 'failedFilesOut')

  if (!Number.isInteger(context.apiPort) || (context.apiPort as number) < 1) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "apiPort" must be a positive integer.`)
  }
  if (context.attempt !== 'initial' && context.attempt !== 'retry') {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "attempt" must be "initial" or "retry".`)
  }
  if (
    context.capabilities !== undefined &&
    (typeof context.capabilities !== 'object' || context.capabilities === null)
  ) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "capabilities" must be an object when present.`)
  }

  try {
    new URL(context.publicOrigin as string)
  } catch {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "publicOrigin" must be a valid URL.`)
  }

  return context as ChildRunContext
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

function assertType(context: Record<string, unknown>, key: string, type: 'boolean' | 'number'): void {
  if (typeof context[key] !== type) {
    throw new Error(`Malformed ${CHILD_CONTEXT_ENV}: "${key}" must be a ${type}.`)
  }
}
