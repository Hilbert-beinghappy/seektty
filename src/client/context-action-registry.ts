/** Product-level context menu descriptions; execution remains in TuiActions. */

import { ui } from './locale.ts'
import type { ContextActionMenu, ContextActionNode, ContextTarget } from './context-actions.ts'

const action = (
  id: string,
  label: string,
  options: { readonly danger?: boolean; readonly disabledReason?: string; readonly description?: string } = {},
): ContextActionNode => ({ kind: 'action', id, label, ...options })

const submenu = (id: string, label: string, children: readonly ContextActionNode[]): ContextActionNode => ({
  kind: 'submenu', id, label,
  children: children.filter((node): node is Extract<ContextActionNode, { kind: 'action' | 'separator' }> => node.kind !== 'submenu'),
})

export function contextActionMenu(
  target: ContextTarget,
  state: { readonly jobStoppable?: boolean; readonly customTheme?: boolean } = {},
): ContextActionMenu | undefined {
  const menu = (title: string, nodes: readonly ContextActionNode[]): ContextActionMenu => ({ title, target, nodes })
  switch (target.kind) {
    case 'text': return undefined
    case 'session': return menu(ui(`会话 · ${target.sessionId}`, `Session · ${target.sessionId}`), [
      action('open', ui('打开', 'Open')),
      action('rename', ui('重命名…', 'Rename…')),
      action('fork', 'Fork'),
      submenu('export', ui('导出', 'Export'), [
        action('export-zip', ui('会话 ZIP', 'Session ZIP')),
        action('export-descendants', ui('会话与子 Agent ZIP', 'Session and subagents ZIP')),
        action('export-markdown', 'Markdown'),
      ]),
      { kind: 'separator', id: 'session-danger' },
      action('archive', ui('归档…', 'Archive…'), { danger: true }),
    ])
    case 'workspace': return menu(ui(`工作区 · ${target.workspaceId}`, `Workspace · ${target.workspaceId}`), [
      action('open', ui('打开／新建会话', 'Open / create session')),
      submenu('manage', ui('管理', 'Manage'), [
        action('rename', ui('重命名…', 'Rename…')),
        action('reorder-sessions', ui('调整会话顺序…', 'Reorder sessions…')),
      ]),
      action('reorder', ui('调整工作区顺序…', 'Reorder workspaces…')),
      { kind: 'separator', id: 'workspace-danger' },
      action('unregister', ui('移除工作区注册…', 'Unregister workspace…'), { danger: true }),
    ])
    case 'profile': return menu(`Profile · ${target.profile}`, [
      action('switch', ui('切换…', 'Switch…')),
      action('copy-profile', ui('复制为新 Profile…', 'Copy to new Profile…')),
    ])
    case 'theme': return menu(ui(`主题 · ${target.themeId}`, `Theme · ${target.themeId}`), [
      action('apply', ui('应用界面与代码主题', 'Apply UI and code theme')),
      action('apply-code', ui('仅设为代码主题', 'Use as code theme only')),
      submenu('customize', ui('自定义主题', 'Custom theme'), [
        action('edit', ui('编辑…', 'Edit…')),
        action('palette', ui('查看调色板', 'View palette')),
        action('export', ui('导出…', 'Export…')),
        action('delete', ui('删除…', 'Delete…'), {
          danger: true,
          ...(state.customTheme === false ? { disabledReason: ui('内置主题不能删除', 'Built-in themes cannot be deleted') } : {}),
        }),
      ]),
    ])
    case 'welcome-row': return menu(ui(`欢迎页信息 · ${target.rowId}`, `Welcome row · ${target.rowId}`), [
      action('edit', ui('编辑', 'Edit')),
      submenu('move', ui('移动', 'Move'), [
        action('move-top', ui('移到顶部', 'Move to top')),
        action('move-up', ui('上移', 'Move up')),
        action('move-down', ui('下移', 'Move down')),
        action('move-bottom', ui('移到底部', 'Move to bottom')),
      ]),
      action('delete', ui('删除', 'Delete'), { danger: true }),
    ])
    case 'fastfetch-module': return menu(`Fastfetch · ${target.moduleId}`, [
      submenu('move', ui('移动', 'Move'), [
        action('move-up', ui('上移', 'Move up')),
        action('move-down', ui('下移', 'Move down')),
      ]),
      action('remove', ui('移除', 'Remove'), { danger: true }),
    ])
    case 'queue-item': return menu(ui(`排队消息 · ${target.itemId}`, `Queued message · ${target.itemId}`), [
      action('steer', ui('转为引导', 'Convert to steering')),
      action('edit', ui('编辑…', 'Edit…')),
      action('remove', ui('删除', 'Delete'), { danger: true }),
    ])
    case 'plugin': return menu(ui(`插件 · ${target.pluginId}`, `Plugin · ${target.pluginId}`), [
      action('details', ui('查看详情', 'View details')),
      action('update', ui('更新…', 'Update…')),
      action('remove', ui('移除…', 'Remove…'), { danger: true }),
    ])
    case 'plugin-catalog': return menu(ui(`插件目录 · ${target.catalogId}`, `Plugin catalog · ${target.catalogId}`), [
      action('toggle', ui('启用／停用', 'Enable / disable')),
      action('credential', ui('配置凭证…', 'Configure credential…')),
      action('remove', ui('移除…', 'Remove…'), { danger: true }),
    ])
    case 'plugin-bundle': return menu(`Bundle · ${target.pluginId}`, [submenu('move', ui('移动', 'Move'), [
      action('move-top', ui('移到顶部', 'Move to top')),
      action('move-up', ui('上移', 'Move up')),
      action('move-down', ui('下移', 'Move down')),
      action('move-bottom', ui('移到底部', 'Move to bottom')),
    ])])
    case 'file': return menu(ui(`文件 · ${target.path}`, `File · ${target.path}`), [
      action('view', ui('在 TUI 查看', 'View in TUI')),
      action('copy-path', ui('复制绝对路径', 'Copy absolute path')),
      action('open-external', ui('外部打开…', 'Open externally…')),
    ])
    case 'job': return menu(ui(`后台任务 · ${target.jobId}`, `Background job · ${target.jobId}`), [
      action('details', ui('查看详情', 'View details')),
      action('stop', ui('停止任务…', 'Stop job…'), {
        danger: true,
        ...(state.jobStoppable === false ? { disabledReason: ui('任务已结束', 'Job already finished') } : {}),
      }),
    ])
    case 'subagent': return menu(ui(`子 Agent · ${target.sessionId}`, `Subagent · ${target.sessionId}`), [action('open', ui('打开', 'Open'))])
    case 'tool-card': return menu(ui('工具调用', 'Tool call'), [action('toggle', ui('展开／收起', 'Expand / collapse'))])
    case 'reasoning': return menu(ui('思考', 'Reasoning'), [action('toggle', ui('展开／收起', 'Expand / collapse'))])
    case 'agent-tree': return menu(ui(`Agent · ${target.sessionId}`, `Agent · ${target.sessionId}`), target.part === 'chevron'
      ? [action('toggle', ui('展开／收起', 'Expand / collapse'))]
      : [action('open', ui('打开', 'Open'))])
    case 'mcp-tool': return menu(`MCP · ${target.id}`, [action('details', ui('查看详情与参数', 'View details and parameters'))])
    case 'mcp-instance': return menu(ui(`MCP 实例 · ${target.id}`, `MCP instance · ${target.id}`), [
      action('details', ui('查看实例', 'View instance')),
      action('doctor', ui('运行 /doctor', 'Run /doctor')),
      action('settings', ui('打开 MCP 设置…', 'Open MCP Settings…')),
    ])
    case 'settings': return menu(ui(`设置 · ${target.id}`, `Settings · ${target.id}`), [action('open', ui('打开设置', 'Open Settings'))])
    case 'skill': return menu(`Skill · ${target.id}`, [action('insert', ui('插入到输入框', 'Insert into composer'))])
    case 'trajectory': return menu(ui(`轨迹 · ${target.id}`, `Trajectory · ${target.id}`), [action('details', ui('查看详情', 'View details'))])
    case 'chrome': {
      const labels: Record<string, string> = {
        model: ui('模型', 'Model'), reasoning: ui('推理强度', 'Reasoning effort'), mode: ui('模式', 'Mode'),
        permission: ui('权限', 'Permission'), detail: ui('状态', 'Status'),
      }
      return menu(labels[target.commandId] ?? target.commandId, [action('open', ui('打开', 'Open'))])
    }
  }
}
