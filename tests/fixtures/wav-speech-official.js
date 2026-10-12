/** Actual published rc.2 registry/Gateway/speech controller and provider registry.
 * Recognizer and Connection admission are inert fixture seams: no model, microphone or download.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function waveFixture(samples = 1600) {
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40)
  return buffer
}
export async function officialWavSpeechFixture(stockNodeModules, { scopedServices = false } = {}) {
  // Default to normal project dependency resolution; an explicit fixture root is portable.
  const require = stockNodeModules ? createRequire(join(stockNodeModules, '..', 'package.json')) : createRequire(import.meta.url)
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const [{ Context }, { TypertRegistry }, { TypertGatewayService }, { default: SpeechToText },
    { default: SpeechController }, { TYPERT }, { TYPERT_REMOTE }, { OperatorPeer }] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'),
    load('@deepseek-ai/dsh-experimental-speech-to-text'), load('@deepseek-ai/dsh-experimental-api-speech-to-text'),
    load('@deepseek-ai/dsh-experimental-api-speech-to-text/typert'), load('@deepseek-ai/dsh-experimental-api-speech-to-text/remote'),
    load('@deepseek-ai/dsh-client-connection'),
  ])
  const ctx = new Context()
  try {
    let serviceCtx = ctx
    if (scopedServices) {
      await ctx.plugin({ name: 'synthetic-speech-services', apply: child => { serviceCtx = child } })
    }
    const routes = new Map()
    serviceCtx.provide('connection', { operator: new OperatorPeer(serviceCtx), rpc: { intercept: () => () => {} },
      fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path) } } })
    const registry = new TypertRegistry(serviceCtx); registry.register(TYPERT)
    const gateway = new TypertGatewayService(serviceCtx, { websocketHeartbeatIntervalMs: 30_000, streamInboxBytes: 1_048_576 })
    const service = new SpeechToText(serviceCtx, { defaultProvider: { get: () => 'fixture-asr' }, language: { get: () => 'en' } })
    const listeners = new Set()
    let state = { phase: 'ready' }, preparationError, cancelWork, transcriptionWork
    const calls = { prepare: [], cancel: 0, transcribe: [] }
    const provider = { info: { id: 'fixture-asr', name: 'Inert fixture recognizer', location: 'host-local', languages: ['auto', 'en', 'zh'],
      setupEstimate: { recommendedDiskBytes: 1024, expectedMemoryBytes: 2048, minimumMinutes: 1, maximumMinutes: 2 }, downloadSources: ['fixture-source'] },
      preparation: { snapshot: () => structuredClone(state), subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        prepare: options => { calls.prepare.push(options); if (preparationError) throw preparationError; setState({ phase: 'downloading', resource: 'fixture-model', completedBytes: 3 }) },
        cancel: async () => { calls.cancel++; if (cancelWork) await cancelWork(); setState({ phase: 'cancelled' }) } },
      transcribe: async (input, signal) => { calls.transcribe.push({ input, signal }); if (transcriptionWork) return transcriptionWork(input, signal)
        return { text: 'Inert fixture transcript 原文', audioSeconds: (input.audio.length - 44) / 32000, inferenceSeconds: 0 } },
    }
    function setState(next) { state = next; for (const listener of [...listeners]) listener() }
    const unregister = service.register(provider)
    const controller = new SpeechController(serviceCtx, { maxAudioBytes: 4 * 1024 * 1024, maxDurationSeconds: 120 })
    await new Promise(resolve => setTimeout(resolve, 0))
    return { ctx, registry, gateway, controller, service, provider, calls, routes, contract: TYPERT_REMOTE,
      setState, failPreparation: error => { preparationError = error }, transcribeWith: work => { transcriptionWork = work },
      cancelWith: work => { cancelWork = work },
      dispose: async () => { await unregister(); await ctx.fiber.dispose() },
    }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
