import { describe, expect, it, vi } from 'vitest'
import { paletteFillsEditor, TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities, TuiCommandCandidate } from '../src/client/capabilities.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

function command(
  name: string,
  behavior: TuiCommandCandidate['behavior'],
  argumentHint?: string,
): TuiCommandCandidate {
  return {
    name,
    description: name,
    source: behavior === 'local' ? 'TUI' : behavior === 'skill' ? 'Skill' : 'Host',
    behavior,
    ...(argumentHint === undefined ? {} : { argumentHint }),
  }
}

function host(overlays: Partial<OverlayQueue>): TuiActionHost & {
  readonly setEditor: ReturnType<typeof vi.fn>
} {
  const setEditor = vi.fn()
  return {
    overlays: overlays as OverlayQueue,
    transcript: { followLatest: vi.fn() } as unknown as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor,
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
}

describe('command palette execution', () => {
  it('fills the editor only for Host, Skill, quit, and required-argument commands', () => {
    expect(paletteFillsEditor(command('model', 'local'))).toBe(false)
    expect(paletteFillsEditor(command('sessions', 'local', '[query]'))).toBe(false)
    expect(paletteFillsEditor(command('help', 'local'))).toBe(false)
    expect(paletteFillsEditor(command('quit', 'local'))).toBe(true)
    expect(paletteFillsEditor(command('exit', 'local'))).toBe(true)
    expect(paletteFillsEditor(command('steer', 'local', '<message>'))).toBe(true)
    expect(paletteFillsEditor(command('compact', 'host'))).toBe(true)
    expect(paletteFillsEditor(command('review', 'skill'))).toBe(true)
  })

  it('executes a local interactive command instead of copying it back to the editor', async () => {
    const catalog = [command('help', 'local'), command('quit', 'local')]
    const setEditorHost = host({
      select: vi.fn(async () => ({ id: 'help', label: '/help' })),
    })
    const execute = vi.spyOn(TuiActions.prototype, 'execute').mockResolvedValue(undefined)
    const actions = new TuiActions({
      commandCatalog: async () => catalog,
    } as unknown as HarnessTuiCapabilities, setEditorHost)

    await actions.commandPalette()

    expect(execute).toHaveBeenCalledWith('help', '')
    expect(setEditorHost.setEditor).not.toHaveBeenCalled()
    execute.mockRestore()
  })

  it('still fills the editor for quit and Host commands', async () => {
    const catalog = [command('quit', 'local'), command('compact', 'host', '[text]')]
    const quitHost = host({
      select: vi.fn(async () => ({ id: 'quit', label: '/quit' })),
    })
    const actions = new TuiActions({
      commandCatalog: async () => catalog,
    } as unknown as HarnessTuiCapabilities, quitHost)

    await actions.commandPalette()
    expect(quitHost.setEditor).toHaveBeenCalledWith('/quit')

    const hostCommand = host({
      select: vi.fn(async () => ({ id: 'compact', label: '/compact' })),
    })
    await new TuiActions({
      commandCatalog: async () => catalog,
    } as unknown as HarnessTuiCapabilities, hostCommand).commandPalette()
    expect(hostCommand.setEditor).toHaveBeenCalledWith('/compact ')
  })
})
