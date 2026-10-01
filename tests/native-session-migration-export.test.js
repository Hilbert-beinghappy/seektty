import { createRequire } from 'node:module'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { exportSession, readSessionConversation } from '../src/host/session-export.ts'
import { conversationMarkdown } from '../src/client/conversation-markdown.ts'

// Resolve build-static codecs through their published owner, not a parallel migration.
const require = createRequire(import.meta.url)
const queryRequire = createRequire(require.resolve('@deepseek-ai/dsh-session-query'))
const { createSessionFormatCatalogWithChildren } = await import(queryRequire.resolve('@deepseek-ai/dsh-session-format-catalog'))
const catalogRequire = createRequire(queryRequire.resolve('@deepseek-ai/dsh-session-format-catalog'))
const { releasedV3SessionFormatCodec } = await import(catalogRequire.resolve('@deepseek-ai/dsh-session-format-v3-to-v4'))
const exportRequire = createRequire(require.resolve('@deepseek-ai/dsh-session-log-export'))
const { unzipSync } = exportRequire('fflate')

it('preserves a copied V3 log while the official migration feeds V4 Markdown and canonical ZIP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'seektty-v3-copy-'))
  try {
const header = {version:3,id:'old',createdAt:1,isSeeded:false,delegationDepth:0}
const events = [
 {type:'turn/start',seq:0,time:1,data:{turn:1}},
 {type:'step/start',seq:1,time:2,data:{turn:1,step:1}},
 {type:'assistant/message',seq:2,time:3,surfaceOp:'append',data:{turn:1,step:1,stream:[],message:{id:'assistant',role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'tool-call',id:'call',name:'write',arguments:'{}'}]}}},
 {type:'tool/call',seq:3,time:4,data:{turn:1,step:1,callId:'call',name:'write',arguments:'{}'}},
 {type:'tool/result',seq:4,time:5,surfaceOp:'append',data:{turn:1,step:1,message:{id:'result',role:'user',source:{kind:'tool',callId:'call'},content:[{type:'tool-result',toolCallId:'call',content:[{type:'text',text:'old failure'}],isError:true}]}}},
 {type:'step/end',seq:5,time:6,data:{turn:1,step:1}},
 {type:'turn/end',seq:6,time:7,data:{turn:1,reason:{kind:'completed'}}},
]
    const oldPath = join(root, 'session.v3.jsonl')
    const rows = [releasedV3SessionFormatCodec.encodeHeader(header, 0), ...events.map(event => releasedV3SessionFormatCodec.encodeEvent(event))]
    const original = rows.map(row => JSON.stringify(row)).join('\n') + '\n'
    await writeFile(oldPath, original)
    const catalog = createSessionFormatCatalogWithChildren([])
    const [physical, ...body] = (await readFile(oldPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const restore = catalog.createRestore(physical, { recovery: 'strict', validation: 'transformed' })
    for (const row of body) restore.decodeRow(row)
    const migrated = restore.finish()
    expect(migrated.header.version).toBe(4)
    const result = migrated.events.find(event => event.type === 'tool/result')
    expect(result.data.message).toMatchObject({ role: 'tool', content: [{ type: 'text', text: 'old failure' }], isError: true })
    const release = vi.fn(async () => {})
    const conversation = await readSessionConversation({
      inspect: async () => ({ meta: migrated.header, events: migrated.events, inheritedEventCount: migrated.inheritedEventCount }),
      presenter: async () => ({ present: () => undefined, [Symbol.asyncDispose]: release }),
    }, 'old', new AbortController().signal)
    expect(conversationMarkdown(conversation.title, conversation.nodes)).toContain('## Tool result (error)\n\nold failure')
    expect(release).toHaveBeenCalledOnce()
    const close = vi.fn(async () => {})
    const services = { sessionQuery: {}, attachments: {}, sessionPersistence: { open: vi.fn(async () => ({
      header: migrated.header, read: async () => ({ events: migrated.events }), close,
    })) } }
    const payload = await exportSession({ get: key => services[key] }, 'old', false, new AbortController().signal)
    const zip = new Uint8Array(await new Response(payload.stream).arrayBuffer())
    const files = unzipSync(zip)
    expect(Object.keys(files)).toEqual(['session.v4.jsonl'])
    const exported = Buffer.from(files['session.v4.jsonl']).toString('utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(exported[0].version).toBe(4)
    expect(exported.find(event => event.type === 'tool/result').data.message).toEqual(result.data.message)
    expect(close).toHaveBeenCalledOnce()
    expect(await readFile(oldPath, 'utf8')).toBe(original)
  } finally { await rm(root, { recursive: true, force: true }) }
})
