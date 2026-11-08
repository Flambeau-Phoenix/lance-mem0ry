import { readFileSync } from 'node:fs'
import { createWorkspaceResolver, workspaceInstructions } from '../governance.js'

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const resolveWorkspace = createWorkspaceResolver()
  const status = await resolveWorkspace(input.cwd)
  const instructions = workspaceInstructions(status)
  if (instructions) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: instructions,
      },
    }))
  }
} catch {
  // A malformed hook input or unavailable resolver should leave the session usable.
}
