/** Explicit published intake/account calls through the mounted native Gateway. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { TuiManagementBridge } from '../protocol.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { AccountView, AccountBalance } from '../client/account-handoff.ts'
const ACCOUNT_METHODS = ['getState', 'getBalance', 'startSignIn', 'cancelSignIn', 'hasRunningAccountTasks', 'signOut'] as const

export function createNativeIntakePort(ctx: Context): Pick<TuiManagementBridge, 'intake'> {
  const available = (endpoint: string): boolean => {
    const descriptor = ctx.get('typert')?.local.get(endpoint)
    if (descriptor === undefined || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== 'direct') return false
    const receiver: unknown = ctx.get(descriptor.service as never)
    return receiver !== null && receiver !== undefined && typeof Reflect.get(Object(receiver), descriptor.implementation ?? descriptor.method) === 'function'
  }
  const call = async <T>(namespace: string, method: string, args: Record<string, unknown>): Promise<RemoteResult<T>> => {
    if (!available(`${namespace}/${method}`)) throw new Error(`Current Host does not publish ${namespace}/${method}`)
    return { ok: true, value: await ctx.typertGateway.invoke({ namespace, method, args }) as T }
  }
  return { intake: {
    available,
    model: { session: { modelCatalog: () => call<ModelCatalog>('session', 'modelCatalog', {}) } },
    account: () => ACCOUNT_METHODS.every(name => available(`account/${name}`)) ? { account: {
      getState: () => call<AccountView>('account', 'getState', {}),
      getBalance: client => call<AccountBalance>('account', 'getBalance', { client }),
      startSignIn: (client, callbackOrigin, loginSource) => call<AccountView>('account', 'startSignIn', { client, callbackOrigin, loginSource }),
      cancelSignIn: attemptId => call<AccountView>('account', 'cancelSignIn', { attemptId }),
      hasRunningAccountTasks: () => call<boolean>('account', 'hasRunningAccountTasks', {}),
      signOut: client => call<AccountView>('account', 'signOut', { client }),
    } } : {},
    callbackOrigin: () => {
      const server: unknown = ctx.get('webServer' as never)
      if (typeof server !== 'object' || server === null) return undefined
      const port: unknown = Reflect.get(server, 'port')
      const host: unknown = Reflect.get(server, 'host')
      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return undefined
      if (host !== '127.0.0.1' && host !== '0.0.0.0') return undefined
      // The existing official listening HTTP service owns callback routes. No server is started here.
      return `http://127.0.0.1:${port}`
    },
  } }
}
