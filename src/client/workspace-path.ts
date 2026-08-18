/** Resolve user-typed paths against the current Harness workspace. */

import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function stripQuotes(input: string): string {
  if ((input.startsWith('"') && input.endsWith('"'))
    || (input.startsWith("'") && input.endsWith("'"))) {
    return input.slice(1, -1)
  }
  return input
}

/**
 * Expand `~` and supported `file:` URLs, then resolve relative paths
 * against the Harness workspace instead of the process cwd.
 * @param rawPath - user-typed path, quoted path, home path, or file URL.
 * @param workspacePath - current Session workspace root.
 */
export function resolveHarnessUserPath(rawPath: string, workspacePath: string): string {
  const input = stripQuotes(rawPath.trim())
  if (input.startsWith('file:')) return fileURLToPath(input)
  if (input === '~') return homedir()
  if (/^~[/\\]/u.test(input)) return resolve(homedir(), input.slice(2))
  return resolve(workspacePath, input)
}
