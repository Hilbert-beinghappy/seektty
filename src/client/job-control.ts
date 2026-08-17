/** Host-backed background job helpers shared by the management bridge and /jobs. */

import { ui } from './locale.ts'

/** Structural job registry surface used by the Host bridge. */
export interface HostJobRegistry {
  kill(id: string, caller?: unknown, reason?: string): 'requested' | 'already-finished'
}

/** Result of asking the Host registry to stop a job. */
export type JobKillResult = 'requested' | 'already-finished'

/**
 * Whether the user can still request cancellation.
 * @param status - JobView lifecycle state.
 */
export function isStoppableJob(status: string): boolean {
  return status === 'running' || status === 'stopping'
}

/**
 * Elapsed milliseconds using a frozen `now` so overlay refresh stays testable.
 * @param job - startedAt plus optional finishedAt.
 * @param now - comparison instant.
 */
export function jobElapsedMs(
  job: { readonly startedAt: number; readonly finishedAt?: number },
  now: number,
): number {
  return Math.max(0, (job.finishedAt ?? now) - job.startedAt)
}

/**
 * Stop one job through the Host registry without depending on dsh-jobs.
 * @param jobs - ctx.jobs, if the Host assembled it.
 * @param id - registry job id.
 */
export function killHostJob(jobs: HostJobRegistry | undefined, id: string): JobKillResult {
  if (jobs === undefined) throw new Error('Harness 后台任务服务未装配')
  return jobs.kill(id, undefined, 'user stopped the job from SeekTTY')
}

/**
 * Translate a kill result into a status-bar notice.
 * @param result - registry kill outcome.
 */
export function jobKillNotice(result: JobKillResult): string {
  return result === 'requested'
    ? ui('已请求停止任务', 'Stop requested')
    : ui('任务已经结束', 'Job already finished')
}
