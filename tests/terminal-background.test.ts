import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input, StdinBuffer, TUI, type Terminal } from '@mariozechner/pi-tui'
import {
  BACKGROUND_QUERY,
  BACKGROUND_QUERY_TIMEOUT_MS,
  supportsTerminalBackground,
  TerminalBackground,
} from '../src/client/terminal-background.ts'
import { createTerminalSession, type ManagedTerminal } from '../src/client/terminal-session.ts'
import { createFatalHandler } from '../src/process-guards.ts'
import { OverlayQueue } from '../src/client/overlays.ts'

const ESC = '\u001B'
const ST = `${ESC}\\`
const ORIGINAL = 'rgb:0c0c/1234/abcd'
const reply = (color = ORIGINAL, end = ST): string => `${ESC}]11;${color}${end}`
const desired = reply('rgb:28/2c/34')
const truecolor = { COLORTERM: 'truecolor', TERM: 'xterm-256color' }
const paste = (text: string): string => `${ESC}[200~${text}${ESC}[201~`

function controller(enabled = true) {
  const writes: string[] = []
  const notice = vi.fn()
  const background = new TerminalBackground({ write: data => { writes.push(data) } }, enabled, notice)
  background.setColor('#282C34')
  return { background, writes, notice }
}

afterEach(() => { vi.useRealTimers() })

describe('terminal background capability policy', () => {
  it.each([
    { WT_SESSION: 'test' },
    { TERM_PROGRAM: 'iTerm.app' },
    { TERM_PROGRAM: 'vscode' },
    { TERM: 'xterm-kitty', COLORTERM: 'truecolor' },
    { TERM: 'xterm-ghostty', COLORTERM: 'truecolor' },
    { ...truecolor, SSH_CONNECTION: 'test' },
  ])('allows a bounded probe without an OS-specific implementation: %j', env => {
    expect(supportsTerminalBackground(env)).toBe(true)
  })

  it.each([
    {}, { TERM: 'xterm-256color' }, { TERM_PROGRAM: 'Apple_Terminal' },
    { ...truecolor, NO_COLOR: '' }, { ...truecolor, TERM: 'dumb' },
    { ...truecolor, TMUX: 'test' }, { ...truecolor, STY: 'test' },
    { ...truecolor, TERM: 'tmux-256color' }, { ...truecolor, TERM: 'screen-256color' },
    { ...truecolor, SEEKTTY_TERMINAL_BACKGROUND: 'off' },
    { ...truecolor, SEEKTTY_TERMINAL_BACKGROUND: '0' },
    { ...truecolor, SEEKTTY_TERMINAL_BACKGROUND: ' FALSE ' },
  ])('leaves unsupported, opted-out and multiplexed terminals untouched: %j', env => {
    expect(supportsTerminalBackground(env)).toBe(false)
  })
})

describe('background ownership', () => {
  it('reports applied, restored and unknown colors without another query or precision loss', () => {
    const writes: string[] = []
    const changed = vi.fn()
    const background = new TerminalBackground({ write: data => { writes.push(data) } }, true, undefined, changed)
    background.setColor('#282c34')
    background.start()
    expect(changed).not.toHaveBeenCalled()
    background.consumeInput(reply('rgb:f/8000/00'))
    expect(changed).toHaveBeenLastCalledWith('#282c34')
    background.setColor('#282c34', 'terminal')
    expect(changed).toHaveBeenLastCalledWith('#ff8000')
    expect(writes.at(-1)).toBe(reply('rgb:f/8000/00'))
    background.restore()
    expect(changed).toHaveBeenLastCalledWith(undefined)
    expect(writes.filter(value => value === BACKGROUND_QUERY)).toHaveLength(1)
  })

  it.each(['disabled', 'timeout', 'write-failed'] as const)('does not report a guessed background after %s', reason => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const background = new TerminalBackground({ write: () => {
      if (reason === 'write-failed') throw new Error('write failed')
    } }, reason !== 'disabled', undefined, changed)
    background.setColor('#282c34')
    background.start()
    vi.advanceTimersByTime(BACKGROUND_QUERY_TIMEOUT_MS)
    background.consumeInput(reply())
    expect(changed).not.toHaveBeenCalled()
    background.restore()
  })

  it('invalidates a known background when a later write or restoration fails', () => {
    let fail = false
    const changed = vi.fn()
    const background = new TerminalBackground({ write: () => { if (fail) throw new Error('write failed') } }, true, undefined, changed)
    background.setColor('#282c34')
    background.start()
    background.consumeInput(reply())
    expect(changed).toHaveBeenLastCalledWith('#282c34')
    fail = true
    background.setColor('#ffffff')
    expect(changed).toHaveBeenLastCalledWith(undefined)
    background.restore()
  })

  it('defers its single query until input is ready and a synchronizing mode is selected', () => {
    const { background, writes } = controller()
    background.setColor('#282C34', 'terminal')
    background.start()
    expect(writes).toEqual([])
    background.setColor('#282C34', 'explicit')
    background.start()
    expect(writes).toEqual([BACKGROUND_QUERY])
    background.consumeInput(reply())
    background.setColor('#282C34', 'theme')
    expect(writes).toEqual([BACKGROUND_QUERY, desired])
    background.restore()
  })

  it('restores on terminal mode and reuses the same exact snapshot across all mode switches', () => {
    const { background, writes } = controller()
    background.start()
    background.consumeInput(reply())
    background.setColor('#282C34', 'explicit')
    background.setColor('#FFFFFF', 'terminal')
    background.setColor('#123456', 'terminal')
    expect(writes).toEqual([BACKGROUND_QUERY, desired, reply()])
    background.setColor('#123456', 'theme')
    background.setColor('#123456', 'explicit')
    background.restore()
    expect(writes).toEqual([BACKGROUND_QUERY, desired, reply(), reply('rgb:12/34/56'), reply()])
  })

  it('captures a pending reply in terminal mode without recoloring or re-querying', () => {
    const { background, writes } = controller()
    background.start()
    background.setColor('#FFFFFF', 'terminal')
    background.consumeInput(reply())
    background.consumeInput(reply('rgb:1/2/3'))
    expect(writes).toEqual([BACKGROUND_QUERY])
    background.setColor('#FFFFFF', 'theme')
    expect(writes).toEqual([BACKGROUND_QUERY, reply('rgb:ff/ff/ff')])
    background.setColor('#FFFFFF', 'terminal')
    background.restore()
    expect(writes.at(-1)).toBe(reply())
    expect(writes).toHaveLength(3)
  })

  it('never retries an expired query and reports unavailable theme sync once, even after mode changes', () => {
    vi.useFakeTimers()
    const { background, writes, notice } = controller()
    background.start()
    background.setColor('#FFFFFF', 'terminal')
    vi.advanceTimersByTime(BACKGROUND_QUERY_TIMEOUT_MS)
    expect(notice).not.toHaveBeenCalled()
    background.consumeInput(reply())
    background.setColor('#FFFFFF', 'explicit')
    expect(notice).not.toHaveBeenCalled()
    for (let i = 0; i < 3; i++) {
      background.setColor('#FFFFFF', 'theme')
      background.setColor('#FFFFFF', 'terminal')
      background.start()
    }
    expect(notice).toHaveBeenCalledExactlyOnceWith('timeout')
    expect(writes).toEqual([BACKGROUND_QUERY])
    background.restore()
  })

  it('reports disabled sync only in theme mode and resets notice/probe ownership on resume', () => {
    const { background, writes, notice } = controller(false)
    background.setColor('#282C34', 'terminal')
    background.start()
    background.setColor('#282C34', 'explicit')
    expect(notice).not.toHaveBeenCalled()
    background.setColor('#282C34', 'theme')
    background.start()
    expect(notice).toHaveBeenCalledExactlyOnceWith('unsupported')
    background.restore()
    background.start()
    expect(notice).toHaveBeenCalledTimes(2)
    expect(writes).toEqual([])
    background.restore()
  })

  it('waits for a valid reply, follows theme changes and restores exact original precision once', () => {
    vi.useFakeTimers()
    const { background, writes } = controller()
    expect(writes).toEqual([])
    background.start()
    background.start()
    expect(writes).toEqual([BACKGROUND_QUERY])
    expect(background.consumeInput(reply())).toBe(true)
    expect(writes).toEqual([BACKGROUND_QUERY, desired])
    background.setColor('#282c34')
    background.setColor('#FFFFFF')
    background.setColor('#FFFFFF')
    expect(writes).toEqual([BACKGROUND_QUERY, desired, reply('rgb:ff/ff/ff')])
    background.restore()
    background.restore()
    expect(writes.at(-1)).toBe(reply())
    expect(writes).toHaveLength(4)
    expect(writes.join('')).not.toContain(`${ESC}]111`)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reapplies the same color only when a finalized theme requests it', () => {
    const { background, writes } = controller()
    background.start()
    background.consumeInput(reply())
    background.setColor('#282C34')
    expect(writes).toEqual([BACKGROUND_QUERY, desired])
    background.setColor('#282C34', 'theme', true)
    expect(writes).toEqual([BACKGROUND_QUERY, desired, desired])
    background.restore()
  })

  it.each([ST, '\u0007'])('accepts the standard %j terminator and 1–4 digit RGB channels', end => {
    const { background, writes } = controller()
    background.start()
    background.consumeInput(reply('rgb:F/Ab/123', end))
    background.restore()
    expect(writes).toEqual([BACKGROUND_QUERY, desired, reply('rgb:f/ab/123')])
  })

  it('uses the newest requested theme if it changes while the query is pending', () => {
    const { background, writes } = controller()
    background.start()
    background.setColor('#123456')
    background.consumeInput(reply())
    expect(writes).toEqual([BACKGROUND_QUERY, reply('rgb:12/34/56')])
    background.restore()
  })

  it('ignores malformed, duplicate and unsolicited reports without passing them to editors', () => {
    vi.useFakeTimers()
    const { background, writes } = controller()
    expect(background.consumeInput(reply())).toBe(true)
    expect(writes).toEqual([])
    background.start()
    for (const data of [reply('rgb:12345/0/0'), reply('red'), reply('rgb:gg/00/00'), `${ESC}]11;rgb:0/0/0`, `${ESC}]11;?${ST}`, `${ESC}]52;c;bad${ST}`]) {
      expect(background.consumeInput(data)).toBe(true)
    }
    expect(writes).toEqual([BACKGROUND_QUERY])
    background.consumeInput(reply())
    background.consumeInput(reply('rgb:ff/ff/ff'))
    background.restore()
    expect(writes).toEqual([BACKGROUND_QUERY, desired, reply()])
  })

  it('does not consume normal keys, plain text or an opaque bracketed paste', () => {
    const { background } = controller()
    for (const data of ['abc', '中文', ESC, `${ESC}[A`, ']11;rgb:ff/ff/ff', paste(reply())]) {
      expect(background.consumeInput(data)).toBe(false)
    }
  })

  it('never recolors on timeout or late replies and never polls on repaint/theme changes', () => {
    vi.useFakeTimers()
    const { background, writes } = controller()
    background.start()
    vi.advanceTimersByTime(BACKGROUND_QUERY_TIMEOUT_MS)
    background.consumeInput(reply())
    for (let index = 0; index < 100; index++) {
      background.start()
      background.setColor(index % 2 === 0 ? '#FFFFFF' : '#000000')
    }
    background.restore()
    expect(writes).toEqual([BACKGROUND_QUERY])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an early exit and re-queries a new original color on a later lifetime', () => {
    vi.useFakeTimers()
    const { background, writes } = controller()
    background.start()
    background.restore()
    background.consumeInput(reply())
    background.setColor('#FFFFFF')
    expect(writes).toEqual([BACKGROUND_QUERY])
    background.start()
    background.consumeInput(reply('rgb:1/2/3'))
    background.restore()
    expect(writes).toEqual([BACKGROUND_QUERY, BACKGROUND_QUERY, reply('rgb:ff/ff/ff'), reply('rgb:1/2/3')])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does nothing when disabled, even with valid replies', () => {
    const { background, writes } = controller(false)
    background.start()
    background.consumeInput(reply())
    background.setColor('#FFFFFF')
    background.restore()
    expect(writes).toEqual([])
  })

  it('rejects theme command injection and fails safely when the write port throws', () => {
    const writes: string[] = []
    const background = new TerminalBackground({ write: data => {
      writes.push(data)
      if (data === desired) throw new Error('broken write')
    } }, true)
    background.setColor(`${ESC}]11;red${ST}`)
    background.start()
    expect(writes).toEqual([])
    background.setColor('#282C34')
    background.start()
    expect(() => background.consumeInput(reply())).not.toThrow()
    expect(writes).toEqual([BACKGROUND_QUERY, desired, reply()])
    background.setColor('#FFFFFF')
    background.restore()
    expect(writes).toHaveLength(3)
  })
})

/** Same StdinBuffer → TerminalSession → TUI boundary as the interactive Surface. */
class VirtualTerminal implements Terminal, ManagedTerminal {
  columns = 80
  rows = 24
  kittyProtocolActive = false
  writes: string[] = []
  readonly stdin = new StdinBuffer({ timeout: 10 })
  start(onInput: (data: string) => void): void {
    this.stdin.on('data', onInput)
    this.stdin.on('paste', content => { onInput(paste(content)) })
  }
  stop(): void { this.stdin.destroy() }
  drainInput(): Promise<void> { return Promise.resolve() }
  restoreProtocolsSync(): void { this.stdin.clear() }
  restoreRawModeSync(): void {}
  write(data: string): void { this.writes.push(data) }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

function inputHarness() {
  const terminal = new VirtualTerminal()
  const tui = new TUI(terminal, false)
  const session = createTerminalSession(terminal, true, () => undefined, truecolor)
  const keys: string[] = []
  tui.addInputListener(data => {
    if (session.consumeInput(data)) return { consume: true }
    keys.push(data)
    return undefined
  })
  const composer = new Input()
  const search = new Input()
  const nestedSearch = new Input()
  tui.addChild(composer)
  tui.setFocus(composer)
  session.setBackgroundColor('#282C34')
  session.enter()
  // No query before input listeners/raw mode are ready.
  expect(terminal.writes).not.toContain(BACKGROUND_QUERY)
  tui.start()
  tui.showOverlay(search)
  tui.showOverlay(nestedSearch)
  session.startBackgroundSync()
  return { terminal, tui, session, keys, composer, search, nestedSearch, close: () => { session.restore(); tui.stop() } }
}

describe('OSC framing and nested input isolation', () => {
  it.each(['theme', 'terminal', 'explicit'] as const)('keeps OSC replies out of an actual API-key overlay in %s mode', async mode => {
    vi.useFakeTimers()
    const harness = inputHarness()
    const overlays = new OverlayQueue(harness.tui)
    const secret = overlays.secretInput({ title: 'API key' })
    try {
      await vi.advanceTimersByTimeAsync(40)
      harness.session.setBackgroundColor('#282C34', mode)
      harness.terminal.stdin.process(`sk-fixture${reply()}${reply('invalid')}`)
      vi.advanceTimersByTime(BACKGROUND_QUERY_TIMEOUT_MS + 1)
      harness.terminal.stdin.process(`${reply('rgb:1/2/3')}-tail\r`)
      expect(await secret).toBe('sk-fixture-tail')
      expect(harness.search.getValue()).toBe('')
      expect(harness.composer.getValue()).toBe('')
      expect(harness.keys.join('')).not.toContain(']11;')
    } finally { overlays.dispose(); harness.close() }
  })

  it.each([ST, '\u0007'])('handles every split, including slow fragments after the OSC opener (%j)', end => {
    vi.useFakeTimers()
    const data = reply(ORIGINAL, end)
    for (let split = 1; split < data.length; split++) {
      const harness = inputHarness()
      try {
        harness.terminal.stdin.process(`a${ESC}${data.slice(0, split)}`)
        vi.advanceTimersByTime(split === 1 ? 5 : 100)
        harness.terminal.stdin.process(`${data.slice(split)}b`)
        expect(harness.keys, `split ${split}`).toEqual(['a', ESC, 'b'])
        expect(harness.nestedSearch.getValue()).toBe('ab')
        expect(harness.search.getValue()).toBe('')
        expect(harness.composer.getValue()).toBe('')
        expect(harness.terminal.writes).toContain(desired)
      } finally { harness.close() }
    }
  })

  it('discards a delayed reply after timeout without dirtying a nested search or changing color', () => {
    vi.useFakeTimers()
    const harness = inputHarness()
    try {
      harness.terminal.stdin.process(`${ESC}]11;rgb:0c0c/`)
      vi.advanceTimersByTime(1000)
      expect(harness.terminal.stdin.flush()).toEqual([])
      harness.terminal.stdin.process(`1234/abcd${ST}z`)
      expect(harness.keys).toEqual(['z'])
      expect(harness.nestedSearch.getValue()).toBe('z')
      expect(harness.terminal.writes).not.toContain(desired)
    } finally { harness.close() }
  })

  it('preserves opaque paste and normal keys while canceling truncated OSC on a fresh escape', () => {
    const harness = inputHarness()
    try {
      const literal = paste(`中文 ${reply()} [<35;20;13M`)
      harness.terminal.stdin.process(`${ESC}]11;rgb:bad${literal}${ESC}[A`)
      expect(harness.keys).toEqual([literal, `${ESC}[A`])
      expect(harness.terminal.writes).not.toContain(desired)
      harness.terminal.stdin.process(`${ESC}]11;unfinished${ESC}[B`)
      expect(harness.keys.at(-1)).toBe(`${ESC}[B`)
      harness.terminal.stdin.process(reply())
      expect(harness.terminal.writes).toContain(desired)
    } finally { harness.close() }
  })

  it('bounds oversized OSC, preserves split ST, and does not turn the tail into text', () => {
    const harness = inputHarness()
    try {
      harness.terminal.stdin.process(`${ESC}]11;${'f'.repeat(100_000)}${ESC}`)
      expect(harness.terminal.stdin.getBuffer().length).toBeLessThanOrEqual(1024)
      harness.terminal.stdin.process('\\z')
      expect(harness.keys).toEqual(['z'])
      expect(harness.terminal.writes).not.toContain(desired)
    } finally { harness.close() }
  })

  it('restores background synchronously before fatal cleanup and private-mode teardown', async () => {
    const harness = inputHarness()
    harness.terminal.stdin.process(reply())
    const exit = vi.fn()
    const handle = createFatalHandler({
      restore: () => { harness.session.restore() },
      cleanup: async () => {
        expect(harness.terminal.writes).toContain(reply())
        harness.close()
      },
      writeError: () => undefined,
      formatError: () => '',
      exit,
    })
    handle(undefined, 143)
    const restoredAt = harness.terminal.writes.indexOf(reply())
    const leaveAt = harness.terminal.writes.findIndex(data => data.includes(`${ESC}[?1049l`))
    expect(restoredAt).toBeGreaterThan(-1)
    expect(restoredAt).toBeLessThan(leaveAt)
    await vi.waitFor(() => { expect(exit).toHaveBeenCalledWith(143) })
    expect(harness.terminal.writes.filter(data => data === reply())).toHaveLength(1)
  })
})
