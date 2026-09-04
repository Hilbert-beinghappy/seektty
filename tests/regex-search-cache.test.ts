import { expect, it, vi } from 'vitest'
import { cacheFailedRegexSearch } from '../src/client/regex-search-cache.ts'

it('matches native captures and lastIndex under forward, backward and changing input searches', () => {
  for (const flags of ['gd', 'gdu', 'gdv']) {
    for (const pattern of ['z+', '^abc', 'a(?=b)', '(?<=a)b', '(a)?(b)', '.', '$', '(?:)', '😀', '\\bword\\b']) {
      const actual = cacheFailedRegexSearch(new RegExp(pattern, flags)), old = new RegExp(pattern, flags)
      for (const text of ['abc ab word', '😀x\ud800z\udc00', 'no matches', 'a'.repeat(5000), '', 'abc ab word']) {
        for (const start of [...Array.from({ length: Math.min(text.length + 3, 100) }, (_, i) => i), 0, 2, 1, -1, 1.5, Infinity]) {
          actual.lastIndex = old.lastIndex = start
          expect(actual.exec(text)).toEqual(old.exec(text))
          expect(actual.lastIndex).toBe(old.lastIndex)
        }
      }
    }
  }
})

it('does not wrap sticky, nonglobal or emulated subclasses', () => {
  class Custom extends RegExp {}
  for (const regex of [/z/y, /z/, new Custom('z', 'g')]) {
    const exec = regex.exec
    expect(cacheFailedRegexSearch(regex)).toBe(regex)
    expect(regex.exec).toBe(exec)
  }
})

it('executes one native miss for all later positions on the same line, but retries earlier positions', () => {
  const regex = /z/gd, original = RegExp.prototype.exec
  let count = 0
  const spy = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (this: RegExp, text: string) {
    if (this === regex) count++
    return original.call(this, text)
  })
  try {
    cacheFailedRegexSearch(regex)
    for (let start = 2; start < 100; start++) { regex.lastIndex = start; regex.exec('a'.repeat(100)) }
    const forwardCount = count
    regex.lastIndex = 0; regex.exec('a'.repeat(100))
    const earlierCount = count
    spy.mockRestore()
    expect(forwardCount).toBe(1)
    expect(earlierCount).toBe(2)
  } finally { spy.mockRestore() }
})
