import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { inject } from '../src/host/index.ts'
import { readSessionConversation, sessionExportSource } from '../src/host/session-export.ts'

// Only the production dependency declaration is needed; this test opens no terminal.
vi.mock('../src/client/index.ts', () => ({ startTui: vi.fn() }))
vi.mock('../src/host/management.ts', () => ({ createTuiManagementBridge: vi.fn() }))

it('resolves cold presenters from a real Cordis consumer using the runner dependency declaration', async () => {
  const ctx = new Context()
  const scope = { preset: 'standard' }
  const released = vi.fn()
  const standingKeyFor = vi.fn(async () => scope)
  const services = {
    agents: { get: () => undefined },
    agentPresets: { standingKeyFor },
    sessionQuery: { observeSession: async () => ({
      projections: { values: { agentPreset: 'standard' } }, [Symbol.dispose]: released,
    }) },
    sessionController: { inspect: async () => ({ meta: { id: 'cold' }, events: [] }) },
    tools: { get: () => undefined },
  }
  for (const name of new Set([...inject, ...Object.keys(services)])) {
    ctx.provide(name)
    ctx.set(name, services[name] ?? {})
  }
  const finished = Promise.withResolvers()
  try {
    ctx.plugin({
      name: 'native-cold-presenter-consumer',
      inject,
      apply(consumer) {
        readSessionConversation(sessionExportSource(consumer), 'cold', new AbortController().signal)
          .then(finished.resolve, finished.reject)
      },
    })
    await expect(finished.promise).resolves.toMatchObject({ producedFiles: [] })
    expect(standingKeyFor).toHaveBeenCalledWith('standard')
    expect(released).toHaveBeenCalledOnce()
  } finally {
    await ctx.fiber.dispose()
  }
})
