/** OSC 52 clipboard writes with optional platform-command fallback. */

import { spawn } from 'node:child_process'
import { ui } from './locale.ts'
import type { TuiClipboardFallback } from '@deepseek-ai/dsh-tui-protocol'

/** OSC 52 payloads larger than this are refused and must use a process fallback or /export. */
export const OSC52_BYTE_LIMIT = 100_000
/** Hung pbcopy/xclip/wl-copy/clip.exe must not pin the TUI input thread. */
export const CLIPBOARD_DEADLINE_MS = 2_000

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
  ) => ClipboardSpawnResult | Promise<ClipboardSpawnResult>
  readonly deadlineMs?: number
  readonly kill?: (command: string) => void
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

function defaultSpawn(
  command: string,
  args: readonly string[],
  input: string,
  deadlineMs: number,
  kill?: (command: string) => void,
): Promise<ClipboardSpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    })
    let settled = false
    const finish = (result: ClipboardSpawnResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      kill?.(command)
      finish({
        status: null,
        error: new Error(`clipboard deadline exceeded after ${String(deadlineMs)}ms`),
      })
    }, deadlineMs)
    child.on('error', (error) => { finish({ status: null, error }) })
    child.on('close', (status) => { finish({ status }) })
    child.stdin?.end(input)
  })
}

async function spawnWithDeadline(
  command: string,
  args: readonly string[],
  input: string,
  options: ClipboardWriteOptions,
): Promise<ClipboardSpawnResult> {
  const deadlineMs = options.deadlineMs ?? CLIPBOARD_DEADLINE_MS
  if (options.spawn === undefined) {
    return defaultSpawn(command, args, input, deadlineMs, options.kill)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(options.spawn(command, args, input)),
      new Promise<ClipboardSpawnResult>((resolve) => {
        timer = setTimeout(() => {
          options.kill?.(command)
          resolve({
            status: null,
            error: new Error(`clipboard deadline exceeded after ${String(deadlineMs)}ms`),
          })
        }, deadlineMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
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
export async function writeClipboard(text: string, options: ClipboardWriteOptions): Promise<ClipboardMethod> {
  const bytes = Buffer.byteLength(text, 'utf8')
  const osc52Ok = bytes <= OSC52_BYTE_LIMIT
  if (osc52Ok) options.writeOsc52(osc52Sequence(text))
  if (options.fallback === 'osc52' || options.fallback === 'off') {
    if (!osc52Ok) {
      throw new Error(ui(
        `回复超过终端剪贴板 ${String(OSC52_BYTE_LIMIT)} 字节安全上限；请使用 /export`,
        `The response exceeds the ${String(OSC52_BYTE_LIMIT)}-byte terminal clipboard limit; use /export instead`,
      ))
    }
    return 'osc52'
  }
  if (osc52Ok && options.fallback === 'auto') {
    // Still try a process fallback so tmux clients that swallow OSC 52 get a copy.
  }
  for (const candidate of FALLBACKS[options.platform] ?? []) {
    const result = await spawnWithDeadline(candidate.command, candidate.args, text, options)
    if (result.error === undefined && result.status === 0) {
      return osc52Ok ? 'osc52' : candidate.method
    }
  }
  if (osc52Ok) return 'osc52'
  throw new Error(ui(
    `无法写入系统剪贴板；请使用 /export。OSC 52 上限为 ${String(OSC52_BYTE_LIMIT)} 字节`,
    `Could not write the system clipboard; use /export. The OSC 52 limit is ${String(OSC52_BYTE_LIMIT)} bytes`,
  ))
}
