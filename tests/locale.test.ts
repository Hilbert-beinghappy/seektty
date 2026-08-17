import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOCALE_PREFERENCE_FIELD,
  LOCALE_SETTINGS_NAMESPACE,
  type LocaleSettings,
} from '@deepseek-ai/dsh-client-locale'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import {
  languageSelection,
  localeFromEnvironment,
  localeFromSettings,
  saveLanguage,
  setUiLocale,
  translateUiText,
  ui,
  uiLocale,
} from '../src/client/locale.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import type {
  TuiManagementBridge,
  TuiSettingsDocument,
  TuiSettingsPathOp,
} from '../src/protocol.ts'

function document(value: LocaleSettings, revision = 0): TuiSettingsDocument {
  return {
    namespace: LOCALE_SETTINGS_NAMESPACE,
    schema: {},
    value,
    revision,
    applies: 'live',
    secrets: [],
  }
}

afterEach(() => { setUiLocale('zh') })

describe('terminal locale preference', () => {
  it('uses the explicit Harness preference before terminal locale variables', () => {
    expect(localeFromSettings([document({ preference: 'en' })], {
      LC_ALL: 'zh_CN.UTF-8',
    })).toBe('en')
    expect(localeFromSettings([document({ preference: 'zh' })], {
      LC_ALL: 'en_US.UTF-8',
    })).toBe('zh')
  })

  it('derives an automatic choice from POSIX locale priority and falls back to Chinese', () => {
    const automatic = document({})
    expect(languageSelection(automatic)).toBe('auto')
    expect(localeFromSettings([automatic], {
      LC_ALL: 'en_GB.UTF-8',
      LANG: 'zh_CN.UTF-8',
    })).toBe('en')
    expect(localeFromSettings([automatic], {
      LC_MESSAGES: 'zh_TW.UTF-8',
      LANG: 'en_US.UTF-8',
    })).toBe('zh')
    expect(localeFromSettings([automatic], { LANG: 'C.UTF-8' })).toBe('zh')
    expect(localeFromEnvironment({ LANGUAGE: 'en_GB:zh_CN', LANG: 'zh_CN.UTF-8' })).toBe('en')
  })

  it('persists explicit and automatic choices through revision-protected Harness mutations', async () => {
    const mutate = vi.fn(async (
      _namespace: string,
      ops: readonly TuiSettingsPathOp[],
      _expectedRevision: number,
    ) => document(
      ops[0]?.op === 'set' ? { preference: ops[0].value as 'en' } : {},
      2,
    ))
    const settings = { mutate } as unknown as TuiManagementBridge['settings']

    await expect(saveLanguage(settings, document({}, 1), 'en')).resolves.toMatchObject({ locale: 'en' })
    expect(mutate).toHaveBeenLastCalledWith(
      LOCALE_SETTINGS_NAMESPACE,
      [{ op: 'set', path: [LOCALE_PREFERENCE_FIELD], value: 'en' }],
      1,
    )

    await expect(saveLanguage(settings, document({ preference: 'en' }, 1), 'auto', {
      LANG: 'en_US.UTF-8',
    })).resolves.toMatchObject({ locale: 'en' })
    expect(mutate).toHaveBeenLastCalledWith(
      LOCALE_SETTINGS_NAMESPACE,
      [{ op: 'unset', path: [LOCALE_PREFERENCE_FIELD] }],
      1,
    )
  })

  it('switches authored and catalog-backed terminal copy without changing unknown content', () => {
    expect(uiLocale()).toBe('zh')
    expect(ui('设置', 'Settings')).toBe('设置')
    expect(setUiLocale('en')).toBe(true)
    expect(ui('设置', 'Settings')).toBe('Settings')
    expect(translateUiText('命令面板')).toBe('Command palette')
    expect(translateUiText('队列 3')).toBe('Queue 3')
    expect(translateUiText('插件 · 立即生效')).toBe('插件 · applies immediately')
    expect(translateUiText('命令 /new 被 TUI 内置命令遮蔽')).toBe('Command /new is shadowed by a TUI builtin')
    expect(translateUiText('provider-authored 中文说明')).toBe('provider-authored 中文说明')
  })

  it('implements /language en as one shared Settings write and live surface update', async () => {
    let current = document({}, 4)
    const mutate = vi.fn(async (
      _namespace: string,
      ops: readonly TuiSettingsPathOp[],
      expectedRevision: number,
    ) => {
      expect(expectedRevision).toBe(current.revision)
      current = document(
        ops[0]?.op === 'set' ? { preference: ops[0].value as 'en' } : {},
        current.revision + 1,
      )
      return current
    })
    const settings = {
      describe: vi.fn(async () => [current]),
      mutate,
    } as unknown as TuiManagementBridge['settings']
    const management = { settings } as unknown as TuiManagementBridge
    const capabilities = {
      managementBridge: () => management,
      active: () => undefined,
    } as unknown as HarnessTuiCapabilities
    const applyLocale = vi.fn((locale: 'zh' | 'en') => { setUiLocale(locale) })
    const host: TuiActionHost = {
      overlays: {} as OverlayQueue,
      transcript: {} as Transcript,
      notice: vi.fn(),
      refresh: vi.fn(),
      refreshHeader: vi.fn(),
      applyTheme: vi.fn(),
      applyLocale,
      setEditor: vi.fn(),
      copy: vi.fn(),
      close: vi.fn(),
      restart: vi.fn(),
      requireRestart: vi.fn(),
    }

    await new TuiActions(capabilities, host).execute('language', 'en')

    expect(mutate).toHaveBeenCalledWith(
      LOCALE_SETTINGS_NAMESPACE,
      [{ op: 'set', path: [LOCALE_PREFERENCE_FIELD], value: 'en' }],
      4,
    )
    expect(applyLocale).toHaveBeenCalledWith('en')
    expect(host.notice).toHaveBeenCalledWith('Interface language changed to English', 'success')
  })
})
