import * as FingerprintJS from '@fingerprintjs/fingerprintjs-pro'

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
