import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppearanceSettingsSchema } from '../src/host/management.ts'
import { resolveRendering, backgroundSyncMode, renderingOverrides } from '../src/client/appearance-rendering.ts'
import { normalizeAppearance, BUILT_IN_THEMES } from '../src/client/theme-config.ts'
import { background, color, renderingColorLevel, setRendering, setBackgroundMode, setTheme, terminalColorLevel, styleTerminalText } from '../src/client/theme.ts'
import { sgrCells } from './helpers/sgr-colors.ts'
import { BACKGROUND_QUERY, TerminalBackground } from '../src/client/terminal-background.ts'

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); setBackgroundMode('theme'); setTheme(BUILT_IN_THEMES.dark) })

describe('independent appearance policies', () => {
  it.each([
    ['theme', 'auto', 'terminal', 'theme'], ['terminal', 'auto', 'terminal', 'off'],
    ['explicit', 'auto', 'theme', 'theme'], ['foreground', 'rgb', 'terminal', 'off'],
  ] as const)('interprets %s without migrating or schema-injected overrides', (backgroundMode, colorMode, backgroundFill, terminalBackgroundSync) => {
    const saved = { theme: 'dark', backgroundMode }
    const before = structuredClone(saved)
    const schema = AppearanceSettingsSchema(saved)
    expect(renderingOverrides(schema)).toEqual({})
    expect(resolveRendering(normalizeAppearance(schema))).toEqual({ colorMode, backgroundFill, terminalBackgroundSync })
    expect(saved).toEqual(before)
    expect(normalizeAppearance(schema)).not.toHaveProperty('colorMode')
  })

  it('supports sparse independent overrides and rejects invalid values at both boundaries', () => {
    expect(resolveRendering(normalizeAppearance({ theme: 'dark', backgroundMode: 'foreground', backgroundFill: 'theme' })))
      .toEqual({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' })
    for (const key of ['colorMode', 'backgroundFill', 'terminalBackgroundSync']) {
      expect(() => normalizeAppearance({ theme: 'dark', [key]: 'invalid' })).toThrow()
      expect(() => AppearanceSettingsSchema({ [key]: 'invalid' })).toThrow()
    }
  })

  it.each([{}, { TERM: 'screen', TMUX: '/tmp/test' }, { TERM: 'xterm-256color' }, { COLORTERM: 'truecolor' }])('outputs theme RGB with either fill and leaves capability detection unchanged: %j', env => {
    for (const key of ['NO_COLOR', 'TERM', 'COLORTERM', 'TERM_PROGRAM', 'WT_SESSION', 'TMUX']) vi.stubEnv(key, undefined)
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    const detected = terminalColorLevel()
    for (const backgroundFill of ['terminal', 'theme'] as const) {
      setRendering({ colorMode: 'rgb', backgroundFill, terminalBackgroundSync: 'off' })
      expect(terminalColorLevel()).toBe(detected)
      expect(renderingColorLevel()).toBe(3)
      // A competing SGR39 before the text would invalidate this assertion.
      expect(sgrCells(background.canvas('BODY')).every(cell => cell.foreground === '#dde2ee')).toBe(true)
      expect(sgrCells(background.canvas(' '))[0]?.background).toBe(backgroundFill === 'theme' ? '#090e1b' : undefined)
      expect(sgrCells(background.surface(' '))[0]?.background).toBe(backgroundFill === 'theme' ? '#111827' : undefined)
      const islands = sgrCells(background.canvas(background.surface(`a${background.selection('s')}b${styleTerminalText('t', { foreground: '#123456', background: '#654321' })}${color.brand('c')}`)))
      expect(islands.find(cell => cell.text === 's')?.background).toBe('#1d2b52')
      expect(islands.find(cell => cell.text === 't')).toEqual({ text: 't', foreground: '#123456', background: '#654321' })
      expect(islands.find(cell => cell.text === 'c')?.foreground).toBe('#6682ff')
    }
  })

  it.each([{ NO_COLOR: '' }, { TERM: 'dumb' }])('keeps color suppression stronger than RGB/fill: %j', env => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    setRendering({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' })
    expect(background.canvas('body')).toBe('body')
    expect(background.surface('panel')).toBe('panel')
  })

  it.each(['terminal', 'theme'] as const)('sync off is protocol-silent with %s fill, including force, late reply, exit and resume', backgroundFill => {
    vi.useFakeTimers()
    const terminal = { write: vi.fn() }
    const controller = new TerminalBackground(terminal, true)
    const mode = backgroundSyncMode({ colorMode: 'rgb', backgroundFill, terminalBackgroundSync: 'off' })
    controller.setColor('#090e1b', mode, true)
    controller.start()
    controller.consumeInput('\u001B]11;rgb:ff/ff/ff\u001B\\')
    vi.advanceTimersByTime(1000)
    controller.restore(); controller.start(); controller.restore()
    expect(terminal.write).not.toHaveBeenCalled()
  })

  it('turns sync off without changing RGB/fill, cancels pending probes and restores only owned original colors', () => {
    const terminal = { write: vi.fn() }
    const controller = new TerminalBackground(terminal, true)
    const rendering = { colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'theme' } as const
    const on = backgroundSyncMode(rendering)
    const off = backgroundSyncMode({ ...rendering, terminalBackgroundSync: 'off' })
    controller.setColor('#090e1b', on); controller.start()
    expect(terminal.write).toHaveBeenLastCalledWith(BACKGROUND_QUERY)
    controller.setColor('#090e1b', off)
    controller.consumeInput('\u001B]11;rgb:11/22/33\u001B\\')
    expect(terminal.write).toHaveBeenCalledTimes(1)
    controller.setColor('#090e1b', on)
    controller.consumeInput('\u001B]11;rgb:aa/bb/cc\u001B\\')
    expect(terminal.write).toHaveBeenLastCalledWith('\u001B]11;rgb:09/0e/1b\u001B\\')
    controller.setColor('#090e1b', off, true)
    expect(terminal.write).toHaveBeenLastCalledWith('\u001B]11;rgb:aa/bb/cc\u001B\\')
    const writes = terminal.write.mock.calls.length
    controller.restore()
    expect(terminal.write).toHaveBeenCalledTimes(writes)
  })
})
