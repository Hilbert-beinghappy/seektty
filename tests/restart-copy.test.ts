import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('restart copy', () => {
  it('lets requireRestart own the /restart instruction once', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const actions = readFileSync(resolve(root, 'src/client/actions.ts'), 'utf8')
    expect(surface).toContain('需要重启 · /restart')
    expect(surface).not.toContain('可输入 /restart 稍后重启')
    expect(actions).toContain('this.host.requireRestart(ui(`${label} 已修改`')
    expect(actions).toContain('this.host.requireRestart(ui(`${label} 已完成`')
    expect(actions).not.toContain('输入 /restart 生效')
    expect(actions).not.toContain('输入 /restart 加载变更')
  })
})
