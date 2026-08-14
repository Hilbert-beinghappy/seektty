/** Client-only Cordis view kept separate from the Host service namespace. */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ISessions,
  IWorkspaces,
} from '@deepseek-ai/dsh-client-runtime/node-client'

/**
 * Host and Client plugins both augment Cordis' global Context with services
 * named `sessions` and `workspaces`. A standalone Bundle contains both halves,
 * so this view pins those names to the Client Runtime faces inside the TUI.
 */
export type TuiClientContext = Omit<Context, 'sessions' | 'workspaces'> & {
  readonly sessions: ISessions
  readonly workspaces: IWorkspaces
}
