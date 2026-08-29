/** Safe, bounded adapter around an optional system Fastfetch executable. */

import { randomUUID } from 'node:crypto'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import crossSpawn from 'cross-spawn'
import type {
  TuiSafeFastfetchModule,
  TuiWelcomeFastfetchRequest,
  TuiWelcomeFastfetchResult,
  TuiWelcomeFastfetchRow,
} from '@deepseek-ai/dsh-tui-protocol'

const DEFAULT_TIMEOUT_MS = 2_000
const DEFAULT_OUTPUT_LIMIT = 256 * 1_024

export interface FastfetchRunOptions {
  readonly command?: string
  readonly prefixArgs?: readonly string[]
  readonly timeoutMs?: number
  readonly outputLimit?: number
  readonly spawn?: (
    command: string,
    args: readonly string[],
  ) => ChildProcessWithoutNullStreams
}

function withoutTerminalControls(value: string): string {
  return value
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/gu, '')
    .replace(/\x1B[P^_X][\s\S]*?\x1B\\/gu, '')
    .replace(/\x1B\[[0-?]*[ -\/]*[@-~]/gu, '')
    .replace(/\x1B[@-_]/gu, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, '')
    .replace(/\t/gu, '  ')
}

function oneLine(value: string, maximum = 512): string {
  return withoutTerminalControls(value).replace(/[\r\n]+/gu, ' ').trim().slice(0, maximum)
}

export function fastfetchArguments(
  request: TuiWelcomeFastfetchRequest,
  separator: string,
): readonly string[] {
  const config = request.source === 'safe'
    ? ['--config', 'none']
    : request.configPath.trim() === ''
      ? []
      : ['--config', request.configPath]
  const structure = request.source === 'safe'
    ? ['--structure', request.modules.join(':')]
    : []
  return [
    ...config,
    '--logo', 'none',
    '--pipe', 'true',
    '--separator', separator,
    ...structure,
  ]
}

export function parseFastfetchOutput(stdout: string, separator: string): readonly TuiWelcomeFastfetchRow[] {
  const rows: TuiWelcomeFastfetchRow[] = []
  for (const rawLine of stdout.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = withoutTerminalControls(rawLine).trimEnd()
    if (line.trim() === '') continue
    const split = line.indexOf(separator)
    if (split === -1) {
      rows.push({ kind: 'text', text: line.slice(0, 512) })
      continue
    }
    const label = line.slice(0, split).trim().slice(0, 512)
    const value = line.slice(split + separator.length).trim().slice(0, 512)
    if (label === '' && value === '') continue
    if (/^(?:error|failed|not supported)(?::|$)/iu.test(value)) continue
    rows.push({ kind: 'field', label, value })
  }
  return rows.slice(0, 128)
}

function defaultSpawn(command: string, args: readonly string[]): ChildProcessWithoutNullStreams {
  return crossSpawn(command, [...args], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams
}

/**
 * Run Fastfetch without a shell and return only sanitized semantic rows.
 * User-config mode is deliberately an opt-in trust boundary because Fastfetch
 * configurations may contain their own command modules.
 */
export function collectFastfetch(
  request: TuiWelcomeFastfetchRequest,
  signal?: AbortSignal,
  options: FastfetchRunOptions = {},
): Promise<TuiWelcomeFastfetchResult> {
  if (signal?.aborted === true) return Promise.resolve({ status: 'cancelled', rows: [] })
  const separator = `__SEEKTTY_${randomUUID()}__`
  const args = [...(options.prefixArgs ?? []), ...fastfetchArguments(request, separator)]
  const spawn = options.spawn ?? defaultSpawn
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT

  return new Promise(resolve => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(options.command ?? 'fastfetch', args)
    } catch (error) {
      resolve({ status: 'unavailable', rows: [], diagnostic: oneLine(String(error)) })
      return
    }
    let settled = false
    let stdout = ''
    let stderr = ''
    let overflow = false
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8')
      if (Buffer.byteLength(next, 'utf8') <= outputLimit) return next
      overflow = true
      return next.slice(0, outputLimit)
    }
    const finish = (result: TuiWelcomeFastfetchResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const stop = (): void => {
      if (!child.killed) child.kill()
    }
    const onAbort = (): void => {
      stop()
      finish({ status: 'cancelled', rows: [] })
    }
    const timer = setTimeout(() => {
      stop()
      finish({ status: 'timeout', rows: [], diagnostic: 'Fastfetch timed out after 2000 ms' })
    }, timeoutMs)
    timer.unref?.()
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk)
      if (overflow) stop()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk)
      if (overflow) stop()
    })
    child.once('error', error => {
      const code = (error as NodeJS.ErrnoException).code
      finish({
        status: code === 'ENOENT' ? 'unavailable' : 'error',
        rows: [],
        diagnostic: oneLine(error.message),
      })
    })
    child.once('close', code => {
      if (overflow) {
        finish({ status: 'error', rows: [], diagnostic: 'Fastfetch output exceeded 256 KiB' })
        return
      }
      const rows = parseFastfetchOutput(stdout, separator)
      if (code === 0) {
        finish({ status: 'ok', rows })
        return
      }
      finish({
        status: 'error',
        rows: [],
        diagnostic: oneLine(stderr === '' ? `Fastfetch exited with code ${String(code)}` : stderr),
      })
    })
  })
}
