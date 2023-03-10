import { rollup } from 'rollup'
import rollupVirtual from '@rollup/plugin-virtual'
import { nodeResolve as rollupNodeResolve } from '@rollup/plugin-node-resolve'
import { spawn, SpawnOptions } from 'child_process'
import html from '@rollup/plugin-html'
import { readFileSync } from 'fs'
//import { drawRandom } from '../fetch_agent/draw_random'
import { code } from './3.6'

export async function createBundle(): Promise<void> {
  const contextDirectory = 'browser_version_monitor'
  await installAgentVersion('3.6.1', contextDirectory)

  const entryCode = code
  const htmlTemplate = readFileSync('./rollup/template.html', { encoding: 'utf8' })
  const bundle = await rollup({
    input: 'entry',
    output: [
      {
        file: './resources',
        format: 'cjs',
      },
    ],
    plugins: [
      rollupNodeResolve({
        browser: true,
        rootDir: contextDirectory,
        jail: contextDirectory,
      }),
      rollupVirtual({
        entry: entryCode,
      }),
      html({
        template: () => htmlTemplate,
      }),
    ],
  })

  const { output } = await bundle.generate({
    dir: './resources',
    name: 'FingerprintJS',
    //file: 'fp.min.js',
    format: 'esm',
  })

  const x = output[0].code
  console.log(x)
  console.log('==============')
  console.log(output)
  // Inject `code` into the browser or serve as a JS file by your HTTP(S) server
}

async function installAgentVersion(version: string, _contextDirectory: string): Promise<void> {
  const dependencyName = '@fingerprintjs/fingerprintjs-pro'
  await runCommand(`yarn add ${dependencyName}@${version} -ED`, {  })
}

export function runCommand(command: string, options: SpawnOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [], { shell: true, ...options })
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code) {
        reject(new Error(`The ${command} command has exited with code ${code}`))
      } else {
        resolve()
      }
    })
  })
}
