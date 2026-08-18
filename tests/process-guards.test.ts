import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { restoreTerminalSync, withCleanupTimeout } from '../src/process-guards.ts'

const root = resolve(import.meta.dirname, '..')

describe('fatal terminal restore (review #14)', () => {
  it('restores cooked mode and the cursor synchronously before any cleanup', () => {
    const order: string[] = []
    const stdin = { setRawMode: (mode: boolean) => { order.push(`raw:${String(mode)}`) } }
    const terminal = { showCursor: () => { order.push('cursor') } }
    restoreTerminalSync(stdin, chunk => { order.push(`write:${chunk}`) }, terminal)
    expect(order[0]).toBe('raw:false')
    expect(order).toContain('cursor')
  })

  it('bounds hanging async cleanup so restore is never waited on', async () => {
    const finished = await withCleanupTimeout(async () => {
      await new Promise(() => undefined)
      return 'never'
    }, 20)
    expect(finished).toBeUndefined()
  })

  it('restores the terminal in surface close before drainInput', () => {
    const source = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    const restoreAt = source.indexOf('restoreTerminalSync')
    const drainAt = source.indexOf('drainInput')
    expect(restoreAt).toBeGreaterThan(-1)
    expect(drainAt).toBeGreaterThan(restoreAt)
  })
})
