/** Parse and reconcile launcher restart handoff without blocking boot. */

import { resolve } from 'node:path'
import { ui } from '../client/locale.ts'
import type { ConsumeAppHandoffResult } from './app-handoff.ts'

/** Draft, attachments, and notice restored after a controlled restart. */
export interface TuiRestartHandoff {
  readonly profile: string
  readonly cwd: string
  readonly resume?: string
  readonly draft?: string
  readonly attachmentPaths: readonly string[]
  readonly notice?: string
}

function degradedNotice(): string {
  return ui('重启交接无效，已按普通启动继续', 'Restart handoff was invalid; continuing with a normal start')
}

function parseRestartHandoff(value: unknown): TuiRestartHandoff {
  if (typeof value !== 'object' || value === null) throw new Error('TUI 重启交接不是对象')
  const row = value as Record<string, unknown>
  if (typeof row.profile !== 'string' || typeof row.cwd !== 'string'
    || !Array.isArray(row.attachmentPaths)
    || !row.attachmentPaths.every(path => typeof path === 'string')) {
    throw new Error('TUI 重启交接缺少 Profile、工作区或附件路径')
  }
  if (row.attachmentPaths.length > 32) throw new Error('TUI 重启交接附件数量超过限制')
  if (row.resume !== undefined && typeof row.resume !== 'string') throw new Error('TUI 重启交接会话 id 无效')
  if (row.draft !== undefined && typeof row.draft !== 'string') throw new Error('TUI 重启交接草稿无效')
  if (row.notice !== undefined && typeof row.notice !== 'string') throw new Error('TUI 重启交接提示无效')
  return {
    profile: row.profile,
    cwd: resolve(row.cwd),
    ...(typeof row.resume === 'string' ? { resume: row.resume } : {}),
    ...(typeof row.draft === 'string' ? { draft: row.draft } : {}),
    attachmentPaths: row.attachmentPaths,
    ...(typeof row.notice === 'string' ? { notice: row.notice } : {}),
  }
}

/**
 * Turn a consume result into a parsed handoff or a startup notice.
 * Invalid envelopes never throw; boot continues without the draft.
 */
export function readRestartHandoff(consumed: ConsumeAppHandoffResult): {
  readonly handoff?: TuiRestartHandoff
  readonly startupNotice?: string
} {
  if (consumed.kind === 'missing') return {}
  if (consumed.kind === 'degraded') return { startupNotice: degradedNotice() }
  try {
    return { handoff: parseRestartHandoff(consumed.payload) }
  } catch {
    return { startupNotice: degradedNotice() }
  }
}

/**
 * Drop a parsed handoff when it disagrees with this process's launcher args.
 */
export function reconcileHandoff(
  pending: { readonly handoff?: TuiRestartHandoff; readonly startupNotice?: string },
  launch: { readonly profile: string; readonly cwd: string; readonly resume?: string | true },
): { readonly handoff?: TuiRestartHandoff; readonly startupNotice?: string } {
  if (pending.handoff === undefined) return pending
  if (
    pending.handoff.profile !== launch.profile
    || pending.handoff.cwd !== resolve(launch.cwd)
    || pending.handoff.resume !== launch.resume
  ) {
    return { startupNotice: degradedNotice() }
  }
  return {
    handoff: pending.handoff,
    ...(pending.handoff.notice === undefined && pending.startupNotice === undefined
      ? {}
      : { startupNotice: pending.handoff.notice ?? pending.startupNotice }),
  }
}

/**
 * Parse a consume result against this process's launcher arguments.
 */
export function applyConsumedHandoff(
  consumed: ConsumeAppHandoffResult,
  launch: { readonly profile: string; readonly cwd: string; readonly resume?: string | true },
): { readonly handoff?: TuiRestartHandoff; readonly startupNotice?: string } {
  return reconcileHandoff(readRestartHandoff(consumed), launch)
}
