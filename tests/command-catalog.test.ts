import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commandOf } from '../src/client/actions.ts'
import {
  canonicalTuiCommandName,
  reservedTuiCatalogNames,
  shortFunctionDescription,
  tuiCommands,
  type TuiCommandCandidate,
} from '../src/client/capabilities.ts'

const root = resolve(import.meta.dirname, '..')

describe('command catalog copy (review #60)', () => {
  it('truncates Host and Skill descriptions without requiring Han characters', () => {
    expect(shortFunctionDescription('Run the linter on changed files.', 'Run command'))
      .toBe('Run the linter on changed files.')
    expect(shortFunctionDescription('按名称执行对应能力。更多说明。', 'fallback'))
      .toBe('按名称执行对应能力')
    const long = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz'
    expect(shortFunctionDescription(long, 'fallback')).toBe(`${[...long].slice(0, 48).join('')}…`)
  })

  it('keys the catalog cache by locale and shadows Host commands instead of failing the directory', () => {
    const source = readFileSync(resolve(root, 'src/client/capabilities.ts'), 'utf8')
    expect(source).toMatch(/\$\{sessionId\}:\$\{uiLocale\(\)\}/u)
    expect(source).not.toMatch(/命令冲突：TUI 与 Host 都注册了/u)
    expect(source).toMatch(/if \(reserved\.has\(command\.name\)\) continue/u)
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).toMatch(/invalidateCommandCatalog\(\)/u)
  })

  it('puts daily commands first and hides compatible aliases from the visible catalog', () => {
    const names = tuiCommands().map(command => command.name)
    expect(names.slice(0, 6)).toEqual(['new', 'sessions', 'model', 'mode', 'permission', 'workspace'])
    expect(names).toContain('plugin')
    expect(names).toContain('mouse')
    expect(names).toContain('exit')
    expect(names).not.toContain('resume')
    expect(names).not.toContain('plugins')
    expect(names).not.toContain('quit')
    expect(canonicalTuiCommandName('resume')).toBe('sessions')
    expect(canonicalTuiCommandName('plugins')).toBe('plugin')
    expect(canonicalTuiCommandName('quit')).toBe('exit')
    expect(commandOf(tuiCommands(), 'resume')?.name).toBe('sessions')
    expect(commandOf(tuiCommands(), 'plugins')?.name).toBe('plugin')
    expect(commandOf(tuiCommands(), 'quit')?.name).toBe('exit')
    expect(commandOf(tuiCommands(), 'sessions')?.name).toBe('sessions')
    const execute = readFileSync(resolve(root, 'src/client/actions.ts'), 'utf8')
    expect(execute).toMatch(/case 'resume':/u)
    expect(execute).toMatch(/case 'plugins':/u)
    expect(execute).toMatch(/case 'quit':/u)
  })

  it('keeps hidden aliases reserved when a same-named Host command is merged', () => {
    const reserved = reservedTuiCatalogNames()
    expect(reserved.has('resume')).toBe(true)
    expect(reserved.has('plugins')).toBe(true)
    expect(reserved.has('quit')).toBe(true)
    expect(reserved.has('sessions')).toBe(true)
    expect(reserved.has('compact')).toBe(false)

    const hostResume: TuiCommandCandidate = {
      name: 'resume',
      description: 'Host resume',
      source: 'Host',
      behavior: 'host',
    }
    const hostPlugins: TuiCommandCandidate = {
      name: 'plugins',
      description: 'Host plugins',
      source: 'Host',
      behavior: 'host',
    }
    const merged = [...tuiCommands(), hostResume, hostPlugins]
    expect(commandOf(merged, 'resume')?.name).toBe('sessions')
    expect(commandOf(merged, 'resume')?.behavior).toBe('local')
    expect(commandOf(merged, 'plugins')?.name).toBe('plugin')
    expect(commandOf(merged, 'quit')?.name).toBe('exit')
    expect(commandOf(merged, 'sessions')?.name).toBe('sessions')
  })
})
