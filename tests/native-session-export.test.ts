import { describe, expect, it, vi } from 'vitest'
import { SessionId, SessionSeq, SessionLogOffset, SESSION_FORMAT_VERSION, type SessionEvent } from '@deepseek-ai/dsh-session'
import { MessageId } from '@deepseek-ai/dsh-llm/brand'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { readSessionConversation, type SessionExportSource } from '../src/host/session-export.ts'
import { conversationMarkdown } from '../src/client/conversation-markdown.ts'

function fixture() {
  const signal = new AbortController().signal
  const events: SessionEvent[] = [{ type: 'user/message', seq: SessionSeq(0), time: 1, surfaceOp: 'append',
    data: { id: MessageId('prompt'), role: 'user', source: { kind: 'user' }, content: [
      { type: 'text', text: 'preserve this conversation' },
      { type: 'image', attachment: { attachmentId: AttachmentId('image'), bytes: 3, width: 1, height: 1, mediaType: 'image/png' } },
    ] } }]
  const inspect = vi.fn<SessionExportSource['inspect']>(async (id: SessionId) => ({ meta: { version: SESSION_FORMAT_VERSION, id, createdAt: 1, isSeeded: false },
    inheritedEventCount: SessionLogOffset(0), events }))
  const source: SessionExportSource = { inspect, presenter: async () => () => undefined }
  return { source, signal, events, inspect }
}

describe('native logical Session export', () => {
  it('reads a complete authoritative conversation without a legacy ZIP parser', async () => {
    const f = fixture()
    const snapshot = await readSessionConversation(f.source, 'root', f.signal)
    expect(conversationMarkdown(snapshot.title, snapshot.nodes)).toContain('preserve this conversation')
    expect(f.inspect).toHaveBeenCalledWith('root', f.signal)
  })

  it('keeps append-origin human history when a model-context replacement exists', async () => {
    const f = fixture()
    const first = f.events[0]!
    if (first.type !== 'user/message') throw new Error('fixture must be a user message')
    f.events.push({ ...first, seq: SessionSeq(1), surfaceOp: { op: 'replace', startSeq: SessionSeq(0), endSeq: SessionSeq(0) } })
    const snapshot = await readSessionConversation(f.source, 'root', f.signal)
    const markdown = conversationMarkdown(snapshot.title, snapshot.nodes)
    expect(markdown.match(/preserve this conversation/gu)).toHaveLength(1)
  })

  it('honors cancellation before inspecting any Session', async () => {
    const f = fixture()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(readSessionConversation(f.source, 'root', controller.signal)).rejects.toThrow('cancelled')
    expect(f.inspect).not.toHaveBeenCalled()
  })
})
