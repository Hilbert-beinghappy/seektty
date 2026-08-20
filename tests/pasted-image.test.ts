import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BRACKETED_PASTE,
  imagePathFromPasteText,
  isSlashCommandLine,
  splitLeadingImagePath,
  unescapePosixPath,
} from '../src/client/pasted-image.ts'
import { resolveHarnessUserPath } from '../src/client/workspace-path.ts'

const QQ_ESCAPED = '/Users/huangjiawei/Library/Containers/com.tencent.qq/Data/Library/Application\\ Support/QQ/nt_qq_7d04be481f9407d5701cc094bdef8766/nt_data/Pic/2026-08/Thumb/acdd5ba85276c535a5785dd0fa63d372_0.png'
const QQ_REAL = '/Users/huangjiawei/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_7d04be481f9407d5701cc094bdef8766/nt_data/Pic/2026-08/Thumb/acdd5ba85276c535a5785dd0fa63d372_0.png'

function bracketed(text: string): string {
  return `\u001B[200~${text}\u001B[201~`
}

describe('unescapePosixPath', () => {
  it('turns Finder/QQ shell-escaped spaces into a real POSIX path', () => {
    expect(unescapePosixPath(QQ_ESCAPED)).toBe(QQ_REAL)
  })

  it('leaves Windows paths and UNC paths unchanged', () => {
    expect(unescapePosixPath('C:\\Users\\me\\photo.png')).toBe('C:\\Users\\me\\photo.png')
    expect(unescapePosixPath('\\\\server\\share\\photo.png')).toBe('\\\\server\\share\\photo.png')
  })
})

describe('imagePathFromPasteText', () => {
  it('recognizes a bracketed QQ thumbnail path with escaped spaces', () => {
    const pasted = imagePathFromPasteText(bracketed(QQ_ESCAPED))
    expect(pasted).toEqual({ path: QQ_REAL, rest: '', raw: QQ_ESCAPED })
  })

  it('recognizes an unescaped path that contains Application Support', () => {
    const pasted = imagePathFromPasteText(QQ_REAL)
    expect(pasted).toEqual({ path: QQ_REAL, rest: '', raw: QQ_REAL })
  })

  it('keeps a trailing prompt after the image path', () => {
    const pasted = imagePathFromPasteText(`${QQ_ESCAPED} 这个是什么`)
    expect(pasted).toEqual({ path: QQ_REAL, rest: '这个是什么', raw: `${QQ_ESCAPED} 这个是什么` })
  })

  it('accepts quoted paths with spaces', () => {
    const quoted = `"${QQ_REAL}"`
    expect(imagePathFromPasteText(quoted)).toEqual({ path: QQ_REAL, rest: '', raw: quoted })
  })

  it('rejects slash commands and non-image text', () => {
    expect(imagePathFromPasteText('/attach')).toBeUndefined()
    expect(imagePathFromPasteText('/attach /tmp/photo.png')).toBeUndefined()
    expect(imagePathFromPasteText('hello.png is a filename')).toBeUndefined()
  })
})

describe('splitLeadingImagePath', () => {
  it('splits a pasted absolute image path from the user question', () => {
    expect(splitLeadingImagePath(`${QQ_ESCAPED} 这个是什么`)).toEqual({
      path: QQ_REAL,
      rest: '这个是什么',
    })
  })

  it('treats a lone image path as an attachment with an empty prompt', () => {
    expect(splitLeadingImagePath(QQ_REAL)).toEqual({ path: QQ_REAL, rest: '' })
  })

  it('does not steal /attach or ordinary prompts', () => {
    expect(splitLeadingImagePath('/attach /tmp/photo.png')).toBeUndefined()
    expect(splitLeadingImagePath('please look at /tmp/photo.png')).toBeUndefined()
  })
})

describe('isSlashCommandLine', () => {
  it('accepts catalog commands and rejects filesystem paths', () => {
    expect(isSlashCommandLine('/attach')).toBe(true)
    expect(isSlashCommandLine('/attach /tmp/a.png')).toBe(true)
    expect(isSlashCommandLine('/export md')).toBe(true)
    expect(isSlashCommandLine(QQ_ESCAPED)).toBe(false)
    expect(isSlashCommandLine(`${QQ_REAL} 这个是什么`)).toBe(false)
    expect(isSlashCommandLine('/tmp/photo.png')).toBe(false)
  })
})

describe('resolveHarnessUserPath', () => {
  it('unescapes POSIX shell escapes before resolving', () => {
    expect(resolveHarnessUserPath(QQ_ESCAPED, '/tmp/workspace')).toBe(QQ_REAL)
  })
})

describe('surface paste wiring', () => {
  it('routes pasted paths through imagePathFromPasteText instead of treating /Users as a command', () => {
    const surface = readFileSync(new URL('../src/client/surface.ts', import.meta.url), 'utf8')
    expect(surface).toContain('imagePathFromPasteText')
    expect(surface).toContain('isSlashCommandLine')
    expect(surface).toContain('splitLeadingImagePath')
    expect(surface).not.toMatch(/if \(text\.startsWith\('\/'\)\) void dispatchCommand\(text\)/u)
    const actions = readFileSync(new URL('../src/client/actions.ts', import.meta.url), 'utf8')
    expect(actions).toContain('captureClipboardImage')
    expect(BRACKETED_PASTE.test(bracketed(QQ_ESCAPED))).toBe(true)
  })
})
