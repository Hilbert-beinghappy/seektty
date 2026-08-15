import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth, type Component, type TUI } from '@mariozechner/pi-tui'
import {
  BottomAnchoredLayout,
  PromptEditor,
  transcriptViewportRows,
} from '../src/client/chrome.ts'

function editor(): PromptEditor {
  return new PromptEditor({
    terminal: { rows: 24 },
    requestRender: vi.fn(),
  } as unknown as TUI)
}

function rows(...values: string[]): Component {
  return {
    render: () => values,
    invalidate: () => undefined,
  }
}

afterEach(() => { vi.unstubAllEnvs() })

describe('composer chrome', () => {
  it('uses spare viewport rows above the composer instead of below it', () => {
    const layout = new BottomAnchoredLayout(
      () => 12,
      rows('context'),
      rows('reply one', 'reply two'),
      rows('editor top', 'editor body', 'editor bottom'),
      rows('status'),
    )

    expect(layout.render(80)).toEqual([
      'context',
      '',
      'reply one',
      'reply two',
      '',
      '',
      '',
      '',
      'editor top',
      'editor body',
      'editor bottom',
      'status',
    ])
  })

  it('centers empty-session content inside the conversation area', () => {
    const layout = new BottomAnchoredLayout(
      () => 14,
      rows('context'),
      rows('deepseek', '探索未至之境', '直接描述你想完成的事'),
      rows('editor top', 'editor body', 'editor bottom'),
      rows('status'),
      () => true,
    )

    expect(layout.render(80)).toEqual([
      'context',
      '',
      '',
      '',
      'deepseek',
      '探索未至之境',
      '直接描述你想完成的事',
      '',
      '',
      '',
      'editor top',
      'editor body',
      'editor bottom',
      'status',
    ])
  })

  it('keeps all long output and leaves the composer at the end', () => {
    let viewportRows = 8
    const layout = new BottomAnchoredLayout(
      () => viewportRows,
      rows('context'),
      rows('one', 'two', 'three', 'four'),
      rows('editor top', 'editor body', 'editor bottom'),
      rows('status'),
    )

    const long = layout.render(80)
    expect(long).toHaveLength(11)
    expect(long.slice(-4)).toEqual(['editor top', 'editor body', 'editor bottom', 'status'])

    viewportRows = 14
    const resized = layout.render(80)
    expect(resized).toHaveLength(14)
    expect(resized.slice(-4)).toEqual(['editor top', 'editor body', 'editor bottom', 'status'])
  })

  it('reserves one breathing row between conversation and composer', () => {
    expect(transcriptViewportRows(24, 3)).toBe(17)
  })

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

  it('keeps an empty newline draft on the single placeholder row', () => {
    vi.stubEnv('NO_COLOR', '1')
    const composer = editor()

    composer.setText('\n')
    expect(composer.getText()).toBe('')
    expect(composer.render(40)).toHaveLength(3)
    expect(composer.render(40)[1]).toContain('输入消息，/ 打开命令')

    composer.setText('\r\n')
    expect(composer.getText()).toBe('')

    composer.handleInput('\n')
    expect(composer.getText()).toBe('')
    expect(composer.render(40)).toHaveLength(3)
  })

  it('still expands meaningful multiline input above the lower rule', () => {
    vi.stubEnv('NO_COLOR', '1')
    const composer = editor()

    composer.setText('第一行\n第二行')

    const rendered = composer.render(40)
    expect(composer.getText()).toBe('第一行\n第二行')
    expect(rendered).toHaveLength(4)
    expect(rendered[1]).toContain('❯  第一行')
    expect(rendered[2]).toContain('第二行')
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
