import { spawn, SpawnOptions } from 'child_process'

export function runCommand(command: string, options: SpawnOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [], { shell: true, ...options })
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code) {
        reject(new Error(`The ${command} command has exited with code ${code}`))
      } else {
        resolve()
      }
    })
  })
}
