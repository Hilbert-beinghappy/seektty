import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionChromeStore, nextTitleWrite } from '../src/client/session-chrome.ts'

describe('session-scoped chrome (review #20 #21 #22)', () => {
  it('isolates runningSince, notify snapshots, and last title by sessionId', () => {
    const store = createSessionChromeStore()
    const first = store.of('sess-a')
    first.runningSince = 1_000
    first.notifyPrimed = true
    first.lastTitle = 'A'
    const second = store.of('sess-b')
    expect(second.runningSince).toBeUndefined()
    expect(second.notifyPrimed).toBe(false)
    expect(second.lastTitle).toBe('')
    expect(store.of('sess-a').runningSince).toBe(1_000)
  })

  it('writes a terminal title only when the OSC payload changed', () => {
    expect(nextTitleWrite('', 'Inspect')).toBe('Inspect')
    expect(nextTitleWrite('Inspect', 'Inspect')).toBeUndefined()
    const source = readFileSync(resolve(import.meta.dirname, '../src/client/surface.ts'), 'utf8')
    expect(source).toMatch(/createSessionChromeStore\(/u)
    expect(source).toMatch(/nextTitleWrite\(/u)
    const timer = /elapsedTimer = setInterval\(([\s\S]*?)\}, 500\)/u.exec(source)
    expect(timer?.[1]).toBeDefined()
    expect(timer?.[1]).not.toContain('refreshHeader')
  })
})
