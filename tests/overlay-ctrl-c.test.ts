import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { ctrlCTarget } from '../src/client/interrupt-priority.ts'
import { OverlayQueue } from '../src/client/overlays.ts'

const CTRL_C = '\u0003'

function overlayHarness(): {
  readonly overlays: OverlayQueue
  readonly hide: ReturnType<typeof vi.fn>
  component(): Component & { handleInput(data: string): void }
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
      return mounted as Component & { handleInput(data: string): void }
    },
  }
}

describe('Ctrl+C while an overlay is open', () => {
  it('cancels a running session without closing the overlay', async () => {
    const cancel = vi.fn(async () => undefined)
    const harness = overlayHarness()
    const selected = harness.overlays.select({
      title: 'help',
      choices: [{ id: 'stay', label: 'stay open' }],
    })

    expect(harness.overlays.hasActive()).toBe(true)
    const target = ctrlCTarget({ running: true, overlayActive: harness.overlays.hasActive() })
    expect(target).toBe('cancel-session')
    if (target === 'cancel-session') await cancel()
    else harness.component().handleInput(CTRL_C)

    expect(cancel).toHaveBeenCalledOnce()
    expect(harness.overlays.hasActive()).toBe(true)
    expect(harness.hide).not.toHaveBeenCalled()
    harness.component().handleInput('\u001B')
    await expect(selected).resolves.toBeUndefined()
  })

  it('still lets idle Ctrl+C close the overlay', async () => {
    const cancel = vi.fn(async () => undefined)
    const harness = overlayHarness()
    const selected = harness.overlays.select({
      title: 'help',
      choices: [{ id: 'stay', label: 'stay open' }],
    })

    const target = ctrlCTarget({ running: false, overlayActive: harness.overlays.hasActive() })
    expect(target).toBe('overlay')
    if (target === 'cancel-session') await cancel()
    else harness.component().handleInput(CTRL_C)

    await expect(selected).resolves.toBeUndefined()
    expect(cancel).not.toHaveBeenCalled()
    expect(harness.hide).toHaveBeenCalledOnce()
  })
})
