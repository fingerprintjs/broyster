import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export type BrowserStackSessionRecord = {
  schemaVersion: 1
  runId: string
  browserId: string
  attempt: {
    number: number
    kind: 'initial' | 'retry'
  }
  sessionId: string
}

export type BrowserStackSessionTarget = Omit<BrowserStackSessionRecord, 'schemaVersion' | 'sessionId'> & {
  file: string
}

export async function writeBrowserStackSessionFile(
  target: BrowserStackSessionTarget,
  sessionId: string,
): Promise<void> {
  const record: BrowserStackSessionRecord = {
    schemaVersion: 1,
    runId: target.runId,
    browserId: target.browserId,
    attempt: { ...target.attempt },
    sessionId,
  }
  const directory = dirname(target.file)
  const temporaryPath = join(directory, `.${basename(target.file)}.${process.pid}.${randomUUID()}.tmp`)
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, target.file)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

export async function readBrowserStackSessionFile(
  target: BrowserStackSessionTarget,
): Promise<BrowserStackSessionRecord | undefined> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(target.file, 'utf8'))
  } catch {
    return undefined
  }
  if (!isBrowserStackSessionRecord(value)) {
    return undefined
  }
  if (
    value.runId !== target.runId ||
    value.browserId !== target.browserId ||
    value.attempt.number !== target.attempt.number ||
    value.attempt.kind !== target.attempt.kind
  ) {
    return undefined
  }
  return value
}

function isBrowserStackSessionRecord(value: unknown): value is BrowserStackSessionRecord {
  if (!isRecord(value) || !isRecord(value.attempt)) {
    return false
  }
  return (
    value.schemaVersion === 1 &&
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.browserId) &&
    Number.isInteger(value.attempt.number) &&
    (value.attempt.number as number) > 0 &&
    (value.attempt.kind === 'initial' || value.attempt.kind === 'retry') &&
    isNonEmptyString(value.sessionId)
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
