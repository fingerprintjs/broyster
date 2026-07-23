import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export const BROYSTER_RUN_CONTEXT_ENV = 'BROYSTER_RUN_CONTEXT'

export type BrowserStackRunContext = {
  schemaVersion: 1
  run: {
    id: string
    projectName: string
    buildName: string
  }
  browser: {
    id: string
    name: string
    browser: string
    capabilities: Record<string, unknown>
  }
  slot: {
    publicUrl: string
    localPort: number
    protocol: 'http' | 'https'
  }
  browserStack: {
    hubUrl: string
    apiBaseUrl: string
  }
  apiPort: number
  providerConnectTimeoutMs: number
  attempt: {
    number: number
    kind: 'initial' | 'retry'
  }
  resultFile: string
  readinessFile: string
  sessionFile: string
  heartbeatIntervalMs?: number
}

export function loadBrowserStackRunContext(env: NodeJS.ProcessEnv = process.env): BrowserStackRunContext {
  const contextPath = env[BROYSTER_RUN_CONTEXT_ENV]
  if (!contextPath) {
    throw new Error(
      `[broyster] ${BROYSTER_RUN_CONTEXT_ENV} is required. Run this configuration through the Broyster CLI.`,
    )
  }

  return readBrowserStackRunContext(contextPath)
}

export function readBrowserStackRunContext(contextPath: string): BrowserStackRunContext {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(contextPath, 'utf8'))
  } catch (error) {
    throw new Error(`[broyster] Failed to read run context at "${contextPath}": ${getErrorMessage(error)}`)
  }

  return parseBrowserStackRunContext(value)
}

export function parseBrowserStackRunContext(value: unknown): BrowserStackRunContext {
  const context = requireRecord(value, 'run context')
  if (context.schemaVersion !== 1) {
    throw new Error(`[broyster] Unsupported run context schema version "${String(context.schemaVersion)}".`)
  }

  const run = requireRecord(context.run, 'run context.run')
  const browser = requireRecord(context.browser, 'run context.browser')
  const slot = requireRecord(context.slot, 'run context.slot')
  const browserStack = requireRecord(context.browserStack, 'run context.browserStack')
  const attempt = requireRecord(context.attempt, 'run context.attempt')
  const capabilities = requireRecord(browser.capabilities, 'run context.browser.capabilities')
  rejectCredentialCapabilities(capabilities)

  const publicUrl = requireHttpUrl(slot.publicUrl, 'run context.slot.publicUrl')
  const protocol = requireProtocol(slot.protocol, 'run context.slot.protocol')
  if (publicUrl.protocol !== `${protocol}:`) {
    throw new Error(`[broyster] run context.slot.protocol must match the protocol of run context.slot.publicUrl.`)
  }

  const resultFile = requireAbsolutePath(context.resultFile, 'run context.resultFile')
  const readinessFile = requireAbsolutePath(context.readinessFile, 'run context.readinessFile')
  const sessionFile = requireAbsolutePath(context.sessionFile, 'run context.sessionFile')
  const heartbeatIntervalMs = optionalPositiveInteger(context.heartbeatIntervalMs, 'run context.heartbeatIntervalMs')
  const localPort = requirePort(slot.localPort, 'run context.slot.localPort')
  const apiPort = requirePort(context.apiPort, 'run context.apiPort')
  if (localPort !== apiPort) {
    throw new Error('[broyster] run context.slot.localPort must match run context.apiPort.')
  }

  return {
    schemaVersion: 1,
    run: {
      id: requireNonEmptyString(run.id, 'run context.run.id'),
      projectName: requireNonEmptyString(run.projectName, 'run context.run.projectName'),
      buildName: requireNonEmptyString(run.buildName, 'run context.run.buildName'),
    },
    browser: {
      id: requireNonEmptyString(browser.id, 'run context.browser.id'),
      name: requireNonEmptyString(browser.name, 'run context.browser.name'),
      browser: requireNonEmptyString(browser.browser, 'run context.browser.browser'),
      capabilities,
    },
    slot: {
      publicUrl: publicUrl.toString(),
      localPort,
      protocol,
    },
    browserStack: {
      hubUrl: requireHttpUrl(browserStack.hubUrl, 'run context.browserStack.hubUrl').toString(),
      apiBaseUrl: requireHttpUrl(browserStack.apiBaseUrl, 'run context.browserStack.apiBaseUrl').toString(),
    },
    apiPort,
    providerConnectTimeoutMs: requirePositiveInteger(
      context.providerConnectTimeoutMs,
      'run context.providerConnectTimeoutMs',
    ),
    attempt: {
      number: requirePositiveInteger(attempt.number, 'run context.attempt.number'),
      kind: requireAttemptKind(attempt.kind, 'run context.attempt.kind'),
    },
    resultFile,
    readinessFile,
    sessionFile,
    ...(heartbeatIntervalMs === undefined ? {} : { heartbeatIntervalMs }),
  }
}

function rejectCredentialCapabilities(capabilities: Record<string, unknown>): void {
  const protectedTopLevelKeys = ['browserstack.user', 'browserstack.key']
  if (protectedTopLevelKeys.some((key) => capabilities[key] !== undefined)) {
    throw new Error('[broyster] BrowserStack credentials must not be stored in run context capabilities.')
  }

  const bstackOptions = capabilities['bstack:options']
  if (bstackOptions === undefined) {
    return
  }
  const options = requireRecord(bstackOptions, 'run context.browser.capabilities.bstack:options')
  const protectedOptionKeys = ['userName', 'username', 'accessKey']
  if (protectedOptionKeys.some((key) => options[key] !== undefined)) {
    throw new Error('[broyster] BrowserStack credentials must not be stored in run context capabilities.')
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[broyster] ${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[broyster] ${label} must be a non-empty string.`)
  }
  return value
}

function requireHttpUrl(value: unknown, label: string): URL {
  const rawUrl = requireNonEmptyString(value, label)
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`[broyster] ${label} must be a valid absolute URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`[broyster] ${label} must use HTTP or HTTPS.`)
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`[broyster] ${label} must not include credentials, query parameters, or a fragment.`)
  }
  return url
}

function requireProtocol(value: unknown, label: string): 'http' | 'https' {
  if (value !== 'http' && value !== 'https') {
    throw new Error(`[broyster] ${label} must be "http" or "https".`)
  }
  return value
}

function requireAttemptKind(value: unknown, label: string): 'initial' | 'retry' {
  if (value !== 'initial' && value !== 'retry') {
    throw new Error(`[broyster] ${label} must be "initial" or "retry".`)
  }
  return value
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`[broyster] ${label} must be a positive integer.`)
  }
  return value
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : requirePositiveInteger(value, label)
}

function requirePort(value: unknown, label: string): number {
  const port = requirePositiveInteger(value, label)
  if (port > 65_535) {
    throw new Error(`[broyster] ${label} must be at most 65535.`)
  }
  return port
}

function requireAbsolutePath(value: unknown, label: string): string {
  const path = requireNonEmptyString(value, label)
  if (!isAbsolute(path)) {
    throw new Error(`[broyster] ${label} must be an absolute path.`)
  }
  return path
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
