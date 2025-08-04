export type WdioOptions = {
  projectName: string
  specs?: string[]
  maxInstances?: number
  matrix?: WebdriverIO.Capabilities[]
  timeoutMs?: number
}

export function makeWdioConfig(opts: WdioOptions): WebdriverIO.Config {
  return {
    runner: 'local',
    specs: opts.specs ?? ['./e2e/**/*.spec.ts'],
    maxInstances: opts.maxInstances ?? 5,
    framework: 'mocha',
    reporters: ['spec'],
    services: [['browserstack', { browserstackLocal: true }]],
    user: process.env.BROWSERSTACK_USERNAME,
    key: process.env.BROWSERSTACK_ACCESS_KEY,
    capabilities: opts.matrix ?? [{ browserName: 'chrome' }, { browserName: 'firefox' }, { browserName: 'safari' }],
    logLevel: 'info',
    mochaOpts: {
      timeout: opts.timeoutMs ?? 120000,
      require: ['ts-node/register'],
    },
  }
}

export function makeBrowserMatrix<N extends Array<'chrome' | 'firefox' | 'safari' | 'edge'>>(
  names: N,
  base: Partial<WebdriverIO.Capabilities> = {},
): WebdriverIO.Capabilities[] {
  return names.map((browserName) => ({ browserName, ...base }))
}

export function enableLocal(config: WebdriverIO.Config, opts?: { id?: string }) {
  const localId = opts?.id ?? `broyster-${Date.now()}`
  const services = config.services ?? ([] as any)
  const idx = services.findIndex((s: string[]) => Array.isArray(s) && s[0] === 'browserstack')
  const bsTuple = idx >= 0 ? services[idx] : ['browserstack', {}]

  bsTuple[1] = {
    ...bsTuple[1],
    browserstackLocal: true,
    forcedStop: true,
    opts: { ...(bsTuple[1]?.opts ?? {}), localIdentifier: localId },
  }

  if (idx >= 0) {
    services[idx] = bsTuple
  } else {
    services.push(bsTuple)
  }

  ;(config as any).services = services
}
