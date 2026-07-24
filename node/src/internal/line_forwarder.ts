import { StringDecoder } from 'node:string_decoder'

export type LineForwarder = {
  write(chunk: string | Uint8Array): void
  flush(): void
}

/**
 * Converts arbitrary stream chunks into complete non-empty lines. A separate
 * instance must be used per stream so interleaved stdout/stderr fragments
 * cannot be joined together.
 */
export function createLineForwarder(onLine: (line: string) => void): LineForwarder {
  const decoder = new StringDecoder('utf8')
  let pending = ''

  const emit = (line: string) => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
    if (normalized.trim()) {
      onLine(normalized)
    }
  }

  const append = (text: string) => {
    if (text) {
      const lines = `${pending}${text}`.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        emit(line)
      }
    }
  }

  return {
    write(chunk) {
      append(decoder.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk))
    },
    flush() {
      append(decoder.end())
      emit(pending)
      pending = ''
    },
  }
}
