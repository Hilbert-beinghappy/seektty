/** Single-use restart tickets so the outer `deepseek` launcher respawns dsh. */

import { lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Exit status that tells the product launcher to spawn dsh again. */
export const LAUNCHER_RESTART_EXIT_CODE = 75
const PREFIX = 'deepseek-restart-'

/** Profile and arguments for the next dsh process owned by the launcher. */
export interface LauncherRestartRequest {
  readonly profile: string
  readonly args: readonly string[]
  readonly handoffPath?: string
}

interface LauncherRestartEnvelope {
  readonly version: 1
  readonly profile: string
  readonly args: readonly string[]
  readonly handoffPath?: string
}

export function launcherRestartPath(launcherPid: number): string {
  return join(tmpdir(), `${PREFIX}${launcherPid}.json`)
}

function allowedPath(path: string): boolean {
  const absolute = resolve(path)
  return dirname(absolute) === resolve(tmpdir()) && basename(absolute).startsWith(PREFIX)
}

/**
 * Record the next dsh invocation for the waiting `deepseek` parent.
 * @param launcherPid - parent pid of this dsh process (`process.ppid`).
 * @param request - Profile, forwarded args, and optional handoff path.
 * @returns absolute ticket path.
 */
export function writeLauncherRestart(launcherPid: number, request: LauncherRestartRequest): string {
  if (!Number.isInteger(launcherPid) || launcherPid <= 0) throw new Error('launcher restart pid is invalid')
  if (request.profile.trim() === '') throw new Error('launcher restart Profile cannot be blank')
  const body = JSON.stringify({
    version: 1,
    profile: request.profile,
    args: [...request.args],
    ...(request.handoffPath === undefined ? {} : { handoffPath: request.handoffPath }),
  } satisfies LauncherRestartEnvelope)
  const path = launcherRestartPath(launcherPid)
  try { unlinkSync(path) } catch { /* replace a stale ticket from a previous interrupted restart */ }
  writeFileSync(path, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  return path
}

/**
 * Consume and delete this launcher process's restart ticket.
 * @param launcherPid - pid of the waiting `deepseek` process.
 * @returns the next invocation, or undefined when dsh did not request a restart.
 */
export function consumeLauncherRestart(launcherPid: number): LauncherRestartRequest | undefined {
  const path = launcherRestartPath(launcherPid)
  if (!allowedPath(path)) throw new Error('launcher restart path is outside the temp boundary')
  try {
    const stat = lstatSync(path)
    if (!stat.isFile()) throw new Error('launcher restart path is not a regular file')
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('launcher restart file permissions are not owner-only')
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LauncherRestartEnvelope> | null
    if (parsed === null || parsed.version !== 1 || typeof parsed.profile !== 'string' || parsed.profile.trim() === ''
      || !Array.isArray(parsed.args) || !parsed.args.every(argument => typeof argument === 'string')) {
      throw new Error('launcher restart ticket is invalid')
    }
    if (parsed.handoffPath !== undefined && typeof parsed.handoffPath !== 'string') {
      throw new Error('launcher restart handoff path is invalid')
    }
    return {
      profile: parsed.profile,
      args: parsed.args,
      ...(parsed.handoffPath === undefined ? {} : { handoffPath: parsed.handoffPath }),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  } finally {
    try { unlinkSync(path) } catch { /* single-use cleanup is best effort after a read failure */ }
  }
}
