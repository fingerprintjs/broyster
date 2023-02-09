export class QueueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueueError'
  }
}
