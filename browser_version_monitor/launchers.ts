export const Windows11_ChromeLatestBeta = {
  base: 'Selenium',
  platform: 'Windows',
  osVersion: '11',
  browserName: 'Chrome',
  browserVersion: 'latest-beta',
  useHttps: true,
}

export const Windows11_ChromeLatest = {
  base: 'Selenium',
  platform: 'Windows',
  osVersion: '11',
  browserName: 'Chrome',
  browserVersion: 'latest',
  useHttps: true,
}

export const Windows11_ChromeLatestBeta_Incognito = {
  base: 'Selenium',
  platform: 'Windows',
  osVersion: '11',
  browserName: 'Chrome',
  browserVersion: 'latest-beta',
  useHttps: true,
  flags: ['incognito'],
}

export const Windows11_ChromeLatest_Incognito = {
  base: 'Selenium',
  platform: 'Windows',
  osVersion: '11',
  browserName: 'Chrome',
  browserVersion: 'latest',
  useHttps: true,
  flags: ['incognito'],
}

export const OSX13_Safari16 = {
  base: 'Selenium',
  platform: 'OS X',
  osVersion: 'Ventura',
  browserName: 'Safari',
  browserVersion: '16',
  useHttps: false,
}
