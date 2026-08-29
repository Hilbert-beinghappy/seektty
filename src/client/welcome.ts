/** Non-durable Fastfetch-style empty-session presentation. */

import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@mariozechner/pi-tui'
import type {
  TuiManagementBridge,
  TuiWelcomeFact,
  TuiWelcomeFastfetchResult,
  TuiWelcomeRow,
  TuiWelcomeSettings,
} from '@deepseek-ai/dsh-tui-protocol'
import { color, currentTheme, escapeTerminalText } from './theme.ts'
import { ui } from './locale.ts'
import {
  builtinWelcomeLogo,
  loadWelcomeLogoFile,
  parseThemeIndexedLogo,
  type WelcomeLogo,
} from './welcome-logo.ts'

const INFO_MIN_WIDTH = 32
const LOGO_GAP = 4

export interface WelcomeRuntimeFacts {
  readonly seekttyVersion: string
  readonly profile: string
  readonly workspace: string
  readonly model: string
  readonly reasoning: string
  readonly mode: string
  readonly permission: string
  readonly theme: string
  readonly platform: string
}

const FACT_LABELS: Readonly<Record<TuiWelcomeFact, () => string>> = {
  seekttyVersion: () => ui('SeekTTY', 'SeekTTY'),
  profile: () => ui('Profile', 'Profile'),
  workspace: () => ui('工作区', 'Workspace'),
  model: () => ui('模型', 'Model'),
  reasoning: () => ui('推理强度', 'Reasoning'),
  mode: () => ui('模式', 'Mode'),
  permission: () => ui('权限', 'Permission'),
  theme: () => ui('主题', 'Theme'),
  platform: () => ui('平台', 'Platform'),
}

function wrapped(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width)).map(line => truncateToWidth(line, width, '…'))
}

function field(label: string, value: string, width: number): string[] {
  const safeLabel = escapeTerminalText(label)
  const safeValue = escapeTerminalText(value)
  const prefix = `${color.accent(safeLabel)}${color.muted(': ')} `
  const prefixWidth = visibleWidth(prefix)
  if (prefixWidth >= width) return [truncateToWidth(prefix, width, '…')]
  const values = wrapped(safeValue, width - prefixWidth)
  return values.map((line, index) => index === 0 ? `${prefix}${line}` : `${' '.repeat(prefixWidth)}${line}`)
}

function paletteRow(): string {
  return [
    color.brand('●'),
    color.accent('●'),
    color.success('●'),
    color.warning('●'),
    color.danger('●'),
    color.muted('●'),
  ].join('  ')
}

export function renderCustomWelcomeRows(
  rows: readonly TuiWelcomeRow[],
  facts: WelcomeRuntimeFacts,
  width: number,
): string[] {
  const lines: string[] = []
  for (const row of rows) {
    switch (row.kind) {
      case 'heading': lines.push(...wrapped(color.brand(row.text), width)); break
      case 'text': lines.push(...wrapped(escapeTerminalText(row.text), width)); break
      case 'field': lines.push(...field(row.label, row.value, width)); break
      case 'fact': {
        const value = facts[row.fact]
        if (value !== '') lines.push(...field(row.label ?? FACT_LABELS[row.fact](), value, width))
        break
      }
      case 'separator': lines.push(color.border('─'.repeat(Math.max(1, width)))); break
      case 'blank': lines.push(''); break
      case 'palette': lines.push(paletteRow()); break
    }
  }
  return lines
}

export function renderFastfetchRows(result: TuiWelcomeFastfetchResult | undefined, width: number): string[] {
  if (result === undefined) return [color.muted(ui('正在读取 Fastfetch…', 'Reading Fastfetch…'))]
  if (result.status === 'cancelled') return []
  if (result.status !== 'ok') {
    return [color.warning(ui('Fastfetch 不可用', 'Fastfetch unavailable'))]
  }
  return result.rows.flatMap(row => row.kind === 'field'
    ? field(row.label, row.value, width)
    : wrapped(escapeTerminalText(row.text), width))
}

function pad(line: string, width: number): string {
  return `${line}${' '.repeat(Math.max(0, width - visibleWidth(line)))}`
}

export function layoutWelcome(
  width: number,
  large: WelcomeLogo | undefined,
  compact: WelcomeLogo | undefined,
  info: (width: number) => readonly string[],
): string[] {
  const selected = large !== undefined && large.width + LOGO_GAP + INFO_MIN_WIDTH <= width
    ? large
    : compact !== undefined && compact.width + LOGO_GAP + INFO_MIN_WIDTH <= width
      ? compact
      : undefined
  if (selected === undefined) return [...info(width)]
  const infoWidth = Math.max(INFO_MIN_WIDTH, width - selected.width - LOGO_GAP)
  const details = info(infoWidth)
  const height = Math.max(selected.height, details.length)
  return Array.from({ length: height }, (_, row) => {
    const art = selected.lines[row] ?? ''
    const detail = details[row] ?? ''
    return `${pad(art, selected.width)}${' '.repeat(LOGO_GAP)}${detail}`.trimEnd()
  })
}

interface LoadedLogo {
  readonly source: string
  readonly logo: WelcomeLogo
}

/** Async resources and generation guards for one TUI process. */
export class WelcomeController {
  private generation = 0
  private ready = false
  private disposed = false
  private facts: WelcomeRuntimeFacts
  private settings: TuiWelcomeSettings
  private fastfetchResult: TuiWelcomeFastfetchResult | undefined
  private fastfetchKey = ''
  private fastfetchGeneration = 0
  private readonly fastfetchCache = new Map<string, TuiWelcomeFastfetchResult>()
  private fastfetchAbort: AbortController | undefined
  private largeLogo: LoadedLogo | undefined
  private compactLogo: LoadedLogo | undefined
  private logoAbort = 0
  private readonly reported = new Set<string>()

  constructor(
    settings: TuiWelcomeSettings,
    facts: WelcomeRuntimeFacts,
    private readonly collect: TuiManagementBridge['welcome']['collectFastfetch'],
    private readonly requestRender: () => void,
    private readonly notice: (message: string) => void,
  ) {
    this.settings = settings
    this.facts = facts
  }

  fingerprint(): number { return this.generation }

  setRuntimeFacts(facts: WelcomeRuntimeFacts): void {
    this.facts = facts
    this.generation += 1
    this.requestRender()
  }

  applySettings(settings: TuiWelcomeSettings): void {
    const fastfetchChanged = JSON.stringify(settings.fastfetch) !== JSON.stringify(this.settings.fastfetch)
    this.settings = settings
    this.fastfetchGeneration += 1
    this.fastfetchAbort?.abort()
    this.generation += 1
    this.fastfetchResult = undefined
    this.fastfetchKey = ''
    if (fastfetchChanged) this.fastfetchCache.delete(JSON.stringify(settings.fastfetch))
    if (this.ready) {
      void this.loadLogos()
      void this.loadFastfetch(fastfetchChanged)
    }
    this.requestRender()
  }

  /** API-key onboarding calls this only after its modal transaction settles. */
  activate(): void {
    if (this.ready || this.disposed) return
    this.ready = true
    void this.loadLogos()
    void this.loadFastfetch(false)
  }

  async refreshFastfetch(): Promise<void> {
    this.fastfetchCache.clear()
    this.fastfetchKey = ''
    this.fastfetchResult = undefined
    this.generation += 1
    this.requestRender()
    await this.loadFastfetch(true)
  }

  private reportOnce(key: string, message: string): void {
    if (this.reported.has(key)) return
    this.reported.add(key)
    this.notice(message)
  }

  private wantsFastfetch(): boolean {
    return this.settings.infoMode === 'fastfetch' || this.settings.infoMode === 'mixed'
  }

  private async loadFastfetch(force: boolean): Promise<void> {
    if (!this.ready || this.disposed || !this.wantsFastfetch()) return
    const request = this.settings.fastfetch
    const key = JSON.stringify(request)
    if (!force && key === this.fastfetchKey && this.fastfetchResult !== undefined) return
    const cached = force ? undefined : this.fastfetchCache.get(key)
    if (cached !== undefined) {
      this.fastfetchKey = key
      this.fastfetchResult = cached
      this.generation += 1
      this.requestRender()
      return
    }
    this.fastfetchAbort?.abort()
    const controller = new AbortController()
    this.fastfetchAbort = controller
    const generation = ++this.fastfetchGeneration
    this.generation += 1
    this.fastfetchKey = key
    this.requestRender()
    const result = await this.collect(request, controller.signal)
    if (this.disposed || controller.signal.aborted || generation !== this.fastfetchGeneration) return
    this.fastfetchResult = result
    this.fastfetchCache.set(key, result)
    this.generation += 1
    if (result.status !== 'ok' && result.status !== 'cancelled') {
      this.reportOnce(`fastfetch:${result.status}:${result.diagnostic ?? ''}`, ui(
        `Fastfetch 不可用；${this.settings.infoMode === 'mixed' ? '继续显示自定义欢迎内容' : '请用 /welcome 检查设置'}。`,
        `Fastfetch is unavailable; ${this.settings.infoMode === 'mixed' ? 'custom welcome content remains visible' : 'check /welcome settings'}.`,
      ))
    }
    this.requestRender()
  }

  private async loadLogos(): Promise<void> {
    const serial = ++this.logoAbort
    this.largeLogo = undefined
    this.compactLogo = undefined
    if (this.settings.logo.source !== 'file') {
      this.generation += 1
      this.requestRender()
      return
    }
    const workspace = this.facts.workspace
    try {
      const large = await loadWelcomeLogoFile(
        this.settings.logo.largePath,
        workspace,
        this.settings.logo.colorMode,
      )
      if (this.disposed || serial !== this.logoAbort) return
      this.largeLogo = { source: large.source, logo: large.logo }
      if (this.settings.logo.compactPath !== '') {
        const compact = await loadWelcomeLogoFile(
          this.settings.logo.compactPath,
          workspace,
          this.settings.logo.colorMode,
        )
        if (this.disposed || serial !== this.logoAbort) return
        this.compactLogo = { source: compact.source, logo: compact.logo }
      }
    } catch (error) {
      if (this.disposed || serial !== this.logoAbort) return
      this.largeLogo = undefined
      this.compactLogo = undefined
      this.reportOnce(`logo:${String(error)}`, ui(
        '自定义欢迎 Logo 无法读取；已回退到内置 Logo。',
        'The custom welcome logo could not be read; the built-in logo is being used.',
      ))
    }
    this.generation += 1
    this.requestRender()
  }

  private logos(): { readonly large?: WelcomeLogo; readonly compact?: WelcomeLogo } {
    if (this.settings.logo.source === 'none') return {}
    if (this.settings.logo.source === 'builtin' || this.largeLogo === undefined) {
      return {
        large: builtinWelcomeLogo('large', this.settings.logo.colorMode),
        compact: builtinWelcomeLogo('compact', this.settings.logo.colorMode),
      }
    }
    const render = (loaded: LoadedLogo): WelcomeLogo => this.settings.logo.colorMode === 'theme'
      ? parseThemeIndexedLogo(loaded.source)
      : loaded.logo
    return {
      large: render(this.largeLogo),
      ...(this.compactLogo === undefined ? {} : { compact: render(this.compactLogo) }),
    }
  }

  private renderSettings(
    settings: TuiWelcomeSettings,
    width: number,
    hasSession: boolean,
    fastfetchResult: TuiWelcomeFastfetchResult | undefined,
    logos: { readonly large?: WelcomeLogo; readonly compact?: WelcomeLogo },
  ): string[] {
    const custom = (valueWidth: number): string[] => renderCustomWelcomeRows(
      settings.customRows,
      { ...this.facts, theme: currentTheme().name },
      valueWidth,
    )
    const fastfetch = (valueWidth: number): string[] => renderFastfetchRows(fastfetchResult, valueWidth)
    const info = (valueWidth: number): string[] => {
      let lines: string[]
      if (settings.infoMode === 'custom') lines = custom(valueWidth)
      else if (settings.infoMode === 'fastfetch') lines = fastfetch(valueWidth)
      else {
        const first = settings.mixedOrder === 'custom-first' ? custom(valueWidth) : fastfetch(valueWidth)
        const second = settings.mixedOrder === 'custom-first' ? fastfetch(valueWidth) : custom(valueWidth)
        lines = [...first, ...(first.length === 0 || second.length === 0 ? [] : ['']), ...second]
      }
      lines.push('')
      lines.push(color.muted(hasSession
        ? ui('/welcome 配置欢迎页', '/welcome configures this page')
        : ui('/new 或 /workspace 开始 · /welcome 配置欢迎页', '/new or /workspace to begin · /welcome configures this page')))
      return lines
    }
    return layoutWelcome(Math.max(1, width), logos.large, logos.compact, info)
  }

  render(width: number, hasSession: boolean): string[] {
    return this.renderSettings(this.settings, width, hasSession, this.fastfetchResult, this.logos())
  }

  /** Render a settings draft without changing the live page or executing Fastfetch. */
  async preview(settings: TuiWelcomeSettings, width: number, hasSession: boolean): Promise<string> {
    let logos: { readonly large?: WelcomeLogo; readonly compact?: WelcomeLogo } = {}
    if (settings.logo.source === 'builtin') {
      logos = {
        large: builtinWelcomeLogo('large', settings.logo.colorMode),
        compact: builtinWelcomeLogo('compact', settings.logo.colorMode),
      }
    } else if (settings.logo.source === 'file') {
      try {
        const large = await loadWelcomeLogoFile(
          settings.logo.largePath,
          this.facts.workspace,
          settings.logo.colorMode,
        )
        const compact = settings.logo.compactPath.trim() === ''
          ? undefined
          : await loadWelcomeLogoFile(
            settings.logo.compactPath,
            this.facts.workspace,
            settings.logo.colorMode,
          )
        logos = {
          large: large.logo,
          ...(compact === undefined ? {} : { compact: compact.logo }),
        }
      } catch {
        logos = {
          large: builtinWelcomeLogo('large', settings.logo.colorMode),
          compact: builtinWelcomeLogo('compact', settings.logo.colorMode),
        }
      }
    }
    const key = JSON.stringify(settings.fastfetch)
    const result = key === this.fastfetchKey
      ? this.fastfetchResult
      : this.fastfetchCache.get(key)
    return this.renderSettings(settings, Math.max(1, width), hasSession, result, logos).join('\n')
  }

  dispose(): void {
    this.disposed = true
    this.fastfetchGeneration += 1
    this.fastfetchAbort?.abort()
    this.logoAbort += 1
  }
}
