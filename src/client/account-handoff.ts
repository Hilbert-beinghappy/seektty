/** Safe account projection/commands from the published dsh 0.2.0-rc.2 account descriptor.
 * Structural types keep this optional capability from adding a mandatory account package.
 * No credentials, HTTP callback server or token exchange belongs to this controller.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { RemoteOperationScope, remoteValue } from './remote-operation.ts'
import { escapeTerminalText } from './theme.ts'

export interface AccountClientMetadata { readonly version: string; readonly locale: string; readonly timezoneOffsetSeconds: number }
export interface AccountView {
  readonly status: 'signed-out' | 'credential-stored'
  readonly links: { readonly usageUrl: string; readonly topUpUrl: string }
  readonly attempt: null | { readonly id: Branded<'SignInAttemptId'>
    readonly phase: 'initializing' | 'waiting-browser' | 'exchanging' | 'committing' | 'succeeded' | 'cancelled' | 'expired' | 'failed'
    readonly authorizeUrl?: string; readonly expiresAt?: number; readonly errorCode?: 'network' | 'protocol' | 'expired' | 'storage' }
}
export type AccountBalance = null | { readonly status: 'failed' } | {
  readonly status: 'ready'
  readonly value: readonly { readonly currency: 'CNY' | 'USD'; readonly balance: string }[]
  readonly bonusWallets: readonly { readonly currency: 'CNY' | 'USD'; readonly balance: string }[]
}
export interface AccountRemote {
  readonly account?: {
    getState(): Promise<RemoteResult<AccountView>>
    getBalance(client: AccountClientMetadata): Promise<RemoteResult<AccountBalance>>
    startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<RemoteResult<AccountView>>
    cancelSignIn(attemptId: Branded<'SignInAttemptId'>): Promise<RemoteResult<AccountView>>
    hasRunningAccountTasks(): Promise<RemoteResult<boolean>>
    signOut(client: AccountClientMetadata): Promise<RemoteResult<AccountView>>
  }
}

export function accountCallbackOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Official login requires a browser-accessible loopback HTTP origin')
  return url.origin
}

export function accountBrowserUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

/** Route origin must be supplied by an authoritative caller; names never classify accounts. */
export function accountRouteLabel(origin: 'account' | 'api-key' | 'unknown'): string {
  return origin === 'account' ? 'Official account' : origin === 'api-key' ? 'API key provider' : 'Credential source unknown'
}

export class AccountHandoffController {
  private readonly operations = new RemoteOperationScope()
  private generation = 0
  private view: AccountView | undefined
  private balance: AccountBalance | undefined
  private balanceGeneration = 0
  private cancellationError: unknown
  private login: { cancelled: boolean; pending: boolean; api: NonNullable<AccountRemote['account']>; attemptId?: Branded<'SignInAttemptId'> } | undefined
  constructor(private remote: AccountRemote, private readonly client: AccountClientMetadata, readonly timeoutMs = 10_000) {}
  get available(): boolean {
    const account = this.remote.account
    return account !== undefined && ['getState', 'getBalance', 'startSignIn', 'cancelSignIn', 'hasRunningAccountTasks', 'signOut']
      .every(key => typeof Reflect.get(account, key) === 'function')
  }
  get snapshot(): AccountView | undefined {
    return this.view === undefined ? undefined : { ...this.view, links: { ...this.view.links }, attempt: this.view.attempt === null ? null : { ...this.view.attempt } }
  }
  get balanceSnapshot(): AccountBalance | undefined { return this.balance }
  get lateCancellationError(): unknown { return this.cancellationError }
  get loginUrl(): string | undefined {
    return this.view?.attempt?.phase === 'waiting-browser' ? accountBrowserUrl(this.view.attempt.authorizeUrl) : undefined
  }
  private api(): NonNullable<AccountRemote['account']> {
    if (!this.available) throw new Error('Official account capability unavailable')
    return this.remote.account!
  }
  private begin(): number { this.operations.cancel(); return ++this.generation }
  private apply(view: AccountView, generation: number): void {
    if (generation !== this.generation) return
    this.view = view; this.balance = undefined
  }
  async refresh(signal?: AbortSignal): Promise<AccountView> {
    const api = this.api(), generation = this.begin()
    const view = await this.operations.run(async () => remoteValue(await api.getState()), this.timeoutMs, signal)
    this.apply(view, generation)
    return view
  }
  async refreshBalance(signal?: AbortSignal): Promise<AccountBalance> {
    const api = this.api(), generation = this.generation
    const balanceGeneration = ++this.balanceGeneration
    this.balance = undefined
    const balance = await this.operations.run(async () => remoteValue(await api.getBalance(this.client)), this.timeoutMs, signal)
    if (generation === this.generation && balanceGeneration === this.balanceGeneration) this.balance = balance
    return balance
  }
  /** E supplies the origin of the existing official HTTP callback service (or SSH forwarded origin). */
  async startSignIn(callbackOrigin: string, signal?: AbortSignal): Promise<AccountView> {
    const origin = accountCallbackOrigin(callbackOrigin), api = this.api(), generation = this.begin()
    const login: NonNullable<typeof this.login> = { cancelled: false, pending: true, api }
    this.cancellationError = undefined
    this.login = login
    const view = await this.operations.run(async () => {
      const value = remoteValue(await api.startSignIn(this.client, origin, 'desktop'))
      login.pending = false
      if (value.attempt) login.attemptId = value.attempt.id
      // Official startSignIn has no signal. An explicit cancel also cancels its late attempt.
      if (login.cancelled && login.attemptId) {
        // Keep the explicit request independent of refresh/dispose, but bound its
        // observation. A carrier timeout does not prove that Host cancellation failed.
        void new RemoteOperationScope().run(async () => remoteValue(await api.cancelSignIn(login.attemptId!)), this.timeoutMs).catch(error => {
          if (this.login === login) this.cancellationError = new Error('Late sign-in cancellation result unknown (not confirmed)', { cause: error })
        })
      }
      return value
    }, this.timeoutMs, signal)
    this.apply(view, generation)
    return view
  }
  async cancelSignIn(signal?: AbortSignal): Promise<void> {
    const login = this.login
    if (login) login.cancelled = true
    const api = login?.api ?? this.api()
    const attemptId = login?.pending ? login.attemptId : this.view?.attempt?.id ?? login?.attemptId
    const generation = this.begin()
    if (!attemptId) return
    const view = await this.operations.run(async () => remoteValue(await api.cancelSignIn(attemptId)), this.timeoutMs, signal)
    this.apply(view, generation)
  }
  async signOut(confirmRunningTasks: (signal: AbortSignal) => Promise<boolean>, signal?: AbortSignal): Promise<boolean> {
    const api = this.api(), generation = this.begin()
    const view = await this.operations.run(async operationSignal => {
      const running = remoteValue(await api.hasRunningAccountTasks())
      operationSignal.throwIfAborted()
      if (running && !await confirmRunningTasks(operationSignal)) return undefined
      operationSignal.throwIfAborted()
      return remoteValue(await api.signOut(this.client))
    }, this.timeoutMs, signal)
    if (view === undefined) return false
    this.apply(view, generation)
    return true
  }
  reconnect(remote: AccountRemote): void {
    this.begin(); this.remote = remote; this.view = undefined; this.balance = undefined; this.login = undefined
  }
  dispose(): void { this.generation++; this.operations.dispose() }
}

export function accountInformationLines(view: AccountView | undefined, balance?: AccountBalance): readonly string[] {
  const lines = ['Source: Official account', `Account: ${view?.status ?? 'unknown'}`]
  if (view?.attempt) lines.push(`Login: ${view.attempt.phase}${view.attempt.errorCode ? ` (${view.attempt.errorCode})` : ''}`)
  if (balance?.status === 'ready') {
    lines.push(...balance.value.map(wallet => escapeTerminalText(`Balance: ${wallet.balance} ${wallet.currency}`)),
      ...balance.bonusWallets.map(wallet => escapeTerminalText(`Bonus balance: ${wallet.balance} ${wallet.currency}`)))
  } else lines.push(`Balance: ${balance?.status === 'failed' ? 'unavailable' : 'unknown'}`)
  return lines
}
