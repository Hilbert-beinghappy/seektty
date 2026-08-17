import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  APP_HANDOFF_ENV,
  consumeAppHandoff,
  internals,
  sweepStaleAppHandoffs,
  writeAppHandoff,
} from '../src/host/app-handoff.ts'
import { applyConsumedHandoff } from '../src/host/restart-handoff.ts'

const original = { tmpdir: internals.tmpdir, now: internals.now, staleMs: internals.staleMs }

afterEach(() => {
  internals.tmpdir = original.tmpdir
  internals.now = original.now
  internals.staleMs = original.staleMs
  delete process.env[APP_HANDOFF_ENV]
})

describe('app handoff (task 6.6)', () => {
  it('treats a tmpdir symlink and its real path as the same boundary', () => {
    const root = mkdtempSync(join(tmpdir(), 'seektty-handoff-'))
    const real = join(root, 'real')
    const link = join(root, 'link')
    mkdirSync(real)
    symlinkSync(real, link)
    internals.tmpdir = () => real
    const path = writeAppHandoff('seektty-v1', { ok: true }).replace(real, link)
    process.env[APP_HANDOFF_ENV] = path
    expect(consumeAppHandoff('seektty-v1')).toEqual({ kind: 'payload', payload: { ok: true } })
  })

  it('degrades invalid envelopes instead of throwing', () => {
    const path = writeAppHandoff('seektty-v1', { ok: true })
    writeFileSync(path, '{not-json')
    chmodSync(path, 0o600)
    process.env[APP_HANDOFF_ENV] = path
    const result = consumeAppHandoff('seektty-v1')
    expect(result.kind).toBe('degraded')
    expect(process.env[APP_HANDOFF_ENV]).toBeUndefined()
  })

  it('sweeps leftover prefix files older than the stale window', () => {
    internals.staleMs = 1_000
    const path = writeAppHandoff('seektty-v1', { leftover: true })
    utimesSync(path, new Date(0), new Date(0))
    internals.now = () => 10_000
    sweepStaleAppHandoffs()
    process.env[APP_HANDOFF_ENV] = path
    expect(consumeAppHandoff('seektty-v1')).toMatchObject({ kind: 'degraded' })
  })

  it('continues a normal start when the handoff does not match launcher args', () => {
    const applied = applyConsumedHandoff(
      { kind: 'payload', payload: { profile: 'a', cwd: '/tmp/a', attachmentPaths: [] } },
      { profile: 'b', cwd: '/tmp/b' },
    )
    expect(applied.handoff).toBeUndefined()
    expect(applied.startupNotice).toContain('普通启动')
  })
})
