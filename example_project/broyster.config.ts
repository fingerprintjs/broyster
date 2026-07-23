import { defineBroysterConfig } from '@fpjs-incubator/broyster'
import { fingerprintBrowserPreset } from '@fpjs-incubator/broyster/presets/fingerprint'
import { cloudflareTunnel, type BrowserProtocol, type TunnelSlot } from '@fpjs-incubator/broyster/transports/cloudflare'

const httpsHosts = readCsvEnvironmentVariable('BS_CLOUDFLARE_HTTPS_HOSTS', [
  'bs-slot-https-1.fpjs.sh',
  'bs-slot-https-2.fpjs.sh',
  'bs-slot-https-3.fpjs.sh',
  'bs-slot-https-4.fpjs.sh',
  'bs-slot-https-5.fpjs.sh',
])
const httpsPorts = readPortEnvironmentVariable('BS_CLOUDFLARE_HTTPS_PORTS', [7201, 7202, 7203, 7204, 7205])
const httpHosts = readCsvEnvironmentVariable('BS_CLOUDFLARE_HTTP_HOSTS', [
  'bs-slot-http-1.fpjs.sh',
  'bs-slot-http-2.fpjs.sh',
])
const httpPorts = readPortEnvironmentVariable('BS_CLOUDFLARE_HTTP_PORTS', [7206, 7207])

export default defineBroysterConfig({
  projectName: 'Broyster example',
  vitestConfig: './vitest.browserstack.config.ts',
  browsers: fingerprintBrowserPreset(),
  transport: cloudflareTunnel({
    slots: [...createSlots('https', httpsHosts, httpsPorts), ...createSlots('http', httpHosts, httpPorts)],
  }),
  resultsFile: './artifacts/browserstack-results.json',
})

function readCsvEnvironmentVariable(name: string, fallback: readonly string[]): string[] {
  const value = process.env[name]
  if (!value?.trim()) {
    return [...fallback]
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function readPortEnvironmentVariable(name: string, fallback: readonly number[]): number[] {
  return readCsvEnvironmentVariable(
    name,
    fallback.map((port) => String(port)),
  ).map((value) => {
    const port = Number(value)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error(`${name} contains invalid port "${value}".`)
    }
    return port
  })
}

function createSlots(protocol: BrowserProtocol, hosts: readonly string[], ports: readonly number[]): TunnelSlot[] {
  if (hosts.length !== ports.length) {
    throw new Error(`Cloudflare ${protocol} host count (${hosts.length}) must match its port count (${ports.length}).`)
  }

  return hosts.map((hostname, index) => ({
    id: `${protocol}-${index + 1}`,
    publicUrl: `${protocol}://${hostname}`,
    localPort: ports[index]!,
    protocol,
  }))
}
