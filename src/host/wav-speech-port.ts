/** Optional published speech descriptor admission: tested dsh 0.2.0-rc.2 only.
 * Uses the installed descriptor codecs and existing Gateway authentication.
 * No optional plugin dependency, credential, route or download protocol is added.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteOperationScope } from '../client/remote-operation.ts'
import { UnknownSpeechOutcome, type SpeechMethod, type WavSpeechPort, type SpeechCatalog, type SpeechTranscript } from '../client/speech-contract.ts'
import type { OptionalViewScope } from '../client/optional-view-lifetime.ts'

const pkg = '@deepseek-ai/dsh-experimental-api-speech-to-text'
const core = '@deepseek-ai/dsh-experimental-speech-to-text/types#'
const parameter = (name: string, typeSymbol: string, optional = false) => ({ name, wire: name, source: 'json',
  ...(optional ? { acceptsUndefined: true } : {}), codec: { mode: 'strict', typeSymbol, create: 'factory' } })
const shape = (method: SpeechMethod) => ({ id: `${pkg}#speech/${method}`, service: 'speechController', namespace: 'speech', method,
  invocation: { kind: 'direct' },
  parameters: method === 'cancelPreparation' ? [parameter('providerId', `${core}SpeechProviderId`)]
    : method === 'configure' ? [parameter('patch', `${core}SpeechSelectionPatch`)]
      : method === 'prepare' ? [parameter('providerId', `${core}SpeechProviderId`), parameter('options', `${core}SpeechPreparationOptions`, true)]
        : method === 'transcribe' ? [parameter('request', `${pkg}/types#TranscriptionRequest`)] : [],
  ...(method === 'follow' ? { mode: 'stream' } : {}),
  ...(method === 'follow' || method === 'transcribe' ? { cancellation: { parameter: 'signal' } } : {}),
  result: { mode: 'strict', typeSymbol: method === 'catalog' || method === 'follow' ? `${pkg}/types#SpeechCatalog`
    : method === 'transcribe' ? `${core}Transcript` : `${pkg}#speech/${method}:result`, create: 'factory' },
})
function fingerprint(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (typeof item === 'function') return 'factory'
    if (Array.isArray(item)) return item.map(canonical)
    if (item !== null && typeof item === 'object') return Object.fromEntries(Object.entries(item)
      .filter(([key, field]) => key !== 'sourceLocation' && field !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, field]) => [key, canonical(field)]))
    return item
  }
  return JSON.stringify(canonical(value))
}
function parse(codec: InvocationDescriptor['result'], value: unknown): unknown {
  if (codec.mode !== 'strict') throw new Error('Published speech strict codec unavailable')
  return codec.create().parse(value)
}

export function createWavSpeechPort(ctx: Context, target: OptionalViewScope, current: () => OptionalViewScope,
  timeoutMs = 15_000): WavSpeechPort {
  const bound = { ...target }
  const reason = (method: SpeechMethod): string | undefined => {
    const scope = current()
    if (!bound.ready || !scope.ready || !bound.sessionId || scope.sessionId !== bound.sessionId || scope.generation !== bound.generation) return 'Speech Session/connection changed; refresh'
    try {
      const descriptor = ctx.get('typert')?.local.get(`speech/${method}`)
      if (!descriptor || fingerprint(descriptor) !== fingerprint(shape(method))) return 'Published speech descriptor absent or incompatible (tested dsh 0.2.0-rc.2)'
      const receiver: unknown = ctx.get('speechController' as never)
      if (!receiver || typeof Reflect.get(Object(receiver), method) !== 'function'
        || typeof ctx.get('typertGateway')?.[method === 'follow' ? 'stream' : 'invoke'] !== 'function') return 'Native speech service/Gateway is not mounted'
    } catch { return 'Speech capability is unknown' }
    return undefined
  }
  const descriptor = (method: SpeechMethod): InvocationDescriptor => {
    const unavailable = reason(method)
    if (unavailable) throw new Error(unavailable)
    return ctx.get('typert')!.local.get(`speech/${method}`)!
  }
  const invoke = async <T>(method: Exclude<SpeechMethod, 'follow'>, args: Record<string, unknown>, signal: AbortSignal): Promise<T> => {
    let sent = false, refused = false
    try { return await new RemoteOperationScope().run(async inner => {
      const d = descriptor(method)
      const wire = Object.fromEntries(d.parameters.map(p => [p.wire, parse(p.codec, args[p.wire])]))
      inner.throwIfAborted(); sent = true
      let value: unknown
      try { value = await ctx.get('typertGateway')!.invoke({ namespace: 'speech', method, args: wire, signal: inner }) }
      catch (error) { refused = remoteErrorOf(error) !== undefined; throw error }
      inner.throwIfAborted(); descriptor(method)
      return parse(d.result, value) as T
    }, timeoutMs, signal) } catch (error) {
      if (method !== 'catalog' && sent && !refused) throw new UnknownSpeechOutcome(`speech/${method}`, error)
      throw error
    }
  }
  return { reason,
    catalog: signal => invoke<SpeechCatalog>('catalog', {}, signal),
    configure: (patch, signal) => invoke('configure', { patch }, signal),
    prepare: (providerId, options, signal) => invoke('prepare', { providerId, options }, signal),
    cancelPreparation: (providerId, signal) => invoke('cancelPreparation', { providerId }, signal),
    transcribe: (request, signal) => invoke<SpeechTranscript>('transcribe', { request }, signal),
    follow: async function* (signal) {
      const d = descriptor('follow')
      const observation = new AbortController()
      const abort = () => observation.abort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      let iterator: AsyncIterator<unknown> | undefined
      try {
        const stream = await new RemoteOperationScope().run(() => ctx.get('typertGateway')!.stream({ namespace: 'speech', method: 'follow', args: {}, signal: observation.signal }), timeoutMs, signal)
        iterator = stream[Symbol.asyncIterator]()
        while (true) {
          // Bounds a dead stream and suppresses every late/generation-obsolete observation.
          const row = await new RemoteOperationScope().run(() => iterator!.next(), timeoutMs, signal)
          signal.throwIfAborted(); descriptor('follow')
          if (row.done) return
          yield parse(d.result, row.value) as SpeechCatalog
        }
      } finally { observation.abort(); signal.removeEventListener('abort', abort); void iterator?.return?.().catch(() => {}) }
    },
  }
}
