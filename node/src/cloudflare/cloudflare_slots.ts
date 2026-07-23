export type CloudflareSlot = {
  id: string
  hostname: string
  port: number
  useHttps: boolean
}

const defaultHttpsHosts = [
  'bs-slot-https-1.fpjs.sh',
  'bs-slot-https-2.fpjs.sh',
  'bs-slot-https-3.fpjs.sh',
  'bs-slot-https-4.fpjs.sh',
  'bs-slot-https-5.fpjs.sh',
]

const defaultHttpHosts = ['bs-slot-http-1.fpjs.sh', 'bs-slot-http-2.fpjs.sh']

const defaultHttpsPorts = [7201, 7202, 7203, 7204, 7205]
const defaultHttpPorts = [7206, 7207]

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parsePorts(value: string | undefined, fallback: number[], envName: string): number[] {
  const parts = parseCsv(value, fallback.map(String))
  const ports = parts.map((part) => {
    const port = Number(part)
    if (!Number.isInteger(port) || port < 1) {
      throw new Error(`Invalid ${envName} entry "${part}". Expected a positive integer port.`)
    }
    return port
  })

  return ports
}

function createSlots(prefix: string, hosts: string[], ports: number[], useHttps: boolean): CloudflareSlot[] {
  if (hosts.length !== ports.length) {
    throw new Error(`Cloudflare ${prefix} slot hosts (${hosts.length}) must match ports (${ports.length}).`)
  }

  return hosts.map((hostname, index) => {
    const port = ports[index]
    if (port === undefined) {
      throw new Error(`Missing Cloudflare ${prefix} port for host "${hostname}".`)
    }

    return {
      id: `${prefix}-${index + 1}`,
      hostname,
      port,
      useHttps,
    }
  })
}

export function getCloudflareSlots(): CloudflareSlot[] {
  const httpsHosts = parseCsv(process.env.BS_CLOUDFLARE_HTTPS_HOSTS, defaultHttpsHosts)
  const httpHosts = parseCsv(process.env.BS_CLOUDFLARE_HTTP_HOSTS, defaultHttpHosts)
  const httpsPorts = parsePorts(process.env.BS_CLOUDFLARE_HTTPS_PORTS, defaultHttpsPorts, 'BS_CLOUDFLARE_HTTPS_PORTS')
  const httpPorts = parsePorts(process.env.BS_CLOUDFLARE_HTTP_PORTS, defaultHttpPorts, 'BS_CLOUDFLARE_HTTP_PORTS')

  const httpsSlots = createSlots('https', httpsHosts, httpsPorts, true)
  const httpSlots = createSlots('http', httpHosts, httpPorts, false)
  const seenHosts = new Set<string>()
  const seenPorts = new Set<number>()

  for (const slot of [...httpsSlots, ...httpSlots]) {
    if (seenHosts.has(slot.hostname)) {
      throw new Error(`Duplicate Cloudflare slot hostname "${slot.hostname}".`)
    }
    if (seenPorts.has(slot.port)) {
      throw new Error(`Duplicate Cloudflare slot port "${slot.port}".`)
    }
    seenHosts.add(slot.hostname)
    seenPorts.add(slot.port)
  }

  return [...httpsSlots, ...httpSlots]
}
