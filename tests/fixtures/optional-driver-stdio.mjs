/** Synthetic MCP driver only. No browser, OS input, network, model or credentials. */
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
const log = process.argv[2], cancelled = new Set()
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`)
const tools = ['click', 'screenshot', 'fail', 'slow'].map(name => ({ name, description: `Synthetic ${name}`,
  inputSchema: { type: 'object', properties: {}, additionalProperties: false } }))
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg=='
createInterface({ input: process.stdin }).on('line', async line => {
  const request = JSON.parse(line)
  if (request.method === 'notifications/cancelled') { cancelled.add(request.params.requestId); return }
  if (request.id === undefined) return
  let result
  switch (request.method) {
    case 'initialize': result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'seektty-synthetic-driver', version: '1' } }; break
    case 'ping': result = {}; break
    case 'tools/list': result = { tools }; break
    case 'tools/call': {
      if (log) appendFileSync(log, `${JSON.stringify({ name: request.params.name, pid: process.pid })}\n`)
      if (request.params.name === 'slow') await new Promise(resolve => setTimeout(resolve, 200))
      if (cancelled.has(request.id)) return
      result = request.params.name === 'screenshot'
        ? { content: [{ type: 'image', data: png, mimeType: 'image/png' }] }
        : { content: [{ type: 'text', text: request.params.name === 'fail' ? 'synthetic driver rejected' : 'synthetic result' }], ...(request.params.name === 'fail' ? { isError: true } : {}) }
      break
    }
    default: send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unsupported synthetic request' } }); return
  }
  send({ jsonrpc: '2.0', id: request.id, result })
})
