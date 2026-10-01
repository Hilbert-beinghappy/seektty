import { describe, expect, it, vi } from 'vitest'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { ModelInformationController, discoveredModelEvidence, modelImageAdmission, modelInformation, modelInformationLines, usageInformationLines } from '../src/client/model-information.ts'
const selection = { provider: 'fixture', model: 'vision-name-only' }
const catalog: ModelCatalog = { default: selection, routableProviders: ['fixture'], failures: [],
  groups: [{ id: 'fixture', name: 'fixture', models: [{ id: selection.model, name: 'Vision name' }] }] }
const ok = <T>(value: T) => ({ ok: true as const, value })

describe('exact-route model facts', () => {
  it('catalog names cannot invent modalities or limits; unknown preserves existing images with uncertainty', () => {
    const info = modelInformation(selection, catalog)
    expect(info.inputModalities).toBeNull(); expect(info.contextWindow).toBeNull()
    expect(modelImageAdmission(info)).toEqual({ allowed: true, support: 'unknown' })
    expect(modelInformationLines(info).join('\n')).toContain('Metadata source: unknown')
  })
  it('displays discovery provenance and denies images for explicit text-only metadata', () => {
    const evidence = discoveredModelEvidence('fixture', { id: selection.model, inputModalities: ['text'], contextWindow: 4096, maxTokens: 1024 })
    const info = modelInformation(selection, catalog, evidence)
    expect(info).toMatchObject({ source: 'official-discovery', contextWindow: 4096, maxTokens: 1024, inputModalities: ['text'] })
    expect(modelImageAdmission(info)).toEqual({ allowed: false, support: 'unsupported' })
    expect(modelImageAdmission(modelInformation(selection, catalog, { ...evidence, inputModalities: ['text', 'image'] })).support).toBe('supported')
  })
  it('isolates provider/model identities, preserves manual provenance and invalid limits stay unknown', () => {
    const evidence = { ...selection, source: 'manual' as const, inputModalities: ['image'], contextWindow: -1, maxTokens: Infinity }
    expect(modelInformation(selection, catalog, evidence)).toMatchObject({ source: 'manual', contextWindow: null, maxTokens: null })
    expect(modelInformation({ ...selection, provider: 'other' }, catalog, evidence).inputModalities).toBeNull()
    expect(modelInformation({ ...selection, model: 'manual-unlisted' }, catalog).catalog).toBe('unlisted')
  })
  it('does not turn missing or invalid counters into zero and keeps Aux separate', () => {
    const official = { tokens: undefined, input: 5, cost: NaN }
    expect(usageInformationLines(official, { tokens: 99 })).toEqual(['Official tokens: unknown', 'Official input: 5', 'Official cost: unknown', 'Aux tokens: 99'])
    expect(official.tokens).toBeUndefined()
  })
  it('retains selected route facts when catalog fails or a provider becomes inactive', async () => {
    let fail = false
    const controller = new ModelInformationController({ session: { modelCatalog: async () => { if (fail) throw new Error('offline'); return ok(catalog) } } })
    await controller.refresh(); fail = true
    await expect(controller.refresh()).rejects.toThrow('offline')
    expect(controller.info(selection).selection).toEqual(selection)
    expect(controller.info(selection).catalog).toBe('listed')
  })
  it('ignores late catalog results and error state from an older connection', async () => {
    let finish!: (value: ReturnType<typeof ok<ModelCatalog>>) => void
    const controller = new ModelInformationController({ session: { modelCatalog: () => new Promise(resolve => { finish = resolve }) } })
    controller.setEvidence({ ...selection, source: 'manual', inputModalities: ['image'] })
    const pending = controller.refresh(); const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    controller.reconnect({ session: { modelCatalog: async () => ok({ ...catalog, groups: [] }) } })
    await controller.refresh(); await rejected
    finish(ok(catalog)); await Promise.resolve()
    expect(controller.state).toBe('ready'); expect(controller.info(selection)).toMatchObject({ catalog: 'unlisted', source: 'unknown' })
  })
  it('handles missing methods, rejection, cancellation and an unresponsive catalog', async () => {
    await expect(new ModelInformationController({}).refresh()).rejects.toThrow('unavailable')
    const controller = new ModelInformationController({ session: { modelCatalog: () => new Promise(() => {}) } }, 5)
    await expect(controller.refresh()).rejects.toThrow('timed out')
    const abort = new AbortController(); abort.abort(new Error('cancelled'))
    await expect(controller.refresh(abort.signal)).rejects.toThrow('cancelled')
    controller.dispose(); await expect(controller.refresh()).rejects.toThrow('disposed')
    await expect(new ModelInformationController({ session: { modelCatalog: async () => ({ ok: false, error: new Error('denied') as never }) } }).refresh()).rejects.toThrow('denied')
  })
})
