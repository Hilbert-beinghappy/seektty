import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { officialWavSpeechFixture, waveFixture } from './fixtures/wav-speech-official.js'
import { createWavSpeechPort } from '../src/host/wav-speech-port.ts'
import { WavSpeechController } from '../src/client/wav-speech.ts'
import { wavSpeechCommand, speechProviderDetail } from '../src/client/wav-speech-view.ts'
import { scopedSource, scriptedOverlays } from './fixtures/optional-native-views.ts'

const stock = process.env.SEEKTTY_OFFICIAL_NODE_MODULES
describe.skipIf(!stock)('published rc.2 speech Gateway → WAV controller → explicit draft insertion', () => {
  let host, root, temps, path, scope, port, controller, draft, revision, text
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'seektty-speech-fixture-')); temps = join(root, 'private'); await mkdir(temps)
    path = join(root, 'fixture.wav'); await writeFile(path, waveFixture())
    host = await officialWavSpeechFixture(stock)
    scope = scopedSource(); revision = 1; text = 'Existing draft'
    draft = { read: () => ({ revision, text }), insert: vi.fn((value, expected) => {
      if (revision !== expected) return false
      text = `${text}\n${value}`; revision++; return true
    }) }
    port = createWavSpeechPort(host.ctx, scope.source.getSnapshot(), () => scope.source.getSnapshot(), 1000)
    controller = new WavSpeechController(port, scope.source, draft, undefined, 1000, temps)
  })
  afterEach(async () => { controller?.dispose(); vi.restoreAllMocks(); try { await host?.dispose() } finally { await rm(root, { recursive: true, force: true }) } })
  const selection = { providerId: 'fixture-asr', language: 'en' }
  const signal = () => new AbortController().signal
  const transcript = { text: 'Inert late fixture', audioSeconds: 0.1, inferenceSeconds: 0 }

  it('admits exactly all six published descriptors without preparing on catalog read', async () => {
    for (const descriptor of host.contract.descriptors) expect(port.reason(descriptor.method)).toBeUndefined()
    const catalog = await controller.catalog(signal())
    expect(catalog.selection).toEqual(selection)
    expect(host.calls.prepare).toEqual([]); expect(host.calls.transcribe).toEqual([])
    expect(draft.insert).not.toHaveBeenCalled()
    // The fixture is deliberately mounted without a Loader/Profile entry: real configure refuses persistence.
    const failure = await controller.configure(selection, true, signal()).catch(error => error)
    expect(failure.name).toBe('UnknownSpeechOutcome')
    expect(failure.cause.message).toContain('settings service and a profile entry')
  })
  it('rejects a lookalike namespace with the wrong published identity before Gateway dispatch', async () => {
    const descriptor = host.registry.local.get('speech/catalog')
    const bad = createWavSpeechPort({ get: name => name === 'typert'
      ? { local: { get: () => ({ ...descriptor, id: '@foreign/speech#speech/catalog' }) } } : host.ctx.get(name) },
      scope.source.getSnapshot(), () => scope.source.getSnapshot())
    const invoke = vi.spyOn(host.gateway, 'invoke')
    await expect(bad.catalog(signal())).rejects.toThrow('descriptor absent or incompatible')
    expect(invoke).not.toHaveBeenCalled()
  })
  it('refuses absent capabilities and reconnection reuse even when service methods have matching names', async () => {
    const missing = createWavSpeechPort({ get: name => name === 'typert' ? { local: { get: () => undefined } } : host.ctx.get(name) },
      scope.source.getSnapshot(), () => scope.source.getSnapshot())
    await expect(missing.catalog(signal())).rejects.toThrow('descriptor absent')
    scope.set({ generation: 2 })
    await expect(controller.catalog(signal())).rejects.toThrow('connection changed')
    expect(host.calls.transcribe).toEqual([]); expect(host.calls.prepare).toEqual([])
  })
  it('transcribes canonical WAV through the real service without inserting until explicit confirmation, then cleans only its private copy', async () => {
    const proposal = await controller.transcribeFile(path, selection, signal())
    expect(proposal.text).toBe('Inert fixture transcript 原文')
    expect(host.calls.transcribe[0].input.audio).toEqual(waveFixture())
    expect(await readdir(temps)).toEqual([])
    expect(await readdir(root)).toContain('fixture.wav')
    expect(controller.insertProposal(proposal, false)).toBe(false)
    expect(draft.insert).not.toHaveBeenCalled()
    expect(controller.insertProposal(proposal, true)).toBe(true)
    expect(text).toBe('Existing draft\nInert fixture transcript 原文')
    expect(() => controller.insertProposal(proposal, true)).toThrow('stale')
  })
  it('reuses the exact original opaque input insertion capture instead of replacing it during result review', async () => {
    const captures = []
    draft.read = () => { const capture = { fixture: captures.length }; captures.push(capture); return { revision, text, capture } }
    const proposal = await controller.transcribeFile(path, selection, signal())
    controller.insertProposal(proposal, true)
    expect(draft.insert).toHaveBeenCalledWith(proposal.text, 1, captures[0])
    expect(captures.length).toBeGreaterThan(1)
  })
  it('uses the complete view path with two explicit confirmations and the existing draft port, without message admission', async () => {
    const script = scriptedOverlays(['fixture-asr', 'wav', 'en', undefined], [path], [true, true])
    await wavSpeechCommand(controller, script.overlays)
    expect(host.calls.transcribe).toHaveLength(1)
    expect(draft.insert).toHaveBeenCalledOnce()
    expect(script.details[0].content).toContain('Inert fixture transcript')
    expect(host.calls.prepare).toEqual([])
  })
  it('leaves the composer unchanged when the user declines insertion or transcription confirmation', async () => {
    const declined = scriptedOverlays(['fixture-asr', 'wav', 'en', undefined], [path], [true, false])
    await wavSpeechCommand(controller, declined.overlays)
    expect(host.calls.transcribe).toHaveLength(1); expect(draft.insert).not.toHaveBeenCalled()
    const noRequest = scriptedOverlays(['fixture-asr', 'wav', 'en', undefined], [path], [false])
    await wavSpeechCommand(controller, noRequest.overlays)
    expect(host.calls.transcribe).toHaveLength(1); expect(text).toBe('Existing draft')
  })
  it('propagates a real official recognition refusal without retrying or staging any draft', async () => {
    host.transcribeWith(async () => { throw new Error('inert recognition refusal') })
    await expect(controller.transcribeFile(path, selection, signal())).rejects.toThrow('inert recognition refusal')
    expect(host.calls.transcribe).toHaveLength(1); expect(draft.insert).not.toHaveBeenCalled()
    expect(await readdir(temps)).toEqual([])
  })
  it('rejects oversized result text, keeps empty recognition out of drafts and strips provider SGR at insertion', async () => {
    host.transcribeWith(async () => ({ ...transcript, text: 'x'.repeat(65_537) }))
    await expect(controller.transcribeFile(path, selection, signal())).rejects.toThrow('oversized')
    host.transcribeWith(async () => ({ ...transcript, text: '' }))
    const empty = await controller.transcribeFile(path, selection, signal())
    expect(controller.insertProposal(empty, true)).toBe(false)
    host.transcribeWith(async () => ({ ...transcript, text: 'visible\u001b[8m\u001b]52;c;hidden\u0007' }))
    const plain = await controller.transcribeFile(path, selection, signal())
    expect(plain.text).toBe('visible'); expect(controller.insertProposal(plain, true)).toBe(true)
    expect(draft.insert).toHaveBeenCalledOnce()
  })
  it('refuses stale composer revisions even after ABA text edits or an edit while the user reviews the result', async () => {
    const proposal = await controller.transcribeFile(path, selection, signal())
    revision += 2 // Text went A → B → A; equality of text alone must not admit insertion.
    expect(() => controller.insertProposal(proposal, true)).toThrow('stale')
    expect(draft.insert).not.toHaveBeenCalled()
  })
  it('suppresses a transcript when the composer is edited during inference', async () => {
    const started = Promise.withResolvers(), finish = Promise.withResolvers()
    host.transcribeWith(() => { started.resolve(); return finish.promise })
    const pending = controller.transcribeFile(path, selection, signal())
    const rejected = expect(pending).rejects.toThrow('composer changed')
    await started.promise; revision++; text = 'edited'; finish.resolve(transcript); await rejected
    expect(draft.insert).not.toHaveBeenCalled(); expect(await readdir(temps)).toEqual([])
  })
  it('requires insertion confirmation in the actual view and rejects a revision change during review', async () => {
    const script = scriptedOverlays(['fixture-asr', 'wav', 'en', undefined], [path], [true, true])
    script.overlays.detail = async request => { script.details.push(request); revision += 2 }
    await wavSpeechCommand(controller, script.overlays)
    expect(draft.insert).not.toHaveBeenCalled()
    expect(script.details.at(-1).content).toContain('stale')
  })
  it('suppresses a late generation-obsolete transcription and never automatically retries', async () => {
    const started = Promise.withResolvers(), finish = Promise.withResolvers()
    host.transcribeWith(() => { started.resolve(); return finish.promise })
    const pending = controller.transcribeFile(path, selection, signal())
    const rejected = expect(pending).rejects.toThrow('outcome unknown')
    await started.promise; scope.set({ generation: 2 }); await rejected
    finish.resolve(transcript); await new Promise(resolve => setTimeout(resolve, 20))
    expect(host.calls.transcribe).toHaveLength(1); expect(draft.insert).not.toHaveBeenCalled()
    await vi.waitFor(async () => expect(await readdir(temps)).toEqual([]))
  })
  it('bounds a real provider ignoring cancellation, reports unknown and does not stage a late response', async () => {
    const finish = Promise.withResolvers()
    host.transcribeWith(() => finish.promise)
    const quickPort = createWavSpeechPort(host.ctx, scope.source.getSnapshot(), () => scope.source.getSnapshot(), 15)
    const quick = new WavSpeechController(quickPort, scope.source, draft, undefined, 1000, temps)
    try {
      await expect(quick.transcribeFile(path, selection, signal())).rejects.toThrow('outcome unknown')
      expect(host.calls.transcribe).toHaveLength(1)
      finish.resolve(transcript); await new Promise(resolve => setTimeout(resolve, 20))
      expect(draft.insert).not.toHaveBeenCalled(); expect(await readdir(temps)).toEqual([])
    } finally { finish.resolve(transcript); quick.dispose() }
  })
  it('requires explicit preparation consent and advertised source, then observes actual Host state including unknown totals', async () => {
    host.setState({ phase: 'unprepared' })
    const offer = await controller.preparationOffer(selection.providerId, signal())
    await expect(controller.prepare(offer, false, undefined, signal())).rejects.toThrow('explicitly confirmed')
    await expect(controller.prepare(offer, true, 'unadvertised', signal())).rejects.toThrow('not advertised')
    expect(host.calls.prepare).toEqual([])
    await controller.prepare(offer, true, 'fixture-source', signal())
    const report = vi.fn()
    const observed = controller.watchPreparation(selection.providerId, signal(), report)
    void observed.catch(() => {})
    await vi.waitFor(() => expect(report).toHaveBeenCalled())
    expect(speechProviderDetail(report.mock.calls[0][0])).toContain('总字节未知')
    host.setState({ phase: 'ready' }); await expect(observed).resolves.toMatchObject({ preparation: { phase: 'ready' } })
    expect(host.calls.prepare).toEqual([{ downloadSource: 'fixture-source' }])
  })
  it('surfaces actual preparation rejection and failed progress, and cancels only on explicit shared-task consent', async () => {
    host.setState({ phase: 'unprepared' }); host.failPreparation(new Error('inert prepare refusal'))
    const offer = await controller.preparationOffer(selection.providerId, signal())
    await expect(controller.prepare(offer, true, undefined, signal())).rejects.toThrow()
    expect(host.calls.prepare).toHaveLength(1)
    host.setState({ phase: 'failed', message: 'inert preparation failed' })
    await expect(controller.watchPreparation(selection.providerId, signal(), () => {})).rejects.toThrow('inert preparation failed')
    await expect(controller.cancelPreparation(selection.providerId, false, signal())).rejects.toThrow('explicit confirmation')
    expect(host.calls.cancel).toBe(0)
    await controller.cancelPreparation(selection.providerId, true, signal())
    expect((await controller.catalog(signal())).providers[0].preparation.phase).toBe('cancelled')
  })
  it('rejects missing/oversized resource estimates or changed offers without starting a download', async () => {
    host.setState({ phase: 'unprepared' })
    const estimate = host.provider.info.setupEstimate
    host.provider.info.setupEstimate = undefined
    await expect(controller.preparationOffer(selection.providerId, signal())).rejects.toThrow('unknown')
    host.provider.info.setupEstimate = { ...estimate, recommendedDiskBytes: 8 * 1024 ** 3 }
    await expect(controller.preparationOffer(selection.providerId, signal())).rejects.toThrow('admission budget')
    host.provider.info.setupEstimate = estimate
    const offer = await controller.preparationOffer(selection.providerId, signal())
    host.setState({ phase: 'checking', startedAt: 1 })
    await expect(controller.prepare(offer, true, undefined, signal())).rejects.toThrow('facts changed')
    expect(host.calls.prepare).toEqual([])
  })
  it('bounds an unresponsive shared cancellation and reports its unknown outcome without repeating it', async () => {
    const finish = Promise.withResolvers(); host.cancelWith(() => finish.promise)
    const quickPort = createWavSpeechPort(host.ctx, scope.source.getSnapshot(), () => scope.source.getSnapshot(), 15)
    const quick = new WavSpeechController(quickPort, scope.source, draft, undefined, 1000, temps)
    try {
      await expect(quick.cancelPreparation(selection.providerId, true, signal())).rejects.toThrow('outcome unknown')
      expect(host.calls.cancel).toBe(1)
    } finally { finish.resolve(); quick.dispose(); await new Promise(resolve => setTimeout(resolve, 0)) }
  })
  it('stops observation on cancellation but does not cancel or download a shared Host preparation', async () => {
    host.setState({ phase: 'downloading', resource: 'fixture-model', completedBytes: 5 })
    const abort = new AbortController(), report = vi.fn()
    const observation = controller.watchPreparation(selection.providerId, abort.signal, report)
    const rejected = expect(observation).rejects.toThrow()
    await vi.waitFor(() => expect(report).toHaveBeenCalled()); abort.abort(); await rejected
    await vi.waitFor(() => expect(host.service.listeners.size).toBe(0))
    controller.dispose()
    expect(host.calls.cancel).toBe(0); expect(host.calls.prepare).toEqual([])
    expect(host.service.snapshot().providers[0].preparation.phase).toBe('downloading')
  })
  it('validates audio, capability and readiness before executing the inert recognizer', async () => {
    const stereo = waveFixture(); stereo.writeUInt16LE(2, 22); await writeFile(path, stereo)
    await expect(controller.transcribeFile(path, selection, signal())).rejects.toThrow('16 kHz mono PCM16')
    await writeFile(path, waveFixture(16000 * 121))
    await expect(controller.transcribeFile(path, selection, signal())).rejects.toThrow('duration budget')
    await writeFile(path, waveFixture()); host.setState({ phase: 'unprepared' })
    await expect(controller.transcribeFile(path, selection, signal())).rejects.toThrow('explicitly')
    expect(host.calls.transcribe).toEqual([]); expect(await readdir(temps)).toEqual([])
  })
  it('sends real canonical protocol arguments over fixture loopback into the actual official Gateway, with no external service', async () => {
    // Transport/admission-only fixture route, deliberately not a production speech URL.
    const server = createServer(async (req, res) => {
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk)
        const request = JSON.parse(Buffer.concat(chunks).toString())
        const value = await host.gateway.invoke(request)
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value))
      } catch (error) { res.writeHead(400); res.end(String(error)) }
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/fixture/invoke`, { method: 'POST', body: JSON.stringify({
        namespace: 'speech', method: 'transcribe', args: { request: { audioBase64: waveFixture().toString('base64'), ...selection } },
      }) })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ text: 'Inert fixture transcript 原文', audioSeconds: 0.1, inferenceSeconds: 0 })
      expect(host.calls.transcribe).toHaveLength(1); expect(draft.insert).not.toHaveBeenCalled()
    } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  })
})
