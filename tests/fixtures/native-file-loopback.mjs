/** Test-only HTTP loopback carrier over the real official Gateway; no product route or second filesystem. */
import { createServer } from 'node:http'
import { once } from 'node:events'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

function encode(value) { return JSON.stringify(value, (_key, item) => item instanceof Uint8Array ? { $fixtureBytes: Array.from(item) } : item?.type === 'Buffer' && Array.isArray(item.data) ? { $fixtureBytes: item.data } : item) }
function decode(text) { return JSON.parse(text, (_key, item) => item !== null && typeof item === 'object' && Array.isArray(item.$fixtureBytes) ? Uint8Array.from(item.$fixtureBytes) : item) }
function failure(error) { return { error: { code: typeof error?.code === 'string' ? error.code : 'gateway/internal', message: error instanceof Error ? error.message : String(error), details: error?.details ?? {} } } }
function unwrap(value) { if (value.error) throw new RemoteError(value.error.code, value.error.message, value.error.details); return value.value }
export async function nativeFileLoopback(native) {
  const requests = []
  const server = createServer(async (request, response) => {
    const lifetime = new AbortController()
    response.on('close', () => lifetime.abort())
    try {
      if (request.method !== 'POST' || request.url !== '/synthetic-file-gateway') { response.writeHead(404).end(); return }
      let body = ''
      for await (const chunk of request) { body += chunk.toString(); if (body.length > 65536) throw new Error('Fixture request limit') }
      const frame = decode(body)
      if (frame.namespace !== 'workspaceFiles' || !['read', 'stat', 'list', 'readBytes', 'changes'].includes(frame.method)) throw new Error('Fixture endpoint rejected')
      requests.push(frame.method)
      const invocation = { namespace: frame.namespace, method: frame.method, args: frame.args, signal: lifetime.signal }
      if (frame.method === 'changes') {
        response.writeHead(200, { 'content-type': 'application/x-ndjson' })
        const stream = await native.stream(invocation)
        for await (const value of stream) response.write(`${encode({ value })}\n`)
        response.end()
      } else {
        const value = await native.invoke(invocation)
        response.writeHead(200, { 'content-type': 'application/json' }).end(encode({ value }))
      }
    } catch (error) {
      if (!response.headersSent) response.writeHead(200, { 'content-type': 'application/json' })
      if (!response.destroyed) response.end(`${encode(failure(error))}\n`)
    }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Loopback address unavailable')
  const url = `http://127.0.0.1:${address.port}/synthetic-file-gateway`
  async function open(request) {
    return fetch(url, { method: 'POST', body: encode({ namespace: request.namespace, method: request.method, args: request.args }), headers: { 'content-type': 'application/json' }, signal: request.signal })
  }
  return { requests, gateway: {
    invoke: async request => unwrap(decode(await (await open(request)).text())),
    stream: async request => {
      const response = await open(request)
      if (response.body === null) throw new Error('Loopback stream absent')
      const reader = response.body.getReader(), decoder = new TextDecoder()
      return { async *[Symbol.asyncIterator]() {
        let pending = ''
        try {
          for (;;) {
            const next = await reader.read()
            pending += decoder.decode(next.value, { stream: !next.done })
            let index
            while ((index = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, index); pending = pending.slice(index + 1); if (line) yield unwrap(decode(line)) }
            if (next.done) { if (pending) yield unwrap(decode(pending)); return }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      } }
    },
  }, close: async () => { server.closeAllConnections(); await new Promise((done, fail) => server.close(error => error ? fail(error) : done())) } }
}
