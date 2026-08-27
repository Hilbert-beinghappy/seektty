import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { visibleWidth, type Component, type OverlayHandle, type TUI } from '@mariozechner/pi-tui'
import { OverlayQueue, visibleEditorWindow, type OverlayNavigation } from '../src/client/overlays.ts'

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
  it('renders a custom write-only footer without exposing pasted secret text', async () => {
    const harness = overlayHarness()
    const secret = harness.overlays.secretInput({
      title: 'Add an API key to get started',
      placeholder: 'Paste your API key',
      footer: 'Enter save and continue · Esc configure later',
    })

    harness.component().handleInput('sk-never-render-this')
    const rendered = plain(harness.component().render(80))
    expect(rendered).toContain('Enter save and continue · Esc configure later')
    expect(rendered).toContain('••••')
    expect(rendered).not.toContain('sk-never-render-this')

    harness.component().handleInput(ESCAPE)
    await expect(secret).resolves.toBeUndefined()
  })

  it('routes wheel semantically without inserting key names into text or secret inputs', async () => {
    const textHarness = overlayHarness()
    const text = textHarness.overlays.input({ title: 'text' })
    textHarness.component().handleInput('safe-value')
    expect(textHarness.overlays.handleWheel(-4)).toBe(true)
    expect(textHarness.overlays.handleWheel(4)).toBe(true)
    textHarness.component().handleInput(ENTER)
    await expect(text).resolves.toBe('safe-value')

    const secretHarness = overlayHarness()
    const secret = secretHarness.overlays.secretInput({ title: 'secret' })
    secretHarness.component().handleInput('synthetic-secret')
    expect(secretHarness.overlays.handleWheel(-4)).toBe(true)
    expect(secretHarness.overlays.handleWheel(4)).toBe(true)
    secretHarness.component().handleInput(ENTER)
    await expect(secret).resolves.toBe('synthetic-secret')
  })

  it('moves selector and detail state through typed wheel methods', async () => {
    const selectHarness = overlayHarness()
    const selected = selectHarness.overlays.select({
      title: 'wheel picker',
      searchable: false,
      choices: [
        { id: 'a', label: 'alpha' },
        { id: 'b', label: 'bravo' },
        { id: 'c', label: 'charlie' },
      ],
    })
    expect(selectHarness.overlays.handleWheel(-2)).toBe(true)
    selectHarness.component().handleInput(ENTER)
    await expect(selected).resolves.toMatchObject({ id: 'c' })

    const detailHarness = overlayHarness()
    const detail = detailHarness.overlays.detail({
      title: 'detail',
      content: Array.from({ length: 8 }, (_, index) => `line-${String(index)}`).join('\n'),
      maxVisible: 3,
    })
    detailHarness.component().render(80)
    expect(detailHarness.overlays.handleWheel(-2)).toBe(true)
    expect(plain(detailHarness.component().render(80))).toContain('line-2')
    detailHarness.component().handleInput(ESCAPE)
    await detail
  })

  it('keeps a visible single-submit busy page for secret transactions', async () => {
    const harness = overlayHarness()
    let finish: ((result: { ok: true; value: string }) => void) | undefined
    const work = vi.fn((_value: string) => new Promise<{ ok: true; value: string }>((resolve) => {
      finish = resolve
    }))
    const transaction = harness.overlays.secretTransaction({
      input: { title: 'API key', placeholder: 'synthetic only' },
      busyTitle: 'Saving API key',
      busyDetail: 'Harness owns the write',
      failureMessage: 'safe failure',
      validate: raw => ({ ok: true, value: raw.trim() }),
      work,
    })
    harness.component().handleInput('synthetic-key')
    harness.component().handleInput(ENTER)
    await vi.waitFor(() => {
      const rendered = plain(harness.component().render(80))
      expect(rendered).toContain('Saving API key')
      expect(rendered).toContain('Saving')
      expect(rendered).not.toContain('synthetic-key')
    })
    harness.component().handleInput(ENTER)
    harness.component().handleInput(ENTER)
    expect(work).toHaveBeenCalledOnce()
    finish?.({ ok: true, value: 'saved' })
    await expect(transaction).resolves.toBe('saved')
  })

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

  it('keeps the navigation signal live when Escape only returns from a child page', async () => {
    const harness = overlayHarness()
    let signal: AbortSignal | undefined
    const session = harness.overlays.navigate(async (navigation) => {
      signal = navigation.signal
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
    harness.component().handleInput(ESCAPE)
    expect(plain(harness.component().render(80))).toContain('root page')
    expect(signal?.aborted).toBe(false)

    harness.component().handleInput(ESCAPE)
    await expect(session).resolves.toBeUndefined()
    expect(signal?.aborted).toBe(true)
  })

  it('does not treat Tab as confirm inside a selector', async () => {
    const harness = overlayHarness()
    const selected = harness.overlays.select({
      title: 'pick a model',
      choices: [
        { id: 'alpha', label: 'alpha model' },
        { id: 'bravo', label: 'bravo model' },
      ],
    })

    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('pick a model')
    })

    harness.component().handleInput('\t')
    expect(plain(harness.component().render(80))).toContain('pick a model')
    expect(harness.hide).not.toHaveBeenCalled()
    await expect(Promise.race([
      selected.then(() => 'resolved'),
      Promise.resolve('pending'),
    ])).resolves.toBe('pending')

    harness.component().handleInput(ENTER)
    await expect(selected).resolves.toEqual({ id: 'alpha', label: 'alpha model' })
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

  it('updateChoices keeps the typed query and selected id across auto-refresh', async () => {
    const harness = overlayHarness()
    let navigation: OverlayNavigation | undefined
    const session = harness.overlays.navigate(async (nav) => {
      navigation = nav
      await nav.selectPage({
        title: 'jobs snapshot',
        choices: [
          { id: 'alpha', label: 'alpha job' },
          { id: 'bravo', label: 'bravo job' },
          { id: 'other', label: 'unrelated' },
        ],
      }, () => undefined)
    })
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('alpha job')
    })
    harness.component().handleInput('job')
    harness.component().handleInput('\u001B[B')
    expect(plain(harness.component().render(80))).toContain('job')
    expect(plain(harness.component().render(80))).toContain('bravo job')
    navigation?.updateChoices([
      { id: 'alpha', label: 'alpha job · running' },
      { id: 'bravo', label: 'bravo job · idle' },
      { id: 'other', label: 'unrelated' },
    ])
    const after = plain(harness.component().render(80))
    expect(after).toContain('bravo job · idle')
    expect(after).toContain('alpha job · running')
    expect(after).not.toContain('unrelated')
    expect(after).toMatch(/job/u)
    navigation?.updateChoices(
      [{ id: 'alpha', label: 'alpha job · running' }],
      'refresh failed',
    )
    expect(plain(harness.component().render(80))).toContain('refresh failed')
    expect(harness.hide).not.toHaveBeenCalled()
    harness.component().handleInput(ESCAPE)
    await expect(session).resolves.toBeUndefined()
    const actions = readFileSync(resolve(import.meta.dirname, '../src/client/actions.ts'), 'utf8')
    expect(actions).toMatch(/nav\.updateChoices\(/u)
    expect(actions).toMatch(/\.catch\(/u)
  })

  it('submits multiline overlay text only on Kitty Ctrl+Enter, not raw LF', async () => {
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
    harness.component().handleInput('\n')
    expect(plain(harness.component().render(80))).toContain('Ctrl+Enter')
    expect(plain(harness.component().render(80))).toContain('hello')
    harness.component().handleInput('\u001B[13;5u')
    await expect(submitted).resolves.toBe('hello\nx\n')
  })

  it('keeps the multiline cursor row inside the visible editor window', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `line-${String(index)}`)
    expect(visibleEditorWindow(lines, 0, 12).at(0)).toBe('line-0')
    expect(visibleEditorWindow(lines, 19, 12).at(-1)).toBe('line-19')
    expect(visibleEditorWindow(lines, 10, 12)).toContain('line-10')
    expect(visibleEditorWindow(lines, 10, 12)).toHaveLength(12)
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

  it('streams progress output and resolves the progress result when work completes', async () => {
    const harness = overlayHarness()
    let report: ((chunk: string) => void) | undefined
    let finish: ((value: string) => void) | undefined
    const session = harness.overlays.progress({
      title: '安装插件',
      work: (next) => new Promise<string>((resolve) => {
        report = next
        finish = resolve
      }),
    })

    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('安装插件')
    })
    expect(plain(harness.component().render(80))).toContain('等待输出…')
    report?.('Downloading seektty\n')
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('Downloading seektty')
    })
    finish?.('ok')
    await expect(session).resolves.toBe('ok')
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('aborts the streamed work and resolves undefined when Escape cancels progress', async () => {
    const harness = overlayHarness()
    let seenSignal: AbortSignal | undefined
    const session = harness.overlays.progress({
      title: '更新插件',
      work: (_report, signal) => new Promise<string>((_resolve, reject) => {
        seenSignal = signal
        signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      }),
    })

    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('更新插件')
    })
    harness.component().handleInput(ESCAPE)
    expect(seenSignal?.aborted).toBe(true)
    await expect(session).resolves.toBeUndefined()
    expect(harness.hide).toHaveBeenCalledOnce()
  })
})

describe('Clarify OverlayQueue wrapping', () => {
  it('renders a long ask overlay inside 40 and 80 columns via OverlayQueue.component.render', async () => {
    const harness = overlayHarness()
    const preview = 'Implement email-password login, admin-only audit logs, and failed-login events without inventing extra product copy.'
    const pending = harness.overlays.select({
      title: 'Clarify · Which independent delivery constraints remain?',
      detail: [
        'Status: running',
        'Current draft preview:',
        preview,
        'Changes this round: recorded the custom checklist',
      ].join('\n'),
      searchable: false,
      choices: [
        { id: 'o-login', label: 'Keep email+password and add audit logs' },
        { id: '__accept_preview__', label: 'Review and accept current preview' },
        { id: '__refine_preview__', label: 'Refine current preview…' },
      ],
    })
    const at40 = harness.component().render(40)
    const at80 = harness.component().render(80)
    expect(at40.length).toBeGreaterThan(0)
    expect(at80.length).toBeGreaterThan(0)
    for (const line of at40) expect(visibleWidth(line)).toBeLessThanOrEqual(40)
    for (const line of at80) expect(visibleWidth(line)).toBeLessThanOrEqual(80)
    expect(plain(at40)).toMatch(/Review and accept current preview|Refine current preview/)
    const compact80 = plain(at80).replace(/[\s│╭╮╰╯─]+/gu, ' ')
    expect(compact80).toContain('Implement email-password login')
    expect(compact80).toContain('failed-login events')
    expect(plain(at40)).toMatch(/Implement email-password login|email-password/)
    harness.component().handleInput(ESCAPE)
    await expect(pending).resolves.toBeUndefined()
  })

  it('focuses overlay options on the first click and never mouse-executes danger confirm', async () => {
    const harness = overlayHarness()
    const pending = harness.overlays.confirm('Enter full access?', 'Impact text', 'Enter full access')
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('Enter full access')
    })
    harness.component().render(80)
    const first = harness.overlays.handleOptionClick('confirm')
    expect(first).toBe('danger')
    const second = harness.overlays.handleOptionClick('confirm')
    expect(second).toBe('danger')
    expect(harness.overlays.activateArmedOption()).toBe('danger')
    harness.component().handleInput(ESCAPE)
    await expect(pending).resolves.toBe(false)
  })

  it('activates an ordinary option only on the second click through the existing submit path', async () => {
    const harness = overlayHarness()
    const pending = harness.overlays.select({
      title: 'picker',
      searchable: false,
      choices: [
        { id: 'save', label: 'Save' },
        { id: 'cancel', label: 'Cancel' },
      ],
    })
    await vi.waitFor(() => {
      expect(plain(harness.component().render(80))).toContain('Save')
    })
    harness.component().render(80)
    expect(harness.overlays.handleOptionClick('save')).toBe('focused')
    expect(harness.overlays.hitChildren().some(region => region.action.kind === 'overlay' && region.action.optionId === 'save')).toBe(true)
    expect(harness.overlays.handleOptionClick('save')).toBe('activated')
    expect(harness.overlays.activateArmedOption()).toBe('activated')
    await expect(pending).resolves.toMatchObject({ id: 'save' })
  })
})
