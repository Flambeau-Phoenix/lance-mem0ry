import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { bindProject } from './bindings.js'
import { configuredPanel, createWorkspaceResolver, defaultBindings, workspaceInstructions } from './governance.js'

const panel = configuredPanel()
const usage = 'Usage: npm run project -- [project-directory canonical-project-id | --check [project-directory]]'
const cwd = process.env.INIT_CWD || process.cwd()
const resolveWorkspace = createWorkspaceResolver({ panel })

try {
  let [directory, id, extra] = process.argv.slice(2)
  if (directory === '--help' || directory === '-h') {
    console.log(usage)
    console.log(panel ? `Lance Memory panel ${panel}` : 'Set the panel address in your Lance Memory settings or LANCE_MEMORY_PANEL_URL.')
  } else if (directory === '--check' && !extra) {
    const status = await resolveWorkspace(resolve(cwd, id || '.'))
    console.log(JSON.stringify({ ...status, instructions: workspaceInstructions(status) }, null, 2))
  } else {
    if (extra || (directory && !id)) throw new Error(usage)
    if (!directory) {
      if (!stdin.isTTY) throw new Error(usage)
      const prompt = createInterface({ input: stdin, output: stdout })
      try {
        directory = (await prompt.question(`Project checkout folder [${cwd}] `)).trim() || cwd
        const path = resolve(cwd, directory)
        const status = await resolveWorkspace(path)
        if (status.status === 'linked') {
          console.log(`${path} already resolves to ${status.projectId} (${status.source}).`)
        } else {
          if (status.status === 'ambiguous') console.log(`Matching IDs: ${status.candidates.join(', ')}`)
          if (status.status === 'unavailable') console.log('Could not check the project inventory.')
          console.log(`Open ${panel || 'your Lance Memory panel'} to select an existing partition or choose + New Project Partition.`)
          console.log(`For a new partition, enter its name and use ${path} as the folder hint.`)
          id = (await prompt.question('Canonical project ID from the panel ')).trim()
        }
      } finally {
        prompt.close()
      }
    }
    if (id !== undefined) {
      mkdirSync(dirname(defaultBindings), { recursive: true })
      const root = bindProject(defaultBindings, resolve(cwd, directory), id)
      console.log(`Bound ${root} to ${id} in ${defaultBindings}.`)
      console.log('Both adapters will pick up the binding on their next request.')
    }
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
