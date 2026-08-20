/** Read a PNG bitmap from the platform clipboard when paste is not a file path. */

import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** PNG signature used to reject empty or non-image clipboard payloads. */
export const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
/** Hung pngpaste/wl-paste/xclip must not pin the TUI input thread. */
export const CLIPBOARD_IMAGE_DEADLINE_MS = 2_000

export interface ClipboardImageSpawnResult {
  readonly status: number | null
  readonly stdout: Buffer
}

export interface ClipboardImageCaptureOptions {
  readonly platform: NodeJS.Platform
  readonly dest: string
  readonly spawn?: (command: string, args: readonly string[]) => ClipboardImageSpawnResult | Promise<ClipboardImageSpawnResult>
  readonly writeFile?: (path: string, bytes: Buffer) => void
  readonly readFile?: (path: string) => Buffer
  readonly deadlineMs?: number
}

export interface ClipboardImageWorkspaceOptions {
  readonly tmpdir?: string
  readonly mkdir?: (path: string, mode: number) => void
  readonly destName?: string
}

export interface ClipboardImageWorkspace {
  readonly dir: string
  readonly dest: string
}

export interface ClipboardImageCleanupOptions {
  readonly readFile?: (path: string) => Buffer
  readonly chmod?: (path: string, mode: number) => void
  readonly unlink?: (path: string) => void
  readonly rmdir?: (path: string) => void
}

interface ImagePasteCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly stdoutToFile: boolean
}

function appleScriptWriteClipboardPng(dest: string): ImagePasteCommand {
  const escaped = dest.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return {
    command: 'osascript',
    args: [
      '-e', 'try',
      '-e', 'set pngData to (the clipboard as «class PNGf»)',
      '-e', 'on error',
      '-e', 'error number 1',
      '-e', 'end try',
      '-e', `set outFile to POSIX file "${escaped}"`,
      '-e', 'set fh to open for access outFile with write permission',
      '-e', 'try',
      '-e', 'set eof of fh to 0',
      '-e', 'write pngData to fh',
      '-e', 'end try',
      '-e', 'close access fh',
    ],
    stdoutToFile: false,
  }
}

function commandsFor(platform: NodeJS.Platform, dest: string): readonly ImagePasteCommand[] {
  if (platform === 'darwin') {
    return [
      { command: 'pngpaste', args: [dest], stdoutToFile: false },
      appleScriptWriteClipboardPng(dest),
    ]
  }
  if (platform === 'linux') {
    return [
      { command: 'wl-paste', args: ['--type', 'image/png'], stdoutToFile: true },
      { command: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png', '-o'], stdoutToFile: true },
    ]
  }
  if (platform === 'win32' || platform === 'cygwin') {
    return [{
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img -eq $null) { exit 1 }; $img.Save('${dest.replaceAll("'", "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      ],
      stdoutToFile: false,
    }]
  }
  return []
}

function defaultSpawn(
  command: string,
  args: readonly string[],
  deadlineMs: number,
): Promise<ClipboardImageSpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    const chunks: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    let settled = false
    const finish = (result: ClipboardImageSpawnResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ status: null, stdout: Buffer.alloc(0) })
    }, deadlineMs)
    child.on('error', () => { finish({ status: null, stdout: Buffer.alloc(0) }) })
    child.on('close', (status) => {
      finish({ status, stdout: Buffer.concat(chunks) })
    })
  })
}

async function spawnWithDeadline(
  command: string,
  args: readonly string[],
  options: ClipboardImageCaptureOptions,
): Promise<ClipboardImageSpawnResult> {
  const deadlineMs = options.deadlineMs ?? CLIPBOARD_IMAGE_DEADLINE_MS
  if (options.spawn === undefined) return defaultSpawn(command, args, deadlineMs)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(options.spawn(command, args)),
      new Promise<ClipboardImageSpawnResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({ status: null, stdout: Buffer.alloc(0) })
        }, deadlineMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Whether a buffer starts with a PNG signature.
 * @param bytes - candidate clipboard payload.
 */
export function isPng(bytes: Buffer): boolean {
  return bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
}

/**
 * Create a 0700 owner-only directory for one clipboard PNG.
 * @param options - temp root and mkdir seams.
 */
export function createClipboardImageWorkspace(
  options: ClipboardImageWorkspaceOptions = {},
): ClipboardImageWorkspace {
  const root = options.tmpdir ?? tmpdir()
  const dir = join(root, `seektty-paste-${randomUUID()}`)
  const mkdir = options.mkdir ?? ((path, mode) => { mkdirSync(path, { mode }) })
  mkdir(dir, 0o700)
  return { dir, dest: join(dir, options.destName ?? 'clipboard.png') }
}

/**
 * Read a captured PNG, lock it to 0600, then delete the private workspace.
 * @param workspace - dest created by {@link createClipboardImageWorkspace}.
 * @param options - I/O seams.
 */
export function readCapturedClipboardImage(
  workspace: ClipboardImageWorkspace,
  options: ClipboardImageCleanupOptions = {},
): Buffer {
  const readFile = options.readFile ?? (path => readFileSync(path))
  const chmod = options.chmod ?? ((path, mode) => { chmodSync(path, mode) })
  const unlink = options.unlink ?? ((path) => { unlinkSync(path) })
  const rmdir = options.rmdir ?? ((path) => { rmdirSync(path) })
  try {
    chmod(workspace.dest, 0o600)
    return readFile(workspace.dest)
  } finally {
    cleanupClipboardImageWorkspace(workspace, { unlink, rmdir })
  }
}

/**
 * Remove the private clipboard PNG and its 0700 directory.
 * @param workspace - dest created by {@link createClipboardImageWorkspace}.
 * @param options - unlink/rmdir seams.
 */
export function cleanupClipboardImageWorkspace(
  workspace: ClipboardImageWorkspace,
  options: Pick<ClipboardImageCleanupOptions, 'unlink' | 'rmdir'> = {},
): void {
  const unlink = options.unlink ?? ((path) => { unlinkSync(path) })
  const rmdir = options.rmdir ?? ((path) => { rmdirSync(path) })
  try { unlink(workspace.dest) } catch { /* dest may never have been written */ }
  try { rmdir(workspace.dir) } catch { /* best-effort private dir cleanup */ }
}

/**
 * Capture a PNG from the OS clipboard into `dest` when a platform tool is available.
 * @param options - platform, destination path, and I/O seams.
 * @returns dest when a PNG was written, otherwise undefined.
 */
export async function captureClipboardImage(options: ClipboardImageCaptureOptions): Promise<string | undefined> {
  const writeFile = options.writeFile ?? ((path, bytes) => { writeFileSync(path, bytes, { mode: 0o600 }) })
  const readFile = options.readFile ?? (path => readFileSync(path))
  for (const candidate of commandsFor(options.platform, options.dest)) {
    const result = await spawnWithDeadline(candidate.command, candidate.args, options)
    if (result.status !== 0) continue
    if (candidate.stdoutToFile) {
      if (!isPng(result.stdout)) continue
      writeFile(options.dest, result.stdout)
      return options.dest
    }
    try {
      if (isPng(readFile(options.dest))) return options.dest
    } catch {
      continue
    }
  }
  return undefined
}
