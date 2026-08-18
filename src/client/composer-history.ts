/** Composer history helpers. Durable entries live in Harness Settings. */

import {
  TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE,
  type TuiSettingsDocument,
} from '@deepseek-ai/dsh-tui-protocol'

function asEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
}

/**
 * Remember one submitted prompt, newest first, without consecutive duplicates.
 * @param entries - previously loaded newest-first history.
 * @param text - raw submitted composer text.
 * @param limit - maximum stored entries; 0 disables persistence.
 * @returns the updated newest-first list.
 */
export function rememberComposerHistory(
  entries: readonly string[],
  text: string,
  limit: number,
): string[] {
  if (limit <= 0) return []
  const trimmed = text.trim()
  if (trimmed === '') return [...entries]
  const next = entries[0] === trimmed ? [...entries] : [trimmed, ...entries]
  return next.slice(0, limit)
}

/**
 * Project Host Settings into the in-editor history list and its revision.
 * @param documents - redacted Settings descriptors from the Host.
 * @param limit - maximum entries to keep; 0 disables persistence.
 */
export function composerHistoryFromDocuments(
  documents: readonly TuiSettingsDocument[],
  limit: number,
): { readonly entries: string[]; readonly revision: number } {
  const document = documents.find(item => item.namespace === TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE)
  if (document === undefined) return { entries: [], revision: 0 }
  const record = typeof document.value === 'object' && document.value !== null
    ? document.value as { readonly entries?: unknown }
    : {}
  const entries = limit <= 0 ? [] : asEntries(record.entries).slice(0, limit)
  return { entries, revision: document.revision }
}
