/* eslint-disable @typescript-eslint/no-unused-vars */
export interface Logger {
  error(err: Error | string): void
  warn(message: string): void
  debug(message: string): void
  info(message: string): void
}

export class FakeLogger implements Logger {
  error(_err: Error | string): void {
    return
  }
  warn(_message: string): void {
    return
  }
  debug(_message: string): void {
    return
  }
  info(_message: string): void {
    return
  }
}
