import { dirname, isAbsolute, resolve } from 'node:path'

import { findBrowserStackCredentialCapabilityPaths } from './capabilities.js'
import type {
  BrowserDefinition,
  BrowserDefinitions,
  BrowserStackCapabilities,
  BroysterConfig,
  NormalizedBroysterConfig,
} from './types.js'

export const DEFAULT_CONCURRENCY = 5
export const DEFAULT_MAX_RETRIES = 1 as const
export const DEFAULT_QUEUE_POLL_INTERVAL_MS = 10_000
export const DEFAULT_QUEUE_TIMEOUT_MS = 600_000
export const DEFAULT_BROWSER_TIMEOUT_MS = 600_000
export const DEFAULT_PROVIDER_CONNECT_TIMEOUT_MS = 120_000
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 18_000
export const DEFAULT_RESULTS_FILE = 'browserstack-results.json'
export const DEFAULT_BROWSERSTACK_HUB_URL = 'https://hub-cloud.browserstack.com/wd/hub'
export const DEFAULT_BROWSERSTACK_API_BASE_URL = 'https://api.browserstack.com/automate'

export interface NormalizeBroysterConfigOptions {
  readonly cwd?: string
  readonly configFilePath?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly now?: () => number
}

export class BroysterConfigError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid Broyster configuration:\n- ${issues.join('\n- ')}`)
    this.name = 'BroysterConfigError'
    this.issues = [...issues]
  }
}

/** Preserves type inference for authored configuration files. */
export function defineBroysterConfig<const T extends BroysterConfig>(config: T): T {
  return config
}

export function validateBroysterConfig(config: unknown): asserts config is BroysterConfig {
  const issues: string[] = []

  if (!isObject(config)) {
    throw new BroysterConfigError(['configuration must be an object'])
  }

  validateNonEmptyString(config.projectName, 'projectName', issues)
  validateNonEmptyString(config.vitestConfig, 'vitestConfig', issues)
  validateBrowsers(config.browsers, issues)

  if (!isObject(config.transport) || typeof config.transport.start !== 'function') {
    issues.push('transport must implement start(signal)')
  }

  validatePositiveInteger(config.concurrency, 'concurrency', issues)
  validateRetryCount(config.maxRetries, issues)
  validatePositiveInteger(config.queuePollIntervalMs, 'queuePollIntervalMs', issues)
  validatePositiveInteger(config.queueTimeoutMs, 'queueTimeoutMs', issues)
  validatePositiveInteger(config.browserTimeoutMs, 'browserTimeoutMs', issues)
  validatePositiveInteger(config.providerConnectTimeoutMs, 'providerConnectTimeoutMs', issues)
  validatePositiveInteger(config.heartbeatIntervalMs, 'heartbeatIntervalMs', issues)
  validateOptionalNonEmptyString(config.buildName, 'buildName', issues)
  validateOptionalNonEmptyString(config.resultsFile, 'resultsFile', issues)
  validateOptionalNonEmptyString(config.vitestExecutable, 'vitestExecutable', issues)

  if (config.failOnFlaky !== undefined && typeof config.failOnFlaky !== 'boolean') {
    issues.push('failOnFlaky must be a boolean')
  }

  if (config.browserStack !== undefined) {
    if (!isObject(config.browserStack)) {
      issues.push('browserStack must be an object')
    } else {
      validateOptionalUrl(config.browserStack.hubUrl, 'browserStack.hubUrl', issues)
      validateOptionalUrl(config.browserStack.apiBaseUrl, 'browserStack.apiBaseUrl', issues)
      validateCapabilities(config.browserStack.capabilities, 'browserStack.capabilities', issues)
    }
  }

  if (issues.length > 0) {
    throw new BroysterConfigError(issues)
  }
}

export function normalizeBroysterConfig(
  config: unknown,
  options: NormalizeBroysterConfigOptions = {},
): NormalizedBroysterConfig {
  validateBroysterConfig(config)

  const cwd = resolve(options.cwd ?? process.cwd())
  const configFilePath = options.configFilePath ? resolve(cwd, options.configFilePath) : undefined
  const baseDir = configFilePath ? dirname(configFilePath) : cwd
  const env = options.env ?? process.env
  const now = options.now ?? Date.now
  const githubRunId = nonEmptyStringOrUndefined(env.GITHUB_RUN_ID)

  return {
    baseDir,
    projectName: config.projectName.trim(),
    vitestConfig: resolve(baseDir, config.vitestConfig.trim()),
    browsers: cloneBrowsers(config.browsers),
    transport: config.transport,
    concurrency: config.concurrency ?? DEFAULT_CONCURRENCY,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    queuePollIntervalMs: config.queuePollIntervalMs ?? DEFAULT_QUEUE_POLL_INTERVAL_MS,
    queueTimeoutMs: config.queueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS,
    browserTimeoutMs: config.browserTimeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS,
    providerConnectTimeoutMs: config.providerConnectTimeoutMs ?? DEFAULT_PROVIDER_CONNECT_TIMEOUT_MS,
    heartbeatIntervalMs: config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    buildName: config.buildName?.trim() ?? `broyster-${githubRunId ?? now()}`,
    resultsFile: resolve(baseDir, config.resultsFile?.trim() ?? DEFAULT_RESULTS_FILE),
    failOnFlaky: config.failOnFlaky ?? false,
    ...(config.vitestExecutable && {
      vitestExecutable: isAbsolute(config.vitestExecutable.trim())
        ? config.vitestExecutable.trim()
        : resolve(baseDir, config.vitestExecutable.trim()),
    }),
    browserStack: {
      hubUrl: config.browserStack?.hubUrl?.trim() ?? DEFAULT_BROWSERSTACK_HUB_URL,
      apiBaseUrl: config.browserStack?.apiBaseUrl?.trim() ?? DEFAULT_BROWSERSTACK_API_BASE_URL,
      capabilities: cloneCapabilities(config.browserStack?.capabilities ?? {}),
    },
  }
}

function validateBrowsers(value: unknown, issues: string[]): void {
  if (!isObject(value)) {
    issues.push('browsers must be an object keyed by browser id')
    return
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    issues.push('browsers must contain at least one browser')
    return
  }

  for (const [id, browser] of entries) {
    const path = `browsers.${id || '<empty>'}`
    if (id.trim().length === 0) {
      issues.push('browser ids must not be empty')
    }
    if (!isObject(browser)) {
      issues.push(`${path} must be an object`)
      continue
    }

    validateNonEmptyString(browser.browser, `${path}.browser`, issues)
    validateOptionalNonEmptyString(browser.name, `${path}.name`, issues)
    if (browser.protocol !== 'http' && browser.protocol !== 'https') {
      issues.push(`${path}.protocol must be "http" or "https"`)
    }
    validateCapabilities(browser.capabilities, `${path}.capabilities`, issues)
  }
}

function validateCapabilities(value: unknown, path: string, issues: string[]): void {
  if (value === undefined) {
    return
  }
  if (!isObject(value)) {
    issues.push(`${path} must be an object`)
    return
  }

  const bstackOptions = value['bstack:options']
  if (bstackOptions !== undefined && !isObject(bstackOptions)) {
    issues.push(`${path}["bstack:options"] must be an object`)
  }

  const credentialPaths = findBrowserStackCredentialCapabilityPaths(value)
  if (credentialPaths.length > 0) {
    issues.push(`${path} must not contain BrowserStack credentials (${credentialPaths.join(', ')})`)
  }
}

function validatePositiveInteger(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined && (!Number.isInteger(value) || (value as number) < 1)) {
    issues.push(`${path} must be a positive integer`)
  }
}

function validateRetryCount(value: unknown, issues: string[]): void {
  if (value !== undefined && value !== 0 && value !== 1) {
    issues.push('maxRetries must be 0 or 1')
  }
}

function validateNonEmptyString(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`)
  }
}

function validateOptionalNonEmptyString(value: unknown, path: string, issues: string[]): void {
  if (value !== undefined) {
    validateNonEmptyString(value, path, issues)
  }
}

function validateOptionalUrl(value: unknown, path: string, issues: string[]): void {
  if (value === undefined) {
    return
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty HTTP(S) URL`)
    return
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      issues.push(`${path} must use HTTP or HTTPS`)
    }
    if (url.username || url.password) {
      issues.push(`${path} must not contain credentials`)
    }
    if (url.hash) {
      issues.push(`${path} must not contain a URL fragment`)
    }
    if (url.search) {
      issues.push(`${path} must not contain query parameters`)
    }
  } catch {
    issues.push(`${path} must be a valid URL`)
  }
}

function cloneBrowsers(browsers: BrowserDefinitions): BrowserDefinitions {
  return Object.fromEntries(
    Object.entries(browsers).map(([id, browser]): [string, BrowserDefinition] => [
      id,
      {
        browser: browser.browser.trim(),
        protocol: browser.protocol,
        ...(browser.name !== undefined && { name: browser.name.trim() }),
        ...(browser.capabilities !== undefined && { capabilities: cloneCapabilities(browser.capabilities) }),
      },
    ]),
  )
}

function cloneCapabilities(capabilities: BrowserStackCapabilities): BrowserStackCapabilities {
  const bstackOptions = capabilities['bstack:options']
  return {
    ...capabilities,
    ...(bstackOptions !== undefined && { 'bstack:options': { ...bstackOptions } }),
  }
}

function nonEmptyStringOrUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
