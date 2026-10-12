/** Explicit configured metadata at the native provider address; names/catalogs never imply modality. */
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/node-client'
import type { ModelMetadataEvidence } from './model-information.ts'
import { loadProviderConfig, providerProfileSchema, type ProviderApi } from './provider-config.ts'

export async function configuredModelEvidence(api: ProviderApi, selection: ModelSelection): Promise<ModelMetadataEvidence | undefined> {
  const config = await loadProviderConfig(api)
  const rows = config.rows.filter(row => row.entry.provider === selection.provider)
  if (rows.length !== 1) return undefined
  const row = rows[0]!
  const fields = providerProfileSchema(row.namespace, row.entry.settingsPath)?.dict?.models?.inner?.dict
  if (fields === undefined || !Array.isArray(row.profile?.models)) return undefined
  const models: unknown[] = row.profile.models
  const selected = models.filter(value => typeof value === 'object' && value !== null && Reflect.get(value, 'id') === selection.model)
  if (selected.length !== 1) return undefined
  const model = Object(selected[0])
  const contextWindow: unknown = fields.contextWindow?.type === 'number' ? Reflect.get(model, 'contextWindow') : undefined
  const maxTokens: unknown = fields.maxTokens?.type === 'number' ? Reflect.get(model, 'maxTokens') : undefined
  const modalityField = fields.inputModalities?.type === 'array' ? 'inputModalities' : fields.input?.type === 'array' ? 'input' : undefined
  const modalities: unknown = modalityField === undefined ? undefined : Reflect.get(model, modalityField)
  const inputModalities = Array.isArray(modalities) && modalities.every(value => typeof value === 'string' && value.trim()) ? modalities as string[] : undefined
  const validCapacity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  if (inputModalities === undefined && !validCapacity(contextWindow) && !validCapacity(maxTokens)) return undefined
  return { provider: selection.provider, model: selection.model, source: 'manual',
    ...(inputModalities === undefined ? {} : { inputModalities }),
    ...(validCapacity(contextWindow) ? { contextWindow } : {}), ...(validCapacity(maxTokens) ? { maxTokens } : {}) }
}
