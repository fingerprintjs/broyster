import * as edge from 'selenium-webdriver/edge'
import { Arguments } from './arguments'
import * as chrome from 'selenium-webdriver/chrome'
import * as safari from 'selenium-webdriver/safari'
import * as firefox from 'selenium-webdriver/firefox'

export class OptionsBuilder {
  static create(browserName: string | undefined, rawArgs: string[] | undefined) {
    if (browserName) {
      const args = this.mapArguments(browserName, rawArgs ?? new Array<string>())
      switch (browserName.toLowerCase()) {
        case 'chrome': {
          const opts = new chrome.Options()
          opts.setAcceptInsecureCerts(true)
          for (const arg of args) {
            if (arg === Arguments.Headless) {
              opts.headless()
            } else {
              opts.addArguments(arg)
            }
          }
          return opts
        }
        case 'firefox': {
          const opts = new firefox.Options()
          opts.setAcceptInsecureCerts(true)
          for (const arg of args) {
            if (arg === Arguments.Headless) {
              opts.headless()
            } else {
              opts.addArguments(arg)
            }
          }
          return opts
        }
        case 'safari': {
          const opts = new safari.Options()
          opts.setAcceptInsecureCerts(true)
          // no args allowed?
          return opts
        }
        case 'edge': {
          const opts = new edge.Options()
          opts.setAcceptInsecureCerts(true)
          for (const arg of args) {
            if (arg === Arguments.Headless) {
              opts.headless()
            } else {
              opts.addArguments(arg)
            }
          }
          return opts
        }
      }
    }
    throw new Error(`Unknown or unsupported browser: ${browserName}`)
  }

  static createSafariArguments(args: string[]): string[] {
    return this.mapArguments('safari', args)
  }

  private static mapArguments(browserName: string, args: string[]) {
    const newArgs = new Array<string>()
    for (let arg of args) {
      arg = arg.split('-').join('').trim()
      switch (browserName.toLowerCase()) {
        case 'chrome': {
          const newArg = this.chromeArgs.get(arg)
          if (newArg) {
            newArgs.push(newArg)
          }
          continue
        }
        case 'firefox': {
          const newArg = this.firefoxArgs.get(arg)
          if (newArg) {
            newArgs.push(newArg)
          }
          continue
        }
        case 'safari':
          {
            const newArg = this.safariArgs.get(arg)
            if (newArg) {
              newArgs.push(newArg)
            }
          }
          continue
        case 'edge': {
          const newArg = this.edgeArgs.get(arg)
          if (newArg) {
            newArgs.push(newArg)
          }
          continue
        }
      }
    }
    return newArgs
  }

  private static chromeArgs = new Map<string, string>([
    [Arguments.MobileUserAgent, '-use-mobile-user-agent'],
    [Arguments.Incognito, '--incognito'],
    [Arguments.Headless, 'headless'],
  ])

  private static firefoxArgs = new Map<string, string>([
    [Arguments.MobileUserAgent, '-use-mobile-user-agent'],
    [Arguments.Incognito, '-private'],
    [Arguments.Headless, 'headless'],
  ])

  private static edgeArgs = new Map<string, string>([
    [Arguments.MobileUserAgent, '-use-mobile-user-agent'],
    [Arguments.Incognito, '--incognito'],
    [Arguments.Headless, 'headless'],
  ])

  private static safariArgs = new Map<string, string>([[Arguments.MobileUserAgent, '-use-mobile-user-agent']])
}
