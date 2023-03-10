import * as fs from 'fs'
import * as path from 'path'
import { Agent } from './agent'

export function drawRandom(): string {
  const agents: Agent[] = JSON.parse(fs.readFileSync('./fetch_agent/agent_versions.json', 'utf-8'))
  const desiredVersion = process.env.AGENT_VERSION
  let predicate: (a: Agent) => boolean
  if (!desiredVersion) {
    const versions = agents.map((agent) => agent.version.split('.'))
    const majorVersions = versions.map((version) => parseInt(version[0]))
    const majorVersionToGet = Math.floor(
      Math.random() * (Math.max(...majorVersions) - Math.min(...majorVersions) + 1) + Math.min(...majorVersions),
    )
    const minorVersions = agents
      .map((agent) => agent.version)
      .filter((version) => version.startsWith(majorVersionToGet.toString()))
      .map((version) => parseInt(version.split('.')[1]))
    const minorVersionToGet = Math.floor(
      Math.random() * (Math.max(...minorVersions) - Math.min(...minorVersions) + 1) + Math.min(...minorVersions),
    )
    predicate = (agent) => agent.version.startsWith(`${majorVersionToGet}.${minorVersionToGet}`)
  } else {
    predicate = (agent) => agent.version === desiredVersion
  }
  const versions = agents.filter(predicate)
  const versionToGet = versions.at(Math.floor(Math.random() * (Math.max(versions.length) - 1) + 0)) ?? versions[0]
  fs.writeFileSync(path.join('./resources', 'version.v'), versionToGet.version)
  return versionToGet.version
}
