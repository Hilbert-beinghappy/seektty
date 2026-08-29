import { afterEach, describe, expect, it, vi } from 'vitest'
import { visibleWidth, type Component, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { helpSectionChoices, helpSectionText } from '../src/client/help.ts'
import { SURFACE_KEYMAP, applyKeyBindingOverrides, bindingKeysLabel, helpKeymapText, matchesBinding } from '../src/client/keymap.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { stripCopyDecorations } from '../src/client/text-selection.ts'

afterEach(() => {
  setUiLocale('zh')
  applyKeyBindingOverrides({})
})

describe('in-app help keymap', () => {
  it.each([
    ['zh', '扩展键盘协议'],
    ['en', 'extended keyboard input'],
  ] as const)('qualifies Shift+Enter terminal support in %s', (locale, protocolText) => {
    setUiLocale(locale)
    expect(helpKeymapText()).toContain(protocolText)
    expect(helpKeymapText()).toContain('Ctrl+Enter')
    expect(helpSectionText('flows')).toContain(protocolText)
    expect(helpSectionText('flows')).toContain('Ctrl+Enter')
  })

  it.each(['zh', 'en'] as const)('groups every live binding exactly once and explains contextual keys in %s', locale => {
    setUiLocale(locale)
    const text = helpKeymapText()
    const headings = locale === 'zh'
      ? ['输入与编辑', '命令与弹窗', '对话浏览', '会话与运行', '鼠标与选区']
      : ['Input & editing', 'Commands & overlays', 'Transcript browsing', 'Sessions & running turns', 'Mouse & selection']
    expect(text.match(/^\[.+\]$/gmu)).toEqual(headings.map(heading => `[${heading}]`))
    for (const binding of SURFACE_KEYMAP) {
      const description = binding[locale]
      const rows = text.split('\n').filter(row => row.endsWith(`  ${description}`))
      expect(rows, binding.id).toHaveLength(1)
      expect(rows[0]?.trimStart().startsWith(`${bindingKeysLabel(binding.id)} `)).toBe(true)
      const section = text.split('\n\n').find(part => part.includes(rows[0]!))
      const index = ['input', 'commands', 'transcript', 'session', 'selection'].indexOf(binding.group)
      expect(section?.startsWith(`[${headings[index]}]`)).toBe(true)
    }
    expect(text).toContain('Ctrl+Z / Ctrl+-')
    expect(text).toContain('Enter / Ctrl+Enter')
    expect(text).toContain('n / N')
    if (locale === 'en') {
      expect(text).not.toMatch(/\p{Script=Han}/u)
      expect(text).toContain('With candidates open: complete without running')
      expect(text).toContain('not sent messages or saved settings')
    }
  })

  it('keeps remapped keys in the right section without changing contextual keys', () => {
    setUiLocale('en')
    applyKeyBindingOverrides({ commandPalette: 'Ctrl+K', focusToggle: 'F6' })
    const sections = helpKeymapText().split('\n\n')
    const commands = sections.find(part => part.startsWith('[Commands & overlays]'))!
    const transcript = sections.find(part => part.startsWith('[Transcript browsing]'))!
    expect(commands).toContain('Ctrl+K')
    expect(commands).not.toContain('Ctrl+P')
    expect(commands).toContain('Tab') // local completion is not the global focus toggle
    expect(transcript).toContain('F6')
    expect(transcript).not.toContain('Tab')
  })

  it.each([36, 80])('keeps grouped help within a %i-column modal and makes every section reachable', async width => {
    for (const locale of ['zh', 'en'] as const) {
      setUiLocale(locale)
      let page!: Component
      const tui = {
        terminal: { rows: 24, columns: width }, requestRender: vi.fn(),
        showOverlay: (value: Component) => { page = value; return { hide: vi.fn() } as unknown as OverlayHandle },
      } as unknown as TUI
      const overlays = new OverlayQueue(tui)
      const content = helpKeymapText()
      const pending = overlays.detail({ title: 'keys', content, maxVisible: 8 })
      try {
        let seen = ''
        for (let offset = 0; offset < 200; offset++) {
          const lines = page.render(width)
          expect(lines.every(line => visibleWidth(line) <= width)).toBe(true)
          seen += lines.map(stripCopyDecorations).join('\n')
          overlays.handleWheel(-1)
        }
        for (const heading of content.match(/^\[.+\]$/gmu) ?? []) expect(seen).toContain(heading)
        expect(seen).toContain('Ctrl+Z / Ctrl+-')
      } finally { overlays.dispose(); await pending }
    }
  })

  it('lists F1 help and Ctrl+P palette from the same table surface matches', () => {
    expect(SURFACE_KEYMAP.some(binding => binding.id === 'help' && binding.keys.includes('F1'))).toBe(true)
    expect(matchesBinding('help', '\u001bOP')).toBe(true)
    expect(matchesBinding('commandPalette', '\u0010')).toBe(true)
    expect(helpKeymapText()).toContain('F1')
    expect(helpKeymapText()).toContain('Ctrl+P')
    expect(helpKeymapText()).toContain('F3')
    expect(helpKeymapText()).toContain('Ctrl+Shift+C')
    expect(helpSectionText('doctor')).toContain('/doctor')
    expect(helpSectionText('flows')).toContain('/mouse')
  })

  it('keeps F1 flows on daily work, not theme export or keymap setup', () => {
    for (const locale of ['zh', 'en'] as const) {
      setUiLocale(locale)
      const flows = helpSectionText('flows')
      expect(flows).not.toContain('/theme export')
      expect(flows).not.toContain('/keymap commandPalette')
    }

    setUiLocale('en')
    const flows = helpSectionText('flows')
    expect(flows.toLowerCase()).toMatch(/input/)
    expect(flows.toLowerCase()).toMatch(/stop/)
    expect(flows.toLowerCase()).toMatch(/session/)
    expect(flows.toLowerCase()).toMatch(/approv/)
    expect(flows.toLowerCase()).toMatch(/brows/)
    expect(flows).toContain('Terminal.app')
    expect(flows).toContain('Option')

    const description = helpSectionChoices().find(choice => choice.id === 'flows')?.description ?? ''
    expect(description.toLowerCase()).not.toMatch(/export|shortcut/)
  })
})
