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
import type { OverlayQueue, SelectOverlayRequest } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'

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

describe('session tool approvals', () => {
  it('asks every time and only submits allow-once or reject', async () => {
    const wait = {
      key: 'approval:2',
      kind: 'approval',
      sessionId: 'session' as SessionId,
      payload: { toolName: 'bash', approvalId: 'a2', callId: 'c2' },
    } as unknown as PendingWait<'approval'>
    const snapshot = { pending: [wait] } as unknown as ConversationSnapshot
    const answerApproval = vi.fn(async () => undefined)
    const select = vi.fn(async (request: SelectOverlayRequest) => {
      expect(request.choices.map(choice => choice.id)).toEqual(['allow', 'reject'])
      return { id: 'allow', label: 'Allow this time' }
    })
    const active = {
      sessionId: 'session' as SessionId,
      session: { getSnapshot: () => snapshot },
    } as unknown as TuiActiveSession
    const capabilities = {
      active: () => active,
      answerApproval,
    } as unknown as HarnessTuiCapabilities
    const actions = new TuiActions(capabilities, host({ select }))
    actions.syncPending(snapshot)
    await vi.waitFor(() => { expect(answerApproval).toHaveBeenCalledOnce() })
    expect(select).toHaveBeenCalledOnce()
    expect(answerApproval).toHaveBeenCalledWith(wait, 'allowed-once')
  })
})
