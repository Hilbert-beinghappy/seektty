/** Network-free Host/Client carrier for one-process product surfaces. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  ClientConnectionRpc,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcHandler,
  ConnectionRpcHandlerOptions,
  HostConnectionHandle,
  HostConnectionRpc,
} from '@deepseek-ai/dsh-client-connection'
import { ConnectionRpcRegistry } from './rpc-registry.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Connection transport and RPC registrations. */
    connection: HostConnectionHandle
  }
}

/** Host handle exposed by the network-free Connection carrier. */
export interface InProcessConnectionHandle extends HostConnectionHandle {
  /** Client caller paired with this exact Host registry. */
  readonly clientRpc: ClientConnectionRpc
}

/**
 * Owns an in-process logical RPC registry. The process boundary is already
 * loopback-trusted; authority policies remain part of each registration so a
 * later network carrier cannot silently weaken them.
 */
export class InProcessConnectionService extends Service implements InProcessConnectionHandle {
  private readonly registry = new ConnectionRpcRegistry()

  /** Client caller paired with this service's registry. */
  readonly clientRpc: ClientConnectionRpc = {
    call: (channel, endpoint, payload, signal) =>
      this.call(channel, endpoint, payload, signal),
  }

  /**
   * Provide the Host half without a Web server or listening socket.
   * @param ctx - owning Host Cordis context.
   */
  constructor(ctx: Context) {
    super(ctx, 'connection')
  }

  /** Generic channel registry scoped to the Context reading this service. */
  get rpc(): HostConnectionRpc {
    const owner = this.ctx
    return {
      handle: (channel, handler, options) => this.register(owner, channel, handler, options),
      intercept: (channel, matches, handler, options) =>
        this.registerInterceptor(owner, channel, matches, handler, options),
    }
  }

  private register(
    owner: Context,
    channel: string,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => Promise<void> {
    return owner.effect(
      () => this.registry.register(channel, handler, options),
      `client-connection-in-process: ${channel} rpc channel`,
    )
  }

  private registerInterceptor(
    owner: Context,
    channel: '/api',
    matches: ConnectionRpcEndpointMatcher,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => Promise<void> {
    return owner.effect(
      () => this.registry.intercept(channel, matches, handler, options),
      `client-connection-in-process: ${channel} rpc interceptor`,
    )
  }

  private async call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<unknown>> {
    signal?.throwIfAborted()
    const carrierSignal = signal ?? new AbortController().signal
    try {
      const pending = this.registry.dispatch(channel, endpoint, payload, carrierSignal)
      return signal === undefined ? await pending : await abortable(pending, signal)
    } catch (error) {
      if (signal?.aborted === true) throw abortReason(signal)
      throw new Error(
        `transport failure for ${channel}/${endpoint}: handler failure: ${String(error)}`,
        { cause: error },
      )
    }
  }
}

/** Stable Cordis plugin name. */
export const name = 'client-connection-in-process'

/** Required services (none — this is a network-free transport root). */
export const inject: string[] = []

/**
 * Provide one in-process Connection service.
 * @param ctx - Host Cordis context.
 */
export function apply(ctx: Context): void {
  new InProcessConnectionService(ctx)
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { reject(abortReason(signal)) }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('connection request aborted', { cause: signal.reason })
}
