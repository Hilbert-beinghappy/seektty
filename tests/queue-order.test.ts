import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities, TuiActiveSession } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import { moveIndex, queueListChoiceOrder } from '../src/client/queue-order.ts'

const ESCAPE = '\u001B'
const ENTER = '\r'
const DOWN = '\u001B[B'

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

function handleInput(component: Component, key: string): void {
  if (typeof component.handleInput !== 'function') {
    throw new Error('overlay is missing handleInput')
  }
  component.handleInput(key)
}

describe('queue reorder', () => {
  it('moves an item up or down and no-ops at the ends', () => {
    const rows = ['a', 'b', 'c']
    expect(moveIndex(rows, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveIndex(rows, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveIndex(rows, 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveIndex(rows, 2, 1)).toEqual(['a', 'b', 'c'])
  })

  it('does not rebuild the queue by deleting items and re-prompting', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/client/actions.ts'), 'utf8')
    expect(source.includes('reorderQueued')).toBe(false)
    expect(source.includes('与上一条排队消息对调')).toBe(false)
    expect(source.includes('Swap with the previous queued message')).toBe(false)
  })

  it('puts queued messages before bulk actions so Enter targets a message', () => {
    expect(queueListChoiceOrder(['m1'], 1)).toEqual(['m1', '__clear__'])
    expect(queueListChoiceOrder(['m1', 'm2'], 2)).toEqual(['m1', 'm2', '__all_steer__', '__clear__'])
    expect(queueListChoiceOrder([], 0)).toEqual([])
  })

  it('returns from queue edit without a success notice when the editor is cancelled', async () => {
    let mounted: Component | undefined
    const tui = {
      showOverlay: vi.fn((component: Component) => {
        mounted = component
        return { hide: vi.fn() } as unknown as OverlayHandle
      }),
      requestRender: vi.fn(),
      terminal: { rows: 24, cols: 80 },
    } as unknown as TUI
    const overlays = new OverlayQueue(tui)
    const notice = vi.fn()
    const updateQueue = vi.fn(async () => undefined)
    const snapshot = {
      queue: [{
        id: 'msg-1',
        preview: 'queued hello',
        text: 'queued hello',
        placement: 'queued',
      }],
    }
    const host: TuiActionHost = {
      overlays,
      transcript: { followLatest: vi.fn() } as unknown as Transcript,
      notice,
      refresh: vi.fn(),
      refreshHeader: vi.fn(),
      applyTheme: vi.fn(),
      applyLocale: vi.fn(),
      setEditor: vi.fn(),
      copy: vi.fn(),
      close: vi.fn(),
      restart: vi.fn(),
      requireRestart: vi.fn(),
    }
    const actions = new TuiActions({
      active: () => ({ session: { getSnapshot: () => snapshot } }) as unknown as TuiActiveSession,
      updateQueue,
    } as unknown as HarnessTuiCapabilities, host)

    const pending = actions.execute('queue', '')
    await vi.waitFor(() => { expect(mounted).toBeDefined() })
    expect(plain(mounted!.render(80))).toContain('queued hello')

    handleInput(mounted!, ENTER)
    await vi.waitFor(() => { expect(plain(mounted!.render(80))).toContain('编辑') })

    handleInput(mounted!, DOWN)
    handleInput(mounted!, ENTER)
    await vi.waitFor(() => { expect(plain(mounted!.render(80))).toContain('编辑排队消息') })

    handleInput(mounted!, ESCAPE)
    await vi.waitFor(() => {
      expect(updateQueue).not.toHaveBeenCalled()
      expect(notice).not.toHaveBeenCalled()
    })

    handleInput(mounted!, ESCAPE)
    handleInput(mounted!, ESCAPE)
    await pending
    expect(updateQueue).not.toHaveBeenCalled()
    expect(notice.mock.calls.some(call => String(call[0]).includes('已提交'))).toBe(false)
  })
})
