export interface KarmaConfig {
  browserStack: BrowserStackSection
}

export interface BrowserStackSection {
  build: string
  project: string
}
