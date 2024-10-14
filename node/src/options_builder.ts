import * as webdriver from 'selenium-webdriver'
import * as edge from 'selenium-webdriver/edge'
import * as chrome from 'selenium-webdriver/chrome'
import * as safari from 'selenium-webdriver/safari'
import * as firefox from 'selenium-webdriver/firefox'
import { Arguments } from './arguments'

export class OptionsBuilder {
  static create(browserName: string | undefined, rawArgs: string[] = []) {
    const args = this.mapArguments(browserName, rawArgs)
    let opts: webdriver.Capabilities

    switch ((browserName || '').toLowerCase()) {
      case 'chrome':
      case 'samsung':
        opts = new chrome.Options().addArguments(...args)
        break
      case 'firefox':
        opts = new firefox.Options().addArguments(...args)
        break
      case 'safari': {
        // no args allowed?
        opts = new safari.Options()
        break
      }
      case 'edge': {
        opts = new edge.Options().addArguments(...args)
        break
      }
      default:
        throw new Error(`Unknown or unsupported browser: ${JSON.stringify(browserName)}`)
    }

    return opts.setAcceptInsecureCerts(true)
  }

  static createSafariArguments(args: string[]): string[] {
    return this.mapArguments('safari', args)
  }

  private static mapArguments(browserName: string | undefined, args: string[]) {
    let argMap: Record<string, string> = {}

    switch ((browserName || '').toLowerCase()) {
      case 'chrome':
      case 'edge':
      case 'samsung':
        argMap = chromiumArgs
        break
      case 'firefox':
        argMap = firefoxArgs
        break
      case 'safari':
        argMap = safariArgs
    }

    return args.map((arg) => {
      const canonicalArg = arg.split('-').join('').trim()
      return argMap[canonicalArg] ?? arg
    })
  }
}

type ArgumentMap = Partial<Record<Arguments, string>>

const chromiumArgs: ArgumentMap = {
  [Arguments.MobileUserAgent]: '-use-mobile-user-agent',
  [Arguments.Incognito]: '--incognito',
  [Arguments.Headless]: 'headless',
}

const firefoxArgs: ArgumentMap = {
  [Arguments.MobileUserAgent]: '-use-mobile-user-agent',
  [Arguments.Incognito]: '-private',
  [Arguments.Headless]: '-headless',
}

const safariArgs: ArgumentMap = {
  [Arguments.MobileUserAgent]: '-use-mobile-user-agent',
}
