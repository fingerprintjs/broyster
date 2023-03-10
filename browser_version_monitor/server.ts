import * as ns from 'node-static'
import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from 'http'
import { createServer as createHttpsServer } from 'https'
import { sslConfiguration } from '../node/src/server_certificates'
import * as detect from 'detect-port'

async function findFreePort() {
  const port = 8082
  return await detect(port)
    .then((_port) => {
      return _port
    })
    .catch()
}

export async function makeHttpServer(): Promise<
  [url: string, server: Server<typeof IncomingMessage, typeof ServerResponse>]
> {
  const fn = (file: ns.Server) =>
    createHttpServer((req, res) => {
      req
        .addListener('end', () => {
          file.serve(req, res)
        })
        .resume()
    })
  const server = await create(fn, false)
  return [server[0], server[1]]
}

export async function makeHttpsServer(): Promise<
  [url: string, server: Server<typeof IncomingMessage, typeof ServerResponse>]
> {
  const fn = (file: ns.Server) =>
    createHttpsServer(sslConfiguration, (req, res) => {
      req
        .addListener('end', () => {
          file.serve(req, res)
        })
        .resume()
    })
  const server = await create(fn, true)
  return [server[0], server[1]]
}

async function create(
  fn: (file: ns.Server) => Server<typeof IncomingMessage, typeof ServerResponse>,
  useHttps: boolean
): Promise<[url: string, server: Server<typeof IncomingMessage, typeof ServerResponse>]> {
  const file = new ns.Server('./resources')
  const port = await findFreePort()
  const server = fn(file)
  server.listen(port)
  return [makeUrl(port, useHttps), server]
}

function makeUrl(port: number, isHttps: boolean): string {
  const url = new URL('http://127.0.0.1/')
  url.protocol = isHttps ? 'https' : 'http'
  url.port = port.toString()
  return url.href
}
