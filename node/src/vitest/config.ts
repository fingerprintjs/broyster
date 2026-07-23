import { createHash } from 'node:crypto'
import { isAbsolute, join, resolve } from 'node:path'

import type { BrowserInstanceOption } from 'vitest/node'
import type { ViteUserConfig } from 'vitest/config'

import { BrowserStackReporter } from './browserstack_reporter.js'
import { ChildResultReporter } from './child_result_reporter.js'
import { FailureSummaryReporter } from './failure_summary_reporter.js'
import { browserstack } from './provider.js'
import { loadBrowserStackRunContext, type BrowserStackRunContext } from './run_context.js'
import { BrowserStackRuntime } from './runtime.js'

export function defineBrowserStackVitestConfig(userConfig: ViteUserConfig = {}): ViteUserConfig {
  return createBrowserStackVitestConfig(userConfig, loadBrowserStackRunContext())
}

export function createBrowserStackVitestConfig(
  userConfig: ViteUserConfig,
  context: BrowserStackRunContext,
  runtime = new BrowserStackRuntime(),
): ViteUserConfig {
  const publicHost = new URL(context.slot.publicUrl).hostname
  const provider = browserstack({
    capabilities: context.browser.capabilities,
    publicBaseUrl: context.slot.publicUrl,
    readinessFile: context.readinessFile,
    hubUrl: context.browserStack.hubUrl,
    readinessTimeoutMs: context.providerConnectTimeoutMs,
    sessionTarget: {
      file: context.sessionFile,
      runId: context.run.id,
      browserId: context.browser.id,
      attempt: { ...context.attempt },
    },
    ...(context.heartbeatIntervalMs === undefined ? {} : { heartbeatIntervalMs: context.heartbeatIntervalMs }),
    runtime,
  })
  const browserInstance: BrowserInstanceOption = {
    browser: context.browser.browser as BrowserInstanceOption['browser'],
    name: context.browser.id,
    provider,
  }
  const currentBrowser = userConfig.test?.browser ?? {}
  const currentReporters = userConfig.test?.reporters
  const reporters =
    currentReporters === undefined
      ? ['default']
      : Array.isArray(currentReporters)
        ? currentReporters
        : [currentReporters]

  return {
    ...userConfig,
    cacheDir: makeCacheDirectory(userConfig.cacheDir, context),
    server: {
      ...userConfig.server,
      host: '0.0.0.0',
      allowedHosts: mergeAllowedHosts(userConfig.server?.allowedHosts, publicHost),
    },
    test: {
      ...userConfig.test,
      fileParallelism: false,
      browser: {
        ...currentBrowser,
        enabled: true,
        api: {
          port: context.apiPort,
          strictPort: true,
        },
        connectTimeout: context.providerConnectTimeoutMs,
        provider,
        instances: [browserInstance],
      },
      reporters: [
        ...reporters,
        new FailureSummaryReporter({ runLabel: context.browser.name }),
        new BrowserStackReporter({ runtime, apiBaseUrl: context.browserStack.apiBaseUrl }),
        new ChildResultReporter({ context, runtime }),
      ],
    },
  }
}

function mergeAllowedHosts(current: true | string[] | undefined, publicHost: string): true | string[] {
  if (current === true) {
    return true
  }
  return [...new Set([...(current ?? []), publicHost])]
}

function makeCacheDirectory(configuredCacheDir: string | undefined, context: BrowserStackRunContext): string {
  const cacheRoot = configuredCacheDir
    ? isAbsolute(configuredCacheDir)
      ? configuredCacheDir
      : resolve(configuredCacheDir)
    : resolve('node_modules/.vite')
  const identity = `${context.run.id}-${context.browser.id}-${context.attempt.kind}-${context.attempt.number}`
  const slug = sanitizePathSegment(identity).slice(0, 80) || 'attempt'
  const suffix = `${slug}-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`
  return join(cacheRoot, 'broyster', suffix)
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}
