/** Bounded, single-use launcher handoff files for controlled process restart. */

import { randomUUID } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Inherited environment key carrying one single-use handoff path. */
export const APP_HANDOFF_ENV = 'DSH_APP_HANDOFF_FILE'
/** Maximum serialized handoff bytes; payloads carry references, never file bytes. */
export const APP_HANDOFF_MAX_BYTES = 256 * 1024
/** Filename prefix for launcher-owned handoff files in the process temp directory. */
export const APP_HANDOFF_PREFIX = 'deepseek-handoff-'

/** Replaceable process seams used by handoff tests. */
export const internals: {
  tmpdir(): string
  now(): number
  staleMs: number
} = {
  tmpdir,
  now: Date.now,
  staleMs: 24 * 60 * 60 * 1_000,
}

export type ConsumeAppHandoffResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'payload'; readonly payload: unknown }
  | { readonly kind: 'degraded'; readonly reason: string }

interface AppHandoffEnvelope {
  readonly version: 1
  readonly channel: string
  readonly payload: unknown
}

function canonical(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function allowedPath(path: string): boolean {
  const absolute = canonical(path)
  return dirname(absolute) === canonical(internals.tmpdir())
    && basename(absolute).startsWith(APP_HANDOFF_PREFIX)
}

function degrade(reason: string): ConsumeAppHandoffResult {
  return { kind: 'degraded', reason }
}

/**
 * Remove leftover prefix files older than the stale window.
 * Called on write and consume so a child crash does not fill tmpdir.
 */
export function sweepStaleAppHandoffs(): void {
  const directory = internals.tmpdir()
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return
  }
  const cutoff = internals.now() - internals.staleMs
  for (const name of names) {
    if (!name.startsWith(APP_HANDOFF_PREFIX)) continue
    const path = join(directory, name)
    if (!allowedPath(path)) continue
    try {
      const stat = lstatSync(path)
      if (!stat.isFile() || stat.mtimeMs > cutoff) continue
      unlinkSync(path)
    } catch { /* best-effort tmpdir hygiene */ }
  }
}

/**
 * Persist one opaque app payload for a child process. The file is exclusive,
 * owner-only where the platform exposes POSIX modes, and never logged.
 * @param channel - app protocol identifier.
 * @param payload - JSON-compatible references and draft metadata.
 * @returns absolute handoff path for {@link APP_HANDOFF_ENV}.
 */
/**
 * Build a child process env that never inherits a stale handoff ticket.
 * Only a path from a successful {@link writeAppHandoff} is published.
 * @param parentEnv - current process environment.
 * @param handoffPath - newly written ticket, when restart carries a payload.
 */
export function restartChildEnv(
  parentEnv: NodeJS.Dict<string | undefined>,
  handoffPath?: string,
): NodeJS.ProcessEnv {
  const env = { ...parentEnv }
  delete env[APP_HANDOFF_ENV]
  if (handoffPath !== undefined) env[APP_HANDOFF_ENV] = handoffPath
  return env
}

export function writeAppHandoff(channel: string, payload: unknown): string {
  if (channel.trim() === '') throw new Error('app handoff channel cannot be blank')
  sweepStaleAppHandoffs()
  const body = JSON.stringify({ version: 1, channel, payload } satisfies AppHandoffEnvelope)
  if (Buffer.byteLength(body) > APP_HANDOFF_MAX_BYTES) throw new Error('app handoff payload exceeds size limit')
  const path = join(internals.tmpdir(), `${APP_HANDOFF_PREFIX}${randomUUID()}.json`)
  writeFileSync(path, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  return path
}

/**
 * Consume and delete this process's handoff when its channel matches.
 * Invalid paths, permissions, envelopes, or channels degrade instead of aborting boot.
 * @param channel - expected app protocol identifier.
 * @param env - process environment carrying {@link APP_HANDOFF_ENV}.
 */
export function consumeAppHandoff(
  channel: string,
  env: NodeJS.Dict<string | undefined> = process.env,
): ConsumeAppHandoffResult {
  sweepStaleAppHandoffs()
  const path = env[APP_HANDOFF_ENV]
  delete env[APP_HANDOFF_ENV]
  if (path === undefined) return { kind: 'missing' }
  if (!allowedPath(path)) return degrade('app handoff path is outside the launcher temp boundary')
  try {
    const stat = lstatSync(path)
    if (!stat.isFile()) return degrade('app handoff path is not a regular file')
    if (stat.size > APP_HANDOFF_MAX_BYTES) return degrade('app handoff file exceeds size limit')
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      return degrade('app handoff file permissions are not owner-only')
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppHandoffEnvelope> | null
    if (parsed === null || parsed.version !== 1 || parsed.channel !== channel || !('payload' in parsed)) {
      return degrade(`app handoff does not match channel ${JSON.stringify(channel)}`)
    }
    return { kind: 'payload', payload: parsed.payload }
  } catch (error) {
    return degrade(error instanceof Error ? error.message : String(error))
  } finally {
    try { unlinkSync(path) } catch { /* single-use cleanup is best effort after a read failure */ }
  }
}
