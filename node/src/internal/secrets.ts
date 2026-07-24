import { unique } from './collections.js'

export function redactSecrets(value: string, secrets: readonly string[]): string {
  const orderedSecrets = unique(secrets.filter(Boolean)).sort((left, right) => right.length - left.length)
  let redacted = value
  for (const secret of orderedSecrets) {
    redacted = redacted.split(secret).join('[REDACTED]')
  }
  return redacted
}
