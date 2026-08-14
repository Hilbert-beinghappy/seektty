/** Bounded, single-use launcher handoff files for controlled process restart. */

import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Inherited environment key carrying one single-use handoff path. */
export const APP_HANDOFF_ENV = 'DSH_APP_HANDOFF_FILE'
/** Maximum serialized handoff bytes; payloads carry references, never file bytes. */
export const APP_HANDOFF_MAX_BYTES = 256 * 1024
const PREFIX = 'deepseek-handoff-'

interface AppHandoffEnvelope {
  readonly version: 1
  readonly channel: string
  readonly payload: unknown
}

function allowedPath(path: string): boolean {
  const absolute = resolve(path)
  return dirname(absolute) === resolve(tmpdir()) && basename(absolute).startsWith(PREFIX)
}

/**
 * Persist one opaque app payload for a child process. The file is exclusive,
 * owner-only where the platform exposes POSIX modes, and never logged.
 * @param channel - app protocol identifier.
 * @param payload - JSON-compatible references and draft metadata.
 * @returns absolute handoff path for {@link APP_HANDOFF_ENV}.
 */
export function writeAppHandoff(channel: string, payload: unknown): string {
  if (channel.trim() === '') throw new Error('app handoff channel cannot be blank')
  const body = JSON.stringify({ version: 1, channel, payload } satisfies AppHandoffEnvelope)
  if (Buffer.byteLength(body) > APP_HANDOFF_MAX_BYTES) throw new Error('app handoff payload exceeds size limit')
  const path = join(tmpdir(), `${PREFIX}${randomUUID()}.json`)
  writeFileSync(path, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  return path
}

/**
 * Consume and delete this process's handoff when its channel matches.
 * Invalid paths, permissions, envelopes, or channels fail loud after the
 * environment value is cleared; a missing value means ordinary startup.
 * @param channel - expected app protocol identifier.
 * @returns parsed opaque payload, or undefined when no handoff was supplied.
 */
export function consumeAppHandoff(channel: string): unknown {
  const path = process.env[APP_HANDOFF_ENV]
  delete process.env.DSH_APP_HANDOFF_FILE
  if (path === undefined) return undefined
  if (!allowedPath(path)) throw new Error('app handoff path is outside the launcher temp boundary')
  try {
    const stat = lstatSync(path)
    if (!stat.isFile()) throw new Error('app handoff path is not a regular file')
    if (stat.size > APP_HANDOFF_MAX_BYTES) throw new Error('app handoff file exceeds size limit')
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('app handoff file permissions are not owner-only')
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppHandoffEnvelope> | null
    if (parsed === null || parsed.version !== 1 || parsed.channel !== channel || !('payload' in parsed)) {
      throw new Error(`app handoff does not match channel ${JSON.stringify(channel)}`)
    }
    return parsed.payload
  } finally {
    try { unlinkSync(path) } catch { /* single-use cleanup is best effort after a read failure */ }
  }
}
