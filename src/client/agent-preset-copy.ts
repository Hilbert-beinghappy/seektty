/** Locale-safe display copy for Host-owned Agent Presets. */

import type { TuiModeOption } from './capabilities.ts'
import { ui } from './locale.ts'

interface AgentPresetCopy {
  readonly label: string
  readonly description?: string
}

/**
 * Match the official Web surface: localize only shipped system Presets by
 * stable id, while preserving user-authored names and descriptions verbatim.
 */
export function agentPresetCopy(mode: TuiModeOption): AgentPresetCopy {
  if (mode.trust === 'system') {
    switch (mode.id) {
      case 'standard': return {
        label: ui('标准模式', 'Standard mode'),
        description: ui(
          '功能完整的编码 Agent，支持文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流。',
          'Full coding agent with file editing, shell, file and web search, skills, planning, goals, subagents, and workflows.',
        ),
      }
      case 'code': return {
        label: ui('PTC 模式', 'PTC mode'),
        description: ui(
          '具备标准模式的全部能力，并通过 Code Mode SDK 呈现工具，让模型用一个 TypeScript 程序组合多步操作。',
          'All Standard mode capabilities, with tools exposed through the Code Mode SDK so the model can combine multi-step operations in one TypeScript program.',
        ),
      }
      case 'minimal': return {
        label: ui('极简模式', 'Minimal mode'),
        description: ui(
          '仅提供持久 bash 与 str_replace_editor 的双工具编码 Agent。',
          'Two-tool coding agent with persistent bash and str_replace_editor.',
        ),
      }
      case 'cordis': return {
        label: ui('创造模式', 'Creator mode'),
        description: ui(
          '用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。',
          'Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.',
        ),
      }
    }
  }
  return {
    label: mode.label,
    ...(mode.description === undefined ? {} : { description: mode.description }),
  }
}
