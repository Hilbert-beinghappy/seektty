/** DeepSeek Harness terminal surface. */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/node-client'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/node-client'
import type { TuiManagementBridge, TuiSurfaceOutcome } from '@deepseek-ai/dsh-tui-protocol'
import { startTuiSurface } from './surface.ts'

export type * from '@deepseek-ai/dsh-tui-protocol'
export { escapeTerminalText } from './theme.ts'

/** Invocation facts resolved by the Host-side TUI startup provider. */
export interface TuiLaunchOptions {
  /** Launcher-selected Profile shown by the status surface. */
  readonly profile?: string
  /** Absolute workspace path selected for a new session. */
  readonly cwd: string
  /** Session id to resume, or `true` for the most recent visible session. */
  readonly resume?: string | true
  /** Optional prompt sent after the target session opens. */
  readonly task?: string
  /** Draft restored from a launcher-owned single-use restart handoff. */
  readonly draft?: string
  /** Attachment paths revalidated by the new Surface after restart. */
  readonly attachmentPaths?: readonly string[]
  /** Safe status notice shown after restart. */
  readonly startupNotice?: string
}

/** Host bridge passed across the dynamic Host/Client program boundary. */
export interface TuiStartOptions extends TuiLaunchOptions {
  /** Harness API Proxy client using the in-process fetch carrier. */
  readonly api: IApiClient
  /** Logical RPC caller paired with the Host's in-process registry. */
  readonly rpc: ClientConnectionRpc
  /** Direct same-process Settings/Profile/plugin bridge owned by the Host. */
  readonly management: TuiManagementBridge
}

/** Running surface lifecycle returned to the Host bundle. */
export interface TuiSurfaceHandle {
  /** Resolves with an exit or controlled-restart request after cleanup. */
  readonly closed: Promise<TuiSurfaceOutcome>
  /** Idempotently restore the terminal and dispose the Client Runtime. */
  stop(): Promise<void>
}

/**
 * Start the terminal surface over an already assembled Harness Host bridge.
 * @param options - in-process API, logical RPC, and launch facts.
 * @returns running terminal lifecycle.
 */
export function startTui(options: TuiStartOptions): Promise<TuiSurfaceHandle> {
  return startTuiSurface(options)
}
