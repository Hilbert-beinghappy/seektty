/** Partitioned in-app help used by `/help` and F1. */

import { helpKeymapText } from './keymap.ts'
import { ui } from './locale.ts'

export type HelpSectionId = 'keys' | 'flows' | 'doctor'

export function helpSectionChoices(): readonly { id: HelpSectionId; label: string; description: string }[] {
  return [
    { id: 'keys', label: ui('键位速查', 'Keyboard shortcuts'), description: ui('与当前 TUI 绑定共用一张表', 'Same table as the live TUI bindings') },
    { id: 'flows', label: ui('常用流程', 'Common workflows'), description: ui('审批、粘贴、导出和查找', 'Approvals, paste, export, and search') },
    { id: 'doctor', label: ui('/doctor 与安装', '/doctor and setup'), description: ui('环境检查和 QUICKSTART', 'Environment checks and QUICKSTART') },
  ]
}

export function helpSectionText(id: HelpSectionId): string {
  if (id === 'keys') return helpKeymapText()
  if (id === 'flows') {
    return ui(
      [
        '审批工具：弹窗里查看命令或 diff，再选仅本次允许或拒绝。',
        '粘贴图片：粘贴文件路径，或在空粘贴时从系统剪贴板读取位图。',
        '查找对话：Tab 进入对话浏览，按 / 增量搜索，n/N 跳转。',
        '导出会话：/export 保存 ZIP，/export md 保存 Markdown。',
        '命令面板：Ctrl+P；完整帮助：F1 或 /help。',
      ].join('\n'),
      [
        'Approve tools: inspect the command or diff in the overlay, then allow once or reject.',
        'Paste images: paste a file path, or capture a clipboard bitmap on an empty paste.',
        'Search the transcript: Tab into browse mode, press / to search, then n/N to jump.',
        'Export: /export saves a ZIP; /export md saves Markdown.',
        'Command palette: Ctrl+P. Full help: F1 or /help.',
      ].join('\n'),
    )
  }
  return ui(
    [
      '输入 /doctor 检查 pnpm、Profile 插件和 Bundle 兼容性。',
      '启动前需要 Node、pnpm 和官方 dsh，且 dsh 需在 PATH 或 DSH_BIN 中。',
      '安装：pnpm add --global github:Hilbert-beinghappy/seektty#v1.0.0',
      '然后运行 deepseek。版本与兼容范围见 deepseek --version。',
      '更多步骤见仓库 QUICKSTART 与 README。',
    ].join('\n'),
    [
      'Run /doctor to check pnpm, Profile plugins, and Bundle compatibility.',
      'Before launch you need Node, pnpm, and official dsh on PATH or DSH_BIN.',
      'Install: pnpm add --global github:Hilbert-beinghappy/seektty#v1.0.0',
      'Then run deepseek. See deepseek --version for the version and compatibility range.',
      'More steps are in the repository QUICKSTART and README.',
    ].join('\n'),
  )
}
