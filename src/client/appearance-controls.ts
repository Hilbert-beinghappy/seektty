/** Localized controls keep palettes, encoding, fill and OSC synchronization distinct. */
import type { TuiRenderingSettings } from '@deepseek-ai/dsh-tui-protocol'
import { ui } from './locale.ts'

export function renderingControl(key: keyof TuiRenderingSettings) {
  switch (key) {
    case 'colorMode': return {
      command: 'colors', title: ui('显色方式', 'Color rendering'),
      detail: ui(
        '只改变颜色编码，不改变背景呈现。禁色设置仍优先。\n原色 RGB 不主动量化颜色；终端或 tmux 仍可能量化。',
        'Changes color encoding, not background fill. Color suppression is respected.\nOriginal RGB skips application quantization; the terminal or tmux may still quantize.',
      ),
      choices: [
        { id: 'auto', label: ui('自动检测', 'Automatic'), description: ui('按终端能力输出 RGB、256 色或 16 色', 'Use detected RGB, 256-color or 16-color support') },
        { id: 'rgb', label: ui('原色 RGB', 'Original RGB'), description: ui('直接输出主题原色；沿用终端背景时需手动匹配明暗', 'Send theme RGB directly; match light/dark manually when inheriting the terminal background') },
      ],
    }
    case 'backgroundFill': return {
      command: 'fill', title: ui('背景呈现', 'Background fill'),
      detail: ui(
        '只改变画布、弹窗和代码基础背景，不改变显色方式。\n主题铺底通过字符单元填色，不需要终端背景同步。\n恢复旧兼容组合：/theme background explicit',
        'Changes canvas, panel and base code backgrounds, not color rendering.\nTheme fill paints character cells; terminal background sync is not required.\nRestore the legacy compatibility preset: /theme background explicit',
      ),
      choices: [
        { id: 'terminal', label: ui('沿用终端背景', 'Inherit terminal'), description: ui('保留终端背景效果；明暗需手动匹配，选区及特殊 token 仍铺色', 'Keep terminal background effects; match light/dark manually. Selection and special tokens retain fills') },
        { id: 'theme', label: ui('主题铺底', 'Theme fill'), description: ui('铺满主题画布、面板及代码底色；透明效果由终端决定', 'Fill canvas, panels and code with theme backgrounds; the terminal decides opacity') },
      ],
    }
    case 'terminalBackgroundSync': return {
      command: 'sync', title: ui('终端背景同步（高级）', 'Terminal background sync (advanced)'),
      detail: ui(
        '独立的 OSC 11 功能，不是主题铺底的前提。tmux 等环境可能不支持。\n关闭或退出时仅恢复本次运行已捕获且改过的原背景；不修改终端配置。',
        'Independent OSC 11 feature; not required for theme fill. May be unavailable in tmux.\nDisable/exit restores only a background captured and changed by this run; terminal configuration is untouched.',
      ),
      choices: [
        { id: 'off', label: ui('关闭', 'Off'), description: ui('不查询、不改色；铺底与显色仍独立生效', 'No background queries or recoloring; fill and color rendering remain independent') },
        { id: 'theme', label: ui('尝试同步主题底色', 'Try theme background sync'), description: ui('仅在支持的终端尝试 OSC 11 查询与改色', 'Attempt OSC 11 query/recoloring only on supported terminals') },
      ],
    }
  }
}

export const RENDERING_KEYS = ['colorMode', 'backgroundFill', 'terminalBackgroundSync'] as const
