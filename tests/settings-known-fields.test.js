import { expect, it } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { SettingsForms } from '@deepseek-ai/dsh-settings'
import { Config as appearance } from '../src/host/settings/appearance.ts'
import { Config as behavior } from '../src/host/settings/behavior.ts'
import { Config as welcome } from '../src/host/settings/welcome.ts'
import { Config as composer } from '../src/host/settings/composer-history.ts'
import { Config as marketplace } from '../src/host/settings/marketplace.ts'
import { AppearanceSettingsSchema } from '../src/host/management.ts'

// Exercise the published SettingsForms writer with a synthetic ConfigEditor.
// No local replica of the projection/strip/merge/CAS implementation is used.
function forms(Config, initial) {
  let raw = initial
  let revision = 1
  const entry = { options: { id: 'fixture' }, fiber: { runtime: { Config } } }
  const service = Object.create(SettingsForms.prototype)
  service.ownerContext = { configEditor: {
    entries: () => [entry],
    edit: async (_entry, change) => { raw = change(raw, {}); revision++ },
  } }
  service.describe = () => [{ ns: 'fixture', revision }]
  return { service, raw: () => raw, changedElsewhere: () => revision++ }
}
it.each([['appearance', appearance], ['behavior', behavior], ['welcome', welcome], ['composer', composer], ['marketplace', marketplace]])('%s native replacement preserves unknown ordinary profile fields', async (_name, Config) => {
  const f = forms(Config, { legacy: { future: 'keep', keyRef: 'SYNTHETIC_REF' }, retiredPreference: 17 })
  await f.service.replace('fixture', {}, 1)
  expect(f.raw()).toEqual({ legacy: { future: 'keep', keyRef: 'SYNTHETIC_REF' }, retiredPreference: 17 })
  expect(Config.meta.volatile).not.toBe(true)
  expect(Object.values(Config.dict).every(child => child.meta.volatile)).toBe(true)
})
it('native field mutation preserves unknown config and refuses stale revisions', async () => {
  const f = forms(appearance, { theme: 'dark', oldFlag: true })
  await f.service.mutate('fixture', [{ op: 'set', path: ['theme'], value: 'light' }], 1)
  expect(f.raw()).toEqual({ theme: 'light', oldFlag: true })
  f.changedElsewhere()
  await expect(f.service.mutate('fixture', [{ op: 'set', path: ['theme'], value: 'dark' }], 2)).rejects.toMatchObject({ code: 'SETTINGS_CONFLICT' })
  expect(f.raw().theme).toBe('light')
})
it('ordinary unknown fields cannot be edited through the live form', async () => {
  const f = forms(appearance, { oldFlag: true })
  await expect(f.service.mutate('fixture', [{ op: 'set', path: ['oldFlag'], value: false }], 1)).rejects.toThrow('not volatile')
  expect(f.raw().oldFlag).toBe(true)
})
it('does not mutate the original configuration schema when deriving plugin fields', () => {
  expect(AppearanceSettingsSchema.meta.volatile).not.toBe(true)
  expect(AppearanceSettingsSchema.dict.theme.meta.volatile).not.toBe(true)
})
it('native behavior Config validates after a real JSON roundtrip without closure globals', () => {
  const wire = JSON.parse(JSON.stringify(behavior.toJSON()))
  expect(JSON.stringify(wire)).not.toContain('keyBindingsIssue')
  expect(JSON.stringify(wire)).not.toContain('sanitizeKeyBindings')
  const restored = new z(wire)
  expect(restored({}).keyBindings.get()).toEqual({})
  expect(restored({ keyBindings: { commandPalette: 'Ctrl+K' } }).keyBindings.get()).toEqual({ commandPalette: 'ctrl+k' })
  expect(() => restored({ keyBindings: { commandPalette: 'k' } })).toThrow(/printable|可打印/)
  expect(() => restored({ keyBindings: { commandPalette: 'ctrl+s' } })).toThrow(/sessions/)
})
