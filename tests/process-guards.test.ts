import { describe, expect, it, vi } from 'vitest'
import {
  attachFatalGuards,
  createFatalHandler,
  FATAL_SIGHUP_EXIT_CODE,
  FATAL_SIGTERM_EXIT_CODE,
  fatalLogHint,
  restoreSurfaceTerminalSync,
  restoreTerminalSync,
  withCleanupTimeout,
} from '../src/process-guards.ts'

describe('fatal terminal restore (review #14)', () => {
  it('restores cooked mode and the cursor synchronously before any cleanup', () => {
    const order: string[] = []
    const stdin = { setRawMode: (mode: boolean) => { order.push(`raw:${String(mode)}`) } }
    const terminal = { showCursor: () => { order.push('cursor') } }
    restoreTerminalSync(stdin, chunk => { order.push(`write:${chunk}`) }, terminal)
    expect(order[0]).toBe('raw:false')
    expect(order).toContain('cursor')
  })

  it('restores managed modes before the original raw state', () => {
    const order: string[] = []
    const session = { restore: () => { order.push('mouse,paste,keyboard,cursor,alt') } }
    const stdin = { setRawMode: (mode: boolean) => { order.push(`fallback-raw:${String(mode)}`) } }
    const terminal = {
      restoreRawModeSync: () => { order.push('original-raw') },
      showCursor: () => { order.push('cursor-fallback') },
    }

    restoreSurfaceTerminalSync(session, stdin, chunk => { order.push(`write:${chunk}`) }, terminal)

    expect(order[0]).toBe('mouse,paste,keyboard,cursor,alt')
    expect(order[1]).toBe('original-raw')
    expect(order).not.toContain('fallback-raw:false')
  })

  it('still restores raw and cursor state when managed-mode restoration throws', () => {
    const order: string[] = []
    expect(() => restoreSurfaceTerminalSync(
      { restore: () => { throw new Error('mode restore failed') } },
      { setRawMode: mode => { order.push(`raw:${String(mode)}`) } },
      chunk => { order.push(`write:${chunk}`) },
      { showCursor: () => { order.push('cursor') } },
    )).toThrow('mode restore failed')
    expect(order).toEqual(['raw:false', 'cursor', 'write:\u001B[?25h'])
  })

  it('bounds hanging async cleanup so restore is never waited on', async () => {
    const finished = await withCleanupTimeout(async () => {
      await new Promise(() => undefined)
      return 'never'
    }, 20)
    expect(finished).toBeUndefined()
  })

})

describe('fatal process guards (review #14)', () => {
  it('restores the terminal synchronously before cleanup, then exits with the signal code', async () => {
    const order: string[] = []
    const handle = createFatalHandler({
      restore: () => { order.push('restore') },
      cleanup: async () => { order.push('cleanup') },
      writeError: () => { order.push('write') },
      formatError: () => 'unused',
      exit: (code) => { order.push(`exit:${code}`) },
    })
    handle(undefined, FATAL_SIGTERM_EXIT_CODE)
    expect(order[0]).toBe('restore')
    await vi.waitFor(() => { expect(order).toContain(`exit:${FATAL_SIGTERM_EXIT_CODE}`) })
    expect(order).toEqual(['restore', 'cleanup', `exit:${FATAL_SIGTERM_EXIT_CODE}`])
  })

  it('handles only the first fatal event and never writes a summary for signals', async () => {
    const cleanup = vi.fn(async () => undefined)
    const writeError = vi.fn()
    const exit = vi.fn()
    const handle = createFatalHandler({
      restore: () => undefined,
      cleanup,
      writeError,
      formatError: () => 'unused',
      exit,
    })
    handle(undefined, FATAL_SIGHUP_EXIT_CODE)
    handle(new Error('later'), 1)
    await vi.waitFor(() => { expect(exit).toHaveBeenCalledWith(FATAL_SIGHUP_EXIT_CODE) })
    expect(exit).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(writeError).not.toHaveBeenCalled()
  })

  it('prints the formatted crash summary before exit code 1 on a crash', async () => {
    const messages: string[] = []
    const exit = vi.fn()
    const handle = createFatalHandler({
      restore: () => undefined,
      cleanup: async () => undefined,
      writeError: (message) => { messages.push(message) },
      formatError: error => `crash: ${error instanceof Error ? error.message : String(error)}`,
      exit,
    })
    handle(new Error('boom'), 1)
    await vi.waitFor(() => { expect(exit).toHaveBeenCalledWith(1) })
    expect(messages).toEqual(['crash: boom'])
  })

  it('exits even when cleanup hangs past the deadline', async () => {
    const exit = vi.fn()
    const handle = createFatalHandler({
      restore: () => undefined,
      cleanup: () => new Promise(() => undefined),
      writeError: () => undefined,
      formatError: () => 'unused',
      exit,
      cleanupTimeoutMs: 20,
    })
    handle(undefined, FATAL_SIGTERM_EXIT_CODE)
    await vi.waitFor(() => { expect(exit).toHaveBeenCalledWith(FATAL_SIGTERM_EXIT_CODE) })
  })

  it('registers listeners for crashes and termination signals, and detaches cleanly', () => {
    const events = ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGHUP'] as const
    const before = events.map(event => process.listenerCount(event))
    const detach = attachFatalGuards({
      restore: () => undefined,
      cleanup: async () => undefined,
      writeError: () => undefined,
      formatError: () => 'unused',
      exit: () => undefined,
    })
    for (const [index, event] of events.entries()) {
      expect(process.listenerCount(event)).toBe((before[index] ?? 0) + 1)
    }
    detach()
    detach()
    for (const [index, event] of events.entries()) {
      expect(process.listenerCount(event)).toBe(before[index] ?? 0)
    }
  })

  it('derives the crash log hint from DSH_HOME', () => {
    expect(fatalLogHint({})).toBe('~/.dsh')
    expect(fatalLogHint({ DSH_HOME: '  ' })).toBe('~/.dsh')
    expect(fatalLogHint({ DSH_HOME: '/tmp/dsh-home' })).toBe('/tmp/dsh-home')
  })
})
