import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { OverlayQueue, type OverlayNavigation } from '../src/client/overlays.ts'

const ESCAPE = '\u001B'
const ENTER = '\r'
const CTRL_C = '\u0003'

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

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

describe('overlay navigation', () => {
  it('uses one physical overlay while Escape returns through the logical page stack', async () => {
    const harness = overlayHarness()
    const session = harness.overlays.navigate(async (navigation) => {
      await navigation.selectPage({
        title: 'root page',
        choices: [{ id: 'child', label: 'open child' }],
      }, async () => {
        await navigation.selectPage({
          title: 'child page',
          choices: [{ id: 'noop', label: 'stay here' }],
        }, () => undefined)
      })
    })

    expect(plain(harness.component().render(80))).toContain('root page')
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('child page')
    })

    harness.component().handleInput(ESCAPE)
    expect(plain(harness.component().render(80))).toContain('root page')
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expect(session).resolves.toBeUndefined()
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('treats Escape as Back even when a searchable page contains a query', async () => {
    const harness = overlayHarness()
    const selected = harness.overlays.select({
      title: 'searchable root',
      choices: [{ id: 'one', label: 'one' }],
    })

    harness.component().handleInput('query')
    harness.component().handleInput(ESCAPE)

    await expect(selected).resolves.toBeUndefined()
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('lets Ctrl+C abort the complete navigation session from a child page', async () => {
    const harness = overlayHarness()
    const session = harness.overlays.navigate(async (navigation) => {
      await navigation.selectPage({
        title: 'root page',
        choices: [{ id: 'child', label: 'open child' }],
      }, async () => {
        await navigation.selectPage({
          title: 'child page',
          choices: [{ id: 'noop', label: 'stay here' }],
        }, () => undefined)
      })
    })

    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('child page')
    })
    harness.component().handleInput(CTRL_C)

    await expect(session).resolves.toBeUndefined()
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('replaces the current select page without closing the overlay', async () => {
    const harness = overlayHarness()
    let navigation: OverlayNavigation | undefined
    const session = harness.overlays.navigate(async (nav) => {
      navigation = nav
      await nav.selectPage({
        title: 'jobs snapshot',
        choices: [{ id: 'old', label: 'stale job' }],
      }, () => undefined)
    })
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('stale job')
    })
    navigation?.replaceSelectPage({
      title: 'jobs snapshot',
      choices: [{ id: 'new', label: 'fresh job' }],
    }, () => undefined)
    expect(plain(harness.component().render(80))).toContain('fresh job')
    expect(plain(harness.component().render(80))).not.toContain('stale job')
    expect(harness.hide).not.toHaveBeenCalled()
    harness.component().handleInput(ESCAPE)
    await expect(session).resolves.toBeUndefined()
  })

  it('submits multiline overlay text with Ctrl+Enter and keeps Enter as a newline', async () => {
    const harness = overlayHarness()
    const submitted = harness.overlays.multilineInput({
      title: 'edit queued',
      initialValue: 'hello',
    })
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('edit queued')
    })
    harness.component().handleInput(ENTER)
    harness.component().handleInput('x')
    expect(plain(harness.component().render(80))).toContain('Ctrl+Enter')
    harness.component().handleInput('\n')
    await expect(submitted).resolves.toBe('hello\nx')
  })

  it('aborts the navigation signal when Escape closes a busy session', async () => {
    const harness = overlayHarness()
    let signal: AbortSignal | undefined
    const session = harness.overlays.navigate(async (navigation) => {
      signal = navigation.signal
      await navigation.selectPage({
        title: 'busy work',
        choices: [{ id: 'go', label: 'start' }],
      }, async () => {
        await new Promise<void>((resolve, reject) => {
          navigation.signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
        })
      })
    })
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('busy work')
    })
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(false)
    })
    harness.component().handleInput(ESCAPE)
    await expect(session).resolves.toBeUndefined()
    expect(signal?.aborted).toBe(true)
  })

  it('returns undefined from runBusy when Escape aborts the work', async () => {
    const harness = overlayHarness()
    const pending = harness.overlays.runBusy('searching', signal => new Promise<string>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
    }))
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('searching')
    })
    harness.component().handleInput(ESCAPE)
    await expect(pending).resolves.toBeUndefined()
  })
})
