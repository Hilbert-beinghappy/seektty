import { describe, expect, it } from 'vitest'
import {
  commandShadowDiagnostics,
  mergeCommandCatalog,
  TUI_COMMANDS,
} from '../src/client/capabilities.ts'

describe('command catalog merge', () => {
  it('keeps the catalog when a Host command collides with a TUI builtin', () => {
    const result = mergeCommandCatalog([
      { name: 'new', description: 'Host 侧新建' },
      { name: 'plan', description: '开启或关闭计划模式。' },
    ], [])

    expect(result.catalog.map(command => command.name)).toEqual([
      ...TUI_COMMANDS.map(command => command.name),
      'plan',
    ])
    expect(result.shadows).toEqual(['new'])
    expect(result.diagnostics).toEqual([
      '命令 /new 被 TUI 内置命令遮蔽',
    ])
  })

  it('still skips colliding Skills and does not record them as Host shadows', () => {
    const result = mergeCommandCatalog([], [
      { name: 'help', description: 'Skill 帮助' },
      { name: 'unique-skill', description: '按名称执行对应能力。' },
    ])

    expect(result.catalog.some(command => command.name === 'help' && command.source === 'Skill')).toBe(false)
    expect(result.catalog.some(command => command.name === 'unique-skill')).toBe(true)
    expect(result.shadows).toEqual([])
  })

  it('reports Host shadows only for the active session', () => {
    const shadows = new Map<string, readonly string[]>([
      ['session-a', ['new']],
      ['session-b', ['status']],
    ])
    expect(commandShadowDiagnostics(shadows, 'session-a')).toEqual([
      '命令 /new 被 TUI 内置命令遮蔽',
    ])
    expect(commandShadowDiagnostics(shadows, 'session-b')).toEqual([
      '命令 /status 被 TUI 内置命令遮蔽',
    ])
    expect(commandShadowDiagnostics(shadows, undefined)).toEqual([])
    expect(commandShadowDiagnostics(shadows, 'missing')).toEqual([])
  })
})
