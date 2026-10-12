/** User-driven WAV transcription through the optional published rc.2 speech service. */
import type { OptionalViewSource } from './optional-view-lifetime.ts'
import { OptionalViewLifetime } from './optional-view-lifetime.ts'
import { ManagementInterrupted } from './management-lifetime.ts'
import { withTemporaryWave } from './wav-input.ts'
import { UnknownSpeechOutcome, type WavSpeechPort, type SpeechCatalog, type SpeechProvider, type SpeechSelection, type SpeechTranscript, type SpeechMethod } from './speech-contract.ts'
import { escapeTerminalText } from './theme.ts'

export interface SpeechBudget {
  readonly maxAudioBytes: number; readonly maxDurationSeconds: number; readonly maxTextChars: number
  /** Admission ceilings for the Host's estimates, not enforceable download/storage caps. */
  readonly maxEstimatedDiskBytes: number; readonly maxEstimatedMemoryBytes: number; readonly maxSetupMinutes: number
}
export const DEFAULT_SPEECH_BUDGET: SpeechBudget = Object.freeze({ maxAudioBytes: 4 * 1024 * 1024,
  maxDurationSeconds: 120, maxTextChars: 65_536, maxEstimatedDiskBytes: 4 * 1024 ** 3,
  maxEstimatedMemoryBytes: 2 * 1024 ** 3, maxSetupMinutes: 30 })
export interface SpeechDraftPort {
  read(): { readonly revision: number; readonly text: string; readonly capture?: unknown }
  /** Synchronous compare-and-insert using the existing composer; never submits a message. */
  insert(text: string, expectedRevision: number, capture?: unknown): boolean
}
export interface TranscriptProposal extends SpeechTranscript {
  readonly scopeKey: string; readonly draftRevision: number; readonly originalText: string
}
export interface PreparationOffer { readonly scopeKey: string; readonly provider: SpeechProvider }
const plain = (text: string) => escapeTerminalText(text).replace(/\u001b\[[0-9;:]*m/gu, '')
const ready = (provider: SpeechProvider) => provider.preparation.phase === 'ready' || provider.preparation.phase === 'standby'
function frozenSnapshot<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozenSnapshot(child)
    Object.freeze(value)
  }
  return value
}

export class WavSpeechController {
  private readonly lifetime = new AbortController()
  private busy = false
  private proposal: TranscriptProposal | undefined
  private originalDraft: ReturnType<SpeechDraftPort['read']> | undefined
  private offer: PreparationOffer | undefined
  constructor(readonly port: WavSpeechPort, readonly source: OptionalViewSource, readonly draft: SpeechDraftPort,
    readonly budget: SpeechBudget = DEFAULT_SPEECH_BUDGET, readonly timeoutMs = 30_000, readonly temporaryRoot?: string) {
    for (const limit of Object.values(budget)) if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid speech budget')
    if (!Number.isSafeInteger(budget.maxAudioBytes) || budget.maxAudioBytes < 46 || budget.maxAudioBytes > 4 * 1024 * 1024
      || !Number.isSafeInteger(budget.maxTextChars) || budget.maxDurationSeconds > 120 || budget.maxSetupMinutes > 30
      || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error('Invalid bounded WAV policy')
  }
  private key(): string {
    const scope = this.source.getSnapshot()
    if (!scope.ready || !scope.sessionId || this.lifetime.signal.aborted) throw new Error('Speech scope is unavailable')
    return JSON.stringify([scope.sessionId, scope.generation])
  }
  private require(method: SpeechMethod): void { const reason = this.port.reason(method); if (reason) throw new Error(reason); this.key() }
  private async run<T>(signal: AbortSignal, work: (inner: AbortSignal) => Promise<T>, timeout = this.timeoutMs): Promise<T> {
    if (this.busy) throw new Error('Speech operation is already pending')
    this.key(); this.busy = true
    try { return await new OptionalViewLifetime(this.source, timeout).run(AbortSignal.any([signal, this.lifetime.signal]), work) }
    finally { this.busy = false }
  }
  private async mutate(method: SpeechMethod, signal: AbortSignal, work: (inner: AbortSignal, dispatch: () => void) => Promise<void>): Promise<void> {
    let sent = false
    try { await this.run(signal, inner => work(inner, () => { sent = true })) }
    catch (error) { if (sent && error instanceof ManagementInterrupted) throw new UnknownSpeechOutcome(`speech/${method}`, error); throw error }
  }
  private validate(catalog: SpeechCatalog): SpeechCatalog {
    if (!Number.isSafeInteger(catalog.maxAudioBytes) || catalog.maxAudioBytes < 46 || !Number.isFinite(catalog.maxDurationSeconds)
      || catalog.maxDurationSeconds <= 0) throw new Error('Host audio budgets are unknown or invalid')
    if (new Set(catalog.providers.map(provider => provider.id)).size !== catalog.providers.length) throw new Error('Ambiguous speech provider roster')
    return catalog
  }
  private provider(catalog: SpeechCatalog, selection: SpeechSelection): SpeechProvider {
    const provider = catalog.providers.find(row => row.id === selection.providerId)
    if (!provider || !provider.languages.includes(selection.language)) throw new Error('Speech provider/language unavailable')
    return provider
  }
  catalog(signal: AbortSignal): Promise<SpeechCatalog> {
    return this.run(signal, async inner => { this.require('catalog'); return this.validate(await this.port.catalog(inner)) })
  }
  async configure(selection: SpeechSelection, confirmed: boolean, signal: AbortSignal): Promise<void> {
    if (!confirmed) throw new Error('Saving Host speech preferences requires explicit confirmation')
    await this.mutate('configure', signal, async (inner, dispatch) => {
      this.require('catalog'); this.provider(this.validate(await this.port.catalog(inner)), selection)
      inner.throwIfAborted(); this.require('configure'); dispatch()
      return this.port.configure(selection, inner)
    })
  }
  async preparationOffer(providerId: string, signal: AbortSignal): Promise<PreparationOffer> {
    const catalog = await this.catalog(signal)
    const provider = catalog.providers.find(row => row.id === providerId)
    if (!provider) throw new Error('Speech provider unavailable')
    const estimate = provider.setupEstimate
    if (!estimate || !Object.values(estimate).every(value => Number.isFinite(value) && value >= 0)
      || estimate.maximumMinutes < estimate.minimumMinutes) throw new Error('Preparation estimates are unknown; no automatic download')
    if (estimate.recommendedDiskBytes > this.budget.maxEstimatedDiskBytes || estimate.expectedMemoryBytes > this.budget.maxEstimatedMemoryBytes
      || estimate.maximumMinutes > this.budget.maxSetupMinutes) throw new Error('Host preparation estimates exceed the configured admission budget')
    const offer = frozenSnapshot({ scopeKey: this.key(), provider: structuredClone(provider) })
    this.offer = offer
    return offer
  }
  async prepare(offer: PreparationOffer, confirmed: boolean, downloadSource: string | undefined, signal: AbortSignal): Promise<void> {
    if (!confirmed || offer !== this.offer || offer.scopeKey !== this.key()) throw new Error('Preparation requires a current explicitly confirmed resource offer')
    if (downloadSource !== undefined && !offer.provider.downloadSources?.includes(downloadSource)) throw new Error('Download source was not advertised')
    await this.mutate('prepare', signal, async (inner, dispatch) => {
      this.require('catalog')
      const now = this.validate(await this.port.catalog(inner)).providers.find(row => row.id === offer.provider.id)
      if (!now || JSON.stringify(now) !== JSON.stringify(offer.provider)) throw new Error('Preparation facts changed; review resources again')
      if (ready(now) || !['unprepared', 'failed', 'cancelled'].includes(now.preparation.phase)) throw new Error('Preparation already active or ready; observe Host state instead')
      inner.throwIfAborted(); this.require('prepare'); dispatch()
      return this.port.prepare(now.id, downloadSource === undefined ? undefined : { downloadSource }, inner)
    })
    this.offer = undefined
  }
  async cancelPreparation(providerId: string, confirmed: boolean, signal: AbortSignal): Promise<void> {
    if (!confirmed) throw new Error('Cancelling shared Host preparation requires explicit confirmation')
    await this.mutate('cancelPreparation', signal, async (inner, dispatch) => { this.require('cancelPreparation'); dispatch(); return this.port.cancelPreparation(providerId, inner) })
    // An acknowledgement is not a fabricated ready/cancelled catalog observation.
  }
  async watchPreparation(providerId: string, signal: AbortSignal, report: (provider: SpeechProvider) => void): Promise<SpeechProvider> {
    return this.run(signal, async inner => {
      this.require('follow')
      const iterator = this.port.follow(inner)[Symbol.asyncIterator]()
      try {
        while (true) {
          const row = await iterator.next(); inner.throwIfAborted(); this.require('follow')
          if (row.done) throw new Error('Speech observation ended before readiness was confirmed')
          const provider = this.validate(row.value).providers.find(row => row.id === providerId)
          if (!provider) throw new Error('Speech provider unloaded')
          report(provider)
          if (provider.preparation.phase === 'failed') throw new Error(provider.preparation.message ?? 'Host preparation failed')
          if (ready(provider) || provider.preparation.phase === 'cancelled') return provider
        }
      } finally { void iterator.return?.().catch(() => {}) }
    }, this.budget.maxSetupMinutes * 60_000)
  }
  async transcribeFile(path: string, selection: SpeechSelection, signal: AbortSignal): Promise<TranscriptProposal> {
    this.proposal = undefined
    this.originalDraft = undefined
    const scopeKey = this.key(), original = this.draft.read()
    if (!Number.isSafeInteger(original.revision) || original.revision < 0) throw new Error('Composer revision unavailable')
    let sent = false
    try { return await this.run(signal, async inner => {
      this.require('catalog'); const catalog = this.validate(await this.port.catalog(inner))
      const provider = this.provider(catalog, selection)
      if (!ready(provider)) throw new Error('Prepare the selected provider explicitly before transcription')
      return withTemporaryWave(path, Math.min(this.budget.maxAudioBytes, catalog.maxAudioBytes), Math.min(this.budget.maxDurationSeconds, catalog.maxDurationSeconds), inner,
        async audio => {
          inner.throwIfAborted(); this.require('transcribe'); sent = true
          const transcript = await this.port.transcribe({ audioBase64: audio.toString('base64'), ...selection }, inner)
          inner.throwIfAborted(); this.require('transcribe')
          const current = this.draft.read()
          if (this.key() !== scopeKey || current.revision !== original.revision || current.text !== original.text) throw new Error('Speech result is stale: Session or composer changed')
          if (typeof transcript.text !== 'string' || transcript.text.length > this.budget.maxTextChars
            || !Number.isFinite(transcript.audioSeconds) || transcript.audioSeconds < 0
            || !Number.isFinite(transcript.inferenceSeconds) || transcript.inferenceSeconds < 0) throw new Error('Invalid or oversized speech transcript')
          const proposal = Object.freeze({ ...transcript, text: plain(transcript.text), scopeKey, draftRevision: original.revision, originalText: original.text })
          this.proposal = proposal
          this.originalDraft = original
          return proposal
        }, this.temporaryRoot)
    }) } catch (error) {
      if (sent && error instanceof ManagementInterrupted) throw new UnknownSpeechOutcome('speech/transcribe', error)
      throw error
    }
  }
  insertProposal(proposal: TranscriptProposal, confirmed: boolean): boolean {
    if (!confirmed) return false
    const current = this.draft.read()
    if (proposal !== this.proposal || proposal.scopeKey !== this.key() || current.revision !== proposal.draftRevision
      || current.text !== proposal.originalText) throw new Error('Speech draft is stale; no insertion')
    if (proposal.text.trim() === '') return false
    const inserted = this.draft.insert(proposal.text, proposal.draftRevision, this.originalDraft?.capture)
    if (!inserted) throw new Error('Composer revision changed during insertion')
    this.proposal = undefined
    this.originalDraft = undefined
    return true
  }
  dispose(): void { this.proposal = undefined; this.originalDraft = undefined; this.offer = undefined; this.lifetime.abort(new Error('Speech page closed')) }
}
