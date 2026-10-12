/** Synthetic rc.2 records only: no credentials, real Session history, or disk files. */
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ArtifactEvent } from '../../src/client/session-artifacts.ts'
export const artifactEvents: readonly ArtifactEvent[] = [
  { seq: 1, type: 'tool/call', data: { turn: 1, step: 1, name: 'exit_plan_mode', callId: 'plan-call', arguments: JSON.stringify({ plan: '# 计划 😀\n\n完整正文\n- 第一步\n- 第二步' }) } },
  { seq: 2, type: 'tool/result', data: { turn: 1, step: 1, message: createToolResultMessage({ callId: ToolCallId('plan-call'), content: [{ type: 'text', text: 'Cancelled plan review; stay in plan mode.' }], isError: true }) } },
  { seq: 3, type: 'deliverables/presented', data: { turn: 2, callId: 'present-call', files: [{ path: '/synthetic-host/项目/结果 A.md', description: '交付产物' }, { path: 'relative/report.md' }] } },
  { seq: 4, type: 'workspace/changes', data: { turn: 2 } },
  { seq: 5, type: 'tool/ptc-dispatch', data: { rootCallId: 'root', parentCallId: 'root', subCallId: 'sub:1', name: 'read', arguments: { path: '/synthetic-host/large.md' }, content: [{ type: 'text', text: 'Head 😀\n… omitted by Host …\nTail\nFull output: /synthetic-host/spill.txt' }, { type: 'image', attachment: { attachmentId: 'synthetic-attachment', name: 'preview.png', mediaType: 'image/png', bytes: 8, width: 1, height: 1 } }], isError: false } },
  { seq: 6, type: 'artifact/future', data: { reference: 'unknown-scheme:abc', metadata: { retained: true } } },
]
export const reviewSummary = {
  turn: 2, cwd: '/synthetic-host', total: 3, added: 2, deleted: 1,
  files: [
    { path: '项目/结果 A.md', display: '项目/结果 A.md', added: 2, deleted: 1 },
    { path: 'image.png', display: 'image.png', added: 0, deleted: 0, binary: true },
    { path: 'huge.log', display: 'huge.log', added: 0, deleted: 0, oversized: true },
  ],
}
export const reviewDiffs = [
  { kind: 'text', path: '项目/结果 A.md', display: '项目/结果 A.md', before: true, after: true, coarse: false, hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-old', '+新 😀', '+second'] }] },
  { kind: 'binary', path: 'image.png', display: 'image.png' },
  { kind: 'oversized', path: 'huge.log', display: 'huge.log' },
]
