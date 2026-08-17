import { describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot,
  PendingWait,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  TuiActions,
  type TuiActionHost,
} from '../src/client/actions.ts'
import type {
  HarnessTuiCapabilities,
  TuiActiveSession,
} from '../src/client/capabilities.ts'
import type { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import { SessionToolAllowlist } from '../src/client/session-tool-allowlist.ts'

function host(overlays: Partial<OverlayQueue>, transcript: Partial<Transcript> = {}): TuiActionHost {
  return {
    overlays: overlays as OverlayQueue,
    transcript: { followLatest: vi.fn(), ...transcript } as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
}

describe('session tool allowlist', () => {
  it('clears remembered tools when the session changes', () => {
    const allowlist = new SessionToolAllowlist()
    allowlist.bind('session-a')
    allowlist.add('bash')
    expect(allowlist.has('bash')).toBe(true)
    allowlist.bind('session-b')
    expect(allowlist.has('bash')).toBe(false)
    expect(allowlist.size).toBe(0)
  })

  it('auto-allows a remembered tool without opening the overlay', async () => {
    const wait = {
      key: 'approval:2',
      kind: 'approval',
      sessionId: 'session' as SessionId,
      payload: { toolName: 'bash', approvalId: 'a2', callId: 'c2' },
    } as unknown as PendingWait<'approval'>
    const snapshot = { pending: [wait] } as unknown as ConversationSnapshot
    const answerApproval = vi.fn(async () => undefined)
    const select = vi.fn()
    const active = {
      sessionId: 'session' as SessionId,
      session: { getSnapshot: () => snapshot },
    } as unknown as TuiActiveSession
    const capabilities = {
      active: () => active,
      answerApproval,
    } as unknown as HarnessTuiCapabilities
    const actions = new TuiActions(capabilities, host({ select }))
    actions.rememberSessionTool('session', 'bash')
    actions.syncPending(snapshot)
    await vi.waitFor(() => { expect(answerApproval).toHaveBeenCalledOnce() })
    expect(select).not.toHaveBeenCalled()
    expect(answerApproval).toHaveBeenCalledWith(wait, 'allowed-once')
    expect(actions.sessionAllowlistCount()).toBe(1)
  })
})
