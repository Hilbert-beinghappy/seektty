import { afterEach, describe, expect, it } from 'vitest'
import { restartFactAfterNotice, restartRequiredFact, restartRequiredNotice } from '../src/client/restart-copy.ts'
import { setUiLocale } from '../src/client/locale.ts'

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

  it('does not let a later success or info toast hide the lasting restart fact', () => {
    const fact = restartRequiredFact()
    expect(restartFactAfterNotice(fact, 'success')).toBe(fact)
    expect(restartFactAfterNotice(fact, 'info')).toBe(fact)
    expect(restartFactAfterNotice(fact, undefined)).toBe(fact)
    expect(restartFactAfterNotice(fact, 'error')).toBeUndefined()
    expect(restartFactAfterNotice(undefined, 'success')).toBeUndefined()
  })
})
