import { compareById, uniqueSorted } from '../internal/collections.js'
import { finiteNonNegative, isDefined, isRecord } from '../internal/validation.js'
import type { SerializedError, TestCaseResult, TestModuleResult } from '../orchestrator/results.js'

export const ATTEMPT_REPORT_SCHEMA_VERSION = 1 as const

export type AttemptReport = {
  schemaVersion: typeof ATTEMPT_REPORT_SCHEMA_VERSION
  browser: string | null
  projectNames: string[]
  failedModuleIds: string[]
  failedTestModuleIds: string[]
  moduleErrorIds: string[]
  failedStateModuleIds: string[]
  unhandledErrorModuleIds: string[]
  unhandledErrorCount: number
  modules: TestModuleResult[]
  unhandledErrors: SerializedError[]
  warnings: string[]
}

export type ParsedAttemptReport = Pick<AttemptReport, 'failedModuleIds' | 'modules' | 'unhandledErrors' | 'warnings'>

/** Parses the reporter contract without trusting partially written JSON shapes. */
export function parseAttemptReport(value: unknown): ParsedAttemptReport | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== ATTEMPT_REPORT_SCHEMA_VERSION ||
    !Array.isArray(value.failedModuleIds)
  ) {
    return undefined
  }
  return {
    failedModuleIds: uniqueSorted(
      value.failedModuleIds.filter((moduleId): moduleId is string => typeof moduleId === 'string'),
    ),
    modules: Array.isArray(value.modules) ? value.modules.map(parseTestModule).filter(isDefined) : [],
    unhandledErrors: parseErrors(value.unhandledErrors),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  }
}

export function normalizeModuleStatus(status: string): TestModuleResult['status'] {
  return status === 'passed' || status === 'failed' ? status : 'skipped'
}

export function normalizeTestStatus(status: string, todo: boolean): TestCaseResult['status'] {
  if (status === 'skipped' && todo) {
    return 'todo'
  }
  return status === 'passed' || status === 'failed' || status === 'skipped' ? status : 'skipped'
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      ...(error.name && { name: error.name }),
      message: error.message || error.name || 'Unknown error',
      ...(error.stack && { stack: error.stack }),
    }
  }
  if (isRecord(error)) {
    const name = typeof error.name === 'string' ? error.name : undefined
    const message = typeof error.message === 'string' ? error.message : String(error)
    const stack =
      typeof error.stack === 'string' ? error.stack : typeof error.stackStr === 'string' ? error.stackStr : undefined
    return { ...(name && { name }), message, ...(stack && { stack }) }
  }
  return { message: String(error) }
}

function parseTestModule(value: unknown): TestModuleResult | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isModuleStatus(value.status) ||
    !Array.isArray(value.tests)
  ) {
    return undefined
  }
  return {
    id: value.id,
    ...parseResultDetails(value, value.status),
    tests: value.tests.map(parseTestCase).filter(isDefined).sort(compareById),
  }
}

function parseTestCase(value: unknown): TestCaseResult | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.fullName !== 'string' ||
    !isTestStatus(value.status)
  ) {
    return undefined
  }
  return {
    id: value.id,
    name: value.name,
    fullName: value.fullName,
    ...parseResultDetails(value, value.status),
  }
}

function parseResultDetails<Status extends string>(
  value: Record<string, unknown>,
  status: Status,
): { status: Status; duration: number; errors: SerializedError[] } {
  return {
    status,
    duration: finiteNonNegative(value.duration),
    errors: parseErrors(value.errors),
  }
}

function parseErrors(value: unknown): SerializedError[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((error): SerializedError[] => {
    if (!isRecord(error) || typeof error.message !== 'string') {
      return []
    }
    return [
      {
        ...(typeof error.name === 'string' && { name: error.name }),
        message: error.message,
        ...(typeof error.stack === 'string' && { stack: error.stack }),
      },
    ]
  })
}

function isModuleStatus(value: unknown): value is TestModuleResult['status'] {
  return value === 'passed' || value === 'failed' || value === 'skipped'
}

function isTestStatus(value: unknown): value is TestCaseResult['status'] {
  return value === 'passed' || value === 'failed' || value === 'skipped' || value === 'todo'
}
