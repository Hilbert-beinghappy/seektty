/** Stable, target-aware choices for the application-owned mouse context menu. */

import type { OverlayChoice } from './overlays.ts'
import { ui } from './locale.ts'

export function mouseContextChoices(options: {
  readonly target: 'transcript' | 'composer'
  readonly hasSelection: boolean
  readonly pasteSupported: boolean
}): readonly OverlayChoice[] {
  const copy = options.hasSelection ? [{ id: 'copy', label: ui('复制', 'Copy') }] : []
  const cancel = { id: 'cancel', label: ui('取消', 'Cancel') }
  const native = { id: 'native', label: ui('切换到原生选择模式', 'Switch to native selection') }
  if (options.target === 'transcript') return [...copy, native, cancel]
  const paste: OverlayChoice = {
    id: 'paste',
    label: ui('粘贴纯文本', 'Paste plain text'),
    ...(options.pasteSupported ? {} : {
      disabledReason: ui(
        '此平台没有受支持的安全剪贴板读取器',
        'No supported safe clipboard reader exists on this platform',
      ),
    }),
  }
  return options.hasSelection ? [...copy, paste, cancel] : [paste, native, cancel]
}
