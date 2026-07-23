export type SerializedVitestError = {
  name: string
  message: string
  stack?: string
}

export function serializeVitestError(error: unknown): SerializedVitestError {
  if (typeof error === 'string') {
    return { name: 'Error', message: error }
  }
  if (error === null || error === undefined) {
    return { name: 'Error', message: 'Unknown error' }
  }
  if (typeof error !== 'object') {
    return { name: 'Error', message: String(error) }
  }

  const record = error as Record<string, unknown>
  const name = typeof record.name === 'string' && record.name ? record.name : 'Error'
  const message = pickErrorMessage(record)
  const stack = pickErrorStack(record)
  return {
    name,
    message,
    ...(stack === undefined ? {} : { stack }),
  }
}

export function formatVitestError(error: unknown): string {
  const serialized = serializeVitestError(error)
  const message = serialized.name === 'Error' ? serialized.message : `${serialized.name}: ${serialized.message}`
  return toSingleLine(message)
}

function pickErrorMessage(record: Record<string, unknown>): string {
  if (typeof record.message === 'string' && record.message) {
    return record.message
  }
  if (typeof record.stackStr === 'string' && record.stackStr) {
    return firstNonEmptyLine(record.stackStr)
  }
  if (typeof record.stack === 'string' && record.stack) {
    return firstNonEmptyLine(record.stack)
  }
  return toSafeString(record)
}

function pickErrorStack(record: Record<string, unknown>): string | undefined {
  if (typeof record.stackStr === 'string' && record.stackStr) {
    return record.stackStr
  }
  if (typeof record.stack === 'string' && record.stack) {
    return record.stack
  }
  return undefined
}

function firstNonEmptyLine(value: string): string {
  return (
    value
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? 'Unknown error'
  )
}

function toSafeString(value: object): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toSingleLine(message: string): string {
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ')
}
