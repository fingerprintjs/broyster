import 'jasmine'
let hasBeenSetAlready = false

export function retryFailedTests(retries: number, millisecondsBetweenRetries: number): void {
  if (hasBeenSetAlready) {
    return
  }
  const typelessJasmine = jasmine as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const originalSpecConstructor = typelessJasmine.Spec

  typelessJasmine.Spec = function (attrs: unknown) {
    const spec = new originalSpecConstructor(attrs)
    const originalTestFn = spec.queueableFn.fn

    const runOriginalTest = () => {
      if (originalTestFn.length == 0) {
        return originalTestFn()
      } else {
        return new Promise((resolve) => {
          originalTestFn(resolve)
        })
      }
    }

    spec.queueableFn.fn = async function () {
      let exceptionCaught
      let returnValue

      for (let i = 0; i < retries; ++i) {
        spec.reset()
        returnValue = undefined
        exceptionCaught = undefined

        try {
          returnValue = await runOriginalTest()
        } catch (exception) {
          exceptionCaught = exception
        }
        const failed = !spec.markedPending && (exceptionCaught || spec.result.failedExpectations.length != 0)
        if (!failed) {
          break
        }

        if (millisecondsBetweenRetries && i != retries - 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, millisecondsBetweenRetries)
          })
        }
      }

      if (exceptionCaught) {
        throw exceptionCaught
      }
      return returnValue
    }
    return spec
  }
  // returns the original message that Jasmine uses to identify pending specs
  typelessJasmine.Spec.pendingSpecExceptionMessage = '=> marked Pending'
  hasBeenSetAlready = true
}
