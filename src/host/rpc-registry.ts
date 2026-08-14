/** Transport-independent ownership registry for logical Connection RPC. */

import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  ConnectionRpcEndpointMatcher,
  ConnectionRpcHandler,
  ConnectionRpcHandlerOptions,
} from '@deepseek-ai/dsh-client-connection'
import { assertConnectionRpcTarget, assertDedicatedRpcChannel } from './rpc-target.ts'

interface ConnectionRpcRegistration {
  readonly handler: ConnectionRpcHandler
  readonly options: ConnectionRpcHandlerOptions
}

interface ConnectionRpcInterceptor extends ConnectionRpcRegistration {
  readonly matches: ConnectionRpcEndpointMatcher
}

/**
 * Owns logical channel registrations independently of HTTP or in-process
 * transport. Carrier plugins add lifetime and trust-policy enforcement around
 * these registrations.
 */
export class ConnectionRpcRegistry {
  private readonly channels = new Map<string, ConnectionRpcRegistration>()
  private readonly interceptors = new Map<'/api', ConnectionRpcInterceptor>()

  /**
   * Claim one dedicated logical channel.
   * @param channel - absolute, non-reserved channel.
   * @param handler - decoded handler.
   * @param options - authority policy enforced by the carrier.
   * @returns synchronous withdrawal function.
   */
  register(
    channel: string,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => void {
    assertDedicatedRpcChannel(channel)
    if (this.channels.has(channel)) {
      throw new Error(`connection: RPC channel ${JSON.stringify(channel)} already has a handler`)
    }
    const registration = { handler, options }
    this.channels.set(channel, registration)
    return () => {
      if (this.channels.get(channel) === registration) this.channels.delete(channel)
    }
  }

  /**
   * Claim selected endpoints on the shared `/api` channel.
   * @param channel - reserved shared channel.
   * @param matches - endpoint ownership predicate.
   * @param handler - decoded handler.
   * @param options - authority policy enforced by the carrier.
   * @returns synchronous withdrawal function.
   */
  intercept(
    channel: string,
    matches: ConnectionRpcEndpointMatcher,
    handler: ConnectionRpcHandler,
    options: ConnectionRpcHandlerOptions,
  ): () => void {
    if (channel !== '/api') {
      throw new Error(`connection: invalid shared RPC channel ${JSON.stringify(channel)}`)
    }
    if (this.interceptors.has(channel)) {
      throw new Error(`connection: shared RPC channel ${JSON.stringify(channel)} already has an interceptor`)
    }
    const registration = { matches, handler, options }
    this.interceptors.set(channel, registration)
    return () => {
      if (this.interceptors.get(channel) === registration) this.interceptors.delete(channel)
    }
  }

  /**
   * Resolve one registered endpoint without invoking it.
   * @param channel - logical channel.
   * @param endpoint - channel-relative endpoint.
   * @returns registration selected by channel ownership.
   */
  resolve(channel: string, endpoint: string): ConnectionRpcRegistration | undefined {
    assertConnectionRpcTarget(channel, endpoint)
    if (channel !== '/api') return this.channels.get(channel)
    const interceptor = this.interceptors.get(channel)
    return interceptor?.matches(endpoint) === true ? interceptor : undefined
  }

  /**
   * Dispatch one endpoint through the current registration.
   * @param channel - logical channel.
   * @param endpoint - channel-relative endpoint.
   * @param payload - handler-owned request payload.
   * @param signal - caller cancellation signal.
   * @returns the existing RPC result envelope.
   */
  dispatch(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<RpcResult<unknown>> {
    const registration = this.resolve(channel, endpoint)
    if (registration === undefined) {
      throw new Error(`connection: no RPC handler for ${JSON.stringify(`${channel}/${endpoint}`)}`)
    }
    return registration.handler(endpoint, payload, signal)
  }
}
