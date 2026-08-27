import { describe, expect, it, vi } from 'vitest'
import { ProcessTerminal, type Terminal } from '@mariozechner/pi-tui'
import {
  createTerminalSession,
  supportsManagedTerminal,
  terminalMouseDelta,
  type ManagedTerminal,
} from '../src/client/terminal-session.ts'

class RecordingTerminal implements Terminal, ManagedTerminal {
  writes: string[] = []
  columns = 80
  rows = 24
  kittyProtocolActive = false
  __seekttyManagedAlternateScreen?: boolean
  restoreProtocolsSync(): void {
    this.writes.push('\u001B[?2004l\u001B[<u\u001B[>4;0m')
  }
  restoreRawModeSync(): void {}
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve() }
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

describe('managed terminal session', () => {
  it('rejects non-interactive and TERM=dumb surfaces before private modes', () => {
    expect(supportsManagedTerminal(false, 'xterm-256color')).toBe(false)
    expect(supportsManagedTerminal(true, ' dumb ')).toBe(false)
    expect(supportsManagedTerminal(true, 'xterm-256color')).toBe(true)
    expect(supportsManagedTerminal(true, undefined)).toBe(true)
  })

  it('enters alternate screen and SGR wheel mode once, then restores once', () => {
    const terminal = new RecordingTerminal()
    const order: string[] = []
    const session = createTerminalSession(terminal, true, () => { order.push('quiesce') })

    session.enter()
    session.enter()
    expect(terminal.writes.join('')).toBe(
      '\u001B[?1049h\u001B[H'
      + '\u001B[?1002l\u001B[?1003l\u001B[?1007l'
      + '\u001B[?1000h\u001B[?1004h\u001B[?1006h',
    )
    expect(terminal.__seekttyManagedAlternateScreen).toBe(true)

    terminal.writes = []
    session.restore()
    session.restore()
    expect(order).toEqual(['quiesce'])
    expect(terminal.writes.join('')).toBe(
      '\u001B[?1000l\u001B[?1002l\u001B[?1003l\u001B[?1004l\u001B[?1006l\u001B[?1007l'
      + '\u001B[?2004l\u001B[<u\u001B[>4;0m'
      + '\u001B[?25h\u001B[?1049l',
    )
  })

  it('leaves alternate screen even when protocol restoration fails', () => {
    const terminal = new RecordingTerminal()
    terminal.restoreProtocolsSync = () => { throw new Error('protocol restore failed') }
    const session = createTerminalSession(terminal, true)
    session.enter()
    terminal.writes = []

    expect(() => { session.restore() }).toThrow('protocol restore failed')
    expect(terminal.writes.join('')).toContain('\u001B[?1004l')
    expect(terminal.writes.join('')).toContain('\u001B[?25h\u001B[?1049l')

    terminal.writes = []
    session.restore()
    expect(terminal.writes).toEqual([])
  })

  it('does nothing when private terminal modes are disabled', () => {
    const terminal = new RecordingTerminal()
    const session = createTerminalSession(terminal, false)
    session.enter()
    session.restore()
    expect(terminal.writes).toEqual([])
    expect(terminal.__seekttyManagedAlternateScreen).toBeUndefined()
  })

  it('switches mouse reporting without leaving the alternate screen', () => {
    const terminal = new RecordingTerminal()
    const session = createTerminalSession(terminal, true)
    session.enter()
    terminal.writes = []

    session.setMouseReporting('native')
    const native = terminal.writes.join('')
    expect(native).toContain('\u001B[?1004l')
    expect(native).toContain('\u001B[?1000l')
    expect(native).not.toContain('\u001B[?1049')
    expect(native).not.toContain('\u001B[?1003h')

    terminal.writes = []
    session.setMouseReporting('full')
    const full = terminal.writes.join('')
    expect(full).toContain('\u001B[?1000h')
    expect(full).toContain('\u001B[?1004h')
    expect(full).toContain('\u001B[?1006h')
    expect(full).not.toContain('\u001B[?1002h')
    expect(full).not.toContain('\u001B[?1049')

    terminal.writes = []
    session.setMouseReporting('full')
    expect(terminal.writes).toEqual([])
  })

  it('restores pi-tui protocols synchronously and clears keyboard flags', () => {
    const writes: string[] = []
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    try {
      const terminal = new ProcessTerminal() as unknown as {
        _protocolsRestored: boolean
        _kittyProtocolActive: boolean
        _modifyOtherKeysActive: boolean
        inputHandler: (() => void) | undefined
        restoreProtocolsSync(): void
      }
      terminal.inputHandler = () => undefined
      terminal._kittyProtocolActive = true
      terminal._modifyOtherKeysActive = true

      terminal.restoreProtocolsSync()
      terminal.restoreProtocolsSync()

      expect(writes.join('')).toBe(
        '\u001B[?2004l\u001B[<u\u001B[>4;0m\u001B[?2004l',
      )
      expect(terminal._kittyProtocolActive).toBe(false)
      expect(terminal._modifyOtherKeysActive).toBe(false)
      expect(terminal._protocolsRestored).toBe(true)
      expect(terminal.inputHandler).toBeUndefined()
    } finally {
      write.mockRestore()
    }
  })

  it('blocks late Kitty replies and modifyOtherKeys fallback after restore', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    try {
      const terminal = new ProcessTerminal() as unknown as {
        inputHandler: (() => void) | undefined
        stdinBuffer?: { listeners(event: string): ((sequence: string) => void)[] }
        queryAndEnableKittyProtocol(): void
        restoreProtocolsSync(): void
      }
      terminal.inputHandler = () => undefined
      terminal.queryAndEnableKittyProtocol()
      const lateKittyReply = terminal.stdinBuffer?.listeners('data')[0]
      expect(lateKittyReply).toBeDefined()

      terminal.restoreProtocolsSync()
      const restoredAt = writes.length
      lateKittyReply?.('\u001B[?1u')
      vi.advanceTimersByTime(200)

      expect(writes.slice(restoredAt).join('')).not.toContain('\u001B[>7u')
      expect(writes.slice(restoredAt).join('')).not.toContain('\u001B[>4;2m')
    } finally {
      write.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('SGR mouse input', () => {
  it('maps vertical wheel detents and consumes every other mouse report', () => {
    expect(terminalMouseDelta('\u001B[<64;4;8M')).toBe(3)
    expect(terminalMouseDelta('\u001B[<65;4;8M')).toBe(-3)
    expect(terminalMouseDelta('\u001B[<68;4;8M')).toBe(3) // Shift+wheel up.
    expect(terminalMouseDelta('\u001B[<66;4;8M')).toBeNull()
    expect(terminalMouseDelta('\u001B[<0;4;8M')).toBeNull()
    expect(terminalMouseDelta('\u001B[<0;4;8m')).toBeNull()
  })

  it('consumes incomplete mouse prefixes without stealing ordinary CSI keys', () => {
    expect(terminalMouseDelta('\u001B[<64;4')).toBeNull()
    expect(terminalMouseDelta('\u001B[M')).toBeNull()
    expect(terminalMouseDelta('\u001B[A')).toBeUndefined()
    expect(terminalMouseDelta('plain')).toBeUndefined()
  })
})
