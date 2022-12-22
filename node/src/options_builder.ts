import * as edge from 'selenium-webdriver/edge'
import { Arguments } from './arguments'
import * as chrome from 'selenium-webdriver/chrome'
import * as safari from 'selenium-webdriver/safari'
import * as firefox from 'selenium-webdriver/firefox'
import * as ie from 'selenium-webdriver/ie'

export class OptionsBuilder {
  static create(browserName: string, rawArgs: string[]) {
    const args = this.mapArguments(browserName, rawArgs ?? new Array<string>())
    switch (browserName.toLowerCase()) {
      case 'chrome': {
        const opts = new chrome.Options()
        opts.setAcceptInsecureCerts(true)
        for (const arg of args.filter((arg) => arg !== Arguments.Headless)) {
          opts.addArguments(arg)
        }
        if (args.some((arg) => arg === Arguments.Headless)) {
          opts.headless()
        }
        return opts
      }
      case 'firefox': {
        const opts = new firefox.Options()
        opts.setAcceptInsecureCerts(true)
        for (const arg of args.filter((arg) => arg !== Arguments.Headless)) {
          opts.addArguments(arg)
        }
        if (args.some((arg) => arg === Arguments.Headless)) {
          opts.headless()
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
        for (const arg of args.filter((arg) => arg !== Arguments.Headless)) {
          opts.addArguments(arg)
        }
        if (args.some((arg) => arg === Arguments.Headless)) {
          opts.headless()
        }
        return opts
      }
      case 'ie': {
        const opts = new ie.Options()
        opts.setAcceptInsecureCerts(true)
        for (const arg of args.filter((arg) => arg !== Arguments.Headless)) {
          opts.addArguments(arg)
        }
        return opts
      }
    }
    throw new Error(`Unknown browser: ${browserName}`)
  }

  private static mapArguments(browserName: string, args: string[]) {
    const newArgs = new Array<string>()
    for (const arg of args) {
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
    [Arguments.Incognito, '--incognito'],
    [Arguments.Headless, 'headless'],
  ])

  private static firefoxArgs = new Map<string, string>([
    [Arguments.Incognito, '-private'],
    [Arguments.Headless, 'headless'],
  ])

  private static edgeArgs = new Map<string, string>([
    [Arguments.Incognito, '--incognito'],
    [Arguments.Headless, 'headless'],
  ])
}
