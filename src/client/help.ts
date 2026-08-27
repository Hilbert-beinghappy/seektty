/** Partitioned in-app help used by `/help` and F1. */

import { helpKeymapText } from './keymap.ts'
import { ui } from './locale.ts'
import { defaultPluginSpec, PACKAGE_VERSION } from '../dsh-compat.ts'

export type HelpSectionId = 'keys' | 'flows' | 'doctor'

export function helpSectionChoices(): readonly { id: HelpSectionId; label: string; description: string }[] {
  return [
    { id: 'keys', label: ui('键位速查', 'Keyboard shortcuts'), description: ui('与当前 TUI 绑定共用一张表', 'Same table as the live TUI bindings') },
    { id: 'flows', label: ui('常用流程', 'Common workflows'), description: ui('输入、停止、会话、审批和浏览', 'Input, stop, sessions, approvals, and browsing') },
    { id: 'doctor', label: ui('/doctor 与安装', '/doctor and setup'), description: ui('环境检查和 QUICKSTART', 'Environment checks and QUICKSTART') },
  ]
}

export function helpSectionText(id: HelpSectionId): string {
  if (id === 'keys') return helpKeymapText()
  if (id === 'flows') {
    return ui(
      [
        '输入：在底部输入区写消息，Enter 发送。',
        '换行：Shift+Enter 在输入区插入换行。',
        '图片：直接粘贴图片或图片路径；也可以 /attach。待发送图片显示在输入框下方。默认 v4-flash / v4-pro 目前不接受图片输入。',
        '停止：Ctrl+C 停止当前轮次；再按一次退出。',
        '会话：Ctrl+S 打开会话列表，新建或切换会话。',
        '审批：弹窗里查看命令或 diff，再选仅本次允许或拒绝。',
        '浏览对话：Tab 进入对话浏览，按 / 增量搜索，n/N 跳转。',
        '滚动与复制：完整鼠标模式用滚轮浏览内部对话，并点击工具卡、示例、补全和已有 chrome。F3 或 /mouse 可切到原生模式，用终端选择；Terminal.app 按住 Fn、iTerm2 按住 Option 后拖选。复制选区默认 Ctrl+Shift+C。危险确认只能用 Enter 执行。',
      ].join('\n'),
      [
        'Input: type in the composer and press Enter to send.',
        'Newline: Shift+Enter inserts a newline in the composer.',
        'Images: paste an image or image path, or use /attach. Pending images appear under the composer. Default v4-flash / v4-pro currently reject image input.',
        'Stop: Ctrl+C stops the active turn; press again to exit.',
        'Sessions: Ctrl+S opens the session list to create or switch sessions.',
        'Approvals: inspect the command or diff in the overlay, then allow once or reject.',
        'Browse the transcript: Tab into browse mode, press / to search, then n/N to jump.',
        'Scroll and copy: full mouse mode uses the wheel on the internal transcript and clicks tool cards, examples, autocomplete, and existing chrome. F3 or /mouse switches to native mode for terminal selection; hold Fn in Terminal.app or Option in iTerm2 while dragging. Copy selection defaults to Ctrl+Shift+C. Dangerous confirmations still require Enter.',
      ].join('\n'),
    )
  }
  return ui(
    [
      '输入 /doctor 检查 pnpm、Profile 插件和 Bundle 兼容性。',
      '启动前需要 Node、pnpm 和官方 dsh，且 dsh 需在 PATH 或 DSH_BIN 中。',
      `安装：pnpm add --global ${defaultPluginSpec(PACKAGE_VERSION)}`,
      '然后运行 deepseek。版本与兼容范围见 deepseek --version。',
      '更多步骤见仓库 QUICKSTART 与 README。',
    ].join('\n'),
    [
      'Run /doctor to check pnpm, Profile plugins, and Bundle compatibility.',
      'Before launch you need Node, pnpm, and official dsh on PATH or DSH_BIN.',
      `Install: pnpm add --global ${defaultPluginSpec(PACKAGE_VERSION)}`,
      'Then run deepseek. See deepseek --version for the version and compatibility range.',
      'More steps are in the repository QUICKSTART and README.',
    ].join('\n'),
  )
}
