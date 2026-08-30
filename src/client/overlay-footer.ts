/** Typed modal actions: presentation and hit geometry share one layout. */
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui'
import type { HitRegion, MouseAction } from './mouse-hit-map.ts'
import { ui } from './locale.ts'
import { color, escapeTerminalText, interaction } from './theme.ts'

export type OverlayFooterCommand = 'footer-confirm' | 'footer-back'

export interface OverlayPrimaryAction {
  readonly label: string
  readonly key: string
  readonly enabled: boolean
  readonly keyboardOnly?: boolean
  run(): void
}

export interface ActionFooterItem<Command extends string = string> {
  readonly command: Command
  readonly label: string
  readonly key: string
  readonly enabled: boolean
  readonly keyboardOnly?: boolean
}

export interface OverlayFooterAction extends OverlayPrimaryAction, ActionFooterItem<OverlayFooterCommand> {}

export interface ActionFooterTarget<Command extends string> {
  readonly idPrefix: string
  readonly zIndex?: number
  action(command: Command): MouseAction
}

/** Shared action footer; callers own the surrounding two-cell visual inset. */
export function renderActionFooter<Command extends string>(
  actions: readonly ActionFooterItem<Command>[],
  width: number,
  hovered: Command | undefined,
  target: ActionFooterTarget<Command>,
): { lines: string[]; hits: HitRegion[] } {
  const available = Math.max(1, width - 4)
  const lines: string[] = []
  const hits: HitRegion[] = []
  let line = ''
  let used = 0
  for (const action of actions) {
    const suffix = action.keyboardOnly === true ? ui(' · 仅键盘', ' · keyboard only') : ''
    const full = `[${action.key} ${escapeTerminalText(action.label)}${suffix}]`
    const compact = `[${escapeTerminalText(action.label)}${suffix}]`
    const label = truncateToWidth(visibleWidth(full) <= available ? full : compact, available, '…')
    const cells = visibleWidth(label)
    if (used > 0 && used + 2 + cells > available) {
      lines.push(line)
      line = ''
      used = 0
    }
    if (used > 0) { line += '  '; used += 2 }
    hits.push({
      id: `${target.idPrefix}:${action.command}`,
      rect: { col: 2 + used, row: lines.length, width: cells, height: 1 },
      zIndex: target.zIndex ?? 3, role: 'button', enabled: action.enabled,
      activation: action.keyboardOnly === true ? 'enter-only' : 'direct',
      hover: action.enabled ? 'highlight' : 'none',
      action: target.action(action.command),
    })
    line += !action.enabled ? color.muted(label)
      : hovered === action.command ? interaction.hover(label) : color.accent(label)
    used += cells
  }
  if (used > 0) lines.push(line)
  return { lines, hits }
}

/** Rows are content-local; hits include the modal's two-cell left inset. */
export function renderOverlayFooter(
  actions: readonly OverlayFooterAction[],
  width: number,
  hovered: OverlayFooterCommand | undefined,
): { lines: string[]; hits: HitRegion[] } {
  return renderActionFooter(actions, width, hovered, {
    idPrefix: 'overlay',
    action: command => ({ kind: 'overlay', command }),
  })
}
