/** Recognize pasted image paths and keep absolute Unix paths out of slash commands. */

export const BRACKETED_PASTE = /^\u001B\[200~([\s\S]*)\u001B\[201~$/u
const IMAGE_SUFFIX = /\.(?:gif|jpe?g|png|webp)$/iu

export interface PastedImagePath {
  readonly path: string
  readonly rest: string
  readonly raw: string
}

/**
 * Undo POSIX shell escapes such as `Application\ Support`.
 * Windows drive and UNC paths are left unchanged.
 * @param input - a user-typed or pasted path.
 */
export function unescapePosixPath(input: string): string {
  if (input.startsWith('file:')) return input
  if (input.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(input)) return input
  if (!(
    input.startsWith('/')
    || input.startsWith('~/')
    || input.startsWith('./')
    || input.startsWith('../')
  )) return input
  return input.replace(/\\(.)/gu, '$1')
}

/**
 * Whether the composer line is a `/command`, not a filesystem path.
 * `/Users/me/photo.png` is a path; `/attach` is a command.
 * @param text - current composer line.
 */
export function isSlashCommandLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return false
  const token = trimmed.split(/\s/u, 1)[0] ?? ''
  const name = token.slice(1)
  return name !== '' && !name.includes('/') && !name.includes('\\')
}

function isPathPrefix(candidate: string): boolean {
  return candidate.startsWith('/')
    || candidate.startsWith('./')
    || candidate.startsWith('../')
    || candidate.startsWith('~/')
    || candidate.startsWith('~\\')
    || candidate.startsWith('file:')
    || /^[A-Za-z]:[\\/]/u.test(candidate)
    || candidate.startsWith('\\\\')
}

function peelBracketedPaste(data: string): string {
  const match = BRACKETED_PASTE.exec(data)
  return match === null ? data : (match[1] ?? '')
}

function quotedPrefix(text: string): { path: string; rest: string } | undefined {
  const quote = text[0]
  if (quote !== '"' && quote !== "'") return undefined
  const end = text.indexOf(quote, 1)
  if (end < 2) return undefined
  const path = unescapePosixPath(text.slice(1, end))
  if (!IMAGE_SUFFIX.test(path)) return undefined
  return { path, rest: text.slice(end + 1).trim() }
}

/**
 * Split a leading image path from an optional trailing prompt.
 * @param text - composer text or paste payload without bracketed-paste wrappers.
 */
export function splitLeadingImagePath(text: string): { path: string; rest: string } | undefined {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.includes('\0') || trimmed.includes('\n') || trimmed.includes('\r')) {
    return undefined
  }
  if (isSlashCommandLine(trimmed)) return undefined
  const quoted = quotedPrefix(trimmed)
  if (quoted !== undefined) return quoted
  const match = /^(.*?(?:\.(?:gif|jpe?g|png|webp)))(?:\s+(.*))?$/iu.exec(trimmed)
  if (match === null) return undefined
  const rawPath = match[1] ?? ''
  const rest = (match[2] ?? '').trim()
  const path = unescapePosixPath(rawPath)
  if (!IMAGE_SUFFIX.test(path)) return undefined
  const pathLike = isPathPrefix(rawPath) || isPathPrefix(path)
    || (rest === '' && !/\s/u.test(rawPath))
  if (!pathLike) return undefined
  return { path, rest }
}

/**
 * Read a pasted image path from a bracketed paste or a single raw path chunk.
 * @param data - terminal input, optionally wrapped in bracketed-paste CSI.
 */
export function imagePathFromPasteText(data: string): PastedImagePath | undefined {
  const raw = peelBracketedPaste(data).trim()
  const split = splitLeadingImagePath(raw)
  if (split === undefined) return undefined
  return { path: split.path, rest: split.rest, raw }
}
