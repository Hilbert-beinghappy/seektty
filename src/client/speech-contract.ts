/** Narrow adapter contract verified against published dsh 0.2.0-rc.2 speech Remote. */
export type SpeechMethod = 'catalog' | 'configure' | 'follow' | 'prepare' | 'cancelPreparation' | 'transcribe'
export interface SpeechPreparation {
  readonly phase: 'unprepared' | 'ready' | 'standby' | 'cancelled' | 'downloading' | 'checking' | 'loading' | 'waking' | 'cancelling' | 'failed'
  readonly resource?: string; readonly completedBytes?: number; readonly totalBytes?: number
  readonly startedAt?: number; readonly message?: string
  readonly step?: string
  readonly steps?: readonly { readonly kind: string; readonly status: string; readonly startedAt?: number }[]
  readonly download?: { readonly resource: string; readonly source: string; readonly reason: string; readonly code?: string; readonly status?: number }
}
export interface SpeechEstimate {
  readonly recommendedDiskBytes: number; readonly expectedMemoryBytes: number
  readonly minimumMinutes: number; readonly maximumMinutes: number
}
export interface SpeechProvider {
  readonly id: string; readonly name: string; readonly location: 'host-local' | 'cloud'
  readonly languages: readonly string[]; readonly preparation: SpeechPreparation
  readonly setupEstimate?: SpeechEstimate; readonly downloadSources?: readonly string[]
}
export interface SpeechCatalog {
  readonly providers: readonly SpeechProvider[]
  readonly selection: { readonly providerId: string; readonly language: string }
  readonly maxAudioBytes: number; readonly maxDurationSeconds: number
}
export interface SpeechTranscript { readonly text: string; readonly audioSeconds: number; readonly inferenceSeconds: number }
export interface SpeechSelection { readonly providerId: string; readonly language: string }
/** Business values over the existing authenticated native Gateway, not a new wire protocol. */
export interface WavSpeechPort {
  reason(method: SpeechMethod): string | undefined
  catalog(signal: AbortSignal): Promise<SpeechCatalog>
  configure(patch: Partial<SpeechSelection>, signal: AbortSignal): Promise<void>
  follow(signal: AbortSignal): AsyncIterable<SpeechCatalog>
  prepare(providerId: string, options: { readonly downloadSource?: string } | undefined, signal: AbortSignal): Promise<void>
  cancelPreparation(providerId: string, signal: AbortSignal): Promise<void>
  transcribe(request: { readonly audioBase64: string } & SpeechSelection, signal: AbortSignal): Promise<SpeechTranscript>
}
export class UnknownSpeechOutcome extends Error {
  constructor(readonly operation: string, cause: unknown) {
    super(`${operation} outcome unknown; no automatic retry. Refresh the Host before any explicit retry.`, { cause })
    this.name = 'UnknownSpeechOutcome'
  }
}
