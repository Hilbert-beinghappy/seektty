/** SeekTTY's explicit terminal extension contract; not a renderer for Harness React slots. */
export interface TerminalSessionTarget {
  readonly sessionId: string
  readonly displayTitle: string
}
export interface TerminalInputTarget extends TerminalSessionTarget {
  readonly draft: string
  readonly selection: { readonly start: number; readonly end: number }
}
export interface TerminalExtensionRow {
  readonly id: string
  /** Registration identity: reloading the same id invalidates already open menus. */
  readonly revision: number
  readonly label: string
  readonly description?: string
  readonly disabledReason?: string
  readonly danger?: boolean
}
export interface TerminalExtension<Target> {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly order?: number
  readonly danger?: boolean
  /** Undefined enables the action; a reason disables it. Evaluated again before dispatch. */
  reason?(target: Target): string | undefined
  /** Session actions return optional notice text; input activities return text for guarded draft insertion. */
  run(target: Target, signal: AbortSignal): Promise<string | undefined>
}
export interface TerminalExtensionPort {
  sessionActions(target: TerminalSessionTarget): readonly TerminalExtensionRow[]
  inputActivities(target: TerminalInputTarget): readonly TerminalExtensionRow[]
  runSessionAction(target: TerminalSessionTarget, id: string, revision: number, signal: AbortSignal): Promise<string | undefined>
  runInputActivity(target: TerminalInputTarget, id: string, revision: number, signal: AbortSignal): Promise<string | undefined>
}
