export interface LoggerFactory {
  create(name: string): Logger
}

export interface Logger {
  error(err: Error | string): void
  warn(message: string): void
  debug(message: string): void
}
