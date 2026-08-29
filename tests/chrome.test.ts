import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth, type Component, type TUI } from '@mariozechner/pi-tui'
import {
  BottomAnchoredLayout,
  compactFactTokens,
  ContextBar,
  PromptEditor,
  StatusBar,
  transcriptViewportRows,
} from '../src/client/chrome.ts'
import { setUiLocale } from '../src/client/locale.ts'

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

afterEach(() => {
  vi.unstubAllEnvs()
  setUiLocale('zh')
})

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

  it('bounds long output to the viewport while keeping context and composer chrome', () => {
    let viewportRows = 8
    const layout = new BottomAnchoredLayout(
      () => viewportRows,
      rows('context'),
      rows('one', 'two', 'three', 'four'),
      rows('editor top', 'editor body', 'editor bottom'),
      rows('status'),
    )

    const long = layout.render(80)
    expect(long).toHaveLength(8)
    expect(long[0]).toBe('context')
    expect(long).toContain('four')
    expect(long).not.toContain('one')
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

  it('rebuilds composer chrome in English without changing the draft', () => {
    vi.stubEnv('NO_COLOR', '1')
    const composer = editor()
    composer.setText('保留这段用户输入')
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

    setUiLocale('en')
    const rendered = composer.render(60).join('\n')

    expect(rendered).toContain('保留这段用户输入')
    expect(rendered).toMatch(/v4-pro · Maximum reasoning · Standard$/mu)
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

  it('shows pending image drafts on a dedicated composer row', () => {
    vi.stubEnv('NO_COLOR', '1')
    const composer = editor()
    composer.setDraftAttachments([
      { name: 'thumb.png', bytes: 2048, width: 120, height: 80 },
    ])

    const rendered = composer.render(60)
    expect(rendered).toHaveLength(4)
    expect(rendered[2]).toContain('thumb.png')
    expect(rendered[2]).toContain('120×80')
    expect(rendered[1]).toContain('输入消息，/ 打开命令')
  })
})

describe('context bar running indicator', () => {
  it('puts the Ctrl+C stop hint on the context bar only', () => {
    vi.stubEnv('NO_COLOR', '1')
    const bar = new ContextBar('tui', '/workspace')
    bar.setFacts({
      hostVersion: '0.1.0',
      nodeVersion: '24.0.0',
      platform: 'darwin',
      architecture: 'arm64',
      profile: 'tui',
      workspace: '/workspace',
      session: 'session',
      mode: 'standard',
      model: 'deepseek-v4-pro',
      permission: 'workspace-write',
      running: true,
      runningSince: Date.now() - 1_000,
    })
    const rendered = bar.render(80).join('\n')
    expect(rendered).toContain('生成中')
    expect(rendered).toContain('Ctrl+C')
    const surface = readFileSync(new URL('../src/client/surface.ts', import.meta.url), 'utf8')
    expect(surface).not.toMatch(/status\.setDetail\(color\.accent\(ui\(\s*`生成中/u)
  })

  it('compacts fact tokens from the left and only reports remaining ids', () => {
    const wide = compactFactTokens([
      { id: 'model', text: 'v4-pro · Maximum reasoning' },
      { id: 'mode', text: 'Standard' },
    ], 80)
    expect(wide.tokens.map(token => token.id)).toEqual(['model', 'mode'])
    const narrow = compactFactTokens([
      { id: 'model', text: 'v4-pro · Maximum reasoning' },
      { id: 'mode', text: 'Standard' },
    ], 10)
    expect(narrow.tokens.map(token => token.id)).toEqual(['mode'])
    expect(narrow.text).toContain('Standard')
  })

  it.each(['zh', 'en'] as const)('keeps long status errors visible in narrow terminals (%s)', locale => {
    setUiLocale(locale)
    const bar = new StatusBar()
    bar.setPermission('workspace-write')
    bar.setDetail(locale === 'zh' ? '切换失败：' + '错误详情'.repeat(50) : 'Failed: ' + 'error details '.repeat(50))
    for (const width of [1, 8, 20, 40, 80]) {
      const row = bar.render(width)[0]!
      expect(visibleWidth(row)).toBeLessThanOrEqual(width)
      expect(bar.lastTokens().some(token => token.id === 'detail')).toBe(true)
      for (const token of bar.lastTokens()) {
        expect(token.rect.width).toBeGreaterThan(0)
        expect(token.rect.col + token.rect.width).toBeLessThanOrEqual(width)
      }
      if (width >= 20) expect(row).toContain(locale === 'zh' ? '切换' : 'Failed')
    }
  })

  it('registers permission and detail tokens from the status layout, not a string parse', () => {
    vi.stubEnv('NO_COLOR', '1')
    const bar = new StatusBar()
    bar.setPermission('workspace-write')
    bar.setDetail('notice')
    bar.render(80)
    expect(bar.lastTokens().map(token => token.id)).toEqual(['permission', 'detail'])
  })
})
