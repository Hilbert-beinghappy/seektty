import { afterEach, describe, expect, it, vi } from 'vitest'
import { stripVTControlCharacters } from 'node:util'
import type { TuiWelcomeFastfetchLogoResult, TuiWelcomeFastfetchResult } from '../src/protocol.ts'
import { Transcript, internals } from '../src/client/transcript.ts'
import { WelcomeController } from '../src/client/welcome.ts'
import { setBackgroundMode, setRendering } from '../src/client/theme.ts'
import { welcomeAssistant, welcomeFacts, welcomeSettings, welcomeSnapshot } from './helpers/welcome-fixture.ts'

const plain = (lines: readonly string[]) => stripVTControlCharacters(lines.join('\n'))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function fixture(native: boolean, resource?: 'fastfetch' | 'logo') {
  const factsResult = deferred<TuiWelcomeFastfetchResult>()
  const logoResult = deferred<TuiWelcomeFastfetchLogoResult>()
  let transcript!: Transcript
  const requestRender = vi.fn()
  const settings = welcomeSettings()
  const welcome = new WelcomeController({ ...settings,
    infoMode: resource === 'fastfetch' ? 'mixed' : 'custom',
    logo: { ...settings.logo, source: resource === 'logo' ? 'fastfetch' : 'none' },
  }, welcomeFacts, () => factsResult.promise, () => logoResult.promise,
  () => { transcript.refreshWelcomePresentation() }, vi.fn())
  transcript = new Transcript(() => 32, requestRender, vi.fn(), welcome)
  transcript.setNativeMode(native)
  return { transcript, welcome, requestRender, factsResult, logoResult,
    dispose() { transcript.dispose(); welcome.dispose() },
  }
}
afterEach(() => { setBackgroundMode('theme'); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('welcome-local invalidation (#196)', () => {
  it('does not notify for equal facts, but notices every changed field', () => {
    const notify = vi.fn()
    const controller = new WelcomeController(welcomeSettings(), welcomeFacts,
      async () => ({ status: 'cancelled', rows: [] }), async () => ({ status: 'cancelled' }), notify, vi.fn())
    try {
      controller.setRuntimeFacts({ ...welcomeFacts })
      expect(controller.fingerprint()).toBe(0)
      expect(notify).not.toHaveBeenCalled()
      let facts = { ...welcomeFacts }
      for (const key of Object.keys(facts) as (keyof typeof facts)[]) {
        facts = { ...facts, [key]: facts[key] + '_CHANGED' }
        controller.setRuntimeFacts(facts)
        controller.setRuntimeFacts({ ...facts })
      }
      expect(notify).toHaveBeenCalledTimes(9)
      expect(controller.fingerprint()).toBe(9)
      controller.dispose()
      controller.setRuntimeFacts(welcomeFacts)
      expect(notify).toHaveBeenCalledTimes(9)
    } finally { controller.dispose() }
  })

  for (const native of [false, true]) {
    const mode = native ? 'native' : 'full'
    for (const withSession of [false, true]) {
      it(`${mode}: refreshes both caches for ${withSession ? 'empty Session' : 'no Session'} without a snapshot update`, () => {
        const f = fixture(native)
        try {
          if (withSession) f.transcript.update(welcomeSnapshot([]))
          else f.transcript.empty()
          expect(plain(f.transcript.render(100))).toContain('MODEL_BEFORE')
          // Prime a second width; all welcome width entries must be invalidated.
          f.transcript.render(80)
          const update = vi.spyOn(f.transcript, 'update')
          const globalRefresh = vi.spyOn(f.transcript, 'refreshPresentation')
          const presentation = f.transcript.snapshotPresentation()
          f.requestRender.mockClear()
          f.welcome.setRuntimeFacts({ ...welcomeFacts, model: 'MODEL_AFTER\n'.repeat(8) })
          expect(f.transcript.snapshotPresentation()).toEqual(presentation)
          for (const width of [100, 80, 40]) {
            const rendered = plain(f.transcript.render(width))
            expect(rendered).toContain('MODEL_AFTER')
            expect(rendered).not.toContain('MODEL_BEFORE')
          }
          f.welcome.setRuntimeFacts({ ...welcomeFacts, model: 'SHORT_MODEL' })
          expect(plain(f.transcript.render(100))).toContain('SHORT_MODEL')
          expect(update).not.toHaveBeenCalled()
          expect(globalRefresh).not.toHaveBeenCalled()
          expect(f.requestRender).toHaveBeenCalledTimes(2)
        } finally { f.dispose() }
      })
    }

    it(`${mode}: 200 streamed updates do not rebuild settled history`, () => {
      setRendering({ colorMode: 'rgb', backgroundFill: 'theme', terminalBackgroundSync: 'off' })
      const f = fixture(native)
      try {
        const unit = '中文缓存测试 synthetic history with fixed content.\n'
        const text = unit.repeat(Math.ceil(35000 / unit.length)).slice(0, 35000)
        const history = Array.from({ length: 4 }, (_, index) => welcomeAssistant(`history-${index}`, text, 'settled', index + 1))
        let current = 'LIVE_BEGIN\n\n'
        const before = internals.markdownCreated
        f.transcript.update(welcomeSnapshot([...history, welcomeAssistant('live', current, 'running', 5)]))
        f.transcript.render(100)
        expect(internals.markdownCreated - before).toBe(5)
        const historyIdentities = [...f.transcript['nodeCache'].values()].slice(0, 4)
        const initialized = internals.markdownCreated
        const updated = internals.markdownUpdated
        const globalRefresh = vi.spyOn(f.transcript, 'refreshPresentation')
        for (let i = 0; i < 200; i++) {
          current += `CHUNK${String(i).padStart(3, '0')}END\n\n`
          f.transcript.update(welcomeSnapshot([...history, welcomeAssistant('live', current, 'running', 5)]))
          f.welcome.setRuntimeFacts({ ...welcomeFacts })
          if ((i + 1) % 40 === 0) f.transcript.render(100)
        }
        expect(internals.markdownCreated - initialized).toBe(0)
        expect(internals.markdownUpdated - updated).toBe(200)
        expect(globalRefresh).not.toHaveBeenCalled()
        for (let i = 0; i < 4; i++) expect(f.transcript['nodeCache'].get(`history-${i}`)).toBe(historyIdentities[i])
        const final = welcomeSnapshot([...history, welcomeAssistant('live', current + 'FINAL_SETTLED_END', 'settled', 5)])
        f.transcript.update(final)
        const rendered = f.transcript.render(100)
        const output = plain(native ? rendered : f.transcript['renderBlock'](4, 96).lines)
        expect(output.match(/CHUNK\d{3}END/g)).toEqual(Array.from({ length: 200 }, (_, i) => `CHUNK${String(i).padStart(3, '0')}END`))
        expect(output.match(/FINAL_SETTLED_END/g)).toHaveLength(1)
        const beforeChange = f.transcript.snapshotPresentation()
        const beforeCount = internals.markdownCreated
        f.requestRender.mockClear()
        f.welcome.setRuntimeFacts({ ...welcomeFacts, model: 'CHANGED_HIDDEN' })
        expect(f.transcript.snapshotPresentation()).toEqual(beforeChange)
        expect(internals.markdownCreated).toBe(beforeCount)
        expect(f.requestRender).not.toHaveBeenCalled()
      } finally { f.dispose() }
    })

    for (const resource of ['fastfetch', 'logo'] as const) for (const switchSession of [false, true]) {
      it(`${mode}: ${resource} completion ${switchSession ? 'after changing Session preserves history' : 'updates visible welcome'}`, async () => {
        const f = fixture(native, resource)
        try {
          f.transcript.update(welcomeSnapshot([]))
          f.transcript.render(100)
          f.welcome.activate()
          f.transcript.render(100)
          if (switchSession) {
            f.transcript.update(welcomeSnapshot([welcomeAssistant('next', 'NEW_SESSION_SENTINEL', 'settled')], 'next-session'))
            f.transcript.render(100)
          }
          const before = f.transcript.snapshotPresentation()
          const count = internals.markdownCreated
          f.requestRender.mockClear()
          if (resource === 'logo') f.logoResult.resolve({ status: 'ok', ansi: 'LOGO_READY' })
          else f.factsResult.resolve({ status: 'ok', rows: [{ kind: 'field', label: 'OS', value: 'FASTFETCH_READY' }] })
          await Promise.resolve()
          await Promise.resolve()
          const output = plain(f.transcript.render(100))
          expect(internals.markdownCreated).toBe(count)
          if (switchSession) {
            expect(output).toContain('NEW_SESSION_SENTINEL')
            expect(output).not.toContain('READY')
            expect(f.requestRender).not.toHaveBeenCalled()
            expect(f.transcript.snapshotPresentation()).toEqual(before)
          } else {
            expect(output).toContain(resource === 'logo' ? 'LOGO_READY' : 'FASTFETCH_READY')
            expect(f.requestRender).toHaveBeenCalled()
          }
        } finally { f.dispose() }
      })
    }
  }
})
