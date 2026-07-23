import { spawnSync } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const workspaceRoot = resolve(packageRoot, '..')
const packageName = '@fpjs-incubator/broyster'
const packageVersion = '1.0.0-beta.0'

let temporaryRoot: string
let installedPackage: string
let consumerRoot: string
let packedFiles: string[]
let packageLicenseExisted = false

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'broyster package contract with spaces-'))
  packageLicenseExisted = await exists(join(packageRoot, 'LICENSE'))

  run(process.execPath, [
    join(workspaceRoot, 'node_modules/typescript/bin/tsc'),
    '-p',
    join(packageRoot, 'tsconfig.json'),
  ])

  const tarballDirectory = join(temporaryRoot, 'packed artifacts')
  await mkdir(tarballDirectory, { recursive: true })
  run('npm', ['pack', '--json', '--pack-destination', tarballDirectory], packageRoot)

  const tarball = join(
    tarballDirectory,
    (await readdir(tarballDirectory)).find((entry) => entry.endsWith('.tgz')) ?? 'missing-package.tgz',
  )
  await access(tarball)

  const unpackedDirectory = join(temporaryRoot, 'unpacked tarball')
  await mkdir(unpackedDirectory, { recursive: true })
  run('tar', ['-xzf', tarball, '-C', unpackedDirectory])

  consumerRoot = join(temporaryRoot, 'clean consumer project')
  installedPackage = join(consumerRoot, 'node_modules', '@fpjs-incubator', 'broyster')
  await mkdir(dirname(installedPackage), { recursive: true })
  await rename(join(unpackedDirectory, 'package'), installedPackage)
  await linkRuntimeDependencies()

  packedFiles = await listFiles(installedPackage)
  await writeConsumerFixtures()
}, 60_000)

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
  if (!packageLicenseExisted) {
    await rm(join(packageRoot, 'LICENSE'), { force: true })
  }
})

describe('published package contract', () => {
  it('packs only the public ESM package and every declared export target', async () => {
    const manifest = JSON.parse(await readFile(join(installedPackage, 'package.json'), 'utf8')) as {
      type: string
      version: string
      engines: Record<string, string>
      peerDependencies: Record<string, string>
      bin: Record<string, string>
      exports: Record<string, string | { types: string; import: string }>
    }

    expect(manifest.type).toBe('module')
    expect(manifest.version).toBe(packageVersion)
    expect(manifest.engines).toEqual({ node: '^20.19.0 || >=22.12.0' })
    expect(manifest.peerDependencies).toEqual({ vite: '8.0.13', vitest: '4.1.8' })
    expect(manifest.bin).toEqual({ broyster: './dist/cli.js' })
    expect(Object.keys(manifest.exports)).toEqual([
      '.',
      './vitest',
      './transports/cloudflare',
      './presets/fingerprint',
      './package.json',
    ])

    for (const exported of Object.values(manifest.exports)) {
      for (const target of typeof exported === 'string' ? [exported] : [exported.types, exported.import]) {
        await expect(access(resolve(installedPackage, target))).resolves.toBeUndefined()
      }
    }

    expect(packedFiles).toContain('LICENSE')
    expect(packedFiles).toContain('readme.md')
    expect(packedFiles).toContain('dist/cli.js')
    expect(packedFiles.some((file) => file.startsWith('src/'))).toBe(false)
    expect(packedFiles.some((file) => file.startsWith('test/'))).toBe(false)
    expect(packedFiles.some((file) => file.startsWith('node_modules/'))).toBe(false)
  })

  it('uses resolvable explicit extensions for all relative ESM imports', async () => {
    const moduleFiles = packedFiles.filter((file) => file.endsWith('.js') || file.endsWith('.d.ts'))
    expect(moduleFiles.length).toBeGreaterThan(0)

    for (const moduleFile of moduleFiles) {
      const absoluteFile = join(installedPackage, moduleFile)
      const source = await readFile(absoluteFile, 'utf8')
      for (const specifier of relativeModuleSpecifiers(source)) {
        expect(specifier, `${moduleFile} has an extensionless relative import`).toMatch(/\.js$/)
        await expect(access(resolve(dirname(absoluteFile), specifier))).resolves.toBeUndefined()
      }
    }
  })

  it('imports every public subpath from a clean consumer path containing spaces', () => {
    const result = run(process.execPath, [join(consumerRoot, 'consumer.mjs')], consumerRoot)
    expect(JSON.parse(result.stdout)).toEqual({
      cloudflare: true,
      fingerprintBrowsers: 17,
      root: true,
      version: packageVersion,
      vitest: true,
    })
  })

  it('exposes consumable NodeNext types for every public subpath', () => {
    run(
      process.execPath,
      [join(workspaceRoot, 'node_modules/typescript/bin/tsc'), '-p', join(consumerRoot, 'tsconfig.json')],
      consumerRoot,
    )
  })

  it('ships an executable CLI with working help and version commands', async () => {
    const cli = join(installedPackage, 'dist', 'cli.js')
    const firstLine = (await readFile(cli, 'utf8')).split('\n', 1)[0]
    expect(firstLine).toBe('#!/usr/bin/env node')

    if (process.platform !== 'win32') {
      const bin = join(consumerRoot, 'node_modules', '.bin', 'broyster')
      await mkdir(dirname(bin), { recursive: true })
      // npm/pnpm make declared bin targets executable while linking an installation.
      await chmod(cli, 0o755)
      await symlink(join('..', '@fpjs-incubator', 'broyster', 'dist', 'cli.js'), bin)
      expect(run(bin, ['--version'], consumerRoot).stdout.trim()).toBe(packageVersion)
      expect(run(bin, ['--help'], consumerRoot).stdout).toContain('Usage: broyster run [options]')
    } else {
      expect(run(process.execPath, [cli, '--version'], consumerRoot).stdout.trim()).toBe(packageVersion)
      expect(run(process.execPath, [cli, '--help'], consumerRoot).stdout).toContain('Usage: broyster run [options]')
    }
  })
})

function run(command: string, arguments_: string[], cwd = workspaceRoot): { stdout: string; stderr: string } {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', npm_config_cache: join(temporaryRoot, 'npm cache') },
    timeout: 60_000,
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${arguments_.join(' ')}`,
        `Exit status: ${String(result.status)}`,
        result.error?.stack,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
  return { stdout: result.stdout, stderr: result.stderr }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function listFiles(directory: string, relativeDirectory = ''): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(join(directory, relativeDirectory), { withFileTypes: true })) {
    const relativePath = join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)))
    } else {
      files.push(relativePath.split('\\').join('/'))
    }
  }
  return files.sort()
}

function relativeModuleSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map((match) => match[1]!)
}

async function linkRuntimeDependencies(): Promise<void> {
  const consumerModules = join(consumerRoot, 'node_modules')
  const packageModules = join(packageRoot, 'node_modules')
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  await mkdir(consumerModules, { recursive: true })
  await linkPackage(join(workspaceRoot, 'node_modules'), consumerModules, '@types/node')
  for (const dependency of new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])) {
    await linkPackage(packageModules, consumerModules, dependency)
  }
}

async function linkPackage(sourceModules: string, targetModules: string, packageName_: string): Promise<void> {
  const target = join(targetModules, packageName_)
  await mkdir(dirname(target), { recursive: true })
  await symlink(join(sourceModules, packageName_), target, 'dir')
}

async function writeConsumerFixtures(): Promise<void> {
  await writeFile(
    join(consumerRoot, 'package.json'),
    JSON.stringify({ name: 'broyster-contract-consumer', private: true, type: 'module' }, null, 2),
  )
  await writeFile(
    join(consumerRoot, 'consumer.mjs'),
    `import { readFile } from 'node:fs/promises'
import { defineBroysterConfig, runBrowserStack } from '${packageName}'
import { browserstack, defineBrowserStackVitestConfig } from '${packageName}/vitest'
import { cloudflareTunnel } from '${packageName}/transports/cloudflare'
import { fingerprintBrowserPreset } from '${packageName}/presets/fingerprint'

const manifest = JSON.parse(await readFile(new URL('./node_modules/${packageName}/package.json', import.meta.url)))
console.log(JSON.stringify({
  cloudflare: typeof cloudflareTunnel === 'function',
  fingerprintBrowsers: Object.keys(fingerprintBrowserPreset()).length,
  root: typeof defineBroysterConfig === 'function' && typeof runBrowserStack === 'function',
  version: manifest.version,
  vitest: typeof browserstack === 'function' && typeof defineBrowserStackVitestConfig === 'function',
}))
`,
  )
  await writeFile(
    join(consumerRoot, 'consumer.ts'),
    `import { defineBroysterConfig, runBrowserStack, type BrowserDefinition } from '${packageName}'
import { browserstack, defineBrowserStackVitestConfig } from '${packageName}/vitest'
import { cloudflareTunnel, type TunnelSlot } from '${packageName}/transports/cloudflare'
import { fingerprintBrowserPreset, type FingerprintBrowserId } from '${packageName}/presets/fingerprint'

const slots = [{ id: 'https-1', publicUrl: 'https://browser.example.test', localPort: 7201, protocol: 'https' }] as const satisfies readonly TunnelSlot[]
const browser: BrowserDefinition = { browser: 'chrome', protocol: 'https' }
const selectedBrowser: FingerprintBrowserId = 'Windows11_ChromeLatest'
const config = defineBroysterConfig({
  projectName: 'contract-consumer',
  vitestConfig: './vitest.browserstack.config.ts',
  browsers: { browser, ...fingerprintBrowserPreset({ channel: 'beta' }) },
  transport: cloudflareTunnel({ slots }),
})

void [browserstack, config, defineBrowserStackVitestConfig, runBrowserStack, selectedBrowser]
`,
  )
  await writeFile(
    join(consumerRoot, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          lib: ['ES2022', 'DOM'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          noImplicitReturns: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2022',
          types: ['node'],
          verbatimModuleSyntax: true,
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    ),
  )
}
