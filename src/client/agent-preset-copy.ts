/** Preserve the published Host-owned Agent Preset display metadata. */
import type { TuiModeOption } from './capabilities.ts'

interface AgentPresetCopy {
  readonly label: string
  readonly description?: string
}

/** Native rc.2 rows do not identify authorship; a stable id cannot prove it. */
export function agentPresetCopy(mode: TuiModeOption): AgentPresetCopy {
  return {
    label: mode.label,
    ...(mode.description === undefined ? {} : { description: mode.description }),
  }
}
