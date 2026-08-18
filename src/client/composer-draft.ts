/** Idle composer draft recovery used by the Ctrl+C clear path. */

import { ui } from './locale.ts'

interface ComposerDraftEditor {
  getText(): string
  addToHistory(text: string): void
  setText(text: string): void
}

/**
 * Preserve composer text in editor history and the durable Settings-backed
 * history, then clear the draft and attachments.
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
  }
  editor.setText('')
  clearAttachments()
  return text !== ''
    ? ui('已清空草稿，按 ↑ 可找回', 'Draft cleared; press ↑ to restore')
    : ui('已清空输入草稿', 'Draft cleared')
}
