import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { AccountHandoffController, accountBrowserUrl, accountCallbackOrigin, accountInformationLines, accountRouteLabel,
  type AccountRemote, type AccountView, type AccountBalance } from '../src/client/account-handoff.ts'

const client = { version: 'fixture', locale: 'zh-CN', timezoneOffsetSeconds: 0 }
const signedOut: AccountView = { status: 'signed-out', links: { usageUrl: 'https://platform.invalid/usage', topUpUrl: 'https://platform.invalid/balance' }, attempt: null }
const waiting: AccountView = { ...signedOut, attempt: { id: 'fixture-attempt' as never, phase: 'waiting-browser', authorizeUrl: 'https://platform.invalid/authorize?state=fixture' } }
const ok = <T>(value: T) => ({ ok: true as const, value })
function fixture() {
  const account = {
    getState: vi.fn(async () => ok(signedOut)), getBalance: vi.fn(async () => ok(null as AccountBalance)),
    startSignIn: vi.fn(async () => ok(waiting)), cancelSignIn: vi.fn(async (): Promise<ReturnType<typeof ok<AccountView>>> => ok({ ...signedOut, attempt: { ...waiting.attempt!, phase: 'cancelled' as const } })),
    hasRunningAccountTasks: vi.fn(async () => ok(false)), signOut: vi.fn(async () => ok(signedOut)),
  }
  return { account, controller: new AccountHandoffController({ account }, client, 50) }
}

describe('official account handoff', () => {
  it('requires published account methods, never guesses availability from a provider name', async () => {
    const controller = new AccountHandoffController({}, client)
    expect(controller.available).toBe(false)
    await expect(controller.refresh()).rejects.toThrow('unavailable')
    expect(accountRouteLabel('api-key')).toBe('API key provider')
    expect(accountRouteLabel('unknown')).toBe('Credential source unknown')
    expect(accountRouteLabel('account')).toBe('Official account')
  })
  it('validates official browser-accessible loopback HTTP callback origins', () => {
    for (const valid of ['http://localhost:1234', 'http://127.0.0.1:4567/', 'http://[::1]:2345']) expect(accountCallbackOrigin(valid)).toBe(new URL(valid).origin)
    for (const invalid of ['https://localhost:12', 'http://remote.invalid', 'http://127.0.0.1:12/callback', 'http://localhost:12?q=1', 'http://user@localhost:12', 'file:///tmp/login']) {
      expect(() => accountCallbackOrigin(invalid)).toThrow()
    }
    expect(accountBrowserUrl('javascript:alert(1)')).toBeUndefined()
    expect(accountBrowserUrl('https://user:password@platform.invalid')).toBeUndefined()
  })
  it('passes exact official positional args and returns only the Host authorization link', async () => {
    const { account, controller } = fixture()
    await controller.startSignIn('http://127.0.0.1:1234')
    expect(account.startSignIn).toHaveBeenCalledWith(client, 'http://127.0.0.1:1234', 'desktop')
    expect(controller.loginUrl).toBe(waiting.attempt!.authorizeUrl)
    await controller.cancelSignIn()
    expect(account.cancelSignIn).toHaveBeenCalledWith(waiting.attempt!.id)
    expect(controller.loginUrl).toBeUndefined()
  })
  it('cancels a late official attempt when the user cancels an unresponsive start', async () => {
    const { account } = fixture()
    let finish!: (value: ReturnType<typeof ok<AccountView>>) => void
    account.startSignIn.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const controller = new AccountHandoffController({ account }, client, 100)
    const pending = controller.startSignIn('http://localhost:1234')
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await controller.cancelSignIn(); await rejected
    finish(ok(waiting))
    await vi.waitFor(() => expect(account.cancelSignIn).toHaveBeenCalledOnce())
    expect(controller.snapshot).toBeUndefined(); expect(controller.loginUrl).toBeUndefined()
  })
  it('records a late cancellation failure without an unhandled rejection', async () => {
    const { account } = fixture()
    let finish!: (value: ReturnType<typeof ok<AccountView>>) => void
    account.startSignIn.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    account.cancelSignIn.mockRejectedValue(new Error('late cancellation refused'))
    const controller = new AccountHandoffController({ account }, client, 100)
    const pending = controller.startSignIn('http://localhost:1234')
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await controller.cancelSignIn(); await rejected; finish(ok(waiting))
    await vi.waitFor(() => expect(controller.lateCancellationError).toBeInstanceOf(Error))
  })
  it('bounds a hung late cancellation independently of refresh and never retries or applies a late reply', async () => {
    const { account } = fixture()
    let finishStart!: (value: ReturnType<typeof ok<AccountView>>) => void
    let finishCancel!: (value: ReturnType<typeof ok<AccountView>>) => void
    account.startSignIn.mockImplementation(() => new Promise(resolve => { finishStart = resolve }))
    account.cancelSignIn.mockImplementation(() => new Promise(resolve => { finishCancel = resolve }))
    const controller = new AccountHandoffController({ account }, client, 20)
    const pending = controller.startSignIn('http://localhost:1234')
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await Promise.resolve(); await Promise.resolve()
    await controller.cancelSignIn(); await rejected
    finishStart(ok({ ...waiting, attempt: { ...waiting.attempt!, id: 'late-exact' as never } }))
    await vi.waitFor(() => expect(account.cancelSignIn).toHaveBeenCalledWith('late-exact'), { interval: 1 })
    await controller.refresh()
    await vi.waitFor(() => expect(controller.lateCancellationError).toBeInstanceOf(Error), { interval: 1 })
    const error = controller.lateCancellationError as Error
    expect(error.message).toContain('not confirmed')
    expect((error.cause as Error).message).toContain('timed out')
    finishCancel(ok(waiting)); await Promise.resolve(); await Promise.resolve()
    expect(controller.snapshot).toEqual(signedOut)
    expect(controller.loginUrl).toBeUndefined()
    expect(controller.lateCancellationError).toBe(error)
    expect(account.cancelSignIn).toHaveBeenCalledOnce()
  })
  it('logout requires consent for running account tasks; refusing never calls signOut', async () => {
    const { account, controller } = fixture()
    account.hasRunningAccountTasks.mockResolvedValue(ok(true))
    const confirm = vi.fn(async () => false)
    expect(await controller.signOut(confirm)).toBe(false); expect(account.signOut).not.toHaveBeenCalled()
    expect(await controller.signOut(async () => true)).toBe(true)
    expect(account.signOut).toHaveBeenCalledWith(client)
  })
  it('does not need running-task consent when none are running and never changes API keys', async () => {
    const { account, controller } = fixture()
    const confirm = vi.fn()
    expect(await controller.signOut(confirm)).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    expect(Object.keys(account)).not.toContain('credentials')
  })
  it('bounds unresponsive running-task/consent checks and does not sign out after late approval', async () => {
    const { account } = fixture()
    account.hasRunningAccountTasks.mockResolvedValue(ok(true))
    let approve!: (value: boolean) => void
    const controller = new AccountHandoffController({ account }, client, 10)
    await expect(controller.signOut(() => new Promise(resolve => { approve = resolve }))).rejects.toThrow('timed out')
    approve(true); await Promise.resolve(); expect(account.signOut).not.toHaveBeenCalled()
    account.hasRunningAccountTasks.mockImplementation(() => new Promise(() => {}))
    await expect(controller.signOut(async () => true)).rejects.toThrow('timed out')
  })
  it('keeps balance failures/absence unknown and preserves decimal values without rounding', async () => {
    const { account, controller } = fixture()
    expect(accountInformationLines(signedOut, null)).toContain('Balance: unknown')
    expect(accountInformationLines(signedOut, { status: 'failed' })).toContain('Balance: unavailable')
    expect(accountInformationLines({ ...signedOut, status: 'credential-stored' }, { status: 'ready', value: [{ currency: 'CNY', balance: '0.123456789' }], bonusWallets: [] }))
      .toContain('Balance: 0.123456789 CNY')
    account.getBalance.mockImplementation(() => new Promise(() => {}))
    await expect(controller.refreshBalance()).rejects.toThrow('timed out')
    expect(controller.balanceSnapshot).toBeUndefined()
  })
  it('discards late state/balance after reconnect without treating stream disposal as Host login cancellation', async () => {
    const { account } = fixture()
    let finish!: (value: ReturnType<typeof ok<AccountView>>) => void
    account.startSignIn.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const controller = new AccountHandoffController({ account }, client, 100)
    const pending = controller.startSignIn('http://localhost:1234'); const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    controller.reconnect(fixture()); await rejected
    await controller.refresh(); finish(ok(waiting)); await Promise.resolve()
    expect(controller.snapshot?.status).toBe('signed-out'); expect(controller.loginUrl).toBeUndefined()
    expect(account.cancelSignIn).not.toHaveBeenCalled()
  })
  it('surfaces Remote rejection/assembly faults; validates callback before starting and rejects disposed work', async () => {
    const { account, controller } = fixture()
    await expect(controller.startSignIn('http://remote.invalid')).rejects.toThrow('loopback')
    expect(account.startSignIn).not.toHaveBeenCalled()
    account.getState.mockRejectedValue(new Error('assembly fault'))
    await expect(controller.refresh()).rejects.toThrow('assembly fault')
    const remote: AccountRemote = { account: { ...account, signOut: async () => ({ ok: false, error: new Error('denied') as never }) } }
    await expect(new AccountHandoffController(remote, client).signOut(async () => true)).rejects.toThrow('denied')
    controller.dispose(); await expect(controller.refresh()).rejects.toThrow('disposed')
  })
  it('ignores late login results after timeout and late carrier rejection after cancellation', async () => {
    const { account } = fixture()
    let finish!: (value: ReturnType<typeof ok<AccountView>>) => void
    account.startSignIn.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const controller = new AccountHandoffController({ account }, client, 5)
    await expect(controller.startSignIn('http://localhost:1234')).rejects.toThrow('timed out')
    finish(ok(waiting)); await Promise.resolve(); expect(controller.snapshot).toBeUndefined()
    let reject!: (error: Error) => void
    account.getState.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const abort = new AbortController()
    const pending = controller.refresh(abort.signal); const failed = expect(pending).rejects.toThrow('cancelled')
    await Promise.resolve(); await Promise.resolve(); abort.abort(new Error('cancelled')); await failed
    reject(new Error('late carrier failure')); await Promise.resolve()
    expect(controller.snapshot).toBeUndefined()
  })
  it('does not let an older balance query overwrite the latest query, and cancels queries on reconnect', async () => {
    const { account } = fixture()
    let finish!: (value: ReturnType<typeof ok<AccountBalance>>) => void
    account.getBalance.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const controller = new AccountHandoffController({ account }, client, 100)
    const pending = controller.refreshBalance()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const ready: AccountBalance = { status: 'ready', value: [{ currency: 'USD', balance: '1.234' }], bonusWallets: [] }
    account.getBalance.mockResolvedValueOnce(ok(ready))
    const latest = await controller.refreshBalance(); finish(ok(null)); await pending
    expect(controller.balanceSnapshot).toEqual(latest)
    account.getBalance.mockImplementation(() => new Promise(() => {}))
    const old = controller.refreshBalance(); const failed = expect(old).rejects.toThrow('cancelled')
    expect(controller.balanceSnapshot).toBeUndefined()
    controller.reconnect(fixture()); await failed; expect(controller.balanceSnapshot).toBeUndefined()
  })
  it('uses isolated loopback for a real HTTP Remote-result fixture, without real login or credentials', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(ok(signedOut)))
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    try {
      const address = server.address() as { port: number }
      const origin = `http://127.0.0.1:${address.port}`
      const { account } = fixture()
      const controller = new AccountHandoffController({ account: { ...account, getState: async () => (await fetch(origin)).json() } }, client)
      expect(await controller.refresh()).toEqual(signedOut)
      expect(accountCallbackOrigin(origin)).toBe(origin)
    } finally { server.close(); await once(server, 'close') }
  })
})
