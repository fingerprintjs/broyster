export function isDefined<Value>(value: Value | undefined): value is Value {
  return value !== undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return isPositiveInteger(value) && Number.isSafeInteger(value)
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && Number.isSafeInteger(value)
}

export function isPort(value: unknown): value is number {
  return isPositiveInteger(value) && value <= 65_535
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}
