/** Unmodified published rc.2 plugin and approval service. Inert Session + LLM seams;
 * no files, credentials, network or execution of the requested tool body.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function officialAutoReviewFixture(stockNodeModules, interactions) {
  const require = createRequire(join(stockNodeModules, '..', 'seektty-auto-review-fixture.cjs'))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const [{ Context }, { apply }, { ApprovalService, setApprovalPolicy }, { createScope, scopeTarget }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-experimental-auto-review'),
    load('@deepseek-ai/dsh-user-approval'), load('@deepseek-ai/dsh-scope'),
  ])
  const ctx = new Context()
  try {
    const approval = new ApprovalService(ctx, { policy: 'ask' })
    let stream = async function* () {
      yield { type: 'text-delta', index: 0, text: '{"risk":"high","decision":"deny","reason":"fixture reason 原文"}' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const reviews = []
    ctx.provide('llm', { stream: options => { reviews.push(options); return stream(options) } })
    const agents = []
    let registered = false
    ctx.provide('permissionPresets', {
      current: session => session.preset,
      set: (session, value) => { session.preset = value },
      registerAuto: () => { registered = true; return () => { registered = false } },
    })
    ctx.provide('sessions', { list: () => agents.map(agent => agent.session) })
    const agent = (id, preset = 'auto') => {
      const events = [
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'step/start', data: { turn: 1, step: 1 } },
        { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [
          { type: 'tool-call', id: 'call', name: 'fixture_action', arguments: '{}' },
        ] } } },
        { type: 'tool/call', data: { turn: 1, step: 1, callId: 'call', name: 'fixture_action', arguments: '{}' } },
      ].map((event, seq) => ({ ...event, seq }))
      const session = { preset, header: { cwd: '/synthetic-workspace', origin: 'user' },
        surface: { nodes: [2] }, get seq() { return events.length }, eventAt: seq => events[seq],
        snapshotEvents: () => [...events], append: (type, data) => events.push({ seq: events.length, type, data }),
        requestHeader: () => ({ config: { provider: 'inert-fixture', model: 'inert-fixture' }, tools: [
          { name: 'fixture_action', description: 'Never executed', parameters: { type: 'object', properties: {} } },
        ] }),
      }
      const value = { id, session, events }
      value.ctx = createScope(ctx, value).ctx
      agents.push(value)
      return value
    }
    const primary = agent('auto-primary'), foreign = agent('auto-foreign')
    ctx.on('approval/request', (request, next) => interactions.approval(request, next))
    apply(ctx)
    await new Promise(resolve => setTimeout(resolve, 0))
    return { primary, foreign, approval, reviews, get registered() { return registered },
      setStream: value => { stream = value }, policy: (agent, value) => setApprovalPolicy(agent.session, value),
      review: (agent = primary, signal = new AbortController().signal) => ctx.waterfall(scopeTarget(agent, agent), 'tools/pre-execute',
        { agent, name: 'fixture_action', callId: 'call', rootCallId: 'call', arguments: {}, signal }, async () => ({ kind: 'allow' })),
      dispose: () => ctx.fiber.dispose(),
    }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
