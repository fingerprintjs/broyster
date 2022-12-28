import { createServer as createHttpServer, IncomingMessage, RequestListener, ServerResponse } from 'http'
import { createServer as createHttpsServer } from 'https'
import { promisify } from 'util'

export function createServer(...args: RequestListener<typeof IncomingMessage, typeof ServerResponse>[]) {
  const httpServer = createHttpServer(...args)
  const httpsServer = createHttpsServer(...args)

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, args: (...args: any[]) => void) {
      httpServer.on(event, args)
      httpsServer.on(event, args)
    },

    listen(port: number, callback: () => void) {
      port = 2137
      Promise.all([
        promisify(httpServer.listen.bind(httpServer, port))(),
        promisify(httpsServer.listen.bind(httpsServer, calculateHttpsPort(port)))(),
      ]).then(() => callback?.(), callback)
    },

    listeners(listener: string) {
      return httpServer.listeners(listener)
    },

    removeAllListeners(listener: string) {
      httpServer.removeAllListeners(listener)
      httpsServer.removeAllListeners(listener)
    },

    close(callback?: (err?: Error | undefined) => void) {
      Promise.all([
        promisify(httpServer.close.bind(httpServer))(),
        promisify(httpsServer.close.bind(httpsServer))(),
      ]).then(() => callback?.(), callback)
    },
  }
}

export function calculateHttpsPort(port: number): number {
  return port + 1
}
