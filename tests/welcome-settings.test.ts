import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TUI_WELCOME,
  TUI_WELCOME_SETTINGS_NAMESPACE,
  type TuiSettingsDocument,
} from '../src/protocol.ts'
import { WelcomeSettingsSchema } from '../src/host/management.ts'
import {
  defaultWelcomeSettings,
  normalizeWelcome,
  prepareWelcomeSettings,
  saveWelcomeSettings,
  welcomeFromSettings,
  welcomeSettings,
} from '../src/client/welcome-settings.ts'

function document(value: unknown, revision = 1): TuiSettingsDocument {
  return {
    namespace: TUI_WELCOME_SETTINGS_NAMESPACE,
    schema: {},
    value,
    revision,
    applies: 'live',
    secrets: [],
  }
}

describe('welcome settings', () => {
  it('defaults legacy Profiles to the custom runtime presentation', () => {
    const parsed = WelcomeSettingsSchema({})
    expect(parsed.infoMode).toBe('custom')
    expect(parsed.mixedOrder).toBe('custom-first')
    expect(parsed.logo).toMatchObject({ source: 'builtin', colorMode: 'original' })
    expect(parsed.fastfetch.modules).toEqual(DEFAULT_TUI_WELCOME.fastfetch.modules)
    expect(parsed.customRows).toHaveLength(DEFAULT_TUI_WELCOME.customRows.length)
  })

  it('rejects invalid enum values and unsafe Fastfetch modules in the Host schema', () => {
    // @ts-expect-error persisted external Settings may contain invalid values
    expect(() => WelcomeSettingsSchema({ infoMode: 'native' })).toThrow()
    // @ts-expect-error persisted external Settings may contain unsafe modules
    expect(() => WelcomeSettingsSchema({ fastfetch: { modules: ['command'] } })).toThrow()
    expect(() => WelcomeSettingsSchema({ customRows: [{ kind: 'text', text: 'x'.repeat(513) }] })).toThrow()
    expect(WelcomeSettingsSchema({ logo: { source: 'fastfetch' } }).logo.source).toBe('fastfetch')
  })

  it('normalizes partial external values and removes terminal controls', () => {
    const value = normalizeWelcome({
      infoMode: 'mixed',
      customRows: [
        { kind: 'heading', text: 'Hi\u001b[2J' },
        { kind: 'fact', fact: 'workspace', label: 'Repo' },
        { kind: 'fact', fact: 'unknown' },
      ],
      fastfetch: { source: 'safe', modules: ['os', 'command', 'os'] },
    })
    expect(value.infoMode).toBe('mixed')
    expect(value.customRows).toEqual([
      { kind: 'heading', text: 'Hi' },
      { kind: 'fact', fact: 'workspace', label: 'Repo' },
    ])
    expect(value.fastfetch.modules).toEqual(['os'])
  })

  it('finds and reads the registered document', () => {
    const found = welcomeSettings([document({})])
    expect(welcomeFromSettings(found)).toEqual(defaultWelcomeSettings())
    expect(() => welcomeSettings([])).toThrow(/seektty-welcome/u)
  })

  it('persists the complete draft under one revision', async () => {
    const calls: unknown[][] = []
    const next = document(DEFAULT_TUI_WELCOME, 2)
    const settings = {
      mutate: async (...args: unknown[]) => {
        calls.push(args)
        return next
      },
    }
    const saved = await saveWelcomeSettings(
      settings as never,
      document({}, 1),
      { ...defaultWelcomeSettings(), infoMode: 'fastfetch' },
    )
    expect(saved.revision).toBe(2)
    expect(calls[0]?.[0]).toBe(TUI_WELCOME_SETTINGS_NAMESPACE)
    expect(calls[0]?.[2]).toBe(1)
    expect(calls[0]?.[1]).toHaveLength(5)
  })

  it('validates and normalizes external Logo and Fastfetch config paths before saving', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'seektty-welcome-settings-'))
    await writeFile(join(directory, 'large.txt'), '$[1]SeekTTY', 'utf8')
    await writeFile(join(directory, 'compact.txt'), '$[2]ST', 'utf8')
    await writeFile(join(directory, 'fastfetch.jsonc'), '{}', 'utf8')
    const prepared = await prepareWelcomeSettings({
      ...defaultWelcomeSettings(),
      logo: { source: 'file', colorMode: 'theme', largePath: 'large.txt', compactPath: 'compact.txt' },
      fastfetch: { source: 'user-config', modules: ['os'], configPath: 'fastfetch.jsonc' },
    }, directory)
    expect(isAbsolute(prepared.logo.largePath)).toBe(true)
    expect(isAbsolute(prepared.logo.compactPath)).toBe(true)
    expect(isAbsolute(prepared.fastfetch.configPath)).toBe(true)
    const logoPrepared = await prepareWelcomeSettings({
      ...defaultWelcomeSettings(),
      logo: { ...defaultWelcomeSettings().logo, source: 'fastfetch' },
      fastfetch: { source: 'safe', modules: ['os'], configPath: 'fastfetch.jsonc' },
    }, directory)
    expect(isAbsolute(logoPrepared.fastfetch.configPath)).toBe(true)
    await expect(prepareWelcomeSettings({
      ...prepared,
      logo: { ...prepared.logo, largePath: 'missing.txt' },
    }, directory)).rejects.toThrow()
  })
})
