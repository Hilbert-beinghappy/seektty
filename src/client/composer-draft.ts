/** Idle composer draft recovery used by the Ctrl+C clear path. */

export const IDLE_DRAFT_CLEARED_NOTICE = '已清空草稿，按 ↑ 可找回'

interface ComposerDraftEditor {
  getText(): string
  addToHistory(text: string): void
  setText(text: string): void
}

/**
 * Preserve composer text in editor history, then clear the draft and attachments.
 * @param editor - focused prompt editor.
 * @param clearAttachments - pending image attachment sink.
 * @returns the notice shown after a successful idle clear.
 */
export function clearIdleComposerDraft(
  editor: ComposerDraftEditor,
  clearAttachments: () => void,
): string {
  const text = editor.getText()
  if (text !== '') editor.addToHistory(text)
  editor.setText('')
  clearAttachments()
  return IDLE_DRAFT_CLEARED_NOTICE
}
