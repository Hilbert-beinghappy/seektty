import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
const spawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn }))
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>(), existsSync: () => true }))
import { openSafeUrl } from '../src/client/safe-url-opener.ts'

beforeEach(() => { spawn.mockReset() })
it('hands off one safe canonical HTTP URL without a shell and observes exit', async () => {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
  spawn.mockReturnValue(child)
  const signal = new AbortController().signal
  const pending = openSafeUrl('https://example.invalid', signal)
  expect(spawn).toHaveBeenCalledWith(expect.any(String), ['https://example.invalid/'], { stdio: 'ignore', shell: false, windowsHide: true, signal, env: expect.any(Object) })
  expect(child.unref).toHaveBeenCalledOnce()
  child.emit('exit', 0)
  await pending
})
it('rejects unsafe URLs and pre-aborted actions before process dispatch', async () => {
  await expect(openSafeUrl('file:///tmp/no', new AbortController().signal)).rejects.toThrow()
  const abort = new AbortController(); abort.abort()
  await expect(openSafeUrl('https://example.invalid', abort.signal)).rejects.toThrow()
  expect(spawn).not.toHaveBeenCalled()
})
it('reports opener failure without retrying or claiming success', async () => {
  const child = Object.assign(new EventEmitter(), { unref() {} })
  spawn.mockReturnValue(child)
  const pending = openSafeUrl('https://example.invalid', new AbortController().signal)
  child.emit('exit', 1)
  await expect(pending).rejects.toThrow('not confirmed')
  expect(spawn).toHaveBeenCalledOnce()
})
