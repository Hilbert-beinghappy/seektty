import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { officialAutoReviewFixture } from './fixtures/auto-review-official.js'
import { NativeInteractions } from '../src/host/native-interactions.ts'
import { autoReviewDenial } from '../src/client/auto-review-presentation.ts'
import { composeApprovalDetail } from '../src/client/approval-preview.ts'
import { muxFrameSchema } from '../vendor/api-contract/api/events.schema.js'
import { SearchSelectOverlay } from '../src/client/overlays.ts'
import xterm from '@xterm/headless'

const stock = process.env.SEEKTTY_OFFICIAL_NODE_MODULES
describe.skipIf(!stock)('published rc.2 Auto plugin → scoped approval → terminal presentation', () => {
  let host, interactions, frames
  beforeEach(async () => {
    interactions = new NativeInteractions(); frames = []
    interactions.subscribe(frame => frames.push(frame))
    host = await officialAutoReviewFixture(stock, interactions)
  })
  afterEach(async () => { interactions.dispose(); await host?.dispose() })

  it.each(['displayReason', 'reason'])('keeps command cells visible after an actual official Auto denial containing conceal SGR (%s)', async field => {
    host.setStream(async function* () {
      yield { type: 'text-delta', index: 0, text: JSON.stringify({ risk: 'high', decision: 'deny', reason: 'Looks safe\u001b[8m' }) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })
    const gate = await host.review()
    expect(gate.kind).toBe('ask')
    expect(gate.displayReason.en).toContain('\u001b[8m') // Real plugin preserves this untrusted input.
    const { displayReason, ...audited } = gate
    const composed = composeApprovalDetail({ ...(field === 'displayReason' ? gate : audited), locale: 'en', fallback: 'call', preview: 'DANGEROUS_COMMAND_VISIBLE' })
    expect(composed.detail).not.toContain('\u001b')
    const overlay = new SearchSelectOverlay({ title: 'Approval', detail: composed.detail, searchable: false,
      choices: [{ id: 'reject', label: 'Reject' }] }, () => {})
    const vt = new xterm.Terminal({ cols: 120, rows: 24, allowProposedApi: true })
    try {
      await new Promise(resolve => vt.write(overlay.render(120).join('\r\n'), resolve))
      let found = false
      for (let row = 0; row < vt.buffer.active.length; row++) {
        const line = vt.buffer.active.getLine(row)
        const start = line.translateToString().indexOf('DANGEROUS_COMMAND_VISIBLE')
        if (start < 0) continue
        found = true
        for (let col = start; col < start + 'DANGEROUS_COMMAND_VISIBLE'.length; col++) {
          expect(line.getCell(col).isInvisible()).toBe(0)
        }
      }
      expect(found).toBe(true)
    } finally { vt.dispose() }
  })

  it('shows actual localized ask copy but audits only the original reason in the requesting Session', async () => {
    expect(host.registered).toBe(true)
    const gate = await host.review()
    expect(gate.kind).toBe('ask')
    const outcome = host.approval.request({ agent: host.primary, toolName: 'fixture_action', callId: 'call',
      reason: gate.reason, displayReason: gate.displayReason })
    await vi.waitFor(() => expect(frames.some(frame => frame.payload.type === 'approval/requested')).toBe(true))
    const request = frames.find(frame => frame.payload.type === 'approval/requested')
    const payload = muxFrameSchema.parse(request.payload)
    expect(composeApprovalDetail({ ...payload, fallback: 'call', preview: '', locale: 'zh' }).detail)
      .toBe('Auto review 拒绝了此调用：fixture reason 原文')
    expect(interactions.respond({ type: 'client-response', rpcId: request.rpcId, result: { ok: true,
      value: { sessionId: host.foreign.id, approvalId: payload.approvalId, outcome: 'allowed-once' } } }).accepted).toBe(false)
    expect(interactions.respond({ type: 'client-response', rpcId: request.rpcId, result: { ok: true,
      value: { sessionId: host.primary.id, approvalId: payload.approvalId, outcome: 'rejected' } } }).accepted).toBe(true)
    await expect(outcome).resolves.toBe('rejected')
    expect(host.primary.events.at(-2).data).toMatchObject({ reason: gate.reason })
    expect(host.primary.events.at(-2).data).not.toHaveProperty('displayReason')
    expect(host.foreign.events).toHaveLength(4)
    expect(host.reviews).toHaveLength(1)
  })
  it('uses the actual final denial error identity under never; reviewer failures remain ordinary failures', async () => {
    host.policy(host.primary, 'never')
    const denied = await host.review()
    expect(autoReviewDenial({ isError: true, error: denied.info })).toEqual({ reason: 'fixture reason 原文' })
    expect(frames).toEqual([])
    host.setStream(async function* () { throw new Error('fixture transport failed') })
    const failure = await host.review()
    expect(failure.reason).toContain('fixture transport failed')
    expect(autoReviewDenial({ isError: true, error: failure.info })).toBeUndefined()
    expect(host.reviews).toHaveLength(2) // One request each, no implicit retry.
  })
  it('contains failed answerers as unavailable without granting approval', async () => {
    interactions.subscribe(() => { throw new Error('fixture terminal failed') })
    await expect(host.approval.request({ agent: host.primary, toolName: 'fixture_action' })).resolves.toBe('unavailable')
    expect(host.primary.events.at(-1).data.outcome).toBe('unavailable')
    const request = frames.find(frame => frame.payload.type === 'approval/requested')
    expect(interactions.respond({ type: 'client-response', rpcId: request.rpcId, result: { ok: true,
      value: { sessionId: host.primary.id, approvalId: request.payload.approvalId, outcome: 'allowed-once' } } }).accepted).toBe(false)
  })
  it('cancels a native request and rejects a late grant; foreign Session stays independent', async () => {
    const abort = new AbortController()
    const outcome = host.approval.request({ agent: host.primary, toolName: 'fixture_action', signal: abort.signal,
      displayReason: { en: 'literal copy' } })
    await vi.waitFor(() => expect(frames.some(frame => frame.payload.type === 'approval/requested')).toBe(true))
    const request = frames.find(frame => frame.payload.type === 'approval/requested')
    abort.abort(); await expect(outcome).resolves.toBe('cancelled')
    expect(interactions.respond({ type: 'client-response', rpcId: request.rpcId, result: { ok: true,
      value: { sessionId: host.primary.id, approvalId: request.payload.approvalId, outcome: 'allowed-once' } } }).accepted).toBe(false)
    expect(host.primary.events.at(-1).data.outcome).toBe('cancelled')
    expect(host.foreign.events).toHaveLength(4)
  })
  it('does not review sessions whose Host preset is not Auto', async () => {
    host.primary.session.preset = 'workspace-write'
    await expect(host.review()).resolves.toEqual({ kind: 'allow' })
    expect(host.reviews).toEqual([])
    expect(frames).toEqual([])
  })
})
