import { webdriverio } from '@vitest/browser/providers'
import { type Browser as WdioBrowser, remote } from 'webdriverio'
import { Local } from 'browserstack-local'
import type { BrowserProviderInitializationOptions, WorkspaceProject } from 'vitest/node'

export interface BSOpts {
  username: string
  accessKey: string
  projectName: string
  localIdentifier?: string
}

type AnyObj = Record<string, any>
type RemoteOpts = Parameters<typeof remote>[0]
type RemoteCaps = NonNullable<RemoteOpts['capabilities']>

export function browserStackProvider(opts: BSOpts) {
  const localIdentifier = opts.localIdentifier ?? `vitest-${Date.now()}`
  const bsLocal = new Local()
  let cleanupAttached = false
  let stopping = false

  const stopLocal = async () => {
    if (stopping) return
    stopping = true
    await new Promise<void>((resolve) => {
      try {
        bsLocal.stop(() => resolve())
      } catch {
        resolve()
      }
    })
  }

  const branch =
    process.env.GITHUB_REF_NAME ||
    process.env.GITHUB_HEAD_REF ||
    process.env.CI_COMMIT_BRANCH ||
    process.env.BRANCH_NAME ||
    process.env.GIT_BRANCH ||
    'local'

  const sha = process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || process.env.COMMIT_SHA || ''
  const buildNumber = process.env.GITHUB_RUN_NUMBER || process.env.BUILD_NUMBER || process.env.CI_JOB_ID || ''
  const tags = [branch, sha ? sha.slice(0, 7) : 'no-sha', buildNumber ? `build:${buildNumber}` : undefined].filter(
    Boolean,
  ) as string[]

  return class BrowserStackProvider extends webdriverio {
    name = 'browserstack'

    _instance: AnyObj | null = null

    initialize = (ctx: WorkspaceProject, options: BrowserProviderInitializationOptions) => {
      super.initialize(ctx as unknown as any, options as unknown as any)

      const selected = String(options?.browser ?? '')
      const instances: AnyObj[] =
        (ctx as any)?.config?.test?.browser?.instances ?? (ctx as any)?.browser?.instances ?? []

      this._instance =
        instances.find((i: AnyObj) => String(i?.browser).toLowerCase() === selected.toLowerCase()) ??
        instances[0] ??
        null
    }

    openBrowser = async (): Promise<WdioBrowser> => {
      await new Promise<void>((resolve, reject) => {
        bsLocal.start({ key: opts.accessKey, localIdentifier, forceLocal: true }, (err?: Error) =>
          err ? reject(err) : resolve(),
        )
      })

      if (!cleanupAttached) {
        cleanupAttached = true
        const handler = async () => {
          await stopLocal()
        }
        process.once('SIGINT', handler)
        process.once('SIGTERM', handler)
        process.once('exit', () => {
          try {
            bsLocal.stop(() => {})
          } catch {
            /* empty */
          }
        })
      }

      const inst = this._instance ?? {}
      const browserName = String(inst.browser ?? 'chrome')
      const instCaps = (inst.capabilities ?? {}) as AnyObj
      const existingBstack = (instCaps['bstack:options'] ?? {}) as AnyObj

      const mergedBstack = {
        ...existingBstack,
        projectName: opts.projectName,
        buildName:
          existingBstack.buildName ??
          (buildNumber ? `build-${buildNumber}` : `broyster-e2e-${new Date().toISOString().slice(0, 10)}`),
        sessionName: existingBstack.sessionName ?? `${branch}${sha ? ` - ${sha.slice(0, 7)}` : ''}`,
        tags: Array.isArray(existingBstack.tags) ? Array.from(new Set([...existingBstack.tags, ...tags])) : tags,
        local: true,
        localIdentifier,
      }

      const capabilities: RemoteCaps = {
        browserName,
        ...instCaps,
        'bstack:options': mergedBstack,
      }

      const baseOptions: RemoteOpts = {
        user: (inst.user ?? opts.username) as string,
        key: (inst.key ?? opts.accessKey) as string,
        protocol: (inst.protocol ?? 'https') as 'http' | 'https',
        hostname: (inst.hostname ?? 'hub-cloud.browserstack.com') as string,
        port: (inst.port ?? 443) as number,
        path: (inst.path ?? '/wd/hub') as string,
        capabilities,
      }

      const browser = await remote(baseOptions)

      return browser as unknown as WdioBrowser
    }

    close = async (): Promise<void> => {
      await stopLocal()
      await super.close()
    }
  }
}
