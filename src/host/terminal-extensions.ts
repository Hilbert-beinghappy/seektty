/** Cordis-loaded terminal contributions owned by their registering plugin's effects. */
import { Context, Service } from '@deepseek-ai/cordis'
import type { TerminalExtension, TerminalExtensionPort, TerminalExtensionRow, TerminalInputTarget, TerminalSessionTarget } from '../terminal-extensions.ts'

interface Entry<T> { readonly extension: TerminalExtension<T>; readonly revision: number; readonly lifetime: AbortController }
declare module '@deepseek-ai/cordis' {
  interface Context { seekttyExtensions: TerminalExtensionRegistry }
}

const text = (value: string, max: number): boolean => typeof value === 'string' && value.trim() !== '' && value.length <= max && !/[\x00-\x1f\x7f-\x9f]/u.test(value)
const targetCopy = <T extends TerminalSessionTarget>(target: T): T => {
  if (!text(target.sessionId, 512) || typeof target.displayTitle !== 'string') throw new Error('Invalid terminal Session target')
  if ('draft' in target) {
    const input = target as unknown as TerminalInputTarget
    if (typeof input.draft !== 'string' || !Number.isSafeInteger(input.selection?.start) || !Number.isSafeInteger(input.selection?.end)
      || input.selection.start < 0 || input.selection.end < input.selection.start || input.selection.end > input.draft.length) throw new Error('Invalid terminal input target')
    return Object.freeze({ ...target, selection: Object.freeze({ ...input.selection }) })
  }
  return Object.freeze({ ...target })
}

export class TerminalExtensionRegistry extends Service implements TerminalExtensionPort {
  private revision = 0
  private readonly sessions = new Map<string, Entry<TerminalSessionTarget>>()
  private readonly inputs = new Map<string, Entry<TerminalInputTarget>>()
  constructor(ctx: Context) {
    super(ctx, 'seekttyExtensions')
    ctx.effect(() => () => { for (const entry of [...this.sessions.values(), ...this.inputs.values()]) entry.lifetime.abort(); this.sessions.clear(); this.inputs.clear() })
  }
  registerSessionAction(extension: TerminalExtension<TerminalSessionTarget>): () => void { return this.register(this.sessions, extension) }
  registerInputActivity(extension: TerminalExtension<TerminalInputTarget>): () => void { return this.register(this.inputs, extension) }
  private register<T>(entries: Map<string, Entry<T>>, extension: TerminalExtension<T>): () => void {
    if (typeof extension.id !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,95}$/u.test(extension.id) || !text(extension.label, 120)
      || typeof extension.run !== 'function' || extension.description !== undefined && !text(extension.description, 2048)
      || extension.order !== undefined && !Number.isFinite(extension.order)
      || extension.danger !== undefined && typeof extension.danger !== 'boolean') throw new Error('Invalid terminal extension declaration')
    if (entries.has(extension.id)) throw new Error(`Terminal extension id is already registered: ${extension.id}`)
    const entry = { extension: Object.freeze({ ...extension }), revision: ++this.revision, lifetime: new AbortController() }
    entries.set(extension.id, entry)
    return () => { entry.lifetime.abort(); if (entries.get(extension.id) === entry) entries.delete(extension.id) }
  }
  private rows<T extends TerminalSessionTarget>(entries: Map<string, Entry<T>>, target: T): readonly TerminalExtensionRow[] {
    const snapshot = targetCopy(target)
    return [...entries.values()].sort((a, b) => (a.extension.order ?? 0) - (b.extension.order ?? 0) || a.revision - b.revision).map(({ extension, revision }) => {
      let reason: string | undefined
      try { reason = extension.reason?.(snapshot) } catch { reason = 'Terminal extension availability failed' }
      if (reason !== undefined && !text(reason, 2048)) reason = 'Terminal extension availability is invalid'
      return { id: extension.id, revision, label: extension.label,
        ...(extension.description === undefined ? {} : { description: extension.description }),
        ...(extension.danger === undefined ? {} : { danger: extension.danger }),
        ...(reason === undefined ? {} : { disabledReason: reason }) }
    })
  }
  sessionActions(target: TerminalSessionTarget): readonly TerminalExtensionRow[] { return this.rows(this.sessions, target) }
  inputActivities(target: TerminalInputTarget): readonly TerminalExtensionRow[] { return this.rows(this.inputs, target) }
  private async invoke<T extends TerminalSessionTarget>(entries: Map<string, Entry<T>>, target: T, id: string, revision: number, parent: AbortSignal): Promise<string | undefined> {
    parent.throwIfAborted()
    const entry = entries.get(id)
    if (entry === undefined || entry.revision !== revision) throw new Error('Terminal extension changed; reopen the menu')
    const snapshot = targetCopy(target)
    const reason = entry.extension.reason?.(snapshot)
    if (reason !== undefined) throw new Error(typeof reason === 'string' ? reason : 'Terminal extension is unavailable')
    const signal = AbortSignal.any([parent, entry.lifetime.signal, AbortSignal.timeout(30_000)])
    signal.throwIfAborted()
    let abort: (() => void) | undefined
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => { signal.throwIfAborted(); return entry.extension.run(snapshot, signal) }),
        new Promise<never>((_, reject) => { abort = () => reject(new Error('Terminal extension cancelled or timed out; its result is not confirmed')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort() }),
      ])
      signal.throwIfAborted()
      if (entries.get(id) !== entry) throw new Error('Terminal extension changed; result is not confirmed')
      if (result !== undefined && (typeof result !== 'string' || result.length > 262_144)) throw new Error('Invalid terminal extension result')
      return result
    } finally { if (abort !== undefined) signal.removeEventListener('abort', abort) }
  }
  runSessionAction(target: TerminalSessionTarget, id: string, revision: number, signal: AbortSignal): Promise<string | undefined> { return this.invoke(this.sessions, target, id, revision, signal) }
  runInputActivity(target: TerminalInputTarget, id: string, revision: number, signal: AbortSignal): Promise<string | undefined> { return this.invoke(this.inputs, target, id, revision, signal) }
}
