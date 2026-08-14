/** In-process-only Client connection entry without Browser/fixture carriers. */

import { ConnectionController } from '../../vendor/client-connection/client/connection.js'
import type {
  ConnectionHandle,
  ConnectionHandleOptions,
  HostDescription,
} from '../../vendor/client-connection/client/index.js'

/**
 * Build the official connection lifecycle around the Host bridges supplied by
 * this Bundle. The Browser and fixture constructors are intentionally omitted:
 * a terminal plugin always receives its API and RPC carriers in-process.
 */
export function createConnectionHandle(options: ConnectionHandleOptions): ConnectionHandle {
  const { api, rpc, isLoopback = true } = options
  let started = false
  let description: HostDescription | undefined
  const descriptionListeners = new Set<() => void>()
  const publishDescription = (next: HostDescription | undefined): void => {
    if (Object.is(description, next)) return
    description = next
    for (const listener of [...descriptionListeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[deepseek-tui] host-description listener threw:', error)
      }
    }
  }

  return {
    api,
    isLoopback,
    hostDescription: {
      getSnapshot: () => description,
      subscribe: (listener) => {
        descriptionListeners.add(listener)
        return () => { descriptionListeners.delete(listener) }
      },
    },
    rpc,
    start(sinks, config) {
      if (started) throw new Error('connection: the stream loop is already owned by another consumer')
      started = true
      const controller = new ConnectionController(api, {
        ...sinks,
        onConnected: (next) => {
          publishDescription(next)
          if (!Object.is(description, next)) return
          sinks.onConnected?.(next)
        },
        onStateChange: (state) => {
          if (state === 'reconnecting') publishDescription(undefined)
          sinks.onStateChange?.(state)
        },
      }, config ?? {})
      controller.start()
      return {
        stop: () => {
          controller.stop()
          publishDescription(undefined)
        },
      }
    },
  }
}
