import z from '@deepseek-ai/schemastery'
import { expect, it } from 'vitest'
import { verifyProviderWrite } from '../src/client/provider-config.ts'

const path = ['providers', 'fixture']
const profile = {
  displayName: 'Fixture', apiKeyEnv: 'FIXTURE_KEY', api: 'openai-completions',
  baseURL: 'http://127.0.0.1:1234/v1', models: [{ id: 'model', name: 'Model' }],
}
const schema = z.object({ providers: z.dict(z.object({
  apiKeyEnv: z.string(), displayName: z.string(), api: z.string(), baseURL: z.string(),
  models: z.array(z.object({ id: z.string(), name: z.string(), input: z.array(z.string()) })),
  defaultContextWindow: z.number().default(262144), defaultInput: z.array(z.string()).default(['text']),
})) })
const ok = value => ({ result: { ok: true, value } })

function apiFor(userProfile, options = {}) {
  const user = userProfile === undefined ? undefined : { providers: { fixture: userProfile } }
  const value = options.resolved ?? schema(user ?? {})
  return {
    settings: { describe: async () => ok({ writable: true, hasDocument: true, namespaces: [{
      ns: 'llm-pi-ai', user, value, schema: schema.toJSON(), revision: 1, applies: 'live', secrets: [],
    }] }) },
    credentials: { describe: async () => ok({ credentials: { FIXTURE_KEY: { configured: options.credential !== false, writable: true } } }) },
    llm: {
      providers: async () => ok({ providers: [{ provider: 'fixture', settingsNs: 'llm-pi-ai', settingsPath: path, active: options.active !== false }] }),
      models: async () => ok({ groups: options.models === false ? [] : [{ id: 'fixture', models: [{ id: 'model' }] }], failures: [] }),
    },
  }
}
const request = ops => ({ provider: 'fixture', ns: 'llm-pi-ai', ops, credentialRef: 'FIXTURE_KEY', verifyRoute: true })

it('verifies a newly created raw profile despite schema defaults, nested defaults, and key normalization in the resolved view', async () => {
  const resolved = schema({ providers: { fixture: profile } }).providers.fixture
  expect(resolved).toMatchObject({ defaultContextWindow: 262144, defaultInput: ['text'], models: [{ input: [] }] })
  expect(JSON.stringify(resolved)).not.toBe(JSON.stringify(profile))
  expect(await verifyProviderWrite(apiFor(profile), request([{ op: 'set', path, value: profile }]))).toEqual({
    settings: 'confirmed', credential: 'confirmed', route: 'confirmed',
  })
})

it('ignores object key insertion order while requiring the full raw value', async () => {
  const reordered = Object.fromEntries(Object.entries(profile).reverse())
  reordered.models = [{ name: 'Model', id: 'model' }]
  expect(await verifyProviderWrite(apiFor(reordered), request([{ op: 'set', path, value: profile }]))).toMatchObject({ settings: 'confirmed' })
})

it('verifies an unset in the user layer even when a composition value remains resolved', async () => {
  const user = { ...profile }; delete user.displayName
  expect(await verifyProviderWrite(apiFor(user, { resolved: { providers: { fixture: profile } } }), request([
    { op: 'unset', path: [...path, 'displayName'] },
  ]))).toMatchObject({ settings: 'confirmed' })
})

it('does not mistake a matching resolved default for a missing user write', async () => {
  const user = { ...profile }; delete user.displayName
  expect(await verifyProviderWrite(apiFor(user, { resolved: { providers: { fixture: profile } } }), request([
    { op: 'set', path: [...path, 'displayName'], value: 'Fixture' },
  ]))).toMatchObject({ settings: 'mismatch' })
})

it.each([
  ['changed scalar', { ...profile, displayName: 'Different' }],
  ['extra key', { ...profile, unexpected: true }],
  ['extra array element', { ...profile, models: [{ id: 'second' }, ...profile.models] }],
  ['changed nested value', { ...profile, models: [{ id: 'model', name: 'Changed' }] }],
])('rejects actual raw mismatches: %s', async (_label, actual) => {
  expect(await verifyProviderWrite(apiFor(actual), request([{ op: 'set', path, value: profile }]))).toMatchObject({ settings: 'mismatch' })
})

it('rejects reordered arrays even when their length and elements are unchanged', async () => {
  const models = [...profile.models, { id: 'second', name: 'Second' }]
  expect(await verifyProviderWrite(apiFor({ ...profile, models: [...models].reverse() }), request([
    { op: 'set', path: [...path, 'models'], value: models },
  ]))).toMatchObject({ settings: 'mismatch' })
})

it('still rejects an unset that left the raw value present', async () => {
  expect(await verifyProviderWrite(apiFor(profile), request([{ op: 'unset', path }]))).toMatchObject({ settings: 'mismatch' })
})

it('keeps credential and loaded-route verification independent from a successful settings readback', async () => {
  expect(await verifyProviderWrite(apiFor(profile, { credential: false, active: false }), request([
    { op: 'set', path, value: profile },
  ]))).toEqual({ settings: 'confirmed', credential: 'mismatch', route: 'failed' })
})
