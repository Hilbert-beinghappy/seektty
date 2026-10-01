import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeClipboard } from '../src/client/clipboard.ts'
import { CLIPBOARD_TERMINATION_MS } from '../src/client/clipboard.ts'
import { captureClipboardImage, PNG_MAGIC } from '../src/client/clipboard-image.ts'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

function fakeChild(): EventEmitter & { stdin: PassThrough; stdout: PassThrough; kill: ReturnType<typeof vi.fn> } {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(),
    kill: vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true }),
  })
  return child
}

beforeEach(() => { vi.mocked(spawn).mockReset() })

describe('default clipboard helper lifecycle', () => {
  it('listens for stdin errors before writing and falls back, absorbing late errors', async () => {
    const failed = fakeChild()
    const success = fakeChild()
    failed.stdin.end = vi.fn(() => {
      expect(failed.stdin.listenerCount('error')).toBeGreaterThan(0)
      failed.stdin.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
      return failed.stdin
    })
    success.stdin.end = vi.fn(() => { queueMicrotask(() => success.emit('close', 0)); return success.stdin })
    vi.mocked(spawn).mockReturnValueOnce(failed as unknown as ChildProcess)
      .mockReturnValueOnce(success as unknown as ChildProcess)
    await expect(writeClipboard('x'.repeat(5 * 1024 * 1024), {
      platform: 'linux', fallback: 'auto', writeOsc52: () => undefined,
    })).resolves.toEqual({ finalMethod: 'xclip', succeeded: ['xclip'] })
    expect(failed.kill).toHaveBeenCalledOnce()
    expect(() => {
      failed.stdin.emit('error', new Error('late EPIPE'))
      failed.emit('error', new Error('late child error'))
      success.stdin.emit('error', new Error('late stream error'))
    }).not.toThrow()
  })

  it('kills a timed-out writer and absorbs stdin errors after settlement', async () => {
    const child = fakeChild()
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess)
    await expect(writeClipboard('safe', {
      platform: 'darwin', fallback: 'auto', writeOsc52: () => undefined, deadlineMs: 10,
    })).resolves.toEqual({ finalMethod: 'osc52', succeeded: ['osc52'] })
    expect(child.kill).toHaveBeenCalledOnce()
    expect(() => child.stdin.emit('error', new Error('late EPIPE'))).not.toThrow()
  })

  it('waits for confirmed exit before starting fallback, without waiting for pipe close', async () => {
    const failed = fakeChild()
    const success = fakeChild()
    failed.kill = vi.fn(() => true)
    failed.stdin.end = vi.fn(() => {
      failed.stdin.emit('error', new Error('EPIPE'))
      return failed.stdin
    })
    success.stdin.end = vi.fn(() => { queueMicrotask(() => success.emit('close', 0)); return success.stdin })
    vi.mocked(spawn).mockReturnValueOnce(failed as unknown as ChildProcess).mockReturnValueOnce(success as unknown as ChildProcess)
    const result = writeClipboard('safe', { platform: 'linux', fallback: 'auto', writeOsc52: () => undefined })
    expect(vi.mocked(spawn)).toHaveBeenCalledOnce()
    expect(failed.kill).toHaveBeenCalledWith('SIGKILL')
    // An inherited pipe can prevent close even though the writer has exited.
    failed.emit('exit', null, 'SIGKILL')
    await expect(result).resolves.toEqual({ finalMethod: 'xclip', succeeded: ['osc52', 'xclip'] })
  })

  it('fails closed within a bound when writer exit cannot be confirmed', async () => {
    vi.useFakeTimers()
    try {
      const failed = fakeChild()
      failed.kill = vi.fn(() => false)
      failed.stdin.end = vi.fn(() => {
        failed.stdin.emit('error', new Error('EPIPE'))
        return failed.stdin
      })
      vi.mocked(spawn).mockReturnValue(failed as unknown as ChildProcess)
      const result = writeClipboard('safe', { platform: 'linux', fallback: 'auto', writeOsc52: () => undefined })
      const rejected = expect(result).rejects.toThrow(/unknown|未知/u)
      await vi.advanceTimersByTimeAsync(CLIPBOARD_TERMINATION_MS + 1)
      await rejected
      expect(vi.mocked(spawn)).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('discards over-limit image stdout and absorbs data and errors after close', async () => {
    const child = fakeChild()
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => child.stdout.emit('data', Buffer.concat([PNG_MAGIC, Buffer.alloc(9)])))
      return child as unknown as ChildProcess
    })
    const writeFile = vi.fn()
    await expect(captureClipboardImage({
      platform: 'linux', dest: '/tmp/seektty-mock-image.png', maxBytes: 16,
      writeFile, unlink: () => undefined,
    })).resolves.toBeUndefined()
    expect(writeFile).not.toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(() => {
      child.stdout.emit('data', Buffer.alloc(1024))
      child.stdout.emit('error', new Error('late stdout error'))
      child.emit('error', new Error('late child error'))
      child.emit('close', 0)
    }).not.toThrow()
  })
})
