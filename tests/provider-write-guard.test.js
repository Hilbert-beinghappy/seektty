import { expect, it, vi } from 'vitest'
import { saveProviderConfig } from '../src/client/provider-config.ts'

function fixture(afterSettings = () => {}) {
  const state = { ref: 'synthetic_ref', configured: false }
  const value = () => ({ ns: 'provider-instance', revision: 2, value: { providers: { route: { apiKeyEnv: state.ref } } } })
  const ok = value => ({ result: { ok: true, value } })
  const set = vi.fn(async () => ok({}))
  const api = { settings: {
    mutate: vi.fn(async () => { afterSettings(state); return ok(value()) }),
    describe: vi.fn(async () => ok({ namespaces: [value()] })),
  }, credentials: {
    describe: vi.fn(async () => ok({ credentials: { synthetic_ref: { configured: state.configured, writable: true } } })), set,
  } }
  const request = { ns: 'provider-instance', expectedRevision: 1, ops: [{ op: 'set', path: ['providers', 'route', 'apiKeyEnv'], value: 'synthetic_ref' }], credential: { ref: 'synthetic_ref', value: 'synthetic-value' }, credentialSettingsPath: ['providers', 'route', 'apiKeyEnv'], credentialMustBeUnconfigured: true }
  return { api, set, request }
}
it('rechecks the exact persisted credential target after Settings reconciliation', async () => {
  const f = fixture(state => { state.ref = 'different_ref' })
  expect(await saveProviderConfig(f.api, f.request)).toMatchObject({ ok: false, stage: 'credential', code: 'credential-target-changed', settingsCommitted: true })
  expect(f.set).not.toHaveBeenCalled()
})
it('does not overwrite a new Ref configured by another writer during Settings commit', async () => {
  const f = fixture(state => { state.configured = true })
  expect(await saveProviderConfig(f.api, f.request)).toMatchObject({ ok: false, code: 'credential-target-changed' })
  expect(f.set).not.toHaveBeenCalled()
})
it('performs one guarded key write when the target remains valid', async () => {
  const f = fixture()
  expect(await saveProviderConfig(f.api, f.request)).toMatchObject({ ok: true, credentialWritten: true })
  expect(f.set).toHaveBeenCalledExactlyOnceWith(f.request.credential)
})
it('an uncertain credential write is returned as unknown transport outcome and never retried by the writer', async () => {
  const f = fixture()
  f.set.mockRejectedValue(new Error('reply lost after commit'))
  expect(await saveProviderConfig(f.api, f.request)).toMatchObject({ ok: false, stage: 'credential', code: 'transport', settingsCommitted: true })
  expect(f.set).toHaveBeenCalledOnce()
})
