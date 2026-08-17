/** OSC 52 clipboard writes with optional platform-command fallback. */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import type { TuiClipboardFallback } from '@deepseek-ai/dsh-tui-protocol'

/** OSC 52 payloads larger than this are refused and must use a process fallback or /export. */
export const OSC52_BYTE_LIMIT = 100_000

export type ClipboardMethod = 'osc52' | 'pbcopy' | 'wl-copy' | 'xclip' | 'clip.exe'

export interface ClipboardSpawnResult {
  readonly status: number | null
  readonly error?: Error
}

export interface ClipboardWriteOptions {
  readonly fallback: TuiClipboardFallback
  readonly platform: NodeJS.Platform
  readonly writeOsc52: (sequence: string) => void
  readonly spawn?: (
    command: string,
    args: readonly string[],
    input: string,
  ) => ClipboardSpawnResult
}

const FALLBACKS: Readonly<Record<NodeJS.Platform, readonly { readonly method: ClipboardMethod; readonly command: string; readonly args: readonly string[] }[]>> = {
  darwin: [{ method: 'pbcopy', command: 'pbcopy', args: [] }],
  linux: [
    { method: 'wl-copy', command: 'wl-copy', args: [] },
    { method: 'xclip', command: 'xclip', args: ['-selection', 'clipboard'] },
  ],
  win32: [{ method: 'clip.exe', command: 'clip.exe', args: [] }],
  aix: [],
  android: [],
  freebsd: [],
  haiku: [],
  openbsd: [],
  sunos: [],
  cygwin: [{ method: 'clip.exe', command: 'clip.exe', args: [] }],
  netbsd: [],
}

function defaultSpawn(command: string, args: readonly string[], input: string): ClipboardSpawnResult {
  const result: SpawnSyncReturns<string> = spawnSync(command, [...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  })
  return {
    status: result.status,
    ...(result.error === undefined ? {} : { error: result.error }),
  }
}

/**
 * Encode one OSC 52 clipboard assignment.
 * @param text - UTF-8 text to place on the clipboard.
 * @returns the complete OSC 52 sequence.
 */
export function osc52Sequence(text: string): string {
  return `\u001B]52;c;${Buffer.from(text, 'utf8').toString('base64')}\u0007`
}

/**
 * Write text to the terminal clipboard, then to a platform clipboard tool when allowed.
 * @param text - UTF-8 text to copy.
 * @param options - fallback policy and I/O seams.
 * @returns which writer succeeded.
 */
export function writeClipboard(text: string, options: ClipboardWriteOptions): ClipboardMethod {
  const bytes = Buffer.byteLength(text, 'utf8')
  const osc52Ok = bytes <= OSC52_BYTE_LIMIT
  if (osc52Ok) options.writeOsc52(osc52Sequence(text))
  if (options.fallback === 'osc52' || options.fallback === 'off') {
    if (!osc52Ok) {
      throw new Error(`回复超过终端剪贴板 ${String(OSC52_BYTE_LIMIT)} 字节安全上限；请使用 /export`)
    }
    return 'osc52'
  }
  if (osc52Ok && options.fallback === 'auto') {
    // Still try a process fallback so tmux clients that swallow OSC 52 get a copy.
  }
  const spawn = options.spawn ?? defaultSpawn
  for (const candidate of FALLBACKS[options.platform] ?? []) {
    const result = spawn(candidate.command, candidate.args, text)
    if (result.error === undefined && result.status === 0) {
      return osc52Ok ? 'osc52' : candidate.method
    }
  }
  if (osc52Ok) return 'osc52'
  throw new Error(`无法写入系统剪贴板；请使用 /export。OSC 52 上限为 ${String(OSC52_BYTE_LIMIT)} 字节`)
}
