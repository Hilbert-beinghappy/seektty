/** Read a PNG bitmap from the platform clipboard when paste is not a file path. */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

/** PNG signature used to reject empty or non-image clipboard payloads. */
export const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

export interface ClipboardImageSpawnResult {
  readonly status: number | null
  readonly stdout: Buffer
}

export interface ClipboardImageCaptureOptions {
  readonly platform: NodeJS.Platform
  readonly dest: string
  readonly spawn?: (command: string, args: readonly string[]) => ClipboardImageSpawnResult
  readonly writeFile?: (path: string, bytes: Buffer) => void
  readonly readFile?: (path: string) => Buffer
}

interface ImagePasteCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly stdoutToFile: boolean
}

function commandsFor(platform: NodeJS.Platform, dest: string): readonly ImagePasteCommand[] {
  if (platform === 'darwin') {
    return [{ command: 'pngpaste', args: [dest], stdoutToFile: false }]
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

function defaultSpawn(command: string, args: readonly string[]): ClipboardImageSpawnResult {
  const result: SpawnSyncReturns<Buffer> = spawnSync(command, [...args], {
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 2_000,
    windowsHide: true,
  })
  return {
    status: result.status,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
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
 * Capture a PNG from the OS clipboard into `dest` when a platform tool is available.
 * @param options - platform, destination path, and I/O seams.
 * @returns dest when a PNG was written, otherwise undefined.
 */
export function captureClipboardImage(options: ClipboardImageCaptureOptions): string | undefined {
  const spawn = options.spawn ?? defaultSpawn
  const writeFile = options.writeFile ?? ((path, bytes) => { writeFileSync(path, bytes) })
  const readFile = options.readFile ?? (path => readFileSync(path))
  for (const candidate of commandsFor(options.platform, options.dest)) {
    const result = spawn(candidate.command, candidate.args)
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
