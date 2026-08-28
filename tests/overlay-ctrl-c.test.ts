import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { consumeRunningInterrupt } from '../src/client/keymap.ts'
import { OverlayQueue } from '../src/client/overlays.ts'

const CTRL_C = '\u0003'
const ESCAPE = '\u001B'
const root = resolve(import.meta.dirname, '..')

function overlayHarness(): {
  readonly overlays: OverlayQueue
  readonly hide: ReturnType<typeof vi.fn>
  component(): Component
} {
  let mounted: Component | undefined
  const hide = vi.fn()
  const tui = {
    showOverlay: vi.fn((component: Component) => {
      mounted = component
      return { hide } as unknown as OverlayHandle
    }),
    requestRender: vi.fn(),
    terminal: { rows: 24, cols: 80 },
  } as unknown as TUI
  return {
    overlays: new OverlayQueue(tui),
    hide,
    component: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted
    },
  }
}

function typeOverlay(component: Component, data: string): void {
  const handle = component.handleInput
  if (handle === undefined) throw new Error('overlay has no handleInput')
  handle.call(component, data)
}

describe('Ctrl+C while an overlay is open', () => {
  it('routes running Ctrl+C through the Surface listener helper and leaves the overlay open', async () => {
    const cancel = vi.fn(async () => undefined)
    const harness = overlayHarness()
    const selected = harness.overlays.select({
      title: 'help',
      choices: [{ id: 'stay', label: 'stay open' }],
    })
    const session = {
      getSnapshot: () => ({ running: true }),
      cancel,
    }

    expect(harness.overlays.hasActive()).toBe(true)
    expect(consumeRunningInterrupt(CTRL_C, session)).toEqual({ consume: true })
    expect(cancel).toHaveBeenCalledOnce()
    expect(harness.overlays.hasActive()).toBe(true)
    expect(harness.hide).not.toHaveBeenCalled()

    typeOverlay(harness.component(), ESCAPE)
    await expect(selected).resolves.toBeUndefined()
  })

  it('does not consume idle Ctrl+C, so the overlay still receives the chord', async () => {
    const cancel = vi.fn(async () => undefined)
    const harness = overlayHarness()
    const selected = harness.overlays.select({
      title: 'help',
      choices: [{ id: 'stay', label: 'stay open' }],
    })
    const session = {
      getSnapshot: () => ({ running: false }),
      cancel,
    }

    expect(consumeRunningInterrupt(CTRL_C, session)).toBeUndefined()
    expect(cancel).not.toHaveBeenCalled()
    typeOverlay(harness.component(), CTRL_C)
    await expect(selected).resolves.toBeUndefined()
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('registers consumeRunningInterrupt as the Surface listener first stage', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const helperAt = surface.indexOf('consumeRunningInterrupt(payload, capabilities.active()?.session)')
    const overlayAt = surface.indexOf('if (overlays.hasActive()) return undefined')
    expect(helperAt).toBeGreaterThan(-1)
    expect(overlayAt).toBeGreaterThan(helperAt)
    expect(surface).not.toMatch(/interrupt-priority/u)
  })
})
