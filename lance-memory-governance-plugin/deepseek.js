import { createWorkspaceResolver, workspaceInstructions } from './governance.js'

export const name = 'lance-memory-governance'
export const inject = ['systemPrompt', 'workingDirectory']

export function apply(ctx, config = {}) {
  const resolveWorkspace = createWorkspaceResolver(config)
  const instructions = new WeakMap()
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const directory = ctx.workingDirectory.get(agent.session)
    const status = await resolveWorkspace(directory)
    if (!signal.aborted) instructions.set(agent.session, { directory, text: workspaceInstructions(status) })
    return decision
  })
  ctx.systemPrompt.section({
    name,
    order: ctx.systemPrompt.getSectionOrder('MCP_SERVERS') + 1,
    interpolate: false,
    text({ agent }) {
      if (!agent) return ''
      const entry = instructions.get(agent.session)
      return entry && entry.directory === ctx.workingDirectory.get(agent.session) ? entry.text : ''
    },
  })
}
