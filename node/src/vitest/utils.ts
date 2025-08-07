const TRUE_STRINGS = new Set(['1', 'true', 'yes', 'on'])

export function boolEnv(name: string, fallback?: boolean) {
  const rawValue = process.env[name]
  return rawValue == null ? fallback : TRUE_STRINGS.has(String(rawValue).toLowerCase())
}

export function strEnv(name: string, allowed: string[], fallback?: string) {
  const rawValue = process.env[name]
  return rawValue && allowed.includes(rawValue) ? rawValue : fallback
}

function abbrevSha(input?: string) {
  return input ? input.slice(0, 7) : undefined
}

export function envMeta(projectName: string) {
  const branch =
    process.env.GITHUB_REF_NAME ||
    process.env.BRANCH_NAME ||
    process.env.CI_COMMIT_BRANCH ||
    process.env.GIT_BRANCH ||
    undefined

  const commitSha = process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || process.env.COMMIT_SHA || undefined

  const buildNumber =
    process.env.GITHUB_RUN_NUMBER || process.env.BUILD_NUMBER || process.env.CI_PIPELINE_IID || undefined

  const isoDate = new Date().toISOString().slice(0, 10)
  const parts = [projectName, branch && `[${branch}]`, commitSha && `#${abbrevSha(commitSha)}`, isoDate].filter(Boolean)
  const buildName = parts.join(' ')

  const tags = [
    process.env.CI ? 'ci' : 'local',
    branch && `branch:${branch}`,
    commitSha && `sha:${abbrevSha(commitSha)}`,
  ].filter(Boolean) as string[]

  return { buildName, buildIdentifier: buildNumber, tags }
}
