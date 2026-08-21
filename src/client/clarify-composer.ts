/** Classify and dispatch SeekTTY Clarify from the lossless composer submit payload. */

import { isSlashCommandLine, splitLeadingImagePath } from './pasted-image.ts'

export type ClarifyComposerSource = 'leading' | 'trailing' | 'palette'

export interface ClarifyComposerTransaction {
  readonly source: ClarifyComposerSource
  readonly restoreText: string
  readonly seedText: string
  readonly replaceableText: string
}

export interface ComposerSubmitHost {
  followLatest(): void
  draftAttachmentCount(): number
  addToHistory(text: string): void
  clearEditor(): void
  dispatchCommand(line: string): void
  attachLeadingImage(path: string, raw: string, rest: string): void
  sendPrompt(text: string): void
  runClarify(transaction: ClarifyComposerTransaction): void | Promise<void>
}

const CLARIFY_TOKEN = /^\/clarify$/iu

/**
 * Classify the lossless raw composer as a local Clarify intent.
 * Leading `/clarify [args]` and a final trailing `/clarify` token or line
 * are never ordinary prompts.
 */
export function classifyClarifyComposer(raw: string): ClarifyComposerTransaction | undefined {
  const restoreText = raw
  const trimmed = raw.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').trim()
  if (trimmed === '') return undefined
  const lines = trimmed.split('\n')
  const lastLine = (lines.at(-1) ?? '').trim()

  if (lines.length >= 2 && CLARIFY_TOKEN.test(lastLine)) {
    const body = lines.slice(0, -1).join('\n').trim()
    if (body !== '') {
      return { source: 'trailing', restoreText, seedText: body, replaceableText: body }
    }
  }

  const trailingToken = /(?:^|\s)\/clarify$/iu.exec(lastLine)
  if (trailingToken !== null && trailingToken.index > 0) {
    const lastLineBody = lastLine.slice(0, trailingToken.index).trimEnd()
    const seed = [...lines.slice(0, -1), lastLineBody].join('\n').trim()
    if (seed !== '') {
      return { source: 'trailing', restoreText, seedText: seed, replaceableText: seed }
    }
  }

  const leading = /^\/clarify(?:\s+(.*))?$/iu.exec((lines[0] ?? '').trim())
  if (leading !== null) {
    const args = [leading[1] ?? '', ...lines.slice(1)].join('\n').trim()
    return { source: 'leading', restoreText, seedText: args, replaceableText: '' }
  }
  return undefined
}

/**
 * Palette execution keeps the current composer as seed, replaceable text, and restore text.
 */
export function paletteClarifyTransaction(composerText: string): ClarifyComposerTransaction {
  return {
    source: 'palette',
    restoreText: composerText,
    seedText: composerText.trim(),
    replaceableText: composerText,
  }
}

/**
 * Surface dispatch boundary: classify Clarify before history, clear, or send.
 */
export function dispatchComposerSubmit(raw: string, host: ComposerSubmitHost): void {
  const transaction = classifyClarifyComposer(raw)
  if (transaction !== undefined) {
    host.followLatest()
    void host.runClarify(transaction)
    return
  }
  const text = raw.trim()
  if (text === '' && host.draftAttachmentCount() === 0) return
  host.followLatest()
  if (text !== '') host.addToHistory(text)
  host.clearEditor()
  if (isSlashCommandLine(text)) {
    host.dispatchCommand(text)
    return
  }
  const leading = splitLeadingImagePath(text)
  if (leading !== undefined) {
    host.attachLeadingImage(leading.path, text, leading.rest)
    return
  }
  host.sendPrompt(text)
}
