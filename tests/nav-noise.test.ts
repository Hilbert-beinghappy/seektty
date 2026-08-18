import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('navigation noise', () => {
  it('does not toast Tab/Esc navigation or a successful Host command', () => {
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).not.toContain('对话浏览 · Tab/Escape 返回输入')
    expect(surface).not.toContain('已返回输入区')
    expect(surface).not.toContain('已取消查找')
    expect(surface).not.toContain('已退出工具卡焦点')
    expect(surface).not.toContain('已执行 /')
  })

  it('keeps selector footers short and names Esc abort on progress pages', () => {
    const overlays = readFileSync(resolve(root, 'src/client/overlays.ts'), 'utf8')
    expect(overlays).toContain('Enter 选择 · Esc 返回')
    expect(overlays).toContain('Space 勾选')
    expect(overlays).toContain('Esc 中止')
    expect(overlays).not.toContain('↑↓ 选择 · Enter 确认 · Esc 返回/关闭')
  })
})
