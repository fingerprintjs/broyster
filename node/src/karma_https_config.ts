import { Config } from 'karma'
import { sslConfiguration } from './server_certificates'
import * as httpHttpsServer from './http_https_server'

export function setHttpsAndServerForKarma(config: Config) {
  config.set({
    protocol: 'https',
    httpsServerOptions: {
      key: sslConfiguration.key,
      cert: sslConfiguration.cert,
      requestCert: false,
      rejectUnauthorized: false,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpModule: httpHttpsServer as any,
  })
}
