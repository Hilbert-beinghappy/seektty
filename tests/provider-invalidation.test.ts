import { describe, expect, it } from 'vitest'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import type { TuiClientContext } from '../src/client/context.ts'

describe('Provider state invalidation', () => {
  it('advances for adapter, Settings, and connection topology changes', () => {
    const remoteListeners = new Map<string, () => void>()
    const connectionListeners = new Map<string, () => void>()
    const ctx = {
      remote: { $on: (event: string, listener: () => void) => { remoteListeners.set(event, listener) } },
      on: (event: string, listener: () => void) => { connectionListeners.set(event, listener) },
      sessions: {},
    }
    const capabilities = new HarnessTuiCapabilities(
      ctx as unknown as TuiClientContext,
      {} as never,
      'tui',
      '/test',
    )

    expect(capabilities.providerStateGeneration()).toBe(0)
    remoteListeners.get('llm/adapters-updated')?.()
    expect(capabilities.providerStateGeneration()).toBe(1)
    remoteListeners.get('settings/document-updated')?.()
    expect(capabilities.providerStateGeneration()).toBe(2)
    connectionListeners.get('connection/reset')?.()
    expect(capabilities.providerStateGeneration()).toBe(3)
  })
})
