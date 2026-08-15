import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth, type TUI } from '@mariozechner/pi-tui'
import { PromptEditor } from '../src/client/chrome.ts'

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 24 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

afterEach(() => { vi.unstubAllEnvs() })

describe('composer chrome', () => {
  it('uses open horizontal rules without side borders or corner glyphs', () => {
    vi.stubEnv('NO_COLOR', '1')
    const rows = editor().render(40)

    expect(rows).toHaveLength(3)
    expect(rows.join('\n')).not.toMatch(/[│╭╮╰╯]/u)
    expect(rows[0]?.slice(2)).toBe('─'.repeat(36))
    expect(rows[1]).toContain('❯')
    expect(rows[2]).toMatch(/^  ─+ deepseek · 标准$/u)
    expect(rows.map(visibleWidth)).toEqual([38, 38, 38])
  })

  it('keeps the effective model, reasoning effort, and mode on the far right', () => {
    vi.stubEnv('NO_COLOR', '1')
    const composer = editor()
    composer.setFacts({
      hostVersion: '0.1.0',
      nodeVersion: '24.0.0',
      platform: 'darwin',
      architecture: 'arm64',
      profile: 'tui',
      workspace: '/workspace',
      session: 'session',
      mode: 'standard',
      model: 'deepseek-official/deepseek-v4-pro · max',
      permission: 'workspace-write',
      running: false,
    })

    expect(composer.render(60).at(-1)).toMatch(/v4-pro · 最大推理 · 标准$/u)
  })
})
