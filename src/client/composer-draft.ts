/** Idle composer draft recovery used by the Ctrl+C clear path. */

import { ui } from './locale.ts'

interface ComposerDraftEditor {
  getText(): string
  addToHistory(text: string): void
  setText(text: string): void
}

/**
 * Preserve composer text in editor history and the durable Settings-backed
 * history, then clear the text draft. Attachments stay unless the composer
 * is already empty, so Up can restore words without silently dropping images.
 * @param editor - focused prompt editor.
 * @param clearAttachments - pending image attachment sink.
 * @param remember - durable history sink (revisioned Settings path).
 * @returns the notice shown after a successful idle clear.
 */
export function clearIdleComposerDraft(
  editor: ComposerDraftEditor,
  clearAttachments: () => void,
  remember: (text: string) => void = () => undefined,
): string {
  const text = editor.getText()
  if (text !== '') {
    editor.addToHistory(text)
    remember(text)
    editor.setText('')
    return ui(
      '已清空文字草稿，按 ↑ 可找回；图片仍保留',
      'Text draft cleared; press ↑ to restore. Images were kept.',
    )
  }
  editor.setText('')
  clearAttachments()
  return ui('已清除待发送图片', 'Pending images cleared')
}
