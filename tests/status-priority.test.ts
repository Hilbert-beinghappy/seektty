import { afterEach, describe, expect, it, vi } from 'vitest'
import { EPHEMERAL_NOTICE_MS, NoticeBoard, pickStatusLine } from '../src/client/status-priority.ts'

afterEach(() => {
  vi.useRealTimers()
})

describe('status line priority', () => {
  it('keeps errors, pending, and restart above a success toast', () => {
    expect(pickStatusLine({
      error: 'send failed',
      pending: 'waiting',
      notice: 'copied',
    })).toBe('send failed')
    expect(pickStatusLine({
      pending: 'waiting',
      notice: 'copied',
    })).toBe('waiting')
    expect(pickStatusLine({
      restart: 'restart',
      running: 'generating',
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('restart')
    expect(pickStatusLine({
      running: 'generating',
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('generating')
    expect(pickStatusLine({
      warning: 'need restart',
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('need restart')
    expect(pickStatusLine({
      facts: 'queue 1',
      notice: 'copied',
    })).toBe('queue 1')
    expect(pickStatusLine({ notice: 'copied' })).toBe('copied')
  })
})

describe('notice board slots', () => {
  it('keeps a persistent error after a success toast expires', () => {
    vi.useFakeTimers()
    const board = new NoticeBoard()
    board.set('send failed', 'error')
    board.set('copied', 'success')
    expect(board.view()).toEqual({
      error: { message: 'send failed' },
      toast: { message: 'copied', tone: 'success' },
    })
    expect(pickStatusLine({
      error: board.view().error?.message,
      notice: board.view().toast?.message,
    })).toBe('send failed')

    vi.advanceTimersByTime(EPHEMERAL_NOTICE_MS)
    expect(board.view()).toEqual({ error: { message: 'send failed' } })
    board.dispose()
  })

  it('keeps a warning after an info toast and does not let the first timer clear a newer toast', () => {
    vi.useFakeTimers()
    const board = new NoticeBoard()
    board.set('need restart', 'warning')
    board.set('first', 'info')
    vi.advanceTimersByTime(1_000)
    board.set('second', 'info')
    vi.advanceTimersByTime(1_000)
    expect(board.view()).toEqual({
      warning: { message: 'need restart' },
      toast: { message: 'second', tone: 'info' },
    })
    vi.advanceTimersByTime(1_000)
    expect(board.view()).toEqual({ warning: { message: 'need restart' } })
    board.dispose()
  })

  it('dismisses persistent and toast slots together even when the editor has a draft', () => {
    vi.useFakeTimers()
    const board = new NoticeBoard()
    board.set('send failed', 'error')
    board.set('copied', 'success')
    expect(board.hasVisible()).toBe(true)
    board.dismiss()
    vi.advanceTimersByTime(EPHEMERAL_NOTICE_MS)
    expect(board.hasVisible()).toBe(false)
    expect(board.view()).toEqual({})
    board.dispose()
  })

  it('lets elapsed-style callbacks coexist with the toast timer', () => {
    vi.useFakeTimers()
    let ticks = 0
    const elapsed = setInterval(() => { ticks += 1 }, 500)
    const board = new NoticeBoard()
    board.set('copied', 'success')
    vi.advanceTimersByTime(EPHEMERAL_NOTICE_MS)
    expect(ticks).toBe(4)
    expect(board.view().toast).toBeUndefined()
    clearInterval(elapsed)
    board.dispose()
  })
})
