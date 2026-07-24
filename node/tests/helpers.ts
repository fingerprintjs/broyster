export function deferred<Value>() {
  let resolvePromise: ((value: Value) => void) | undefined
  let rejectPromise: ((reason: unknown) => void) | undefined
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve(value: Value) {
      resolvePromise?.(value)
    },
    reject(reason: unknown) {
      rejectPromise?.(reason)
    },
  }
}
