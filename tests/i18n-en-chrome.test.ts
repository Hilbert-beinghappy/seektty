import { afterEach, describe, expect, it } from 'vitest'
import { tuiCommands, shortFunctionDescription, capabilityError } from '../src/client/capabilities.ts'
import { ContextBar, StatusBar } from '../src/client/chrome.ts'
import { desktopNotifyBody } from '../src/client/desktop-notify.ts'
import { EMPTY_SESSION_EXAMPLES, emptyExampleText } from '../src/client/empty-examples.ts'
import { explainFailure, startupTimeoutError } from '../src/client/error-advice.ts'
import { helpSectionChoices, helpSectionText, type HelpSectionId } from '../src/client/help.ts'
import { jobKillNotice } from '../src/client/job-control.ts'
import { helpKeymapText } from '../src/client/keymap.ts'
import { setUiLocale, ui } from '../src/client/locale.ts'
import { relativeTime } from '../src/client/relative-time.ts'
import { settingsFields } from '../src/client/settings.ts'
import { BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { Transcript } from '../src/client/transcript.ts'
import { AppearanceSettingsSchema, BehaviorSettingsSchema } from '../src/host/management.ts'
import {
  DSH_COMPATIBILITY,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  launcherCopy,
  versionMessage,
} from '../src/dsh-compat.ts'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  TuiSettingsConflictError,
} from '../src/protocol.ts'

const HAN = /\p{Script=Han}/u

afterEach(() => { setUiLocale('zh') })

function appearanceDocument() {
  return {
    namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
    schema: AppearanceSettingsSchema.toJSON(),
    value: { theme: 'dark', codeTheme: 'auto', customThemes: [] },
    revision: 1,
    applies: 'live' as const,
    secrets: [],
  }
}

function behaviorDocument() {
  return {
    namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE,
    schema: BehaviorSettingsSchema.toJSON(),
    value: {},
    revision: 1,
    applies: 'live' as const,
    secrets: [],
  }
}

function renderChrome(): string {
  const now = Date.parse('2026-08-18T00:00:00.000Z')
  const sections: readonly HelpSectionId[] = ['keys', 'flows', 'doctor']
  return [
    ...helpSectionChoices().flatMap(choice => [choice.label, choice.description]),
    ...sections.map(helpSectionText),
    helpKeymapText(),
    ...EMPTY_SESSION_EXAMPLES.map(emptyExampleText),
    ...tuiCommands().flatMap(command => [command.description, command.argumentHint ?? '']),
    shortFunctionDescription('Run the linter on changed files. Extra detail.', 'Run command'),
    ui('切换权限', 'Switch permission'),
    ui('提交会话反馈', 'Submit session feedback'),
    ...settingsFields(appearanceDocument()).map(field => field.description ?? ''),
    ...settingsFields(behaviorDocument()).map(field => field.description ?? ''),
    BUILT_IN_THEMES.dark.name,
    BUILT_IN_THEMES.light.name,
    ui(`从 tui 移除 demo？`, 'Remove demo from tui?'),
    ui('插件中心', 'Plugin center'),
    capabilityError(new TuiSettingsConflictError('seektty-behavior', 3, 5)),
    relativeTime(now - 10_000, now),
    relativeTime(now - 60_000, now),
    relativeTime(now - 3_600_000, now),
    relativeTime(now - 86_400_000, now),
    jobKillNotice('requested'),
    jobKillNotice('already-finished'),
    desktopNotifyBody('turn-complete'),
    desktopNotifyBody('approval'),
    desktopNotifyBody('question'),
    explainFailure('transport failure for /api/foo: handler failure: boom'),
    explainFailure(startupTimeoutError('Reading workspace').message),
    launcherCopy('--profile 需要一个 Profile 名称', '--profile requires a Profile name', true),
    versionMessage({
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      compatibility: DSH_COMPATIBILITY,
    }, true),
  ].join('\n')
}

function englishChromeFrom(constructLocale: 'zh' | 'en'): string {
  setUiLocale(constructLocale)
  const transcript = new Transcript(() => 8)
  transcript.empty()
  const context = new ContextBar('tui', '/tmp/workspace')
  const status = new StatusBar()
  status.setPermission('workspace-write')
  const appearance = appearanceDocument()
  const behavior = behaviorDocument()
  const conflict = new TuiSettingsConflictError('seektty-behavior', 3, 5)
  const timeout = startupTimeoutError('Reading workspace')
  setUiLocale('en')
  transcript.refreshPresentation()
  return [
    renderChrome(),
    ...settingsFields(appearance).map(field => field.description ?? ''),
    ...settingsFields(behavior).map(field => field.description ?? ''),
    capabilityError(conflict),
    explainFailure(timeout.message),
    ...transcript.render(60),
    ...context.render(80),
    ...status.render(80),
  ].join('\n')
}

describe('i18n English chrome gate (task 7)', () => {
  it('detects Han outside the basic CJK block', () => {
    expect(HAN.test('\u3400')).toBe(true)
  })

  it('keeps renderable chrome, help, and launcher copy free of Chinese in en mode', () => {
    const rendered = englishChromeFrom('en')
    expect(rendered).not.toMatch(HAN)
    expect(rendered).toContain('Command palette')
    expect(rendered).toContain('New session')
    expect(rendered).toContain('Enter a message below')
    expect(rendered).toContain('The interface theme currently used by SeekTTY')
    expect(rendered).toContain('DeepSeek dark')
    expect(rendered).toContain('Run the linter on changed files')
    expect(rendered).toContain('Remove demo from tui?')
    expect(rendered).toContain('another surface')
    expect(rendered).toContain('Startup timed out')
    expect(rendered).toContain('Switch permission')
  })

  it('re-localizes chrome constructed in zh after switching to en, and the reverse', () => {
    const fromZh = englishChromeFrom('zh')
    expect(fromZh).not.toMatch(HAN)
    expect(fromZh).toContain('Startup timed out')
    expect(fromZh).toContain('DeepSeek dark')
    expect(fromZh).toContain('The interface theme currently used by SeekTTY')
    expect(fromZh).toContain('Remove demo from tui?')

    setUiLocale('en')
    const transcript = new Transcript(() => 8)
    transcript.empty()
    setUiLocale('zh')
    transcript.refreshPresentation()
    const renderedZh = [
      ...helpSectionChoices().map(choice => choice.label),
      BUILT_IN_THEMES.dark.name,
      ...tuiCommands().map(command => command.description),
      ...transcript.render(60),
    ].join('\n')
    expect(renderedZh).toMatch(HAN)
    expect(renderedZh).toContain('键位速查')
    expect(renderedZh).toContain('DeepSeek 暗色')
    expect(renderedZh).toContain('新建会话')
  })
})
