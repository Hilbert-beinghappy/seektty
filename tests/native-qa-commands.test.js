import { Context } from '@deepseek-ai/cordis'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-commands/remote'
import { expect, it, vi } from 'vitest'
import { apply as installRegistry } from '../vendor/typert-registry/client/index.js'
import { apply as installGateway } from '../vendor/api-gateway/client/index.js'
import { Session } from '../vendor/client-runtime/client/sessions/session.js'

it.each(['/plan', '/goal', '/compact', '/feedback state QA'])('submits native %s through the real generated Client Remote contract', async line => {
  const ctx = new Context()
  installRegistry(ctx)
  const call = vi.fn(async () => ({ ok: true, value: { commandId: 'qa-command', result: { kind: 'success' } } }))
  ctx.provide('connection')
  ctx.set('connection', { rpc: { call } })
  installGateway(ctx)
  try {
    await ctx.remote.$mount(TYPERT_REMOTE)
    const session = new Session('state-qa', {}, ctx.remote)
    await expect(session.command(line)).resolves.toEqual({ ok: true, value: { matched: true } })
    expect(call).toHaveBeenCalledExactlyOnceWith('/api', 'commands/execute', {
      args: { agentId: 'state-qa', line, submittedAttachments: [] },
    }, expect.any(AbortSignal))
  } finally {
    await ctx.fiber.dispose()
  }
})
