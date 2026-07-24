export type BrowserStackCapabilities = {
  os?: string
  osVersion?: string
  browserVersion?: string
  deviceName?: string
  buildName?: string
  projectName?: string
  sessionName?: string
  local?: boolean
  localIdentifier?: string
  idleTimeoutSeconds?: number
  networkLogs?: boolean
  consoleLogs?: string
  acceptInsecureCerts?: boolean
  /** Raw bstack:options overrides for fields not listed above */
  bstackOptions?: Record<string, unknown>
}

export const browserIdentityCapabilityKeys = [
  'browserName',
  'browserVersion',
  'os',
  'osVersion',
  'deviceName',
  'projectName',
  'buildName',
  'sessionName',
] as const

export const transportRoutingCapabilityKeys = ['local', 'localIdentifier'] as const

/** Fields that transport metadata must never replace after runner configuration is resolved. */
export const providerOwnedCapabilityKeys = [...browserIdentityCapabilityKeys, 'acceptInsecureCerts'] as const

const legacyCredentialCapabilityKeys = ['browserstack.user', 'browserstack.key'] as const
const credentialOptionKeys = ['userName', 'username', 'accessKey'] as const

export function hasLegacyCredentialCapabilities(fields: Record<string, unknown>): boolean {
  return legacyCredentialCapabilityKeys.some((key) => fields[key] !== undefined)
}

export function hasCredentialOptions(fields: Record<string, unknown>): boolean {
  return credentialOptionKeys.some((key) => fields[key] !== undefined)
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

export function buildCapabilities(browserName: string, userCaps?: BrowserStackCapabilities): Record<string, unknown> {
  const bstackOptions: Record<string, unknown> = {
    local: userCaps?.local ?? false,
    ...(hasValue(userCaps?.os) && { os: userCaps?.os }),
    ...(hasValue(userCaps?.osVersion) && { osVersion: userCaps?.osVersion }),
    ...(hasValue(userCaps?.deviceName) && { deviceName: userCaps?.deviceName }),
    ...(hasValue(userCaps?.buildName) && { buildName: userCaps?.buildName }),
    ...(hasValue(userCaps?.projectName) && { projectName: userCaps?.projectName }),
    ...(hasValue(userCaps?.sessionName) && { sessionName: userCaps?.sessionName }),
    ...(hasValue(userCaps?.localIdentifier) && { localIdentifier: userCaps?.localIdentifier }),
    idleTimeout: userCaps?.idleTimeoutSeconds ?? 300,
    ...(typeof userCaps?.networkLogs === 'boolean' && { networkLogs: userCaps?.networkLogs }),
    ...(userCaps?.networkLogs === true && { networkLogsOptions: { captureContent: 'true' } }),
    ...(hasValue(userCaps?.consoleLogs) && { consoleLogs: userCaps?.consoleLogs }),
    acceptInsecureCerts: userCaps?.acceptInsecureCerts ?? true,
    ...userCaps?.bstackOptions,
  }

  return {
    browserName: browserName?.toLowerCase(),
    ...(hasValue(userCaps?.browserVersion) && { browserVersion: userCaps?.browserVersion }),
    acceptInsecureCerts: userCaps?.acceptInsecureCerts ?? true,
    acceptSslCerts: userCaps?.acceptInsecureCerts ?? true,
    'browserstack.acceptInsecureCerts': userCaps?.acceptInsecureCerts ?? true,
    'bstack:options': bstackOptions,
  }
}
