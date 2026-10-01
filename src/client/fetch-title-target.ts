/** Scoped fetch presenter titles -> visible cell targets, tested with dsh 0.2.0-rc.2.
 * No tool-name/argument/output parsing, tool execution, or URL discovery occurs here.
 * Integration supplies the existing safeArtifactUrl validator and permitted UI ports.
 */
import { Key, matchesKey, visibleWidth } from '@mariozechner/pi-tui'
import type { CellRect } from './mouse-hit-map.ts'
import type { MouseButton, MouseModifiers } from './mouse-protocol.ts'
import { RemoteOperationScope } from './remote-operation.ts'

export interface FetchTitlePresentation { readonly for: 'call' | 'result'; readonly view: unknown }
export interface FetchTitleUrl {
  readonly label: string
  readonly href: string
  readonly source: 'call' | 'result'
}
export interface FetchTitleTarget extends FetchTitleUrl {
  readonly targetKey: string
  readonly scopeId: string
  /** Current visible-content generation; invalidate on scroll/resize/Session replacement. */
  readonly generation: number
}
export interface FetchTitleLayout {
  readonly link?: { readonly rect: CellRect; readonly target: FetchTitleTarget }
  readonly toggles: readonly CellRect[]
}
export type FetchTitleAction = 'open' | 'copy'
export interface FetchTitlePorts {
  /** Pass E's existing safeArtifactUrl; this module does not own a second policy. */
  readonly safeUrl: (url: string) => string
  readonly capability: (action: FetchTitleAction) => { readonly available: boolean; readonly reason?: string } | undefined
  readonly open?: (href: string, signal: AbortSignal) => Promise<void>
  readonly copy?: (href: string) => void | Promise<void>
  readonly timeoutMs?: number
}

// Read JSON-shaped presenter fields only. Malformed/accessor-bearing input is not
// a reason to run arbitrary getters while building a hit map.
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const property = Object.getOwnPropertyDescriptor(value, key)
  return property !== undefined && 'value' in property ? property.value : undefined
}
const DISPLAY_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u
const SGR = /\u001b\[[0-9;:]*m/gu
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Only consume views returned by the scoped registered Host presenter, never raw args. */
export function fetchTitleUrl(title: string, presentations: readonly FetchTitlePresentation[], safeUrl: FetchTitlePorts['safeUrl']): FetchTitleUrl | undefined {
  if (title === '' || DISPLAY_CONTROL.test(title)) return undefined
  for (const presentation of presentations) {
    const view = field(presentation, 'view')
    const source = field(presentation, 'for')
    if (field(view, 'kind') !== 'fetch') continue
    const candidate = source === 'call' && field(view, 'card') === 'generic' && field(view, 'title') === title
      ? field(view, 'rawInput')
      : source === 'result' && field(view, 'card') === 'web'
        && (field(view, 'title') === undefined || field(view, 'title') === title) ? field(view, 'url') : undefined
    // A redirect URL that is different from the visible title must not become
    // that title's hidden href. A retained call view can still supply its own URL.
    if (candidate !== title || typeof candidate !== 'string') continue
    try { return { label: title, href: safeUrl(candidate), source: source as 'call' | 'result' } } catch { /* unavailable */ }
  }
  return undefined
}

/** Extract exactly an already-rendered cell span; reject cuts through a wide grapheme. */
function cellText(line: string, start: number, width: number): string | undefined {
  let col = 0, text = ''
  for (const { segment } of segmenter.segment(line)) {
    const cells = visibleWidth(segment)
    const end = col + cells
    if (col < start + width && end > start) {
      if (cells <= 0 || col < start || end > start + width) return undefined
      text += segment
    }
    col = end
  }
  return visibleWidth(text) === width ? text : undefined
}
function boundary(text: string, offset: number): boolean {
  return offset === 0 || [...segmenter.segment(text)].some(part => part.index + part.segment.length === offset)
}
function integer(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 }

/** Split only the visible title glyphs from the existing row-wide toggle hit.
 * titleCells is measured by the renderer in the actual renderedLine, including
 * its clipping ellipsis but excluding indentation, status and trailing padding.
 * For a wrapped header, provide both source offsets from the renderer's title
 * projection; each row must exactly match that slice, never a text-search guess.
 */
export function fetchTitleLayout(options: {
  readonly title: string
  readonly presentations: readonly FetchTitlePresentation[]
  readonly safeUrl: FetchTitlePorts['safeUrl']
  readonly renderedLine: string
  readonly titleCells: { readonly start: number; readonly width: number; readonly sourceStart?: number; readonly sourceEnd?: number }
  readonly rect: CellRect
  readonly expanded: boolean
  readonly targetKey: string
  readonly scopeId: string
  readonly generation: number
}): FetchTitleLayout {
  const { rect, titleCells } = options
  if (![rect.col, rect.row, rect.width, options.generation].every(integer) || rect.height !== 1 || rect.width === 0) return { toggles: [] }
  const fallback: FetchTitleLayout = { toggles: [rect] }
  if (options.expanded || options.targetKey === '' || options.scopeId === '' || !integer(titleCells.start)
    || !integer(titleCells.width) || titleCells.width === 0 || titleCells.start + titleCells.width > rect.width) return fallback
  const url = fetchTitleUrl(options.title, options.presentations, options.safeUrl)
  const line = options.renderedLine.replace(SGR, '')
  // SGR is owned styling. OSC hyperlinks and cursor/control/bidi sequences are
  // never reinterpreted as a URL or allowed to distort a semantic cell span.
  if (url === undefined || DISPLAY_CONTROL.test(line)) return fallback
  const visible = cellText(line, titleCells.start, titleCells.width)
  if (visible === undefined) return fallback
  let label = visible
  if (titleCells.sourceStart !== undefined || titleCells.sourceEnd !== undefined) {
    const { sourceStart, sourceEnd } = titleCells
    if (sourceStart === undefined || sourceEnd === undefined || !integer(sourceStart) || !integer(sourceEnd)
      || sourceStart >= sourceEnd || sourceEnd > url.label.length || !boundary(url.label, sourceStart)
      || !boundary(url.label, sourceEnd) || visible !== url.label.slice(sourceStart, sourceEnd)) return fallback
  } else if (visible !== url.label) {
    if (!visible.endsWith('…')) return fallback
    label = visible.slice(0, -1)
    const authority = /^https?:\/\/[^/?#]+/iu.exec(url.label)?.[0]
    if (label === '' || !url.label.startsWith(label) || !boundary(url.label, label.length)
      || authority === undefined || !label.startsWith(authority)) return fallback
  }
  const width = visibleWidth(label)
  if (width <= 0) return fallback
  const link = { rect: { col: rect.col + titleCells.start, row: rect.row, width, height: 1 },
    target: { ...url, targetKey: options.targetKey, scopeId: options.scopeId, generation: options.generation } }
  const end = titleCells.start + width
  return { link, toggles: [
    ...(titleCells.start === 0 ? [] : [{ ...rect, width: titleCells.start }]),
    ...(end === rect.width ? [] : [{ ...rect, col: rect.col + end, width: rect.width - end }]),
  ] }
}

function sameTarget(left: FetchTitleTarget, right: FetchTitleTarget | undefined): boolean {
  return right !== undefined && left.targetKey === right.targetKey && left.scopeId === right.scopeId
    && left.generation === right.generation && left.label === right.label && left.href === right.href && left.source === right.source
}
export function fetchTitleActionReason(target: FetchTitleTarget, action: FetchTitleAction, ports: FetchTitlePorts, current: FetchTitleTarget | undefined): string | undefined {
  if (!sameTarget(target, current)) return 'Fetch title is no longer in the current Session/frame; refresh'
  try { if (ports.safeUrl(target.label) !== target.href) return 'Fetch title URL changed; refresh' }
  catch (error) { return error instanceof Error ? error.message : 'Fetch title URL is invalid' }
  const capability = ports.capability(action)
  if (capability?.available !== true) return capability?.reason ?? `Safe URL ${action} capability is not confirmed`
  if (ports[action] === undefined) return `No safe URL ${action} action is attached`
  return undefined
}

/** Observe a permitted UI action, with current-frame checks and a bounded wait.
 * Once dispatched, an opener ignoring abort may still act; never retry it or
 * claim an observation timeout revoked that effect.
 */
export async function runFetchTitleAction(target: FetchTitleTarget, action: FetchTitleAction, ports: FetchTitlePorts,
  current: () => FetchTitleTarget | undefined, signal?: AbortSignal): Promise<void> {
  await new RemoteOperationScope().run(async inner => {
    const reason = fetchTitleActionReason(target, action, ports, current())
    if (reason !== undefined) throw new Error(reason)
    inner.throwIfAborted()
    if (action === 'copy') await ports.copy!(target.href)
    else await ports.open!(target.href, inner)
    inner.throwIfAborted()
    if (!sameTarget(target, current())) throw new Error('Fetch title changed after UI action dispatch; result not confirmed')
  }, ports.timeoutMs ?? 10_000, signal)
}

/** Intent only: integration owns focus, press/release pairing and context menus. */
export function fetchTitleGestureAction(part: 'url' | 'toggle', gesture:
  | { readonly kind: 'key'; readonly data: string }
  | { readonly kind: 'click'; readonly button: MouseButton; readonly modifiers: MouseModifiers; readonly dragged: boolean },
): FetchTitleAction | 'toggle' | 'context' | undefined {
  if (gesture.kind === 'key') {
    if (matchesKey(gesture.data, Key.enter) || gesture.data === '\n') return part === 'url' ? 'open' : 'toggle'
    if (part === 'url' && gesture.data === 'o') return 'open'
    if (part === 'url' && gesture.data === 'c') return 'copy'
    return undefined
  }
  if (gesture.dragged || gesture.modifiers.shift || gesture.modifiers.ctrl || gesture.modifiers.alt) return undefined
  if (gesture.button === 'right') return 'context'
  if (gesture.button === 'left') return part === 'url' ? 'open' : 'toggle'
  return undefined
}
