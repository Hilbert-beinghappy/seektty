import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TUI_APPEARANCE_SETTINGS_NAMESPACE, TUI_BEHAVIOR_SETTINGS_NAMESPACE } from '../src/protocol.ts'
import { AppearanceSettingsSchema, BehaviorSettingsSchema } from '../src/host/management.ts'
import { settingsFields } from '../src/client/settings.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { explainFailure } from '../src/client/error-advice.ts'

const root = resolve(import.meta.dirname, '..')
const HAN = /\p{Script=Han}/u

afterEach(() => { setUiLocale('zh') })

describe('settings schema locale metadata (review #57)', () => {
  it('localizes appearance and behavior field descriptions from {zh,en} metadata', () => {
    const appearance = {
      namespace: TUI_APPEARANCE_SETTINGS_NAMESPACE,
      schema: AppearanceSettingsSchema.toJSON(),
      value: { theme: 'dark', codeTheme: 'auto', customThemes: [] },
      revision: 1,
      applies: 'live' as const,
      secrets: [],
    }
    const behavior = {
      namespace: TUI_BEHAVIOR_SETTINGS_NAMESPACE,
      schema: BehaviorSettingsSchema.toJSON(),
      value: {},
      revision: 1,
      applies: 'live' as const,
      secrets: [],
    }

    setUiLocale('en')
    const theme = settingsFields(appearance).find(field => field.path[0] === 'theme')
    expect(theme?.description).toContain('interface theme')
    expect(theme?.description).not.toMatch(HAN)
    const background = settingsFields(appearance).find(field => field.path[0] === 'backgroundMode')
    expect(background?.description).toContain('terminal effects')
    expect(background?.description).not.toMatch(HAN)
    const elapsed = settingsFields(behavior).find(field => field.path[0] === 'statusElapsed')
    expect(elapsed?.description).toContain('elapsed')
    expect(elapsed?.description).not.toMatch(HAN)
    const hover = settingsFields(behavior).find(field => field.path[0] === 'hoverFeedback')
    expect(hover?.description).toContain('pointer')
    expect(hover?.description).not.toMatch(HAN)

    setUiLocale('zh')
    expect(settingsFields(appearance).find(field => field.path[0] === 'theme')?.description).toContain('界面主题')
    expect(settingsFields(appearance).find(field => field.path[0] === 'backgroundMode')?.description).toContain('终端效果')
  })

  it('defaults the Harness schema for old profiles and rejects unknown background modes', () => {
    expect(AppearanceSettingsSchema({}).backgroundMode).toBe('theme')
    expect(AppearanceSettingsSchema({ theme: 'light' }).backgroundMode).toBe('theme')
    for (const backgroundMode of ['theme', 'terminal', 'explicit', 'foreground'] as const) {
      expect(AppearanceSettingsSchema({ backgroundMode }).backgroundMode).toBe(backgroundMode)
    }
    // @ts-expect-error external persisted settings can contain invalid values
    expect(() => AppearanceSettingsSchema({ backgroundMode: 'unknown' })).toThrow()
  })

  it('keeps the pnpm PATH warning as a stable machine string', () => {
    const source = readFileSync(resolve(root, 'src/host/profile-plugin-manager.ts'), 'utf8')
    expect(source).toMatch(/'pnpm 不在 PATH 中；请安装 pnpm 后重试'/u)
    expect(source).not.toMatch(/ui\('pnpm 不在 PATH/u)
    setUiLocale('en')
    const explained = explainFailure('pnpm 不在 PATH 中；请安装 pnpm 后重试')
    expect(explained).toContain('not on PATH')
    expect(explained).not.toMatch(HAN)
  })
})
