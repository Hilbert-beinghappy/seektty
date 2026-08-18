import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shortFunctionDescription } from '../src/client/capabilities.ts'

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
    expect(source).toMatch(/if \(localCommand !== undefined\) continue/u)
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).toMatch(/invalidateCommandCatalog\(\)/u)
  })
})
