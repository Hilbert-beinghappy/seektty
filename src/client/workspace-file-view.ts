/** Live file contents use the existing navigated selector, whose lifetime cancels the watch. */
import type { OverlayChoice, OverlayNavigation } from './overlays.ts'
import { stripVTControlCharacters } from 'node:util'
import { escapeTerminalText } from './theme.ts'
import { WorkspaceFileObserver } from './workspace-file-observer.ts'
import { HostFileController, hostFileScopeKey, HOST_FILE_READ_NOTICE, type HostFileOptions } from './host-file-controller.ts'
const fileLabel = (text: string) => escapeTerminalText(stripVTControlCharacters(text))

export async function workspaceFileView(observer: WorkspaceFileObserver, title: string, navigation: OverlayNavigation<void>): Promise<void> {
  let active = false
  const choices = (): OverlayChoice[] => {
    const state = observer.getSnapshot()
    const unavailable = observer.refreshReason()
    return [
      { id: '__refresh__', label: 'Refresh from start', ...(unavailable === undefined ? {} : { disabledReason: unavailable }) },
      ...(state.page !== undefined && !state.page.eof ? [{ id: '__next__', label: 'Next page', ...(state.loading || state.stale ? { disabledReason: 'Wait for a current file version' } : {}) }] : []),
      ...(state.page?.text.split('\n').slice(0, state.page.lines).map((text, index) => ({ id: `line:${state.page!.offset + index}`, label: `${state.page!.offset + index}  ${fileLabel(text)}` })) ?? []),
    ]
  }
  const update = () => {
    if (!active || navigation.signal.aborted) return
    const state = observer.getSnapshot()
    navigation.updateChoices(choices(), [state.mode, state.loading ? 'reading' : '', state.stale ? 'stale' : '', state.reason, state.error, state.page?.version].filter(Boolean).join(' · '))
  }
  const stop = observer.subscribe(update)
  try {
    active = true
    const page = navigation.selectPage({ title, detail: `${HOST_FILE_READ_NOTICE}\nChanges refresh from the first page. Back closes observation.`, choices: choices(), searchable: false }, async choice => {
      if (choice.id === '__refresh__') observer.refresh()
      else if (choice.id === '__next__') await observer.nextPage()
    })
    update()
    await page
  } finally { active = false; stop(); observer.dispose(); await observer.closed() }
}

/** E can call this from /files or an explicit Host-reference action; uploads keep their existing intake. */
export async function hostWorkspaceFilesView(options: HostFileOptions, navigation: OverlayNavigation<void>): Promise<void> {
  const files = new HostFileController(options)
  const scope = hostFileScopeKey(options.source.getSnapshot())
  const ensureScope = () => { if (!options.source.getSnapshot().ready || hostFileScopeKey(options.source.getSnapshot()) !== scope) throw new Error('Host file browser scope changed; reopen after reconnecting') }
  const browse = async (path: string): Promise<void> => {
    ensureScope()
    const initial = await navigation.progress({ title: 'Host workspace files', work: (_report, signal) => files.list(path, signal) })
    if (initial === undefined || navigation.signal.aborted) return
    let listing = initial
    const choices = (): OverlayChoice[] => [
      { id: '__refresh__', label: 'Refresh directory' },
      ...listing.entries.map(entry => ({ id: `entry:${entry.name}`, label: fileLabel(entry.name), description: entry.type,
        ...(entry.type === 'other' ? { disabledReason: 'Host entry is not a regular file or directory' } : {}) })),
    ]
    await navigation.selectPage({ title: `Host files /${listing.path}`, detail: `${HOST_FILE_READ_NOTICE}\n${listing.truncated ? 'Host entry cap reached; only this listing window is available.' : 'Directories and file references belong to the Host execution world.'}`, choices: choices() }, async choice => {
      ensureScope()
      if (choice.id === '__refresh__') {
        const fresh = await navigation.progress({ title: 'Refresh Host directory', work: (_report, signal) => files.list(path, signal) })
        if (fresh !== undefined) { listing = fresh; navigation.updateChoices(choices(), fresh.truncated ? 'Host entry cap reached' : 'Host directory refreshed') }
        return
      }
      const entry = listing.entries.find(entry => `entry:${entry.name}` === choice.id)
      if (entry === undefined) return
      const child = [listing.path, entry.name].filter(Boolean).join('/')
      if (entry.type === 'directory') { await browse(child); return }
      if (entry.type !== 'file') return
      await navigation.selectPage({ title: fileLabel(entry.name), choices: [
        { id: 'text', label: 'Read text and observe changes', ...disabled(files.reason('read') ?? files.reason('stat')) },
        { id: 'bytes', label: 'View binary bytes (Host read)', ...disabled(files.reason('readBytes')) },
      ] }, async action => {
        ensureScope()
        if (action.id === 'text') await workspaceFileView(new WorkspaceFileObserver(child, options, navigation.signal), fileLabel(entry.name), navigation)
        else if (action.id === 'bytes') {
          let offset = 0, version: string | undefined
          for (;;) {
            ensureScope()
            const page = await navigation.progress({ title: entry.name, work: (_report, signal) => files.readBytes(child, signal, { range: { offset, length: 4096 } }, version) })
            if (page === undefined) return
            await navigation.detail({ title: `${fileLabel(entry.name)} · byte ${offset}`, content: Array.from(page.data, byte => byte.toString(16).padStart(2, '0')).join(' '), footer: `Host version ${page.version}. ${HOST_FILE_READ_NOTICE}` })
            if (page.eof) return
            const next = await navigation.select({ title: entry.name, choices: [{ id: 'next', label: 'Next byte page' }, { id: 'refresh', label: 'Refresh from start' }] })
            if (next === undefined) return
            offset = next.id === 'refresh' ? 0 : page.offset + page.data.length
            version = next.id === 'refresh' ? undefined : page.version
          }
        }
      })
    })
  }
  try { await browse('') } finally { files.dispose() }
}
function disabled(reason: string | undefined): { disabledReason?: string } { return reason === undefined ? {} : { disabledReason: reason } }
