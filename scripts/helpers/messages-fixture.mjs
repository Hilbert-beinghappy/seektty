/** Loopback-only Messages API replies for official dsh 0.2.0-rc.2 acceptance. */
import { setTimeout as delay } from 'node:timers/promises'

export async function messagesFixtureReply(res, data, { id, content, tool, slow = false }) {
  const usage = { input_tokens: 10, output_tokens: 5 }
  const message = { id, type: 'message', role: 'assistant', model: data.model,
    content: tool ? [{ type: 'tool_use', id: `${id}-tool`, name: tool.name, input: tool.arguments }] : [{ type: 'text', text: content }],
    stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null, usage }
  if (!data.stream) {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(message)); return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const emit = (type, value) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`)
  emit('message_start', { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
  emit('content_block_start', { index: 0, content_block: tool
    ? { type: 'tool_use', id: `${id}-tool`, name: tool.name, input: {} } : { type: 'text', text: '' } })
  if (tool) emit('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.arguments) } })
  else {
    const parts = slow ? ['LOCAL_CANCEL_BEGIN', ...Array(30).fill(' waiting')] : [content.slice(0, 6), content.slice(6)]
    for (const text of parts) {
      if (res.destroyed) return
      emit('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
      await delay(slow ? 250 : 120)
    }
  }
  emit('content_block_stop', { index: 0 })
  emit('message_delta', { delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } })
  emit('message_stop', {})
  res.end()
}
