import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { TuiClientContext } from '../src/client/context.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { ProjectionValueStore } from '../vendor/client-runtime/client/sessions/projection-store.js'

function harness(fields = ['agentId', 'line', 'images']) {
  let selected = 'one'
  let seq = 1
  const listeners = new Set<() => void>()
  const projections = { one: new ProjectionValueStore(), two: new ProjectionValueStore() }
  const options = ['read-only', 'workspace-write', 'danger-full-access', 'unknown-preset'].map(value => ({ value, name: value }))
  const set = (id: 'one' | 'two', value: string) => projections[id].apply('permissions', {
    kind: 'select', currentValue: value, options,
  }, seq++)
  set('one', 'workspace-write'); set('two', 'workspace-write')
  const sessions = Object.fromEntries(Object.entries(projections).map(([id, store]) => [id, {
    projections: store, getSnapshot: () => ({ id }), subscribe: vi.fn(() => vi.fn()),
    command: vi.fn(() => { throw new Error('Do not discard the native business result') }),
  }]))
  const execute = vi.fn(async (id: string, line: string, ..._args: unknown[]) => {
    set(id as 'one' | 'two', line.slice('/permission '.length))
    return { ok: true, value: { commandId: 'command-1', result: { kind: 'success' } } }
  })
  const ctx = {
    remote: { $on: vi.fn(), commands: { execute } }, on: vi.fn(),
    typert: { remotes: { get: () => ({ parameters: fields.map(wire => ({ wire })) }) } },
    sessions: {
      list: {
        getSnapshot: () => ({ current: selected, byId: { one: { cwd: '/test' }, two: { cwd: '/test' } } }),
        subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      },
      binding: (id: string) => ({ session: sessions[id] }),
    },
    workspaces: { list: { getSnapshot: () => ({ items: [] }) } },
  }
  const capabilities = new HarnessTuiCapabilities(ctx as unknown as TuiClientContext, {} as never, 'tui', '/test')
  let mounted: Component | undefined
  const overlays = new OverlayQueue({
    showOverlay: (component: Component) => { mounted = component; return { hide: vi.fn() } as unknown as OverlayHandle },
    requestRender: vi.fn(),
  } as unknown as TUI)
  const host = { overlays, notice: vi.fn(), refreshHeader: vi.fn() } as unknown as TuiActionHost
  return {
    capabilities, execute, set, host, overlays, sessions,
    actions: new TuiActions(capabilities, host),
    selectSession: (id: string) => { selected = id; for (const listener of listeners) listener() },
    text: () => mounted?.render(100).join('\n').replace(/\u001B\[[0-9;:]*m/gu, '') ?? '',
    key: (data: string) => mounted?.handleInput?.(data),
  }
}

afterEach(() => { setUiLocale('zh') })

describe('permission command contract and projection', () => {
  it.each([['agentId', 'line'], ['agentId', 'line', 'images']])('uses the mounted parameter contract %j', async (...fields) => {
    const h = harness(fields)
    await h.capabilities.selectPermission('read-only')
    expect(h.execute.mock.calls[0]).toEqual(fields.length === 2
      ? ['one', '/permission read-only'] : ['one', '/permission read-only', []])
    expect(h.capabilities.listPermissions().find(option => option.current)?.id).toBe('read-only')
    expect(h.sessions.one!.command).not.toHaveBeenCalled()
  })

  it.each([
    { ok: false, error: { message: 'transport denied' } },
    { ok: true, value: undefined },
    { ok: true, value: { commandId: 'rejected', result: { kind: 'error', text: 'Host denied' } } },
    { ok: true, value: { matched: true } },
  ])('rejects transport, admission and business failures: %j', async result => {
    const h = harness()
    h.execute.mockResolvedValueOnce(result as never)
    await expect(h.capabilities.selectPermission('read-only')).rejects.toThrow()
    expect(h.capabilities.listPermissions().find(option => option.current)?.id).toBe('workspace-write')
    expect(h.execute).toHaveBeenCalledTimes(1)
  })

  it('refuses unknown contracts, invalid options and a different session before calling Host', async () => {
    const h = harness(['agentId', 'line', 'unexpected'])
    await expect(h.capabilities.selectPermission('read-only')).rejects.toThrow()
    await expect(h.capabilities.selectPermission('read-only\n/other')).rejects.toThrow()
    await expect(h.capabilities.selectPermission('read-only', 'two' as never)).rejects.toThrow()
    expect(h.execute).not.toHaveBeenCalled()
  })

  it('notifies on permission-only updates and disposes old and final subscriptions', async () => {
    const h = harness()
    const listener = vi.fn()
    const stop = h.capabilities.subscribeActive(listener)
    await Promise.resolve()
    listener.mockClear()
    h.set('one', 'read-only')
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    h.selectSession('two')
    await Promise.resolve()
    listener.mockClear()
    h.set('one', 'danger-full-access')
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()
    h.set('two', 'read-only')
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    stop(); listener.mockClear()
    h.set('two', 'workspace-write'); h.selectSession('one')
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('permission UI', () => {
  it.each(['zh', 'en'] as const)('switches both ways and reports already-current state (%s)', async locale => {
    setUiLocale(locale)
    const h = harness()
    await h.actions.execute('permission', 'read-only')
    await h.actions.execute('permission', 'workspace-write')
    expect(h.execute).toHaveBeenCalledTimes(2)
    await h.actions.execute('permission', 'workspace-write')
    expect(h.execute).toHaveBeenCalledTimes(2)
    expect(h.host.notice).toHaveBeenLastCalledWith(expect.any(String), 'info')
    expect(h.host.refreshHeader).toHaveBeenCalledTimes(2)
  })

  it('keeps a visible in-page error and permits retry before closing on success', async () => {
    const h = harness()
    h.execute.mockResolvedValueOnce({ ok: true, value: { result: { kind: 'error', text: 'Host denied' } } } as never)
    const pending = h.actions.execute('permission', '')
    try {
      await vi.waitFor(() => expect(h.text()).toContain('只读'))
      h.key('\r')
      await vi.waitFor(() => expect(h.text()).toContain('Host denied'))
      expect(h.host.notice).not.toHaveBeenCalledWith(expect.any(String), 'success')
      h.key('\r')
      await pending
      expect(h.execute).toHaveBeenCalledTimes(2)
      expect(h.capabilities.listPermissions().find(option => option.current)?.id).toBe('read-only')
    } finally { h.overlays.dispose(); await pending }
  })

  it('does not trust the current flag captured when opening the menu', async () => {
    const h = harness()
    const pending = h.actions.execute('permission', '')
    try {
      await vi.waitFor(() => expect(h.text()).toContain('只读'))
      h.set('one', 'read-only')
      h.key('\u001B[B'); h.key('\r')
      await pending
      expect(h.execute).toHaveBeenCalledWith('one', '/permission workspace-write', [])
    } finally { h.overlays.dispose(); await pending }
  })

  it.each(['danger-full-access', 'unknown-preset'])('requires confirmation and aborts a session change for %s', async target => {
    const h = harness()
    const confirm = vi.spyOn(h.overlays, 'confirm').mockImplementation(async () => { h.selectSession('two'); return true })
    await h.actions.execute('permission', target)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(h.execute).not.toHaveBeenCalled()
    expect(h.host.notice).toHaveBeenLastCalledWith(expect.stringContaining('会话已切换'), 'error')
  })

  it('keeps the same risk gate for Shift+Tab and cancellation', async () => {
    const h = harness()
    const confirm = vi.spyOn(h.overlays, 'confirm').mockResolvedValue(false)
    await h.actions.cyclePermission()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(h.execute).not.toHaveBeenCalled()
    confirm.mockResolvedValueOnce(true)
    await h.actions.cyclePermission()
    expect(h.execute).toHaveBeenCalledWith('one', '/permission danger-full-access', [])
  })

  it('does not report success in a different session after an asynchronous header refresh', async () => {
    const h = harness()
    vi.mocked(h.host.refreshHeader).mockImplementation(async () => { h.selectSession('two') })
    await h.actions.execute('permission', 'read-only')
    expect(h.execute).toHaveBeenCalledWith('one', '/permission read-only', [])
    expect(h.host.notice).not.toHaveBeenCalledWith(expect.any(String), 'success')
    expect(h.host.notice).toHaveBeenLastCalledWith(expect.stringContaining('会话已切换'), 'error')
  })
})
