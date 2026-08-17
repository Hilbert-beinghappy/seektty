import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachFatalGuards,
  FATAL_SIGHUP_EXIT_CODE,
  FATAL_SIGTERM_EXIT_CODE,
  formatFatalMessage,
} from '../src/client/process-guards.ts'

describe('fatal process guards', () => {
  const detachers: Array<() => void> = []

  afterEach(() => {
    for (const detach of detachers.splice(0)) detach()
  })

  function attach(partial: {
    cleanup: () => Promise<void>
    writeError: (message: string) => void
    exit: (code: number) => void
    logHint?: string
    restoreFallback?: (chunk: string) => void
  }): void {
    detachers.push(attachFatalGuards({
      restoreFallback: () => undefined,
      ...partial,
    }))
  }

  it('restores the terminal once then exits on SIGTERM without an error summary', async () => {
    const cleanup = vi.fn(async () => undefined)
    const writeError = vi.fn()
    const exit = vi.fn()
    const restoreFallback = vi.fn()
    attach({ cleanup, writeError, exit, logHint: '/tmp/dsh-home', restoreFallback })
    process.emit('SIGTERM')
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(FATAL_SIGTERM_EXIT_CODE))
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(restoreFallback).toHaveBeenCalled()
    expect(writeError).not.toHaveBeenCalled()
    process.emit('SIGTERM')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('prints a crash summary and log location on uncaughtException', async () => {
    const cleanup = vi.fn(async () => undefined)
    const writeError = vi.fn()
    const exit = vi.fn()
    attach({ cleanup, writeError, exit, logHint: '/tmp/dsh-home' })
    process.emit('uncaughtException', new Error('boom'))
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
    expect(writeError).toHaveBeenCalledTimes(1)
    const message = String(writeError.mock.calls[0]?.[0])
    expect(message).toContain('boom')
    expect(message).toContain('/tmp/dsh-home')
  })

  it('uses the same cleanup path for SIGHUP', async () => {
    const cleanup = vi.fn(async () => undefined)
    const writeError = vi.fn()
    const exit = vi.fn()
    attach({ cleanup, writeError, exit })
    process.emit('SIGHUP')
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(FATAL_SIGHUP_EXIT_CODE))
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('keeps the crash summary to an error line plus the log directory', () => {
    const message = formatFatalMessage(new Error('broken pipe'), '~/.dsh')
    expect(message.split('\n')).toHaveLength(2)
    expect(message).toMatch(/broken pipe/)
    expect(message).toContain('~/.dsh')
  })
})

describe('surface fatal-guard wiring', () => {
  it('registers the shared guards before the TUI takes over the terminal', () => {
    const source = readFileSync(new URL('../src/client/surface.ts', import.meta.url), 'utf8')
    expect(source).toContain('attachFatalGuards')
    expect(source).toContain('detachFatalGuards')
  })
})
