import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { bindProject } from './bindings.js'
import { apply as deepseek } from './deepseek.js'
import { createWorkspaceResolver, workspaceInstructions } from './governance.js'
import opencode from './opencode.js'

function fixture(t) {
  const base = realpathSync(import.meta.dirname)
  const scratch = mkdtempSync(join(base, '.test-'))
  t.after(() => {
    const target = realpathSync(scratch)
    assert.equal(dirname(target), base)
    rmSync(target, { recursive: true })
  })
  const root = join(scratch, 'repo')
  const child = join(root, 'src')
  const nested = join(root, 'nested')
  const other = join(scratch, 'repo-other')
  for (const directory of [child, nested, other]) mkdirSync(directory, { recursive: true })
  mkdirSync(join(root, '.git'))
  writeFileSync(join(nested, '.git'), 'gitdir: elsewhere\n')
  const file = join(scratch, 'projects.json')
  bindProject(file, root, 'example')
  return { root, child, nested, other, file }
}

const inventory = (projects) => async () => Response.json(projects)
const panel = 'https://memory.example.test/'

test('binding is explicit, idempotent, and stops at unrelated Git worktrees', async (t) => {
  const { root, child, nested, other, file } = fixture(t)
  assert.equal(bindProject(file, root, 'example'), root)
  assert.throws(() => bindProject(file, root, 'another-project'), /already bound/)
  assert.equal(existsSync(`${file}.lock`), false)
  assert.throws(() => bindProject(file, other, 'bad\nID'), /canonical project ID/)
  const lookup = createWorkspaceResolver({ bindings: file, panel, request: inventory([]) })
  assert.equal((await lookup(child)).projectId, 'example')
  assert.equal((await lookup(nested)).status, 'unlinked')
  assert.equal((await lookup(other)).status, 'unlinked')
  bindProject(file, nested, 'nested-project')
  assert.equal((await lookup(nested)).projectId, 'nested-project')
})

test('auto-discovery matches exact folder hints and distinguishes ambiguous and offline', async (t) => {
  const { child, root, nested, other, file } = fixture(t)
  let requests = 0
  const resolve = createWorkspaceResolver({
    bindings: file,
    panel,
    request: async (url) => {
      requests++
      assert.equal(url.pathname, '/api/projects')
      assert.equal(url.search, '')
      return Response.json([
        { id: 'panel-parent', workspace_hints: [root] },
        { id: 'panel-one', folder_path: other },
        { id: 'panel-two', workspace_hints: [other] },
      ])
    },
  })
  assert.equal((await resolve(child)).projectId, 'example')
  assert.equal(requests, 0)
  const [ambiguous, unlinked] = await Promise.all([resolve(other), resolve(nested)])
  assert.equal(requests, 1)
  assert.equal(ambiguous.status, 'ambiguous')
  assert.deepEqual(ambiguous.candidates, ['panel-one', 'panel-two'])
  assert.match(workspaceInstructions(ambiguous), /choose a binding/)
  assert.equal(unlinked.status, 'unlinked')
  assert.match(workspaceInstructions(unlinked), /link an existing partition or create/)
  const linked = await createWorkspaceResolver({ bindings: file, panel, request: inventory([{ id: 'known', folder_path: other }]) })(other)
  assert.deepEqual(linked, { status: 'linked', projectId: 'known', source: 'panel' })
  const unavailable = await createWorkspaceResolver({ bindings: file, panel, request: async () => new Response('', { status: 503 }) })(other)
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(workspaceInstructions(unavailable), '')
})

test('OpenCode adds one system instruction only for a bound session with memory tools', async (t) => {
  const { child, other, file } = fixture(t)
  let contextHook
  let disposed = false
  let reads = 0
  const dispose = await opencode.setup({
    options: { bindings: file, panel, request: inventory([]) },
    session: {
      async get({ sessionID }) {
        reads++
        return { directory: sessionID === 'bound' ? child : other }
      },
      async hook(kind, hook) {
        assert.equal(kind, 'context')
        contextHook = hook
        return { dispose: () => { disposed = true } }
      },
    },
  })
  const system = [{ type: 'text', text: 'Existing instructions' }]
  const tools = { 'project-memory_recall': {}, 'project-memory_commit_memory': {}, 'project-memory_inspect_memory_system': {} }
  await contextHook({ sessionID: 'bound', tools: {}, system })
  assert.equal(reads, 0)
  const unbound = []
  await contextHook({ sessionID: 'unbound', tools, system: unbound })
  assert.match(unbound[0].text, /no partition linked/)
  const event = { sessionID: 'bound', tools, system, messages: [] }
  await contextHook(event)
  await contextHook(event)
  assert.equal(system.length, 2)
  assert.match(system[1].text, /project_id: "example"/)
  assert.deepEqual(event.messages, [])
  await dispose()
  assert.equal(disposed, true)
})

test('DeepSeek resolves governance from each session working directory', async (t) => {
  const { child, nested, file } = fixture(t)
  let section
  let preStep
  deepseek({
    on(kind, callback) {
      assert.equal(kind, 'agent/pre-step')
      preStep = callback
    },
    systemPrompt: {
      getSectionOrder: () => 3100,
      section: (value) => { section = value },
    },
    workingDirectory: { get: (session) => session.directory },
  }, { bindings: file, panel, request: inventory([]) })
  const agent = { session: { directory: child } }
  const signal = new AbortController().signal
  const decision = { kind: 'enter', messages: [] }
  assert.equal(section.interpolate, false)
  assert.equal(await preStep({ agent, signal }, async () => decision), decision)
  assert.match(section.text({ agent }), /project_id: "example"/)
  agent.session.directory = nested
  assert.equal(section.text({ agent }), '')
  await preStep({ agent, signal }, async () => decision)
  assert.match(section.text({ agent }), /no partition linked/)
  assert.equal(section.text({}), '')
})

test('Codex hook emits scoped SessionStart context for a bound checkout', (t) => {
  const { child, file } = fixture(t)
  const packageRoot = import.meta.dirname
  const hooks = JSON.parse(readFileSync(join(packageRoot, 'hooks', 'hooks.json'), 'utf8'))
  const { command } = hooks.hooks.SessionStart[0].hooks[0]
  const result = spawnSync(command, {
    shell: true,
    cwd: child,
    encoding: 'utf8',
    input: JSON.stringify({ cwd: child, source: 'startup' }),
    env: { ...process.env, PLUGIN_ROOT: packageRoot, LANCE_MEMORY_CONFIG_DIR: dirname(file) },
  })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout).hookSpecificOutput
  assert.equal(output.hookEventName, 'SessionStart')
  assert.match(output.additionalContext, /project_id: "example"/)
})
