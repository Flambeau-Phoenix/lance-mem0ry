import { createWorkspaceResolver, workspaceInstructions } from './governance.js'

export default {
  id: 'lance-memory-governance',
  async setup(ctx) {
    const resolveWorkspace = createWorkspaceResolver(ctx.options)
    const registration = await ctx.session.hook('context', async (event) => {
      const names = Object.keys(event.tools)
      const hasMemory = names.some((name) => {
        if (name !== 'recall' && !name.endsWith('_recall')) return false
        const prefix = name.slice(0, -'recall'.length)
        return names.includes(`${prefix}commit_memory`) && names.includes(`${prefix}inspect_memory_system`)
      })
      if (!hasMemory) return

      let session
      try {
        session = await ctx.session.get({ sessionID: event.sessionID })
      } catch {
        return
      }
      const text = workspaceInstructions(await resolveWorkspace(session?.directory))
      if (text && !event.system.some((part) => part.type === 'text' && part.text === text)) {
        event.system.push({ type: 'text', text })
      }
    })
    return () => registration.dispose()
  },
}
