import { expect, it, vi } from 'vitest'
import { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { TuiActions } from '../src/client/actions.ts'
import { createNativeIntakePort } from '../src/host/native-intake-bridge.ts'
import { scriptedOverlays, deferred, tick } from './fixtures/optional-native-views.ts'
import { setUiLocale } from '../src/client/locale.ts'

function observable(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) },
    set: next => { value = next; for (const fn of [...listeners]) fn() }, listeners }
}
function fixture() {
  const selection = { provider: 'fixture', model: 'vision-in-name' }
  const catalog = { default: selection, routableProviders: ['fixture'], groups: [{ id: 'fixture', name: 'Fixture', models: [{ id: selection.model, name: 'Vision name' }] }], failures: [] }
  const state = { status: 'signed-out', attempt: null, links: { usageUrl: 'https://example.invalid/usage', topUpUrl: 'https://example.invalid/top-up' } }
  const methods = ['getState', 'getBalance', 'startSignIn', 'cancelSignIn', 'hasRunningAccountTasks', 'signOut']
  const invoke = vi.fn(async ({ namespace, method }) => {
    if (namespace === 'session' && method === 'modelCatalog') return catalog
    if (method === 'getState' || method === 'cancelSignIn' || method === 'signOut') return state
    if (method === 'hasRunningAccountTasks') return true
    if (method === 'getBalance') return { status: 'failed' }
    if (method === 'startSignIn') return { ...state, attempt: { id: 'synthetic-attempt', phase: 'waiting-browser', authorizeUrl: 'https://example.invalid/sign-in', expiresAt: 999999 } }
    throw new Error('Unexpected native endpoint')
  })
  const services = { accountController: Object.fromEntries(methods.map(name => [name, () => {}])), sessionController: { modelCatalog() {} }, webServer: { host: '127.0.0.1', port: 43210 },
    typert: { local: { get: endpoint => { const [namespace, method] = endpoint.split('/'); return namespace === 'account' && methods.includes(method) || endpoint === 'session/modelCatalog' ? { namespace, method, service: namespace === 'account' ? 'accountController' : 'sessionController', invocation: { kind: 'direct' } } : undefined } } } }
  const bridge = createNativeIntakePort({ get: key => services[key], typertGateway: { invoke } })
  const sessionState = observable({ openState: 'open', running: false })
  const description = observable({ version: '0.2.0-rc.2' })
  const sessions = observable({ phase: 'ready', current: 'root', ids: ['root'], byId: { root: { id: 'root', cwd: '/fixture' } } })
  const effects = []
  const ctx = { connection: { hostDescription: description }, remote: { $on() {} }, on: () => () => {}, effect: fn => effects.push(fn()),
    sessions: { list: sessions, binding: () => ({ session: { getSnapshot: sessionState.getSnapshot, subscribe: sessionState.subscribe, projections: { faceOf: () => observable(undefined) } } }), subagentAddress: () => undefined }, workspaces: { list: observable({ items: [] }) } }
  const models = vi.fn(async () => ({ result: { ok: true, value: { current: selection, routable: true, groups: catalog.groups, failures: [] } } }))
  const api = { sessions: { models } }
  const capabilities = new HarnessTuiCapabilities(ctx, api, 'fixture', '/fixture', bridge)
  const notice = vi.fn(); const copy = vi.fn()
  const actions = script => new TuiActions(capabilities, { overlays: script.overlays, notice, copy, refresh() {}, refreshHeader() {} })
  return { services, bridge, capabilities, actions, invoke, state, models, notice, copy, description, sessions, dispose: () => effects.forEach(fn => fn?.()) }
}
it('public /model-info uses the real selected route and leaves omitted metadata unknown', async () => {
  const f = fixture(); const script = scriptedOverlays([])
  await f.actions(script).execute('model-info', '')
  expect(f.invoke).toHaveBeenCalledWith({ namespace: 'session', method: 'modelCatalog', args: {} })
  expect(f.models).toHaveBeenCalledWith({ sessionId: 'root' })
  expect(script.details[0].content).toContain('fixture/vision-in-name')
  expect(script.details[0].content).toContain('Input modalities: unknown')
  expect(script.details[0].content).toContain('Context: unknown')
  f.dispose()
})
it('public /account signs in using the existing listening HTTP origin and copies only a safe browser URL', async () => {
  const f = fixture(); const script = scriptedOverlays(['sign-in', 'copy-login', undefined])
  await f.actions(script).execute('account', '')
  expect(f.invoke.mock.calls.find(([r]) => r.method === 'startSignIn')[0]).toMatchObject({ namespace: 'account', args: { callbackOrigin: 'http://127.0.0.1:43210', loginSource: 'desktop', client: { version: '1.2.6' } } })
  expect(f.copy).toHaveBeenCalledWith('https://example.invalid/sign-in')
  expect(script.details[0].footer).toContain('浏览器')
  f.dispose()
})
it('absent callback listener disables login without starting a server or dispatching sign-in', async () => {
  const f = fixture(); f.services.webServer.port = undefined
  const script = scriptedOverlays([undefined]); await f.actions(script).execute('account', '')
  expect(script.selects[0].choices.find(row => row.id === 'sign-in').disabledReason).toBeDefined()
  expect(f.invoke.mock.calls.map(([r]) => r.method)).toEqual(['getState'])
  expect(f.bridge.intake.callbackOrigin()).toBeUndefined()
  f.dispose()
})
it('account API and native model catalog disappear with their mounted receivers', async () => {
  const f = fixture(); delete f.services.accountController
  expect(f.capabilities.accountAvailable()).toBe(false)
  const script = scriptedOverlays([]); await f.actions(script).execute('account', '')
  expect(f.invoke).not.toHaveBeenCalled()
  delete f.services.sessionController
  await expect(f.capabilities.modelInformation(new AbortController().signal)).rejects.toThrow('catalog is unavailable')
  f.dispose()
})
it('task-aware logout refusal keeps credentials and dispatches no signOut', async () => {
  const f = fixture(); const script = scriptedOverlays(['sign-out', undefined], [], [true, false])
  await f.actions(script).execute('account', '')
  expect(f.invoke.mock.calls.map(([r]) => r.method)).toEqual(['getState', 'hasRunningAccountTasks'])
  expect(f.notice).not.toHaveBeenCalledWith(expect.anything(), 'success')
  f.dispose()
})
it('task-aware logout requires both confirmations and authoritative signed-out result', async () => {
  const f = fixture(); const script = scriptedOverlays(['sign-out', undefined], [], [true, true])
  await f.actions(script).execute('account', '')
  expect(f.invoke.mock.calls.map(([r]) => r.method)).toEqual(['getState', 'hasRunningAccountTasks', 'signOut'])
  expect(f.notice).toHaveBeenCalledWith(expect.anything(), 'success')
  f.dispose()
})
it('cancel rejection remains unknown and is not reported as confirmed cancellation', async () => {
  setUiLocale('en')
  try {
    const f = fixture(); f.state.attempt = { id: 'synthetic-existing', phase: 'waiting-browser' }
    const original = f.invoke.getMockImplementation()
    f.invoke.mockImplementation(request => request.method === 'cancelSignIn' ? Promise.reject(new Error('carrier lost; unknown outcome')) : original(request))
    const script = scriptedOverlays(['cancel', undefined]); await f.actions(script).execute('account', '')
    expect(script.details[0].content).toContain('unknown outcome')
    expect(f.notice).not.toHaveBeenCalled(); f.dispose()
  } finally { setUiLocale('zh') }
})
it('disconnect fences a late model catalog response and never shows its metadata', async () => {
  const f = fixture(); const pending = deferred(); f.invoke.mockImplementation(() => pending.promise)
  const script = scriptedOverlays([]); const action = f.actions(script).execute('model-info', '')
  await tick(); f.description.set(undefined)
  pending.resolve({ default: { provider: 'late', model: 'late' }, routableProviders: [], groups: [], failures: [] })
  await action
  expect(script.details).toHaveLength(1)
  expect(script.details[0].content).not.toContain('Metadata source')
  expect(f.models).not.toHaveBeenCalled(); f.dispose()
})
it('public image intake rejects explicit text-only metadata before opening the file', async () => {
  const f = fixture(); const add = vi.spyOn(f.capabilities, 'addAttachment')
  vi.spyOn(f.capabilities, 'modelInformation').mockResolvedValue({ selection: { provider: 'fixture', model: 'vision-in-name' }, name: 'Vision name', catalog: 'listed', inputModalities: ['text'], contextWindow: null, maxTokens: null, source: 'manual' })
  await f.actions(scriptedOverlays([])).execute('attach', '/synthetic/not-read.png')
  expect(add).not.toHaveBeenCalled()
  expect(f.notice).toHaveBeenCalledWith(expect.anything(), 'error'); f.dispose()
})
it('cancelled metadata observation does not continue image intake', async () => {
  const f = fixture(); const add = vi.spyOn(f.capabilities, 'addAttachment')
  const script = scriptedOverlays([])
  script.overlays.progress = async request => {
    const abort = new AbortController(); abort.abort(new Error('user cancelled'))
    return request.work(() => {}, abort.signal)
  }
  await f.actions(script).execute('attach', '/synthetic/not-read.png')
  expect(add).not.toHaveBeenCalled(); expect(f.invoke).not.toHaveBeenCalled(); f.dispose()
})
