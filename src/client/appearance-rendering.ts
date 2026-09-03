/** Independent rendering policies, with read-only interpretation of legacy settings. */
import type { TuiAppearanceSettings, TuiBackgroundMode, TuiRenderingSettings } from '@deepseek-ai/dsh-tui-protocol'
import { ui } from './locale.ts'

const LEGACY: Record<TuiBackgroundMode, TuiRenderingSettings> = {
  theme: { colorMode: 'auto', backgroundFill: 'terminal', terminalBackgroundSync: 'theme' },
  terminal: { colorMode: 'auto', backgroundFill: 'terminal', terminalBackgroundSync: 'off' },
  explicit: { colorMode: 'auto', backgroundFill: 'theme', terminalBackgroundSync: 'theme' },
  foreground: { colorMode: 'rgb', backgroundFill: 'terminal', terminalBackgroundSync: 'off' },
}

export const RENDERING_VALUES = {
  colorMode: ['auto', 'rgb'],
  backgroundFill: ['terminal', 'theme'],
  terminalBackgroundSync: ['off', 'theme'],
} as const

/** Do not materialize absent fields: old files retain their original meaning. */
export function renderingOverrides(input: object): Partial<TuiRenderingSettings> {
  const value = input as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(RENDERING_VALUES) as (keyof TuiRenderingSettings)[]) {
    if (value[key] === undefined) continue
    if (!(RENDERING_VALUES[key] as readonly unknown[]).includes(value[key])) {
      throw new Error(ui(`SeekTTY 设置 ${key} 无效`, `Invalid SeekTTY setting ${key}`))
    }
    result[key] = value[key]
  }
  return result as Partial<TuiRenderingSettings>
}

export function resolveRendering(appearance: Partial<TuiAppearanceSettings>): TuiRenderingSettings {
  return { ...LEGACY[appearance.backgroundMode ?? 'theme'], ...renderingOverrides(appearance) }
}

/** Adapt the background-protocol controller without coupling it to RGB encoding. */
export function backgroundSyncMode(rendering: TuiRenderingSettings): TuiBackgroundMode {
  if (rendering.terminalBackgroundSync === 'off') return 'foreground'
  return rendering.backgroundFill === 'theme' ? 'explicit' : 'theme'
}
