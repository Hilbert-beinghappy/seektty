/** Transactional `/welcome` editor shared by the command and Settings. */

import {
  MAX_WELCOME_ROWS,
  type TuiManagementBridge,
  type TuiSafeFastfetchModule,
  type TuiSettingsDocument,
  type TuiWelcomeFact,
  type TuiWelcomeRow,
  type TuiWelcomeSettings,
} from '@deepseek-ai/dsh-tui-protocol'
import type { OverlayChoice, OverlayNavigation, SelectOverlayRequest } from './overlays.ts'
import type { ContextActionNode } from './context-actions.ts'
import { ui } from './locale.ts'
import {
  defaultWelcomeSettings,
  prepareWelcomeSettings,
  SAFE_FASTFETCH_MODULES,
  saveWelcomeSettings,
  welcomeFromSettings,
} from './welcome-settings.ts'

export interface WelcomeEditorContext {
  readonly settings: TuiManagementBridge['settings']
  readonly document: TuiSettingsDocument
  readonly workspacePath: string
  preview(settings: TuiWelcomeSettings, width: number): Promise<string>
  apply(settings: TuiWelcomeSettings): void
  notice(message: string, tone?: 'info' | 'success' | 'warning' | 'error'): void
}

const FACTS: readonly TuiWelcomeFact[] = [
  'seekttyVersion', 'profile', 'workspace', 'model', 'reasoning', 'mode',
  'permission', 'theme', 'platform',
]

const FACT_LABELS: Readonly<Record<TuiWelcomeFact, () => string>> = {
  seekttyVersion: () => ui('SeekTTY 版本', 'SeekTTY version'),
  profile: () => 'Profile',
  workspace: () => ui('工作区', 'Workspace'),
  model: () => ui('模型', 'Model'),
  reasoning: () => ui('推理强度', 'Reasoning'),
  mode: () => ui('模式', 'Mode'),
  permission: () => ui('权限', 'Permission'),
  theme: () => ui('主题', 'Theme'),
  platform: () => ui('平台', 'Platform'),
}

function cloneSettings(settings: TuiWelcomeSettings): TuiWelcomeSettings {
  return {
    ...settings,
    customRows: settings.customRows.map(row => ({ ...row })),
    logo: { ...settings.logo },
    fastfetch: { ...settings.fastfetch, modules: [...settings.fastfetch.modules] },
  }
}

function rowSummary(row: TuiWelcomeRow): string {
  switch (row.kind) {
    case 'heading': return ui(`标题 · ${row.text}`, `Heading · ${row.text}`)
    case 'text': return ui(`文字 · ${row.text}`, `Text · ${row.text}`)
    case 'field': return `${row.label}: ${row.value}`
    case 'fact': return ui(`运行信息 · ${row.label ?? FACT_LABELS[row.fact]()}`, `Runtime fact · ${row.label ?? FACT_LABELS[row.fact]()}`)
    case 'separator': return ui('分隔线', 'Separator')
    case 'blank': return ui('空行', 'Blank line')
    case 'palette': return ui('主题色板', 'Theme palette')
  }
}

function moduleLabel(module: TuiSafeFastfetchModule): string {
  const names: Partial<Record<TuiSafeFastfetchModule, string>> = {
    os: 'OS', cpu: 'CPU', gpu: 'GPU', wm: 'WM', de: 'DE',
    terminalfont: 'TerminalFont',
  }
  return names[module] ?? `${module[0]?.toUpperCase() ?? ''}${module.slice(1)}`
}

function modeLabel(settings: TuiWelcomeSettings): string {
  switch (settings.infoMode) {
    case 'custom': return ui('自定义文字', 'Custom text')
    case 'fastfetch': return 'Fastfetch'
    case 'mixed': return ui('混合', 'Mixed')
  }
}

function logoLabel(settings: TuiWelcomeSettings): string {
  const source = settings.logo.source === 'builtin'
    ? ui('内置', 'Built in')
    : settings.logo.source === 'file'
      ? ui('自定义文件', 'Custom file')
      : settings.logo.source === 'fastfetch' ? 'Fastfetch' : ui('隐藏', 'Hidden')
  if (settings.logo.source === 'fastfetch') return `${source} · ${ui('保留原色', 'Original colors')}`
  if (settings.logo.source === 'none') return source
  const colors = settings.logo.colorMode === 'original' ? ui('原色', 'Original colors') : ui('主题色', 'Theme colors')
  return `${source} · ${colors}`
}

async function promptRow(
  navigation: OverlayNavigation,
  existing?: TuiWelcomeRow,
): Promise<TuiWelcomeRow | undefined> {
  const kind = await navigation.select({
    title: existing === undefined ? ui('新增自定义行', 'Add custom row') : ui('修改自定义行', 'Edit custom row'),
    searchable: false,
    ...(existing === undefined ? {} : { initialChoiceId: existing.kind }),
    choices: [
      { id: 'heading', label: ui('标题', 'Heading') },
      { id: 'text', label: ui('文字', 'Text') },
      { id: 'field', label: ui('固定字段', 'Fixed field'), description: ui('自定义标签和值', 'Custom label and value') },
      { id: 'fact', label: ui('运行信息', 'Runtime fact'), description: ui('版本、工作区、模型、权限等', 'Version, workspace, model, permission, and more') },
      { id: 'separator', label: ui('分隔线', 'Separator') },
      { id: 'blank', label: ui('空行', 'Blank line') },
      { id: 'palette', label: ui('主题色板', 'Theme palette') },
    ],
  })
  if (kind === undefined) return undefined
  if (kind.id === 'separator') return { kind: 'separator' }
  if (kind.id === 'blank') return { kind: 'blank' }
  if (kind.id === 'palette') return { kind: 'palette' }
  if (kind.id === 'heading' || kind.id === 'text') {
    const text = await navigation.input({
      title: kind.id === 'heading' ? ui('标题文字', 'Heading text') : ui('自定义文字', 'Custom text'),
      initialValue: existing?.kind === kind.id ? existing.text : '',
      requireText: true,
    })
    return text === undefined ? undefined : { kind: kind.id, text }
  }
  if (kind.id === 'field') {
    const label = await navigation.input({
      title: ui('字段标签', 'Field label'),
      initialValue: existing?.kind === 'field' ? existing.label : '',
      requireText: true,
    })
    if (label === undefined) return undefined
    const value = await navigation.input({
      title: ui('字段内容', 'Field value'),
      initialValue: existing?.kind === 'field' ? existing.value : '',
    })
    return value === undefined ? undefined : { kind: 'field', label, value }
  }
  const selected = await navigation.select({
    title: ui('运行信息', 'Runtime fact'),
    searchable: false,
    ...(existing?.kind === 'fact' ? { initialChoiceId: existing.fact } : {}),
    choices: FACTS.map(fact => ({ id: fact, label: FACT_LABELS[fact]() })),
  })
  if (selected === undefined) return undefined
  const fact = selected.id as TuiWelcomeFact
  const label = await navigation.input({
    title: ui('自定义标签（可留空）', 'Custom label (optional)'),
    initialValue: existing?.kind === 'fact' ? existing.label ?? '' : '',
    placeholder: FACT_LABELS[fact](),
  })
  return label === undefined
    ? undefined
    : { kind: 'fact', fact, ...(label.trim() === '' ? {} : { label }) }
}

async function editRows(
  navigation: OverlayNavigation,
  settings: TuiWelcomeSettings,
): Promise<TuiWelcomeSettings> {
  let current = settings
  let initialChoiceId: string | undefined
  let rowSequence = 0
  let rowIds = current.customRows.map(() => `welcome-row-${String(++rowSequence)}`)
  const rowActions = (index: number): readonly ContextActionNode[] => [
    { kind: 'action', id: 'edit', label: ui('修改', 'Edit') },
    { kind: 'submenu', id: 'move', label: ui('移动', 'Move'), children: [
      { kind: 'action', id: 'move-top', label: ui('移到顶部', 'Move to top'), ...(index === 0 ? { disabledReason: ui('已经在顶部', 'Already first') } : {}) },
      { kind: 'action', id: 'move-up', label: ui('上移', 'Move up'), ...(index === 0 ? { disabledReason: ui('已经在顶部', 'Already first') } : {}) },
      { kind: 'action', id: 'move-down', label: ui('下移', 'Move down'), ...(index === current.customRows.length - 1 ? { disabledReason: ui('已经在底部', 'Already last') } : {}) },
      { kind: 'action', id: 'move-bottom', label: ui('移到底部', 'Move to bottom'), ...(index === current.customRows.length - 1 ? { disabledReason: ui('已经在底部', 'Already last') } : {}) },
    ] },
    { kind: 'action', id: 'delete', label: ui('删除', 'Delete'), danger: true },
  ]
  const applyRowAction = async (index: number, actionId: string): Promise<void> => {
    const row = current.customRows[index]
    if (row === undefined) return
    const rows = [...current.customRows]
    const ids = [...rowIds]
    if (actionId === 'edit') {
      const updated = await promptRow(navigation, row)
      if (updated !== undefined) rows[index] = updated
    } else if (actionId === 'delete') {
      rows.splice(index, 1)
      ids.splice(index, 1)
      initialChoiceId = rows.length === 0 ? '__add__' : `row:${String(Math.min(index, rows.length - 1))}`
    } else {
      const target = actionId === 'move-top' ? 0
        : actionId === 'move-bottom' ? rows.length - 1
          : actionId === 'move-up' ? index - 1 : index + 1
      if (target >= 0 && target < rows.length && target !== index) {
        const [moved] = rows.splice(index, 1)
        const [movedId] = ids.splice(index, 1)
        if (moved !== undefined && movedId !== undefined) {
          rows.splice(target, 0, moved)
          ids.splice(target, 0, movedId)
          initialChoiceId = `row:${String(target)}`
        }
      }
    }
    current = { ...current, customRows: rows }
    rowIds = ids
  }
  const choices = (): readonly OverlayChoice[] => [
    { id: '__add__', label: ui('新增一行…', 'Add a row…'), ...(current.customRows.length >= MAX_WELCOME_ROWS ? { disabledReason: ui('已达到上限', 'Limit reached') } : {}) },
    { id: '__defaults__', label: ui('恢复默认信息行', 'Restore default rows') },
    ...current.customRows.map((row, index) => {
      const rowId = rowIds[index]!
      return {
        id: `row:${String(index)}`,
        label: `${String(index + 1)}. ${rowSummary(row)}`,
        contextTarget: { kind: 'welcome-row' as const, rowId },
        contextTitle: rowSummary(row),
        contextActions: rowActions(index),
        onContextAction: async (actionId: string) => {
          const liveIndex = rowIds.indexOf(rowId)
          if (liveIndex < 0) return
          await applyRowAction(liveIndex, actionId)
          navigation.updateChoices(choices())
        },
      }
    }),
  ]
  while (!navigation.signal.aborted) {
    const selected = await navigation.select({
      title: ui('自定义信息行', 'Custom information rows'),
      detail: ui(`最多 ${String(MAX_WELCOME_ROWS)} 行；可连续编辑，按 Esc 返回欢迎页设置。`, `Up to ${String(MAX_WELCOME_ROWS)} rows; continue editing here and press Esc to return to Welcome settings.`),
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
      choices: choices(),
    })
    if (selected === undefined) return current
    if (selected.id === '__defaults__') {
      current = { ...current, customRows: cloneSettings(defaultWelcomeSettings()).customRows }
      rowIds = current.customRows.map(() => `welcome-row-${String(++rowSequence)}`)
      initialChoiceId = '__defaults__'
      continue
    }
    if (selected.id === '__add__') {
      const row = await promptRow(navigation)
      if (row !== undefined) {
        current = { ...current, customRows: [...current.customRows, row] }
        rowIds = [...rowIds, `welcome-row-${String(++rowSequence)}`]
        initialChoiceId = `row:${String(current.customRows.length - 1)}`
      } else initialChoiceId = '__add__'
      continue
    }
    const index = Number.parseInt(selected.id.slice('row:'.length), 10)
    const row = current.customRows[index]
    if (row === undefined) {
      initialChoiceId = '__add__'
      continue
    }
    const action = await navigation.select({
      title: rowSummary(row),
      searchable: false,
      choices: [
        { id: 'edit', label: ui('修改', 'Edit') },
        { id: 'up', label: ui('上移', 'Move up'), ...(index === 0 ? { disabledReason: ui('已经在顶部', 'Already first') } : {}) },
        { id: 'down', label: ui('下移', 'Move down'), ...(index === current.customRows.length - 1 ? { disabledReason: ui('已经在底部', 'Already last') } : {}) },
        { id: 'top', label: ui('移到顶部', 'Move to top'), ...(index === 0 ? { disabledReason: ui('已经在顶部', 'Already first') } : {}) },
        { id: 'bottom', label: ui('移到底部', 'Move to bottom'), ...(index === current.customRows.length - 1 ? { disabledReason: ui('已经在底部', 'Already last') } : {}) },
        { id: 'delete', label: ui('删除', 'Delete') },
      ],
    })
    initialChoiceId = selected.id
    if (action === undefined) continue
    await applyRowAction(index, action.id === 'top' ? 'move-top' : action.id === 'bottom' ? 'move-bottom' : action.id === 'up' ? 'move-up' : action.id === 'down' ? 'move-down' : action.id)
  }
  return current
}

async function editLogo(
  navigation: OverlayNavigation,
  settings: TuiWelcomeSettings,
): Promise<TuiWelcomeSettings> {
  let current = settings
  let initialChoiceId: string | undefined
  while (!navigation.signal.aborted) {
    const action = await navigation.select({
      title: ui('欢迎 Logo', 'Welcome logo'),
      detail: ui('修改字段后留在本页；按 Esc 返回欢迎页设置。SeekTTY 不转换普通图片。', 'Changes stay on this page; press Esc to return to Welcome settings. SeekTTY does not convert ordinary images.'),
      searchable: false,
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
      choices: [
        { id: 'source', label: ui('Logo 来源', 'Logo source'), description: logoLabel(current) },
        ...(current.logo.source === 'builtin' || current.logo.source === 'file'
          ? [{ id: 'color', label: ui('颜色模式', 'Color mode'), description: current.logo.colorMode === 'original' ? ui('保留原色 ANSI', 'Preserve ANSI colors') : ui('使用 $[1-9] 主题槽', 'Use $[1-9] theme slots') }]
          : []),
        ...(current.logo.source === 'file' ? [
          { id: 'large', label: ui('大图路径', 'Large-logo path'), description: current.logo.largePath || ui('未设置', 'Not set') },
          { id: 'compact', label: ui('紧凑图路径', 'Compact-logo path'), description: current.logo.compactPath || ui('未设置（窄窗口隐藏）', 'Not set (hidden in narrow terminals)') },
        ] : []),
      ],
    })
    if (action === undefined) return current
    initialChoiceId = action.id
    if (action.id === 'source') {
      const source = await navigation.select({
        title: ui('Logo 来源', 'Logo source'),
        searchable: false,
        initialChoiceId: current.logo.source,
        choices: [
          { id: 'builtin', label: ui('内置 SeekTTY 像素 Logo', 'Built-in SeekTTY pixel logo') },
          { id: 'file', label: ui('自定义终端文本文件', 'Custom terminal-text file') },
          { id: 'fastfetch', label: ui('复用本机 Fastfetch Logo', 'Reuse local Fastfetch logo'), description: ui('只渲染 Logo，不执行信息模块；保留原始颜色', 'Renders only the logo without information modules; preserves original colors') },
          { id: 'none', label: ui('隐藏 Logo', 'Hide logo') },
        ],
      })
      if (source === undefined) continue
      let largePath = current.logo.largePath
      if (source.id === 'file' && largePath.trim() === '') {
        const entered = await navigation.input({
          title: ui('大图文件路径', 'Large-logo file path'),
          detail: ui('支持绝对路径、~ 和工作区相对路径', 'Absolute, ~, and workspace-relative paths are supported'),
          requireText: true,
        })
        if (entered === undefined) continue
        largePath = entered
      }
      current = { ...current, logo: { ...current.logo, source: source.id as TuiWelcomeSettings['logo']['source'], largePath } }
      continue
    }
    if (action.id === 'color') {
      const colorMode = await navigation.select({
        title: ui('Logo 颜色', 'Logo colors'),
        searchable: false,
        initialChoiceId: current.logo.colorMode,
        choices: [
          { id: 'original', label: ui('保留原始 ANSI 颜色', 'Preserve original ANSI colors') },
          { id: 'theme', label: ui('映射当前主题', 'Map to current theme'), description: '$[1-9] / $$' },
        ],
      })
      if (colorMode !== undefined) current = { ...current, logo: { ...current.logo, colorMode: colorMode.id as 'original' | 'theme' } }
      continue
    }
    const compact = action.id === 'compact'
    const path = await navigation.input({
      title: compact ? ui('紧凑图文件路径', 'Compact-logo file path') : ui('大图文件路径', 'Large-logo file path'),
      detail: compact ? ui('可留空；窄窗口会隐藏 Logo', 'Optional; narrow terminals will hide the logo') : ui('自定义文件模式下必填', 'Required in custom-file mode'),
      initialValue: compact ? current.logo.compactPath : current.logo.largePath,
      requireText: !compact && current.logo.source === 'file',
    })
    if (path !== undefined) {
      current = {
        ...current,
        logo: compact ? { ...current.logo, compactPath: path } : { ...current.logo, largePath: path },
      }
    }
  }
  return current
}

async function editModules(
  navigation: OverlayNavigation,
  settings: TuiWelcomeSettings,
): Promise<TuiWelcomeSettings> {
  let current = settings
  let initialChoiceId: string | undefined
  const moduleActions = (index: number, length: number): readonly ContextActionNode[] => [
    { kind: 'submenu', id: 'move', label: ui('移动', 'Move'), children: [
      { kind: 'action', id: 'move-up', label: ui('上移', 'Move up'), ...(index === 0 ? { disabledReason: ui('已经在顶部', 'Already first') } : {}) },
      { kind: 'action', id: 'move-down', label: ui('下移', 'Move down'), ...(index === length - 1 ? { disabledReason: ui('已经在底部', 'Already last') } : {}) },
    ] },
    { kind: 'action', id: 'remove', label: ui('移除', 'Remove'), danger: true },
  ]
  const applyModuleAction = (module: TuiSafeFastfetchModule, actionId: string): void => {
    const modules = [...current.fastfetch.modules]
    const index = modules.indexOf(module)
    if (index < 0) return
    if (actionId === 'remove') {
      modules.splice(index, 1)
      initialChoiceId = modules.length === 0 ? '__add__' : `module:${String(Math.min(index, modules.length - 1))}`
    } else {
      const other = actionId === 'move-up' ? index - 1 : index + 1
      if (other >= 0 && other < modules.length) {
        [modules[index], modules[other]] = [modules[other]!, modules[index]!]
        initialChoiceId = `module:${String(other)}`
      }
    }
    current = { ...current, fastfetch: { ...current.fastfetch, modules } }
  }
  const choices = (): readonly OverlayChoice[] => {
    const modules = [...current.fastfetch.modules]
    return [
      { id: '__add__', label: ui('添加模块…', 'Add modules…'), ...(modules.length === SAFE_FASTFETCH_MODULES.length ? { disabledReason: ui('已全部添加', 'All modules added') } : {}) },
      { id: '__defaults__', label: ui('恢复默认模块', 'Restore default modules') },
      ...modules.map((module, index) => ({
        id: `module:${String(index)}`,
        label: `${String(index + 1)}. ${moduleLabel(module)}`,
        contextTarget: { kind: 'fastfetch-module' as const, moduleId: module },
        contextTitle: moduleLabel(module),
        contextActions: moduleActions(index, modules.length),
        onContextAction: (actionId: string) => {
          applyModuleAction(module, actionId)
          navigation.updateChoices(choices())
        },
      })),
    ]
  }
  while (!navigation.signal.aborted) {
    const modules = [...current.fastfetch.modules]
    const selected = await navigation.select({
      title: ui('Fastfetch 安全模块', 'Safe Fastfetch modules'),
      detail: ui('可连续添加、移动或删除；按 Esc 返回 Fastfetch 设置。', 'Continue adding, moving, or removing modules; press Esc to return to Fastfetch settings.'),
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
      choices: choices(),
    })
    if (selected === undefined) return current
    if (selected.id === '__defaults__') {
      current = { ...current, fastfetch: { ...current.fastfetch, modules: [...defaultWelcomeSettings().fastfetch.modules] } }
      initialChoiceId = '__defaults__'
      continue
    }
    if (selected.id === '__add__') {
      const available = SAFE_FASTFETCH_MODULES.filter(module => !modules.includes(module))
      const additions = await navigation.multiSelect({
        title: ui('添加安全模块', 'Add safe modules'),
        choices: available.map(module => ({ id: module, label: moduleLabel(module) })),
        requireSelection: true,
      })
      if (additions !== undefined) {
        const next = [...modules, ...additions.map(choice => choice.id as TuiSafeFastfetchModule)]
        current = { ...current, fastfetch: { ...current.fastfetch, modules: next } }
        initialChoiceId = `module:${String(modules.length)}`
      } else initialChoiceId = '__add__'
      continue
    }
    const index = Number.parseInt(selected.id.slice('module:'.length), 10)
    const module = modules[index]
    if (module === undefined) {
      initialChoiceId = '__add__'
      continue
    }
    const action = await navigation.select({
      title: moduleLabel(module),
      searchable: false,
      choices: [
        { id: 'up', label: ui('上移', 'Move up'), ...(index === 0 ? { disabledReason: ui('已经在顶部', 'Already first') } : {}) },
        { id: 'down', label: ui('下移', 'Move down'), ...(index === modules.length - 1 ? { disabledReason: ui('已经在底部', 'Already last') } : {}) },
        { id: 'remove', label: ui('移除', 'Remove') },
      ],
    })
    initialChoiceId = selected.id
    if (action === undefined) continue
    applyModuleAction(module, action.id === 'up' ? 'move-up' : action.id === 'down' ? 'move-down' : action.id)
  }
  return current
}

async function editFastfetch(
  navigation: OverlayNavigation,
  settings: TuiWelcomeSettings,
): Promise<TuiWelcomeSettings> {
  let current = settings
  let initialChoiceId: string | undefined
  while (!navigation.signal.aborted) {
    const action = await navigation.select({
      title: 'Fastfetch',
      detail: ui('修改字段后留在本页；按 Esc 返回欢迎页设置。', 'Changes stay on this page; press Esc to return to Welcome settings.'),
      searchable: false,
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
      choices: [
        {
          id: 'source', label: ui('数据来源', 'Data source'),
          description: current.fastfetch.source === 'safe' ? ui('安全预设（--config none）', 'Safe preset (--config none)') : ui('信任用户配置', 'Trusted user config'),
        },
        { id: 'modules', label: ui('安全模块与顺序', 'Safe modules and order'), description: current.fastfetch.modules.map(moduleLabel).join(' · ') },
        { id: 'config', label: ui('用户配置路径', 'User config path'), description: current.fastfetch.configPath || ui('Fastfetch 默认配置', 'Fastfetch default config') },
      ],
    })
    if (action === undefined) return current
    initialChoiceId = action.id
    if (action.id === 'modules') {
      current = await editModules(navigation, current)
      continue
    }
    if (action.id === 'config') {
      const path = await navigation.input({
        title: ui('Fastfetch 配置路径', 'Fastfetch config path'),
        detail: ui('可留空以使用 Fastfetch 默认配置；用于“用户配置”信息或 Fastfetch Logo。', 'Leave blank for the Fastfetch default; used by user-config information or the Fastfetch logo.'),
        initialValue: current.fastfetch.configPath,
      })
      if (path !== undefined) current = { ...current, fastfetch: { ...current.fastfetch, configPath: path } }
      continue
    }
    const source = await navigation.select({
      title: ui('Fastfetch 数据来源', 'Fastfetch data source'),
      searchable: false,
      initialChoiceId: current.fastfetch.source,
      choices: [
        { id: 'safe', label: ui('安全预设', 'Safe preset'), description: '--config none' },
        { id: 'user-config', label: ui('用户配置（受信任）', 'User config (trusted)'), description: ui('配置可能包含 command 模块并执行外部命令', 'The config may contain command modules that execute external commands') },
      ],
    })
    if (source === undefined || source.id === current.fastfetch.source) continue
    if (source.id === 'user-config') {
      const trusted = await navigation.confirm(
        ui('信任 Fastfetch 用户配置？', 'Trust the Fastfetch user config?'),
        ui('Fastfetch 配置可能包含 command 模块并执行任意外部命令。SeekTTY 只清理最终输出，无法约束配置内部行为。', 'A Fastfetch config may contain command modules that execute arbitrary external commands. SeekTTY sanitizes final output but cannot constrain the config itself.'),
        ui('我信任此配置', 'Trust this config'),
      )
      if (!trusted) continue
    }
    current = { ...current, fastfetch: { ...current.fastfetch, source: source.id as 'safe' | 'user-config' } }
  }
  return current
}

/** Open one draft transaction. No live state changes until Save succeeds. */
export async function editWelcomeSettings(
  navigation: OverlayNavigation,
  context: WelcomeEditorContext,
): Promise<TuiSettingsDocument | undefined> {
  let draft = cloneSettings(welcomeFromSettings(context.document))
  const options = { width: '95%', maxHeight: '92%', anchor: 'center', margin: 1 } as const
  const request = async (initialChoiceId?: string): Promise<SelectOverlayRequest> => {
    const preview = (await context.preview(draft, 56)).split('\n')
    const visible = preview.slice(0, 10)
    return {
      title: ui('欢迎页', 'Welcome page'),
      detail: [ui('实时预览（最多显示前 10 行）', 'Live preview (first 10 rows)'), ...visible, ...(preview.length > visible.length ? ['…'] : [])].join('\n'),
      searchable: false,
      choices: [
        { id: 'mode', label: ui('信息模式', 'Information mode'), description: modeLabel(draft) },
        ...(draft.infoMode === 'mixed' ? [{ id: 'order', label: ui('混合顺序', 'Mixed order'), description: draft.mixedOrder === 'custom-first' ? ui('自定义优先', 'Custom first') : 'Fastfetch first' }] : []),
        { id: 'rows', label: ui('自定义信息行', 'Custom information rows'), description: ui(`${String(draft.customRows.length)} 行 · 可新增、编辑、删除和重排`, `${String(draft.customRows.length)} rows · add, edit, delete, and reorder`) },
        { id: 'logo', label: 'Logo', description: logoLabel(draft) },
        { id: 'fastfetch', label: 'Fastfetch', description: draft.fastfetch.source === 'safe' ? ui(`${String(draft.fastfetch.modules.length)} 个安全模块`, `${String(draft.fastfetch.modules.length)} safe modules`) : ui('用户配置（受信任）', 'User config (trusted)') },
        { id: 'preview', label: ui('查看完整预览', 'View full preview') },
        { id: 'reset', label: ui('恢复默认草稿', 'Reset draft to defaults'), description: ui('尚不保存', 'Does not save yet') },
        { id: 'save', label: ui('保存并立即应用', 'Save and apply now') },
        { id: 'cancel', label: ui('取消全部修改', 'Cancel all changes') },
      ],
      ...(initialChoiceId === undefined ? {} : { initialChoiceId }),
      options,
    }
  }
  const handle = async (selected: OverlayChoice): Promise<void> => {
    if (selected.id === 'cancel') {
      navigation.back()
      return
    }
    if (selected.id === 'save') {
      const prepared = await prepareWelcomeSettings(draft, context.workspacePath)
      const updated = await saveWelcomeSettings(context.settings, context.document, prepared)
      context.apply(welcomeFromSettings(updated))
      context.notice(ui('欢迎页设置已保存并立即生效', 'Welcome settings were saved and are now active'), 'success')
      navigation.back()
      return
    }
    if (selected.id === 'mode') {
      const mode = await navigation.select({
        title: ui('欢迎页信息模式', 'Welcome information mode'),
        searchable: false,
        initialChoiceId: draft.infoMode,
        choices: [
          { id: 'custom', label: ui('自定义文字（默认）', 'Custom text (default)'), description: ui('不执行 Fastfetch', 'Does not run Fastfetch') },
          { id: 'fastfetch', label: 'Fastfetch' },
          { id: 'mixed', label: ui('混合', 'Mixed'), description: ui('同时显示自定义与 Fastfetch 内容', 'Show custom and Fastfetch content together') },
        ],
      })
      if (mode !== undefined) draft = { ...draft, infoMode: mode.id as TuiWelcomeSettings['infoMode'] }
    } else if (selected.id === 'order') {
      const order = await navigation.select({
        title: ui('混合内容顺序', 'Mixed content order'),
        searchable: false,
        initialChoiceId: draft.mixedOrder,
        choices: [
          { id: 'custom-first', label: ui('自定义内容优先', 'Custom first') },
          { id: 'fastfetch-first', label: 'Fastfetch first' },
        ],
      })
      if (order !== undefined) draft = { ...draft, mixedOrder: order.id as TuiWelcomeSettings['mixedOrder'] }
    } else if (selected.id === 'rows') draft = await editRows(navigation, draft)
    else if (selected.id === 'logo') draft = await editLogo(navigation, draft)
    else if (selected.id === 'fastfetch') draft = await editFastfetch(navigation, draft)
    else if (selected.id === 'preview') {
      await navigation.detail({ title: ui('欢迎页预览', 'Welcome preview'), content: await context.preview(draft, 76), maxVisible: 32, options })
    } else if (selected.id === 'reset') draft = cloneSettings(defaultWelcomeSettings())
    if (navigation.signal.aborted) return
    navigation.replaceSelectPage(await request(selected.id), handle)
  }
  await navigation.selectPage(await request(), handle)
  return undefined
}
