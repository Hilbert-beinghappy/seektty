/**
 * Structural contracts shared by the TUI Host bridge and terminal Surface.
 * This package owns no Harness state and performs no I/O.
 * @module @deepseek-ai/dsh-tui-protocol
 */

/** One secret slot from a redacted Settings descriptor. */
export interface TuiSettingsSecret {
  readonly path: readonly string[]
  readonly set: boolean
}

/** Harness Settings namespace that persists SeekTTY-only visual preferences. */
export const TUI_APPEARANCE_SETTINGS_NAMESPACE = 'seektty-appearance'

/** Built-in DeepSeek color scheme. */
export type TuiBuiltInTheme = 'dark' | 'light'

/** Persisted built-in or named custom theme selection. */
export type TuiThemeId = TuiBuiltInTheme | `custom:${string}`

/** Independent code-theme selection or automatic pairing with the interface theme. */
export type TuiCodeThemeId = 'auto' | TuiThemeId

/** Dark or light contrast direction used by one resolved theme. */
export type TuiThemeTone = 'dark' | 'light'

/** How one custom theme was originally created. */
export type TuiThemeSource = 'manual' | 'palette' | 'vscode'

/** Portable terminal styles imported from one VS Code TextMate rule. */
export type TuiTokenFontStyle = 'bold' | 'italic' | 'underline' | 'strikethrough'

/** One sanitized TextMate scope rule applied only inside code regions. */
export interface TuiTextMateRule {
  readonly scope: readonly string[]
  readonly foreground?: string
  readonly background?: string
  readonly fontStyle?: readonly TuiTokenFontStyle[]
}

/** Complete terminal chrome palette persisted for one custom theme. */
export interface TuiThemeUiColors {
  readonly text: string
  readonly muted: string
  readonly border: string
  readonly brand: string
  readonly accent: string
  readonly success: string
  readonly warning: string
  readonly danger: string
  readonly canvas: string
  readonly surface: string
  readonly selection: string
}

/** Editable semantic colors used by code syntax highlighting. */
export interface TuiSyntaxThemeColors {
  readonly background: string
  readonly foreground: string
  readonly comment: string
  readonly keyword: string
  readonly string: string
  readonly number: string
  readonly constant: string
  readonly function: string
  readonly type: string
  readonly variable: string
  readonly property: string
  readonly parameter: string
  readonly operator: string
  readonly punctuation: string
  readonly tag: string
  readonly attribute: string
  readonly regexp: string
}

/** One named custom theme stored in the Harness Settings namespace. */
export interface TuiCustomTheme {
  readonly id: string
  readonly name: string
  readonly tone: TuiThemeTone
  readonly source: TuiThemeSource
  readonly colors: TuiThemeUiColors
  readonly syntax: TuiSyntaxThemeColors
  readonly tokenColors: readonly TuiTextMateRule[]
}

/** Complete appearance value owned by the SeekTTY Settings namespace. */
export interface TuiAppearanceSettings {
  readonly theme: TuiThemeId
  readonly codeTheme: TuiCodeThemeId
  readonly customThemes: readonly TuiCustomTheme[]
}

/** First-run color scheme when no user override has been stored. */
export const DEFAULT_TUI_THEME: TuiThemeId = 'dark'

/** Default code pairing follows the active interface theme. */
export const DEFAULT_TUI_CODE_THEME: TuiCodeThemeId = 'auto'

/** Maximum named themes accepted by one Settings document. */
export const MAX_CUSTOM_THEMES = 32

/** Maximum imported TextMate rules stored in one custom theme. */
export const MAX_TEXTMATE_RULES = 4_096

/** Harness Settings namespace that persists SeekTTY interaction defaults. */
export const TUI_BEHAVIOR_SETTINGS_NAMESPACE = 'seektty-behavior'

/** Startup presentation for tool cards in the transcript. */
export type TuiToolCardDisplay = 'collapsed' | 'expanded' | 'hidden'

/** How `/copy` writes the system clipboard after OSC 52. */
export type TuiClipboardFallback = 'auto' | 'osc52' | 'off'

/** Complete behavior value owned by the SeekTTY Settings namespace. */
export interface TuiBehaviorSettings {
  readonly toolCards: TuiToolCardDisplay
  readonly showReasoning: boolean
  readonly desktopNotifications: boolean
  readonly followTerminalTitle: boolean
  readonly composerHistoryLimit: number
  readonly statusElapsed: boolean
  readonly clipboardFallback: TuiClipboardFallback
  readonly toolOutputLineLimit: number
  readonly keyBindings: Readonly<Record<string, string>>
}

/** First-run interaction defaults when no user override has been stored. */
export const DEFAULT_TUI_BEHAVIOR: TuiBehaviorSettings = Object.freeze({
  toolCards: 'collapsed',
  showReasoning: false,
  desktopNotifications: true,
  followTerminalTitle: true,
  composerHistoryLimit: 200,
  statusElapsed: true,
  clipboardFallback: 'auto',
  toolOutputLineLimit: 200,
  keyBindings: Object.freeze({}),
})

/** Upper bound for persisted composer history entries. */
export const MAX_COMPOSER_HISTORY = 10_000

/** Upper bound for one expanded tool-output block; 0 disables folding. */
export const MAX_TOOL_OUTPUT_LINE_LIMIT = 10_000

/** One complete, redacted registered Settings namespace. */
export interface TuiSettingsDocument {
  readonly namespace: string
  readonly schema: unknown
  readonly value: unknown
  readonly revision: number
  readonly applies: 'live' | 'restart'
  readonly base?: unknown
  readonly user?: unknown
  readonly secrets: readonly TuiSettingsSecret[]
}

/** Path edit applied by the native Settings service with revision protection. */
export type TuiSettingsPathOp =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }

/** A stale TUI Settings writer was rejected before changing durable state. */
export class TuiSettingsConflictError extends Error {
  /** Stable machine-readable conflict discriminator. */
  readonly code = 'TUI_SETTINGS_CONFLICT'

  /**
   * @param namespace - registered Settings namespace that changed.
   * @param expected - revision held by the terminal editor.
   * @param actual - current Host revision.
   */
  constructor(
    readonly namespace: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`设置 ${JSON.stringify(namespace)} 已在其他界面更新（期望 revision ${String(expected)}，当前 ${String(actual)}）`)
    this.name = 'TuiSettingsConflictError'
  }
}

/** Safe Credential metadata; the secret value never crosses this contract. */
export interface TuiCredentialInfo {
  readonly configured: boolean
  readonly source?: string
  readonly writable: boolean
}

/** Installed Profile dependency as understood by the native Bundle manager. */
export interface TuiPluginEntry {
  readonly name: string
  readonly spec: string
  readonly version?: string
  readonly description?: string
  readonly source: 'npm' | 'git' | 'tarball' | 'local' | 'unknown'
  readonly bundle: boolean
  readonly active: boolean
  readonly patch?: string
  readonly patchValid: boolean
  readonly scripts: readonly string[]
  readonly diagnostics: readonly string[]
}

/** Native Profile dependency and ordered Bundle snapshot. */
export interface TuiPluginSnapshot {
  readonly profile: string
  readonly dir: string
  readonly dependencies: Readonly<Record<string, string>>
  readonly bundles: readonly string[]
  readonly plugins: readonly TuiPluginEntry[]
}

/** One Profile visible to the launcher-owned Profile manager. */
export interface TuiProfileSummary {
  readonly name: string
  readonly dir: string
  readonly initialized: boolean
  readonly bundles: readonly string[]
  readonly dependencyCount: number
  readonly compatible: boolean
  readonly diagnostic?: string
}

/** Result of an install/remove/update operation over the active Profile. */
export interface TuiPluginOperation {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly warnings: readonly string[]
  readonly changed: boolean
  readonly restartRequired: boolean
  readonly snapshot: TuiPluginSnapshot
}

/** One structured native Profile diagnostic. */
export interface TuiPluginDiagnostic {
  readonly level: 'info' | 'warning' | 'error'
  readonly message: string
}

/** Result of Profile, pnpm, and Bundle compatibility diagnosis. */
export interface TuiPluginDoctor {
  readonly profile: string
  readonly pnpm?: string
  readonly diagnostics: readonly TuiPluginDiagnostic[]
  readonly snapshot: TuiPluginSnapshot
}

/** One configured marketplace discovery source. */
export interface TuiMarketplaceSource {
  readonly id: string
  /** Provider-owned discriminator; new Providers do not require a protocol enum change. */
  readonly kind: string
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly credentialRef?: string
  readonly builtIn: boolean
  /** Present when a stored catalog row failed validation and was kept disabled. */
  readonly diagnostic?: string
}

/** Marketplace source list with the native Settings revision that produced it. */
export interface TuiMarketplaceSources {
  readonly revision: number
  readonly sources: readonly TuiMarketplaceSource[]
}

/** Validated marketplace candidate; compatibility never implies trust. */
export interface TuiMarketplaceCandidate {
  readonly id: string
  readonly name: string
  readonly version?: string
  readonly description?: string
  readonly publisher?: string
  readonly sourceId: string
  readonly source: TuiPluginEntry['source']
  readonly spec: string
  readonly bundle: boolean
  readonly patchValid: boolean
  readonly scripts: readonly string[]
  readonly immutable: boolean
  readonly diagnostics: readonly string[]
}

/** Operation progress emitted from native pnpm without becoming durable state. */
export interface TuiPluginRunOptions {
  readonly signal?: AbortSignal
  readonly onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
}

/** One native Harness Session-log export stream handed to the terminal saver. */
export interface TuiSessionExport {
  readonly suggestedFilename: string
  readonly mediaType: string
  readonly contentLength?: number
  readonly stream: ReadableStream<Uint8Array>
}

/** Host-owned services intentionally exposed to the terminal management UI. */
export interface TuiManagementBridge {
  readonly sessionExport: {
    download(sessionId: string, includeDescendants: boolean, signal?: AbortSignal): Promise<TuiSessionExport>
  }
  readonly settings: {
    describe(namespace?: string): Promise<readonly TuiSettingsDocument[]>
    mutate(namespace: string, ops: readonly TuiSettingsPathOp[], expectedRevision: number): Promise<TuiSettingsDocument>
    credentialInfo(ref: string): Promise<TuiCredentialInfo>
    setCredential(ref: string, value: string): Promise<TuiCredentialInfo>
    unsetCredential(ref: string): Promise<TuiCredentialInfo>
  }
  readonly profiles: {
    list(): Promise<readonly TuiProfileSummary[]>
    create(name: string, copyFrom?: string): Promise<TuiProfileSummary>
  }
  readonly plugins: {
    snapshot(): Promise<TuiPluginSnapshot>
    run(args: readonly string[], options?: TuiPluginRunOptions): Promise<TuiPluginOperation>
    reorder(bundles: readonly string[]): Promise<TuiPluginSnapshot>
    doctor(): Promise<TuiPluginDoctor>
    sources(): Promise<TuiMarketplaceSources>
    saveSources(sources: readonly TuiMarketplaceSource[], expectedRevision: number): Promise<TuiMarketplaceSources>
    search(query: string, signal?: AbortSignal): Promise<readonly TuiMarketplaceCandidate[]>
    inspect(spec: string, signal?: AbortSignal): Promise<TuiMarketplaceCandidate>
  }
  readonly jobs: {
    kill(id: string): Promise<'requested' | 'already-finished'>
  }
}

/** Context references handed to a controlled child-process restart. */
export interface TuiRestartRequest {
  readonly profile: string
  readonly cwd: string
  readonly resume?: string
  readonly draft?: string
  readonly attachmentPaths: readonly string[]
  readonly notice?: string
}

/** Terminal Surface completion: ordinary exit or launcher-owned restart. */
export type TuiSurfaceOutcome =
  | { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'restart'; readonly request: TuiRestartRequest }
