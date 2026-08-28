import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectList, visibleWidth, type Component, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { setUiLocale } from '../src/client/locale.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { background, editorTheme, setTheme } from '../src/client/theme.ts'
import { BUILT_IN_THEMES, generateThemeCandidates, normalizeAppearance, resolveTheme } from '../src/client/theme-config.ts'
import { stripCopyDecorations } from '../src/client/text-selection.ts'

function harness() {
  let component!: Component
  let lines: string[] = []
  const tui = {
    terminal: { rows: 40, columns: 240 }, requestRender: vi.fn(),
    showOverlay: (value: Component) => {
      component = value
      return { hide: vi.fn() } as unknown as OverlayHandle
    },
  } as unknown as TUI
  const overlays = new OverlayQueue(tui)
  const options = () => overlays.hitChildren().filter(hit => hit.role === 'option')
  return {
    overlays,
    key: (data: string) => { component.handleInput?.(data) },
    render: (width: number) => {
      lines = component.render(width)
      for (const line of lines) expect(visibleWidth(line)).toBe(width)
      return lines.map(stripCopyDecorations).join('\n')
    },
    row: (id: string) => {
      const hit = options().find(hit => hit.action.kind === 'overlay' && hit.action.optionId === id)
      if (hit === undefined) throw new Error(`missing row ${id}`)
      expect(hit.rect.height).toBe(1)
      return stripCopyDecorations(lines[hit.rect.row] ?? '')
    },
    ids: () => options().map(hit => hit.action.kind === 'overlay' ? hit.action.optionId : undefined),
    hits: options,
  }
}

beforeEach(() => {
  vi.stubEnv('NO_COLOR', undefined)
  vi.stubEnv('TERM', 'xterm-256color')
  vi.stubEnv('COLORTERM', 'truecolor')
  setUiLocale('en')
})
afterEach(() => {
  setUiLocale('zh')
  setTheme(BUILT_IN_THEMES.dark)
  vi.unstubAllEnvs()
})

const descriptions = [
  'A complete coding agent with file editing, shell commands, workspace search, web search, and configurable tool access.',
  '功能完整的编码助手，支持文件编辑、Shell、文件与网页检索，并能根据当前工作区设置执行任务；宽窗口应该完整显示这段说明。',
  '中文 👩🏽‍💻 e\u0301 🙂 '.repeat(8).trim(),
  '\u001B[38;2;80;180;220m' + 'Styled 中文🙂 '.repeat(8).trim() + '\u001B[0m',
]
const customPalette = generateThemeCandidates('ocean', 'Ocean', '#071426 #F4F8FF #6682FF #37C99B').dark
const customTheme = resolveTheme(normalizeAppearance({ theme: `custom:${customPalette.id}`, customThemes: [customPalette] }))

describe.each(['select', 'multiSelect'] as const)('%s description layout', method => {
  it.each([BUILT_IN_THEMES.dark, BUILT_IN_THEMES.light, customTheme])('uses wide space for complete multilingual descriptions with theme $id', async theme => {
    setTheme(theme)
    const h = harness()
    const choices = descriptions.map((description, index) => ({ id: String(index), label: `Mode ${index}`, description }))
    const pending = h.overlays[method]({ title: 'Agent modes', choices })
    try {
      for (const width of [240, 60, 180, 50, 240]) {
        h.render(width)
        for (const choice of choices) {
          const row = h.row(choice.id)
          if (width >= 180) {
            expect(row).toContain(stripCopyDecorations(choice.description))
            expect(row).not.toContain('…')
          } else {
            expect(row).toContain('…')
          }
          expect(row).not.toContain('\uFFFD')
        }
        expect(h.ids()).toEqual(choices.map(choice => choice.id))
      }
    } finally { h.overlays.dispose(); await pending }
  })

  it('gives unused short-title column space back to the description', async () => {
    const h = harness()
    const description = '12345678'.repeat(8)
    const pending = h.overlays[method]({ title: 'picker', choices: [{ id: 'go', label: 'Go', description }] })
    try {
      h.render(80)
      expect(h.row('go')).toContain(description)
      expect(h.row('go')).not.toContain('…')
    } finally { h.overlays.dispose(); await pending }
  })

  it('does not add an ellipsis when the final description budget fits exactly', async () => {
    const h = harness()
    // At width 80: frame 4, arrow 2, actual label+gap 6/8, and native safety 2.
    const description = 'x'.repeat(method === 'select' ? 66 : 64)
    const pending = h.overlays[method]({ title: 'boundary', choices: [{ id: 'go', label: 'Go', description }] })
    try {
      h.render(80)
      expect(h.row('go')).toContain(description)
      expect(h.row('go')).not.toContain('…')
      h.render(79)
      expect(h.row('go')).toContain('…')
      h.render(80)
      expect(h.row('go')).toContain(description)
      h.render(40) // Keep the existing extremely narrow, title-only fallback.
      expect(h.row('go')).toContain('Go')
      expect(h.ids()).toEqual(['go'])
    } finally { h.overlays.dispose(); await pending }
  })

  it('normalizes multiline descriptions without changing one-row hit geometry', async () => {
    const h = harness()
    const pending = h.overlays[method]({ title: 'multiline', choices: [
      { id: 'one', label: 'One', description: 'first line\nsecond line\n' + 'readable '.repeat(12).trim() },
    ] })
    try {
      h.render(240)
      expect(h.row('one')).toContain('first line second line ' + 'readable '.repeat(12).trim())
      expect(h.ids()).toEqual(['one'])
    } finally { h.overlays.dispose(); await pending }
  })

  it('keeps long-title columns bounded and descriptions aligned across scroll windows', async () => {
    const h = harness()
    const choices = [
      { id: 'short', label: 'Go', description: 'DESCRIPTION ' + 'a'.repeat(90) },
      { id: 'long', label: 'Very long title '.repeat(8), description: 'DESCRIPTION ' + 'b'.repeat(90) },
    ]
    const pending = h.overlays[method]({ title: 'picker', maxVisible: 1, choices })
    try {
      h.render(180)
      const start = h.row('short').indexOf('DESCRIPTION')
      expect(h.row('short')).toContain(choices[0]!.description)
      h.overlays.handleWheel(-1)
      h.render(180)
      expect(h.row('long').indexOf('DESCRIPTION')).toBe(start)
      expect(h.row('long')).toContain(choices[1]!.description)
      h.render(80)
      expect(h.row('long')).toContain('…')
    } finally { h.overlays.dispose(); await pending }
  })

  it('retains search, selection, checked state, viewport and hit rows across resize', async () => {
    const h = harness()
    const choices = Array.from({ length: 16 }, (_, index) => ({
      id: `item-${index}`, label: `group-${index}`, description: descriptions[index % descriptions.length]!,
    }))
    const pending = h.overlays[method]({ title: 'resize', choices, maxVisible: 4 })
    try {
      h.key('group')
      h.render(80)
      h.overlays.handleWheel(-5)
      h.render(80)
      expect(h.overlays.handleOptionClick('item-6')).toBe('focused')
      if (method === 'multiSelect') h.key(' ')
      expect(h.overlays.handleHover('item-7')).toBe(true)
      const expectedIds = choices.slice(5, 9).map(choice => choice.id)
      const rows = h.hits().map(hit => hit.rect.row)
      for (const width of [240, 80, 50, 180, 80]) {
        expect(h.render(width)).toMatch(/Search .*group/u)
        expect(h.ids()).toEqual(expectedIds)
        expect(h.hits().map(hit => hit.rect.row)).toEqual(rows)
        expect(h.row('item-6')).toMatch(/→ .*group-6/u)
        if (method === 'multiSelect') expect(h.row('item-6')).toContain('[x] group-6')
        expect(h.overlays.hitChildren().find(hit => hit.action.kind === 'overlay' && hit.action.command === 'footer-confirm'))
          .toMatchObject({ enabled: true })
      }
      // Keyboard reveal only moves the viewport after the selected row reaches its edge.
      h.key('\u001B[B')
      h.render(80)
      expect(h.ids()).toEqual(expectedIds)
      h.key('\u001B[B')
      h.key('\u001B[B')
      h.render(80)
      expect(h.ids()).toEqual(choices.slice(6, 10).map(choice => choice.id))
      if (method === 'select') h.key('\r')
      else expect(h.overlays.handleFooterClick('footer-confirm')).toBe(true)
      await expect(pending).resolves.toEqual(method === 'select' ? choices[9] : [choices[6]])
    } finally { h.overlays.dispose(); await pending }
  })

  it('preserves an off-screen selection while the wheel viewport is resized', async () => {
    const h = harness()
    const choices = Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: `row-${index}`, description: descriptions[0]! }))
    const pending = h.overlays[method]({ title: 'wheel', choices, maxVisible: 3 })
    try {
      h.render(80)
      h.overlays.handleWheel(-6)
      for (const width of [240, 50, 80]) {
        expect(h.render(width)).not.toContain('→')
        expect(h.ids()).toEqual(['6', '7', '8'])
      }
      expect(h.overlays.handleFooterClick('footer-back')).toBe(true)
      await expect(pending).resolves.toBeUndefined()
    } finally { h.overlays.dispose(); await pending }
  })
})

it('does not pre-truncate the disabled reason or make the disabled row clickable', async () => {
  const h = harness()
  const pending = h.overlays.select({ title: 'disabled', choices: [
    { id: 'disabled', label: 'Unavailable', description: 'ignored', disabledReason: descriptions[0]! },
  ] })
  try {
    h.render(240)
    expect(h.row('disabled')).toContain(descriptions[0])
    expect(h.overlays.handleOptionClick('disabled')).toBe('none')
    h.key('\u001B')
    await expect(pending).resolves.toBeUndefined()
  } finally { h.overlays.dispose(); await pending }
})

it('truncates descriptions once at the native row budget, with opt-in ellipsis only', () => {
  const description = '中文🙂 '.repeat(25)
  const items = [{ value: 'one', label: 'One', description: background.hover(description) }]
  const list = new SelectList(items, 3, editorTheme.selectList!, { descriptionEllipsis: '…' })
  const native = new SelectList(items, 3, editorTheme.selectList!)
  const row = list.render(80)[0]!
  expect(stripCopyDecorations(row)).toMatch(/…$/u)
  expect(visibleWidth(row)).toBeLessThanOrEqual(78)
  expect(list.getRenderSnapshot()?.visibleRows[0]?.item.description).toBe(items[0]!.description)
  expect(stripCopyDecorations(native.render(80)[0]!)).not.toContain('…')
  expect(stripCopyDecorations(list.render(240)[0]!)).toContain(description.trim())
})
