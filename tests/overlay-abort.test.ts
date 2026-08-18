import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('overlay abort wiring (task 5.4)', () => {
  it('passes overlay signals into marketplace search, inspect, run, and session export', () => {
    const actions = readFileSync(resolve(root, 'src/client/actions.ts'), 'utf8')
    const capabilities = readFileSync(resolve(root, 'src/client/capabilities.ts'), 'utf8')
    expect(actions).toMatch(/plugins\.search\([^)]*signal/u)
    expect(actions).toMatch(/plugins\.inspect\([^)]*signal/u)
    expect(actions).toMatch(/plugins\.run\([\s\S]*signal/u)
    expect(capabilities).toMatch(/sessionExport\.download\([\s\S]*signal/u)
  })

  it('stops a running session with Ctrl+C before overlays consume the chord', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const keymap = readFileSync(resolve(root, 'src/client/keymap.ts'), 'utf8')
    const interruptAt = surface.indexOf('consumeRunningInterrupt(data, capabilities.active()?.session)')
    const overlayGateAt = surface.indexOf('if (overlays.hasActive()) return undefined')
    expect(interruptAt).toBeGreaterThan(-1)
    expect(overlayGateAt).toBeGreaterThan(interruptAt)
    expect(keymap).toMatch(/session\?\.getSnapshot\(\)\.running !== true/u)
  })
})
