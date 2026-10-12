import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { OverlayChoice, OverlayNavigation, SelectOverlayRequest } from '../src/client/overlays.ts'
import { workspaceFileView, hostWorkspaceFilesView } from '../src/client/workspace-file-view.ts'
import { ArtifactViewController, artifactViewCommand, type ArtifactSnapshot } from '../src/client/artifact-view.ts'
import { WorkspaceFileObserver } from '../src/client/workspace-file-observer.ts'
import { deferred, flush, hostFilesFixture } from './fixtures/host-files.ts'
function navigationFixture() {
  const pages: { request: SelectOverlayRequest; select: (choice: OverlayChoice) => void | Promise<void>; done: ReturnType<typeof deferred<void>> }[] = []
  const updates: { choices: readonly OverlayChoice[]; notice?: string }[] = []
  const abort = new AbortController()
  const navigation: OverlayNavigation<void> = {
    signal: abort.signal,
    select: vi.fn(async () => undefined), input: vi.fn(async () => undefined), multilineInput: vi.fn(async () => undefined), secretInput: vi.fn(async () => undefined), secretTransaction: async () => undefined,
    multiSelect: vi.fn(async () => undefined), detail: vi.fn(async () => {}), confirm: vi.fn(async () => false),
    progress: async request => request.work(() => {}, abort.signal),
    selectPage: (request, select) => { const done = deferred<void>(); pages.push({ request, select, done }); return done.promise },
    replaceSelectPage: (request, select) => { pages.push({ request, select, done: deferred<void>() }) },
    updateChoices: (choices, notice) => { updates.push({ choices, ...(notice === undefined ? {} : { notice }) }) },
    back: () => { pages.at(-1)?.done.resolve() }, finish: () => { for (const page of pages) page.done.resolve() },
  }
  return { navigation, pages, updates, abort }
}
it('updates the actual navigated file page; refresh works; back closes its native watch', async () => {
  const f = hostFilesFixture(), n = navigationFixture(), observer = new WorkspaceFileObserver('报告.md', f.options, n.navigation.signal)
  const view = workspaceFileView(observer, 'Host result', n.navigation)
  await flush(); expect(n.pages[0]?.request.title).toBe('Host result')
  expect(n.pages[0]?.request.detail).toContain('do not provide atomic confinement')
  f.feeds[0]!.push({ kind: 'ready' }); await flush()
  expect(n.updates.at(-1)?.choices.some(choice => choice.label.includes('remote正文'))).toBe(true)
  f.setFile('v2', 'refreshed\u001b[31mANSI'); await n.pages[0]!.select({ id: '__refresh__', label: 'Refresh' }); await flush()
  expect(n.updates.at(-1)?.choices.some(choice => choice.label.includes('refreshed'))).toBe(true)
  expect(n.updates.at(-1)?.choices.every(choice => !choice.label.includes('\u001b'))).toBe(true)
  n.pages[0]!.done.resolve(); await view
  expect(observer.getSnapshot().mode).toBe('closed'); expect(f.feeds[0]?.returns).toBe(1)
})
it('missing permission has a disabled refresh action and never reads content', async () => {
  const f = hostFilesFixture(), n = navigationFixture(); f.gates.set('workspaceFiles/read', { available: false, reason: 'Permission denied' })
  const observer = new WorkspaceFileObserver('报告.md', f.options), view = workspaceFileView(observer, 'denied', n.navigation)
  await flush(); expect(n.pages[0]?.request.choices[0]?.disabledReason).toBe('Permission denied')
  expect(f.read).not.toHaveBeenCalled(); n.pages[0]!.done.resolve(); await view
})
it('strictConfined file view is visibly disabled without opening a native watch or reading', async () => {
  const f = hostFilesFixture(), n = navigationFixture()
  const observer = new WorkspaceFileObserver('报告.md', { ...f.options, strictConfined: true }), view = workspaceFileView(observer, 'Strict read', n.navigation)
  await flush(); expect(n.pages[0]?.request.choices[0]?.disabledReason).toContain('Strict workspace confinement is unavailable')
  expect(f.read).not.toHaveBeenCalled(); expect(f.stat).not.toHaveBeenCalled(); expect(f.changes).not.toHaveBeenCalled()
  n.pages[0]!.done.resolve(); await view
})
it('Host directory entry reaches text viewer and scope change refuses stale selections', async () => {
  const f = hostFilesFixture(), n = navigationFixture(), browser = hostWorkspaceFilesView(f.options, n.navigation)
  await flush(); expect(n.pages[0]?.request.choices.some(choice => choice.label === '报告.md')).toBe(true)
  const selected = n.pages[0]!.select({ id: 'entry:报告.md', label: '报告.md' }); await flush()
  expect(n.pages[1]?.request.choices.map(choice => choice.id)).toEqual(['text', 'bytes'])
  const text = n.pages[1]!.select({ id: 'text', label: 'Read text' }); await flush()
  f.feeds[0]!.push({ kind: 'ready' }); await flush(); expect(n.updates.at(-1)?.choices.some(choice => choice.label.includes('remote正文'))).toBe(true)
  n.pages[2]!.done.resolve(); await text; n.pages[1]!.done.resolve(); await selected
  f.change({ sessionId: SessionId('another-session') })
  await expect(n.pages[0]!.select({ id: 'entry:报告.md', label: '报告.md' })).rejects.toThrow('scope changed')
  n.pages[0]!.done.resolve(); await browser; expect(f.listeners.size).toBe(0)
})
it.each(['manager', 'navigation'])('existing artifact command reaches live file controller through %s once complete Host ports are wired', async surface => {
  const f = hostFilesFixture(), n = navigationFixture()
  const snapshot: ArtifactSnapshot = { ...f.source.getSnapshot(), events: [{ seq: 1, type: 'deliverables/presented', data: { files: [{ path: '报告.md', description: 'result' }] } }], projections: {}, hasMoreHistory: false }
  const source = { getSnapshot: () => ({ ...snapshot, ...f.source.getSnapshot() }), subscribe: f.source.subscribe }
  const controller = new ArtifactViewController({ source, files: f.options.files, capability: f.options.capability })
  let selection = 0
  const overlays = { ...n.navigation, select: async (request: SelectOverlayRequest) => {
    selection++
    return selection === 1 ? request.choices.find(choice => choice.id === 'delivery:1:0') : selection === 2 ? request.choices.find(choice => choice.id === 'read') : undefined
  }, navigate: async (run: (navigation: OverlayNavigation<void>) => Promise<void>) => run(n.navigation) }
  const { navigate: _navigate, ...directNavigation } = overlays
  const { signal: _signal, selectPage: _selectPage, replaceSelectPage: _replace, updateChoices: _update, back: _back, finish: _finish, ...prompts } = n.navigation
  const manager = { ...prompts, select: overlays.select, navigate: overlays.navigate }
  const command = artifactViewCommand(controller, 'files', surface === 'manager' ? manager : directNavigation); await flush()
  expect(n.pages).toHaveLength(1); expect(f.changes).toHaveBeenCalledTimes(1)
  f.feeds[0]!.push({ kind: 'ready' }); await flush(); n.pages[0]!.done.resolve(); await command
  expect(f.feeds[0]?.closed).toBe(true); controller.dispose(); expect(f.listeners.size).toBe(0)
})
