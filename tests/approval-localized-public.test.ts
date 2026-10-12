import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { SessionId as HostSessionId } from '@deepseek-ai/dsh-session'
import { PendingWait, type ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/node-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeInteractions } from '../src/host/native-interactions.ts'
import { muxFrameSchema } from '../vendor/api-contract/api/events.schema.js'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import { setUiLocale } from '../src/client/locale.ts'

const cleanup: (() => void)[] = []
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); setUiLocale('zh') })
function fixture() {
  const native = new NativeInteractions(), abort = new AbortController()
  let wait!: PendingWait<'approval'>, mounted: Component | undefined
  const responses = vi.fn(async (message: Parameters<NativeInteractions['respond']>[0]) => native.respond(message))
  native.subscribe(request => {
    const frame = muxFrameSchema.parse(request.payload)
    if (frame.type === 'approval/requested') {
      const { type: _type, sessionId, ...payload } = frame
      wait = new PendingWait('approval', request.rpcId, sessionId, payload, responses)
    } else if (frame.type === 'approval/resolved') wait?.markSettled()
  })
  const outcome = native.approval({ agent: { id: HostSessionId('synthetic-root') }, toolName: 'synthetic-tool',
    reason: 'AUDITED ORIGINAL', displayReason: { en: 'LOCALIZED ENGLISH', zh: '本地化审批信息' }, signal: abort.signal }, async () => 'unavailable')
  const snapshot = { pending: [wait], runningCalls: [] } as unknown as ConversationSnapshot
  const capabilities = { active: () => ({ session: { getSnapshot: () => snapshot } }),
    answerApproval: HarnessTuiCapabilities.prototype.answerApproval } as unknown as HarnessTuiCapabilities
  const overlays = new OverlayQueue({ showOverlay: (component: Component) => {
    mounted = component; return { hide: vi.fn() } as unknown as OverlayHandle
  }, requestRender: vi.fn() } as unknown as TUI)
  const notice = vi.fn(), actions = new TuiActions(capabilities, {
    overlays, notice, transcript: { followLatest: vi.fn() }, interactionOrigin: () => 'synthetic-root',
  } as unknown as TuiActionHost)
  cleanup.push(() => { overlays.dispose(); native.dispose() })
  return { actions, snapshot, wait, outcome, abort, responses, notice, native,
    text: () => mounted?.render(120).join('\n') ?? '', key: (data: string) => mounted?.handleInput?.(data) }
}
describe('localized approvals through native frames and the public pending action', () => {
  it.each(['zh', 'en'] as const)('presents %s copy without altering audited reason and safely rejects', async locale => {
    setUiLocale(locale)
    const f = fixture(); f.actions.syncPending(f.snapshot)
    await vi.waitFor(() => expect(f.text()).toContain(locale === 'zh' ? '本地化审批信息' : 'LOCALIZED ENGLISH'))
    expect(f.text()).not.toContain('AUDITED ORIGINAL'); expect(f.wait.payload.reason).toBe('AUDITED ORIGINAL')
    // The conservative initial choice is Reject.
    f.key('\r'); await expect(f.outcome).resolves.toBe('rejected')
    expect(f.responses).toHaveBeenCalledOnce(); expect(f.responses.mock.calls[0]?.[0].result).toMatchObject({ ok: true, value: { outcome: 'rejected' } })
  })
  it('Escape rejects once and a cross-session or late answer cannot grant the pending call', async () => {
    const f = fixture(); f.actions.syncPending(f.snapshot)
    await vi.waitFor(() => expect(f.text()).toContain('本地化审批信息'))
    const foreign = new PendingWait('approval', f.wait.key.slice(2) as never, 'foreign' as typeof f.wait.sessionId, f.wait.payload, f.responses)
    await expect(HarnessTuiCapabilities.prototype.answerApproval.call({} as HarnessTuiCapabilities, foreign, 'allowed-once')).rejects.toThrow('bad-response')
    f.key('\u001b'); await expect(f.outcome).resolves.toBe('rejected')
    await expect(foreign.respond({ ok: true, value: { sessionId: 'synthetic-root', approvalId: f.wait.payload.approvalId, outcome: 'allowed-once' } })).resolves.toEqual({ accepted: false, reason: 'not-pending' })
  })
  it('request cancellation while the overlay is open settles cancelled and cannot turn a later allow into success', async () => {
    const f = fixture(); f.actions.syncPending(f.snapshot)
    await vi.waitFor(() => expect(f.text()).toContain('本地化审批信息'))
    f.abort.abort(); await expect(f.outcome).resolves.toBe('cancelled')
    f.key('\u001b')
    await vi.waitFor(() => expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('already settled'), 'error'))
    expect(f.responses).not.toHaveBeenCalled()
  })
})
