/** Structured /trajectory request inspector text. */

import { ui } from './locale.ts'

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

const MAX_DATE_MS = 8.64e15

function millis(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_DATE_MS
    ? value
    : undefined
}

/**
 * Format the main fields of one Trajectory request instead of dumping JSON.
 * @param request - Trajectory request record from the projection snapshot.
 */
export function trajectoryRequestDetail(request: unknown): string {
  if (typeof request !== 'object' || request === null) return String(request)
  const row = request as Readonly<Record<string, unknown>>
  const config = typeof row.requestConfig === 'object' && row.requestConfig !== null
    ? row.requestConfig as Readonly<Record<string, unknown>>
    : {}
  const started = millis(row.startedAt)
  const completed = row.completedAt === null ? undefined : millis(row.completedAt)
  const duration = started !== undefined && completed !== undefined
    ? Math.max(0, completed - started)
    : undefined
  const usage = typeof row.usage === 'object' && row.usage !== null
    ? row.usage as Readonly<Record<string, unknown>>
    : undefined
  const lines = [
    `${ui('用途', 'Purpose')}: ${text(row.purpose) ?? ui('未知', 'unknown')}`,
    `${ui('状态', 'Status')}: ${text(row.status) ?? ui('未知', 'unknown')}`,
    `${ui('Provider', 'Provider')}: ${text(config.provider) ?? ui('未知', 'unknown')}`,
    `${ui('模型', 'Model')}: ${text(config.model) ?? ui('未知', 'unknown')}`,
    ...text(config.reasoningEffort) === undefined
      ? []
      : [`${ui('推理强度', 'Reasoning effort')}: ${text(config.reasoningEffort)}`],
    ...started === undefined ? [] : [`${ui('开始', 'Started')}: ${new Date(started).toISOString()}`],
    ...completed === undefined
      ? [`${ui('结束', 'Completed')}: ${ui('运行中', 'running')}`]
      : [`${ui('结束', 'Completed')}: ${new Date(completed).toISOString()}`],
    ...duration === undefined ? [] : [`${ui('耗时', 'Duration')}: ${String(duration)} ms`],
  ]
  if (usage !== undefined) {
    const parts = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']
      .flatMap((key) => {
        const amount = millis(usage[key])
        return amount === undefined ? [] : [`${key} ${String(amount)}`]
      })
    if (parts.length > 0) lines.push(`${ui('用量', 'Usage')}: ${parts.join(' · ')}`)
  }
  return lines.join('\n')
}
