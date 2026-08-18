import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { restartRequiredFact, restartRequiredNotice } from '../src/client/restart-copy.ts'
import { setUiLocale } from '../src/client/locale.ts'

const root = resolve(import.meta.dirname, '..')

afterEach(() => { setUiLocale('zh') })

describe('restart copy', () => {
  it('lets requireRestart own the /restart instruction once', () => {
    const notice = restartRequiredNotice('界面语言已修改')
    const fact = restartRequiredFact()
    expect(notice).toBe('界面语言已修改。需要重启 · /restart')
    expect(fact).toBe('需要重启 · /restart')
    expect(notice.match(/\/restart/gu)).toHaveLength(1)
    expect(fact.match(/\/restart/gu)).toHaveLength(1)
  })

  it('keeps English restart copy free of Han and still names /restart once', () => {
    setUiLocale('en')
    const notice = restartRequiredNotice('Interface language was changed')
    const fact = restartRequiredFact()
    expect(notice).toBe('Interface language was changed. Restart required · /restart')
    expect(fact).toBe('Restart required · /restart')
    expect(notice.match(/\/restart/gu)).toHaveLength(1)
    expect(notice).not.toMatch(/\p{Script=Han}/u)
    expect(fact).not.toMatch(/\p{Script=Han}/u)
  })

  it('rebuilds the lasting fact from the current locale instead of a stored string', () => {
    expect(restartRequiredFact()).toBe('需要重启 · /restart')
    setUiLocale('en')
    expect(restartRequiredFact()).toBe('Restart required · /restart')
    const surface = readFileSync(resolve(root, 'src/client/surface.ts'), 'utf8')
    expect(surface).toMatch(/let restartRequired = false/u)
    expect(surface).toMatch(/restartRequired \? \{ restart: color\.warning\(restartRequiredFact\(\)\) \}/u)
    expect(surface).not.toMatch(/facts\.push\(restartRequiredFact\(\)\)/u)
    expect(surface).not.toMatch(/restartFactAfterNotice/u)
    expect(surface).not.toMatch(/lastingRestart/u)
  })
})
