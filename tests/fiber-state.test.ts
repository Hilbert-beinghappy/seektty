import { describe, expect, it } from 'vitest'
import { FIBER_STATE, isActiveFiber } from '../src/host/fiber-state.ts'

describe('Cordis fiber state (task 6.8)', () => {
  it('treats ACTIVE as 2 and warns on an unknown numeric state', () => {
    expect(FIBER_STATE.ACTIVE).toBe(2)
    expect(isActiveFiber(FIBER_STATE.ACTIVE)).toBe(true)
    expect(isActiveFiber(FIBER_STATE.FAILED)).toBe(false)
    const warnings: string[] = []
    expect(isActiveFiber(99, chunk => { warnings.push(chunk) })).toBe(false)
    expect(warnings.join('')).toContain('unknown Cordis fiber.state 99')
  })

  it('keeps the Host runner on the named ACTIVE check', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('../src/host/index.ts', import.meta.url), 'utf8')
    expect(source).toContain('isActiveFiber(ctx.fiber.state')
    expect(source).not.toMatch(/ctx\.fiber\.state === 2/u)
  })
})
