import { expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { inject as runnerInject } from '../src/host/index.ts'
import z from '@deepseek-ai/schemastery'
import { readPrivacySnapshot } from '../src/host/privacy.ts'
import { TuiActions } from '../src/client/actions.ts'
import { tuiCommands } from '../src/client/capabilities.ts'
import { settingsFields, settingsCategoryFor } from '../src/client/settings.ts'
import { setUiLocale } from '../src/client/locale.ts'

it('reads privacy through the runner dependency declaration in a real Cordis plugin fiber', async () => {
  const ctx = new Context()
  for (const name of runnerInject) {
    const service = new Service(ctx, name)
    if (name === 'configEditor') service.configuration = () => []
    if (name === 'profileContext') service.name = 'isolated'
  }
  let snapshot
  try {
    await ctx.plugin({ inject: runnerInject, apply: context => { snapshot = readPrivacySnapshot(context) } })
    expect(snapshot).toEqual({ profile: 'isolated', entries: [] })
  } finally { await ctx.fiber.dispose() }
})

it('reads actual mounted policy by module and unique entry id, without exposing credentials/endpoints', () => {
  const entry = (id, name, config, state = 2) => ({ entry: { options: { id, name }, fiber: { state, config } } })
  const entries = [
    entry('second-log-instance', '@deepseek-ai/dsh-session-log-deepseek', { enabled: { get: () => false }, maxBytes: 8388608, secret: 'synthetic-secret', endpoint: 'https://synthetic.invalid' }),
    entry('feedback', '@deepseek-ai/dsh-session-telemetry-otel', { mode: 'FEEDBACK_ONLY', maxRequestBytes: 4000000 }),
    entry('future-mode', '@deepseek-ai/dsh-session-telemetry-otel', { mode: 'UNKNOWN' }),
    entry('inactive', '@deepseek-ai/dsh-session-log-deepseek', { enabled: true }, 0),
    entry('session-log-deepseek', 'unrelated-module', { enabled: true }),
  ]
  const snapshot = readPrivacySnapshot({ profileContext: { name: 'synthetic' }, configEditor: { configuration: () => entries } })
  expect(snapshot).toEqual({ profile: 'synthetic', entries: [
    { channel: 'session-log', entryId: 'second-log-instance', active: true, policy: 'disabled', maxBytes: 8388608 },
    { channel: 'feedback-otel', entryId: 'feedback', active: true, policy: 'feedback-only', maxBytes: 4000000 },
    { channel: 'feedback-otel', entryId: 'future-mode', active: true, policy: 'unknown' },
    { channel: 'session-log', entryId: 'inactive', active: false, policy: 'unknown' },
  ] })
  expect(JSON.stringify(snapshot)).not.toContain('synthetic-secret')
  expect(JSON.stringify(snapshot)).not.toContain('synthetic.invalid')
})
it.each(['privacy', 'settings'])('wires /%s to actual policy diagnostics without a fake OTel mutation', async command => {
  setUiLocale('en')
  const detail = vi.fn()
  const mutate = vi.fn()
  const snapshot = vi.fn(async () => ({ profile: 'fixture', entries: [{ channel: 'feedback-otel', entryId: 'otel-instance', active: true, policy: 'feedback-only' }] }))
  const host = { overlays: { detail }, notice: vi.fn(), refresh: vi.fn(), refreshHeader: vi.fn() }
  const actions = new TuiActions({ managementBridge: () => ({ privacy: { snapshot }, settings: { mutate } }) }, host)
  try {
    await actions.execute(command, command === 'settings' ? 'privacy' : '')
    expect(snapshot).toHaveBeenCalledOnce()
    expect(detail.mock.calls[0][0].content).toContain('Explicit feedback only')
    expect(detail.mock.calls[0][0].content).toContain('not an official live Settings field')
    expect(detail.mock.calls[0][0].content).toContain('Desktop product analytics')
    expect(mutate).not.toHaveBeenCalled()
  } finally { setUiLocale('zh') }
})
it('labels real editable log fields with their data semantics and preserves the effective boolean', () => {
  setUiLocale('en')
  try {
    const fields = settingsFields({ namespace: 'session-log-deepseek', schema: z.object({ enabled: z.boolean() }).toJSON(), value: { enabled: false }, revision: 1, applies: 'live', secrets: [] })
    expect(fields[0]).toMatchObject({ control: 'boolean', value: false })
    expect(fields[0].label).toContain('event bodies')
    expect(fields[0].description).toContain('uploaded or already prepared')
    expect(settingsCategoryFor('session-log-deepseek')).toBe('permissions')
    expect(tuiCommands().find(c => c.name === 'privacy').behavior).toBe('local')
  } finally { setUiLocale('zh') }
})
