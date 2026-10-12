import { z } from 'zod'
import { SessionId, SessionSeq, SessionLogOffset, SESSION_FORMAT_VERSION, type SessionEvent } from '@deepseek-ai/dsh-session'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { SessionFollowFrame, SessionControlFrame, SessionProjectionBaseline, SessionPage } from '@deepseek-ai/dsh-api-session-controller'

/** Construct current messages with the published owner, without legacy result nesting. */
export function sessionV4Fixture(isError = true) {
  const id = SessionId('v4-fixture')
  const callId = ToolCallId('v4-call')
  const events = [
    { type: 'tool/call', seq: SessionSeq(0), time: 1,
      data: { name: 'write', callId, arguments: '{"path":"output.txt"}', turn: 1, step: 1 } },
    { type: 'tool/result', seq: SessionSeq(1), time: 2, surfaceOp: 'append',
      data: { turn: 1, step: 1, message: createToolResultMessage({ callId,
        content: [{ type: 'text', text: isError ? 'permission denied: output.txt' : 'written: output.txt' }], isError }) } },
  ] satisfies SessionEvent[]
  const meta = { id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false } as const
  const projections = { asOfSeq: 1, values: { agentPreset: 'standard' } } satisfies SessionProjectionBaseline
  const records = events.map(event => ({ type: 'event' as const, event: { ...event, data: z.json().parse(event.data) } }))
  const snapshot = { type: 'snapshot', header: meta, cursor: 1, records, hasMore: false, projections } satisfies SessionFollowFrame
  const control = { type: 'baseline', value: { projections: { [id]: projections } } } satisfies SessionControlFrame
  const page = { records, hasMore: false } satisfies SessionPage
  return { id, events, snapshot, control, page, inspection: { meta, inheritedEventCount: SessionLogOffset(0), events } }
}
