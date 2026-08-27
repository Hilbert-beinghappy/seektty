/** OSC 52 clipboard writes with optional platform-command fallback. */

import { spawn } from 'node:child_process'
import { ui } from './locale.ts'
import { escapeTerminalText } from './theme.ts'
import type { TuiClipboardFallback } from '@deepseek-ai/dsh-tui-protocol'

/** OSC 52 payloads larger than this are refused and must use a process fallback or /export. */
export const OSC52_BYTE_LIMIT = 100_000
/** Hung platform clipboard helpers must not pin the TUI input thread. */
export const CLIPBOARD_DEADLINE_MS = 2_000
/** Clipboard reads are bounded before decoding so a platform helper cannot exhaust memory. */
export const CLIPBOARD_READ_BYTE_LIMIT = 1_000_000

export type ClipboardMethod = 'osc52' | 'powershell' | 'pbcopy' | 'wl-copy' | 'xclip'

export interface ClipboardWriteResult {
  readonly finalMethod: ClipboardMethod
  readonly succeeded: readonly ClipboardMethod[]
}

export interface ClipboardSpawnResult {
  readonly status: number | null
  readonly error?: Error
}

export interface ClipboardReadSpawnResult extends ClipboardSpawnResult {
  readonly stdout?: string | Buffer
}

export interface ClipboardReadOptions {
  readonly platform: NodeJS.Platform
  readonly spawn?: (
    command: string,
    args: readonly string[],
  ) => ClipboardReadSpawnResult | Promise<ClipboardReadSpawnResult>
  readonly deadlineMs?: number
  readonly maxBytes?: number
  readonly kill?: (command: string) => void
}

export interface ClipboardWriteOptions {
  readonly fallback: TuiClipboardFallback
  readonly platform: NodeJS.Platform
  readonly writeOsc52: (sequence: string) => void
  readonly spawn?: (
    command: string,
    args: readonly string[],
    input: Buffer,
    env: Readonly<Record<string, string | undefined>> | undefined,
  ) => ClipboardSpawnResult | Promise<ClipboardSpawnResult>
  readonly deadlineMs?: number
  readonly kill?: (command: string) => void
}

interface ClipboardWriterSpec {
  readonly method: Exclude<ClipboardMethod, 'osc52'>
  readonly command: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string | undefined>>
}

const POWERSHELL_WRITE_SCRIPT = [
  '$utf8=[Text.UTF8Encoding]::new($false,$true);',
  '$reader=[IO.StreamReader]::new([Console]::OpenStandardInput(),$utf8,$false);',
  'try { $text=$reader.ReadToEnd(); Set-Clipboard -Value $text } finally { $reader.Dispose() }',
].join('')

const POWERSHELL_WRITER: ClipboardWriterSpec = {
  method: 'powershell',
  command: 'powershell.exe',
  args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_WRITE_SCRIPT],
}

const FALLBACKS: Partial<Record<NodeJS.Platform, readonly ClipboardWriterSpec[]>> = {
  darwin: [{
    method: 'pbcopy',
    command: 'pbcopy',
    args: [],
    env: { LC_ALL: undefined, LANG: 'en_US.UTF-8', LC_CTYPE: 'UTF-8' },
  }],
  linux: [
    { method: 'wl-copy', command: 'wl-copy', args: ['--type', 'text/plain;charset=utf-8'] },
    {
      method: 'xclip',
      command: 'xclip',
      args: ['-selection', 'clipboard', '-target', 'UTF8_STRING'],
    },
  ],
  win32: [POWERSHELL_WRITER],
  cygwin: [POWERSHELL_WRITER],
}

const READERS: Partial<Record<NodeJS.Platform, readonly { readonly command: string; readonly args: readonly string[] }[]>> = {
  darwin: [{ command: 'pbpaste', args: [] }],
  linux: [
    { command: 'wl-paste', args: ['--no-newline'] },
    { command: 'xclip', args: ['-selection', 'clipboard', '-o'] },
  ],
  win32: [{
    command: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::Out.Write((Get-Clipboard -Raw))',
    ],
  }],
  cygwin: [{
    command: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::Out.Write((Get-Clipboard -Raw))',
    ],
  }],
}

export function canReadClipboardText(platform: NodeJS.Platform): boolean {
  return (READERS[platform]?.length ?? 0) > 0
}

function defaultSpawn(
  writer: ClipboardWriterSpec,
  input: Buffer,
  deadlineMs: number,
  kill?: (command: string) => void,
): Promise<ClipboardSpawnResult> {
  return new Promise((resolve) => {
    const envOverrides = writer.env
    const childEnv = envOverrides === undefined ? undefined : { ...process.env }
    if (envOverrides !== undefined && childEnv !== undefined) {
      for (const [name, value] of Object.entries(envOverrides)) {
        if (value === undefined) delete childEnv[name]
        else childEnv[name] = value
      }
    }
    const child = spawn(writer.command, [...writer.args], {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
      ...(childEnv === undefined ? {} : { env: childEnv }),
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
      kill?.(writer.command)
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
  writer: ClipboardWriterSpec,
  input: Buffer,
  options: ClipboardWriteOptions,
): Promise<ClipboardSpawnResult> {
  const deadlineMs = options.deadlineMs ?? CLIPBOARD_DEADLINE_MS
  if (options.spawn === undefined) {
    return defaultSpawn(writer, input, deadlineMs, options.kill)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(options.spawn(writer.command, writer.args, input, writer.env)),
      new Promise<ClipboardSpawnResult>((resolve) => {
        timer = setTimeout(() => {
          options.kill?.(writer.command)
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

function defaultReadSpawn(
  command: string,
  args: readonly string[],
  deadlineMs: number,
  maxBytes: number,
  kill?: (command: string) => void,
): Promise<ClipboardReadSpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    const finish = (result: ClipboardReadSpawnResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      kill?.(command)
      finish({ status: null, error: new Error('clipboard read deadline exceeded') })
    }, deadlineMs)
    child.on('error', error => { finish({ status: null, error }) })
    child.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return
      bytes += chunk.byteLength
      if (bytes > maxBytes) {
        child.kill()
        kill?.(command)
        finish({ status: null, error: new Error('clipboard read exceeds byte limit') })
        return
      }
      chunks.push(chunk)
    })
    child.on('close', status => {
      finish({ status, stdout: Buffer.concat(chunks, bytes) })
    })
  })
}

async function readWithDeadline(
  command: string,
  args: readonly string[],
  options: ClipboardReadOptions,
): Promise<ClipboardReadSpawnResult> {
  const deadlineMs = options.deadlineMs ?? CLIPBOARD_DEADLINE_MS
  const maxBytes = options.maxBytes ?? CLIPBOARD_READ_BYTE_LIMIT
  if (options.spawn === undefined) {
    return defaultReadSpawn(command, args, deadlineMs, maxBytes, options.kill)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(options.spawn(command, args)),
      new Promise<ClipboardReadSpawnResult>((resolve) => {
        timer = setTimeout(() => {
          options.kill?.(command)
          resolve({ status: null, error: new Error('clipboard read deadline exceeded') })
        }, deadlineMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function safeClipboardText(stdout: string | Buffer, maxBytes: number): string {
  const bytes = Buffer.isBuffer(stdout) ? stdout.byteLength : Buffer.byteLength(stdout, 'utf8')
  if (bytes > maxBytes) throw new Error(ui('剪贴板文本超过安全上限', 'Clipboard text exceeds the safety limit'))
  const decoded = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : stdout
  if (/\u0000|\u001B|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(decoded)) {
    throw new Error(ui('剪贴板包含不安全的终端控制字符', 'Clipboard contains unsafe terminal control characters'))
  }
  return escapeTerminalText(decoded.replace(/\r\n?/gu, '\n'))
}

/** Read plain text through fixed platform commands. Clipboard bytes are never evaluated or logged. */
export async function readClipboardText(options: ClipboardReadOptions): Promise<string> {
  const candidates = READERS[options.platform] ?? []
  const maxBytes = options.maxBytes ?? CLIPBOARD_READ_BYTE_LIMIT
  for (const candidate of candidates) {
    const result = await readWithDeadline(candidate.command, candidate.args, options)
    if (result.error !== undefined || result.status !== 0 || result.stdout === undefined) continue
    return safeClipboardText(result.stdout, maxBytes)
  }
  throw new Error(ui(
    '此环境没有可用的安全剪贴板文本读取器',
    'No safe clipboard text reader is available in this environment',
  ))
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
 * @returns every successful writer and the one that supplied the final clipboard value.
 */
export async function writeClipboard(text: string, options: ClipboardWriteOptions): Promise<ClipboardWriteResult> {
  const bytes = Buffer.byteLength(text, 'utf8')
  const input = Buffer.from(text, 'utf8')
  const osc52Ok = bytes <= OSC52_BYTE_LIMIT
  const succeeded: ClipboardMethod[] = []
  if (osc52Ok) {
    options.writeOsc52(osc52Sequence(text))
    succeeded.push('osc52')
  }
  if (options.fallback === 'osc52' || options.fallback === 'off') {
    if (!osc52Ok) {
      throw new Error(ui(
        `回复超过终端剪贴板 ${String(OSC52_BYTE_LIMIT)} 字节安全上限；请使用 /export`,
        `The response exceeds the ${String(OSC52_BYTE_LIMIT)}-byte terminal clipboard limit; use /export instead`,
      ))
    }
    return { finalMethod: 'osc52', succeeded }
  }
  if (osc52Ok && options.fallback === 'auto') {
    // Still try a process fallback so tmux clients that swallow OSC 52 get a copy.
  }
  for (const candidate of FALLBACKS[options.platform] ?? []) {
    const result = await spawnWithDeadline(candidate, input, options)
    if (result.error === undefined && result.status === 0) {
      succeeded.push(candidate.method)
      return { finalMethod: candidate.method, succeeded }
    }
  }
  if (osc52Ok) return { finalMethod: 'osc52', succeeded }
  throw new Error(ui(
    `无法写入系统剪贴板；请使用 /export。OSC 52 上限为 ${String(OSC52_BYTE_LIMIT)} 字节`,
    `Could not write the system clipboard; use /export. The OSC 52 limit is ${String(OSC52_BYTE_LIMIT)} bytes`,
  ))
}
