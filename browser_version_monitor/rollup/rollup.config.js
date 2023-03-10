const html = require('@rollup/plugin-html')
import rollupVirtual from '@rollup/plugin-virtual'
import { nodeResolve as rollupNodeResolve } from '@rollup/plugin-node-resolve'
import { readFileSync } from 'fs'

const htmlTemplate = readFileSync('./rollup/template.html', { encoding: 'utf8' })
const contextDirectory = 'browser_version_monitor'
//const version = '0.7.1'.split('.') //readFileSync('../resources/FingerprintJS/version').toString().split('.')
//const input = parseInt(version[1]) >= 6 ? '.3.6.ts' : '.3.5.ts'

const code = `import * as FingerprintJS from '@fingerprintjs/fingerprintjs-pro'

const startTime = performance.now()
FingerprintJS.load({
  token: 'eqySwVqdoKP07TSnyuqW',
})
  .then((fp) => fp.get())
  .then((result) => {
    document.getElementById('Fingerprint-getTime').innerText = (performance.now() - startTime).toString()
    document.getElementById('Fingerprint-result').innerText = JSON.stringify(result)
    const div = document.createElement('div')
    const content = document.createTextNode('done')
    div.appendChild(content)
    div.setAttribute('id', 'Fingerprint-done')
    const root = document.getElementById('Fingerprint')
    root.appendChild(div)
  })
`

export default {
  input: './rollup/3.5.js',
  output: [
    {
      dir: './resources',
      name: 'FingerprintJS',
      format: 'iife',
    },
  ],
  plugins: [
    rollupNodeResolve({
      browser: true,
      rootDir: contextDirectory,
      jail: contextDirectory,
    }),
    rollupVirtual({
      entry: code,
    }),
    html({
      template: () => htmlTemplate,
    }),
  ],
}
