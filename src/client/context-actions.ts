/** Semantic targets and reusable action trees for application-owned context menus. */

export type ContextTextSurface = 'transcript' | 'composer' | 'overlay' | 'overlay-input'

export type ContextTarget =
  | { readonly kind: 'text'; readonly surface: ContextTextSurface }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'profile'; readonly profile: string }
  | { readonly kind: 'theme'; readonly themeId: string }
  | { readonly kind: 'welcome-row'; readonly rowId: string }
  | { readonly kind: 'fastfetch-module'; readonly moduleId: string }
  | { readonly kind: 'queue-item'; readonly itemId: string }
  | { readonly kind: 'plugin'; readonly pluginId: string }
  | { readonly kind: 'plugin-catalog'; readonly catalogId: string }
  | { readonly kind: 'plugin-bundle'; readonly pluginId: string }
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'job'; readonly jobId: string }
  | { readonly kind: 'subagent'; readonly sessionId: string }
  | { readonly kind: 'tool-card' | 'reasoning'; readonly targetKey: string }
  | { readonly kind: 'agent-tree'; readonly sessionId: string; readonly part: 'row' | 'chevron' }
  | { readonly kind: 'mcp-tool' | 'mcp-instance' | 'settings' | 'skill' | 'trajectory'; readonly id: string }
  | { readonly kind: 'chrome'; readonly commandId: string }

export type ContextActionNode =
  | {
      readonly kind: 'action'
      readonly id: string
      readonly label: string
      readonly description?: string
      readonly disabledReason?: string
      readonly danger?: boolean
    }
  | {
      readonly kind: 'submenu'
      readonly id: string
      readonly label: string
      readonly description?: string
      readonly children: readonly ContextActionChild[]
    }
  | { readonly kind: 'separator'; readonly id: string }

export type ContextActionItem = Extract<ContextActionNode, { readonly kind: 'action' }>
export type ContextActionChild = ContextActionItem | Extract<ContextActionNode, { readonly kind: 'separator' }>

export interface ContextActionMenu {
  readonly title: string
  readonly target: ContextTarget
  readonly nodes: readonly ContextActionNode[]
}

export interface ContextActionSelection {
  readonly target: ContextTarget
  readonly actionId: string
}
