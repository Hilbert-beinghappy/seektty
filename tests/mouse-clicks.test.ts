import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('click matrix ownership', () => {
  it('routes tool, example, overlay, and chrome clicks through existing action paths', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const transcript = readFileSync(resolve(root, 'src/client/transcript.ts'), 'utf8')
    const overlays = readFileSync(resolve(root, 'src/client/overlays.ts'), 'utf8')
    expect(surface).toContain('transcript.pointerToggleTool')
    expect(surface).toContain('transcript.focusExample')
    expect(surface).toContain('transcript.activateFocused')
    expect(surface).toContain("actions.execute('model'")
    expect(surface).toContain("actions.execute('mode'")
    expect(surface).toContain("actions.execute('permission'")
    expect(surface).toContain("actions.execute('status'")
    expect(surface).toContain('overlays.handleOptionClick')
    expect(surface).toContain('selectAutocompleteItem')
    expect(surface).toContain('activateAutocompleteSelection')
    expect(surface).not.toContain('setAutocompleteSelectedIndex')
    expect(transcript).toContain('toggleToolCard(key)')
    expect(overlays).toContain("mouseExecute: 'focus-only'")
  })

  it('does not register OSC 8 hit regions or launch URLs from mouse reports', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const hitMap = readFileSync(resolve(root, 'src/client/mouse-hit-map.ts'), 'utf8')
    const controller = readFileSync(resolve(root, 'src/client/mouse-controller.ts'), 'utf8')
    expect(surface).not.toMatch(/role:\s*'link'/u)
    expect(surface).not.toMatch(/OSC 8|openPath|openUrl|xdg-open/u)
    expect(controller).not.toMatch(/openPath|openUrl|launch/u)
    expect(hitMap).toContain("'link'")
    expect(surface).not.toContain("command: 'open-link'")
  })

  it('keeps the opt-in PTY harness out of the default test script', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      readonly scripts: Record<string, string>
    }
    expect(manifest.scripts.test).toBe('vitest run')
    expect(manifest.scripts['test:mouse-pty']).toBe('node scripts/mouse-pty-harness.mjs')
    expect(manifest.scripts.test).not.toContain('mouse-pty')
    expect(manifest.scripts.check).not.toContain('mouse-pty')
  })
})
