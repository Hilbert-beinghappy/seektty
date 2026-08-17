/** Profile-scoped composer history for Up/Down recall and Ctrl+R search. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** File name stored inside the launcher-selected Profile directory. */
export const COMPOSER_HISTORY_FILENAME = 'seektty-composer-history.json'

/**
 * Resolve the durable composer-history path for one Profile.
 * @param profile - launcher-selected Profile name.
 * @param env - process environment; `DSH_HOME` overrides `~/.dsh`.
 * @param home - account home used when `DSH_HOME` is absent.
 * @returns absolute JSON path under the Profile directory.
 */
export function composerHistoryPath(
  profile: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const root = env.DSH_HOME?.trim() || join(home, '.dsh')
  return join(root, 'profiles', profile, COMPOSER_HISTORY_FILENAME)
}

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
 * Read persisted composer history, ignoring a missing or corrupt file.
 * @param path - absolute JSON path.
 * @param limit - maximum entries to keep; 0 disables persistence.
 * @returns newest-first prompt list.
 */
export function loadComposerHistory(path: string, limit: number): string[] {
  if (limit <= 0) return []
  try {
    return asEntries(JSON.parse(readFileSync(path, 'utf8'))).slice(0, limit)
  } catch {
    return []
  }
}

/**
 * Replace the persisted composer history.
 * @param path - absolute JSON path.
 * @param entries - newest-first prompt list.
 */
export function saveComposerHistory(path: string, entries: readonly string[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}
