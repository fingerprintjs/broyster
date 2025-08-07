import { afterAll, afterEach, beforeAll } from 'vitest'

declare const browser: any

function specLabelFromUrl(u: string): string {
  try {
    const pathname = new URL(u, location.origin).pathname
    const parts = pathname.split('/').filter(Boolean)
    return parts.slice(-2).join('/')
  } catch {
    return 'unknown.spec'
  }
}

async function bsExec(action: string, args: Record<string, unknown>) {
  try {
    if (!browser?.executeScript) return
    await browser.executeScript('browserstack_executor: ' + JSON.stringify({ action, arguments: args }), [])
  } catch {
    /* empty */
  }
}

async function setSessionStatus(status: 'passed' | 'failed', reason?: string) {
  await bsExec('setSessionStatus', { status, reason: reason ?? '' })
}
async function setSessionName(name: string) {
  await bsExec('setSessionName', { name })
}
async function annotate(message: string, level: 'info' | 'debug' | 'warn' | 'error' = 'info') {
  await bsExec('annotate', { data: message, level })
}

const SPEC_LABEL = specLabelFromUrl(import.meta.url)

beforeAll(async () => {
  await setSessionName(SPEC_LABEL)
  await annotate(`▶️ Start ${SPEC_LABEL}`)
  try {
    await annotate(navigator.userAgent, 'debug')
  } catch {
    /* empty */
  }
})

function firstErrorMessage(result: unknown): string | undefined {
  const r = result as { errors?: Array<{ name?: string; message?: string; stack?: string }> } | undefined
  const e = r?.errors?.[0]
  if (!e) return undefined
  if (e.name && e.message) return `${e.name}: ${e.message}`
  return e.message ?? e.stack ?? undefined
}

afterEach(async (ctx) => {
  const result = ctx.task.result
  if (!result) return

  const msg = firstErrorMessage(result)

  if (result.state === 'fail') {
    await annotate(`❌ ${ctx.task.name}${msg ? `: ${msg}` : ''}`, 'error')
  } else if (result.state === 'pass') {
    await annotate(`✅ ${ctx.task.name}`, 'debug')
  }
})

afterAll(async () => {
  await annotate(`🏁 End ${SPEC_LABEL}`)
})

afterEach(async (ctx) => {
  const result = ctx.task.result
  if (!result?.state) return
  if (result.state === 'pass') return setSessionStatus('passed')

  const msg = firstErrorMessage(result) ?? 'Test failed'
  return setSessionStatus('failed', msg)
})
