import { describe, expect, it } from 'vitest'

import { cloudflareTransport, cloudflareTransportFromEnv } from '../src/transports/cloudflare.js'

const token = 'test-token'

describe('cloudflareTransportFromEnv', () => {
  it('requires the tunnel token', () => {
    expect(() => cloudflareTransportFromEnv({})).toThrow(/CLOUDFLARE_TUNNEL_TOKEN/)
  })

  it('requires at least one slot', () => {
    expect(() => cloudflareTransportFromEnv({ CLOUDFLARE_TUNNEL_TOKEN: token })).toThrow(/No Cloudflare slots/)
  })

  it('builds slots from CSV env variables', () => {
    const transport = cloudflareTransportFromEnv({
      CLOUDFLARE_TUNNEL_TOKEN: token,
      BROYSTER_CLOUDFLARE_HTTPS_HOSTS: 'a.example.com, b.example.com',
      BROYSTER_CLOUDFLARE_HTTPS_PORTS: '7201,7202',
      BROYSTER_CLOUDFLARE_HTTP_HOSTS: 'c.example.com',
      BROYSTER_CLOUDFLARE_HTTP_PORTS: '7203',
    })

    expect(transport.supports({ useHttps: true })).toBe(true)
    expect(transport.supports({ useHttps: false })).toBe(true)
  })

  it('rejects host/port count mismatches', () => {
    expect(() =>
      cloudflareTransportFromEnv({
        CLOUDFLARE_TUNNEL_TOKEN: token,
        BROYSTER_CLOUDFLARE_HTTPS_HOSTS: 'a.example.com,b.example.com',
        BROYSTER_CLOUDFLARE_HTTPS_PORTS: '7201',
      }),
    ).toThrow(/hosts \(2\) must match ports \(1\)/)
  })

  it('rejects invalid ports', () => {
    expect(() =>
      cloudflareTransportFromEnv({
        CLOUDFLARE_TUNNEL_TOKEN: token,
        BROYSTER_CLOUDFLARE_HTTPS_HOSTS: 'a.example.com',
        BROYSTER_CLOUDFLARE_HTTPS_PORTS: 'not-a-port',
      }),
    ).toThrow(/Invalid BROYSTER_CLOUDFLARE_HTTPS_PORTS entry/)
  })
})

describe('cloudflareTransport', () => {
  it('rejects duplicate hostnames and ports', () => {
    expect(() =>
      cloudflareTransport({
        token,
        slots: [
          { hostname: 'a.example.com', port: 7201, useHttps: true },
          { hostname: 'a.example.com', port: 7202, useHttps: true },
        ],
      }),
    ).toThrow(/Duplicate Cloudflare slot hostname/)

    expect(() =>
      cloudflareTransport({
        token,
        slots: [
          { hostname: 'a.example.com', port: 7201, useHttps: true },
          { hostname: 'b.example.com', port: 7201, useHttps: false },
        ],
      }),
    ).toThrow(/Duplicate Cloudflare slot port/)
  })

  it('reports supported protocols from the slot list', () => {
    const transport = cloudflareTransport({
      token,
      slots: [{ hostname: 'a.example.com', port: 7201, useHttps: true }],
    })

    expect(transport.supports({ useHttps: true })).toBe(true)
    expect(transport.supports({ useHttps: false })).toBe(false)
  })
})
