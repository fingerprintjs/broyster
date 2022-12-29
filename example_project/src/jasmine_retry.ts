// eslint-disable-next-line @typescript-eslint/no-var-requires
const jasmine = require('jasmine')

export function retryFailedTests(retries: number, millisecondsBetweenRetries: number) {
  const originalSpecConstructor = jasmine.Spec
  jasmine.Spec = function (attrs: unknown) {
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
            setTimeout(resolve, 100)
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
}
