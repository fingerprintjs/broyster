import type { BrowserStackCapabilities } from './types.js'

export const REDACTED_VALUE = '[REDACTED]'

export interface BrowserStackCapabilityMetadata {
  readonly projectName: string
  readonly buildName: string
  readonly sessionName: string
}

export interface BuildBrowserStackCapabilitiesOptions {
  readonly browser: string
  readonly metadata: BrowserStackCapabilityMetadata
  readonly defaults?: BrowserStackCapabilities
  readonly shared?: BrowserStackCapabilities
  readonly browserCapabilities?: BrowserStackCapabilities
}

/**
 * Merges capabilities shallowly, except for bstack:options which is merged one level deep.
 * Later sources win. Inputs are never mutated.
 */
export function mergeBrowserStackCapabilities(
  ...sources: readonly (BrowserStackCapabilities | undefined)[]
): BrowserStackCapabilities {
  const result: Record<string, unknown> = {}
  const bstackOptions: Record<string, unknown> = {}
  let hasBstackOptions = false

  for (const source of sources) {
    if (!source) {
      continue
    }
    for (const [key, value] of Object.entries(source)) {
      if (key === 'bstack:options') {
        if (isRecord(value)) {
          Object.assign(bstackOptions, value)
          hasBstackOptions = true
        }
      } else {
        result[key] = value
      }
    }
  }

  if (hasBstackOptions) {
    result['bstack:options'] = bstackOptions
  }
  return result
}

export function buildBrowserStackCapabilities(options: BuildBrowserStackCapabilitiesOptions): BrowserStackCapabilities {
  const defaults = mergeBrowserStackCapabilities(
    {
      browserName: options.browser.toLowerCase(),
      acceptInsecureCerts: true,
      acceptSslCerts: true,
      'browserstack.acceptInsecureCerts': true,
      'bstack:options': {
        local: false,
        idleTimeout: 300,
      },
    },
    options.defaults,
  )
  const merged = mergeBrowserStackCapabilities(defaults, options.shared, options.browserCapabilities)
  assertNoBrowserStackCredentialCapabilities(merged)
  const mergedBstackOptions = isRecord(merged['bstack:options']) ? merged['bstack:options'] : {}

  return {
    ...merged,
    'bstack:options': {
      ...mergedBstackOptions,
      projectName: options.metadata.projectName,
      buildName: options.metadata.buildName,
      sessionName: options.metadata.sessionName,
    },
  }
}

/** Rejects legacy or W3C credential keys before capabilities are written to child context. */
export function assertNoBrowserStackCredentialCapabilities(
  capabilities: BrowserStackCapabilities,
  label = 'capabilities',
): void {
  const paths = findBrowserStackCredentialCapabilityPaths(capabilities)
  if (paths.length > 0) {
    throw new Error(`${label} must not contain BrowserStack credentials (${paths.join(', ')}).`)
  }
}

export function findBrowserStackCredentialCapabilityPaths(
  capabilities: Readonly<Record<string, unknown>>,
): readonly string[] {
  const paths: string[] = []
  for (const key of ['browserstack.user', 'browserstack.key']) {
    if (capabilities[key] !== undefined) {
      paths.push(key)
    }
  }

  const bstackOptions = capabilities['bstack:options']
  if (isRecord(bstackOptions)) {
    for (const key of ['userName', 'username', 'accessKey']) {
      if (bstackOptions[key] !== undefined) {
        paths.push(`bstack:options.${key}`)
      }
    }
  }
  return paths
}

/** Returns a non-mutating, recursively redacted representation suitable for logs. */
export function redactSecrets<T>(value: T): T {
  return redactValue(value, new WeakSet<object>()) as T
}

export function redactBrowserStackCapabilities(capabilities: BrowserStackCapabilities): BrowserStackCapabilities {
  return redactSecrets(capabilities)
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]'
    }
    seen.add(value)
    return value.map((item) => redactValue(item, seen))
  }
  if (!isRecord(value)) {
    return value
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, isSecretKey(key) ? REDACTED_VALUE : redactValue(item, seen)]),
  )
}

function isSecretKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return (
    normalized === 'username' ||
    normalized === 'accesskey' ||
    normalized === 'browserstackuser' ||
    normalized === 'browserstackkey' ||
    normalized === 'password' ||
    normalized === 'authorization' ||
    normalized === 'token' ||
    normalized === 'tunneltoken'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
