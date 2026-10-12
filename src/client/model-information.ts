/** Model metadata presentation for published dsh 0.2.0-rc.2; missing facts remain unknown. */
import type { ModelCatalog, ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-llm/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { RemoteOperationScope, remoteValue } from './remote-operation.ts'
import { escapeTerminalText } from './theme.ts'

export interface ModelMetadataEvidence {
  readonly provider: string
  readonly model: string
  readonly source: 'official-discovery' | 'manual'
  readonly inputModalities?: readonly string[]
  readonly contextWindow?: number
  readonly maxTokens?: number
}
export interface ModelInformation {
  readonly selection: ModelSelection
  readonly name: string
  readonly catalog: 'listed' | 'unlisted' | 'unknown'
  readonly inputModalities: readonly string[] | null
  readonly contextWindow: number | null
  readonly maxTokens: number | null
  readonly source: ModelMetadataEvidence['source'] | 'unknown'
}
export interface ModelInformationRemote {
  readonly session?: { modelCatalog(): Promise<RemoteResult<ModelCatalog>> }
}

export function discoveredModelEvidence(provider: string, model: LlmDiscoveredModel): ModelMetadataEvidence {
  return { provider, model: model.id, source: 'official-discovery',
    ...(model.inputModalities === undefined ? {} : { inputModalities: [...model.inputModalities] }),
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }) }
}

const capacity = (value: number | undefined): number | null =>
  value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null

/** The rc.2 catalog omits modalities/capacity. Only exact-route evidence can supply them. */
export function modelInformation(selection: ModelSelection, catalog?: ModelCatalog, evidence?: ModelMetadataEvidence): ModelInformation {
  const model = catalog?.groups.find(group => group.id === selection.provider)?.models.find(model => model.id === selection.model)
  const exact = evidence?.provider === selection.provider && evidence.model === selection.model ? evidence : undefined
  const modalities = exact?.inputModalities
  return { selection: { ...selection }, name: model?.name ?? selection.model,
    catalog: catalog === undefined ? 'unknown' : model ? 'listed' : 'unlisted',
    inputModalities: modalities === undefined || modalities.some(value => typeof value !== 'string' || !value.trim()) ? null : [...modalities],
    contextWindow: capacity(exact?.contextWindow), maxTokens: capacity(exact?.maxTokens), source: exact?.source ?? 'unknown' }
}

/** Unknown retains the existing image path, with an explicit uncertainty warning for the caller. */
export function modelImageAdmission(info: ModelInformation): { readonly allowed: boolean; readonly support: 'supported' | 'unsupported' | 'unknown' } {
  if (info.inputModalities === null) return { allowed: true, support: 'unknown' }
  const allowed = info.inputModalities.includes('image')
  return { allowed, support: allowed ? 'supported' : 'unsupported' }
}

export function modelInformationLines(info: ModelInformation): readonly string[] {
  return [escapeTerminalText(`${info.name} · ${info.selection.provider}/${info.selection.model}`),
    `Input modalities: ${info.inputModalities === null ? 'unknown' : info.inputModalities.map(escapeTerminalText).join(', ') || 'none'}`,
    `Context: ${info.contextWindow ?? 'unknown'} · maximum output: ${info.maxTokens ?? 'unknown'}`,
    `Metadata source: ${info.source} · catalog: ${info.catalog}`]
}

export class ModelInformationController {
  private readonly operations = new RemoteOperationScope()
  private catalog: ModelCatalog | undefined
  private readonly evidence = new Map<string, ModelMetadataEvidence>()
  private generation = 0
  state: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
  error: unknown
  constructor(private remote: ModelInformationRemote, readonly timeoutMs = 10_000) {}
  private key(provider: string, model: string): string { return JSON.stringify([provider, model]) }
  setEvidence(value: ModelMetadataEvidence): void {
    this.evidence.set(this.key(value.provider, value.model), { ...value, ...(value.inputModalities === undefined ? {} : { inputModalities: [...value.inputModalities] }) })
  }
  info(selection: ModelSelection): ModelInformation { return modelInformation(selection, this.catalog, this.evidence.get(this.key(selection.provider, selection.model))) }
  async refresh(signal?: AbortSignal): Promise<void> {
    this.operations.cancel()
    const generation = ++this.generation
    const remote = this.remote.session
    if (!remote?.modelCatalog) { this.state = 'error'; throw new Error('Model catalog unavailable') }
    this.state = 'loading'
    try {
      const catalog = await this.operations.run(async operationSignal => {
        const value = remoteValue(await remote.modelCatalog())
        operationSignal.throwIfAborted()
        return value
      }, this.timeoutMs, signal)
      if (generation === this.generation) { this.catalog = catalog; this.state = 'ready'; this.error = undefined }
    } catch (error) {
      if (generation === this.generation) { this.error = error; this.state = 'error' }
      throw error
    }
  }
  reconnect(remote: ModelInformationRemote): void {
    this.generation++; this.operations.cancel(); this.remote = remote; this.catalog = undefined; this.evidence.clear(); this.state = 'idle'; this.error = undefined
  }
  dispose(): void { this.generation++; this.operations.dispose() }
}

/** Keep counters from separate sources separate; Aux never replaces official tokenUsage. */
export function usageInformationLines(official: Readonly<Record<string, number | undefined>>,
  auxiliary: Readonly<Record<string, number | undefined>> = {}): readonly string[] {
  const format = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0 ? String(value) : 'unknown'
  return [...Object.entries(official).map(([key, value]) => `Official ${escapeTerminalText(key)}: ${format(value)}`),
    ...Object.entries(auxiliary).map(([key, value]) => `Aux ${escapeTerminalText(key)}: ${format(value)}`)]
}
