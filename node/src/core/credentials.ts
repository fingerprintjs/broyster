import { Buffer } from 'node:buffer'

export interface BrowserStackCredentials {
  readonly username: string
  readonly accessKey: string
}

export const BROWSERSTACK_USERNAME_ENV = 'BROWSERSTACK_USERNAME'
export const BROWSERSTACK_ACCESS_KEY_ENV = 'BROWSERSTACK_ACCESS_KEY'
export const LEGACY_BROWSERSTACK_USERNAME_ENV = 'BROWSER_STACK_USERNAME'
export const LEGACY_BROWSERSTACK_ACCESS_KEY_ENV = 'BROWSER_STACK_ACCESS_KEY'

export class BrowserStackCredentialsError extends Error {
  readonly missing: readonly ('username' | 'accessKey')[]

  constructor(missing: readonly ('username' | 'accessKey')[]) {
    const variableNames = missing.flatMap((field) =>
      field === 'username'
        ? [BROWSERSTACK_USERNAME_ENV, LEGACY_BROWSERSTACK_USERNAME_ENV]
        : [BROWSERSTACK_ACCESS_KEY_ENV, LEGACY_BROWSERSTACK_ACCESS_KEY_ENV],
    )
    super(`BrowserStack credentials not found. Set ${variableNames.join(' or ')}.`)
    this.name = 'BrowserStackCredentialsError'
    this.missing = [...missing]
  }
}

export function getBrowserStackCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BrowserStackCredentials {
  const username = firstNonEmpty(env[BROWSERSTACK_USERNAME_ENV], env[LEGACY_BROWSERSTACK_USERNAME_ENV])
  const accessKey = firstNonEmpty(env[BROWSERSTACK_ACCESS_KEY_ENV], env[LEGACY_BROWSERSTACK_ACCESS_KEY_ENV])
  const missing: ('username' | 'accessKey')[] = []

  if (!username) {
    missing.push('username')
  }
  if (!accessKey) {
    missing.push('accessKey')
  }
  if (!username || !accessKey) {
    throw new BrowserStackCredentialsError(missing)
  }

  return { username, accessKey }
}

export function browserStackCredentialSecretValues(credentials: BrowserStackCredentials): string[] {
  const basicValue = Buffer.from(`${credentials.username}:${credentials.accessKey}`, 'utf8').toString('base64')
  return [credentials.username, credentials.accessKey, basicValue, `Basic ${basicValue}`]
}

export function createSecretRedactor(values: readonly (string | undefined)[]): (value: string) => string {
  const secrets = [
    ...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)),
  ].sort((left, right) => right.length - left.length)
  return (value) => secrets.reduce((result, secret) => result.split(secret).join('[REDACTED]'), value)
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value))
}
