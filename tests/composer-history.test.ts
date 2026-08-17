import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPOSER_HISTORY_FILENAME,
  composerHistoryPath,
  loadComposerHistory,
  rememberComposerHistory,
  saveComposerHistory,
} from '../src/client/composer-history.ts'

const temporaryDirs: string[] = []

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('composer history persistence', () => {
  it('keeps newest-first entries, skips consecutive duplicates, and honors a zero limit', () => {
    expect(rememberComposerHistory(['older'], '  newest  ', 2)).toEqual(['newest', 'older'])
    expect(rememberComposerHistory(['same'], 'same', 8)).toEqual(['same'])
    expect(rememberComposerHistory(['a', 'b'], 'c', 2)).toEqual(['c', 'a'])
    expect(rememberComposerHistory(['keep'], 'gone', 0)).toEqual([])
    expect(rememberComposerHistory(['keep'], '   ', 8)).toEqual(['keep'])
  })

  it('loads and saves under the Profile directory, ignoring corrupt files', () => {
    const home = mkdtempSync(join(tmpdir(), 'seektty-history-'))
    temporaryDirs.push(home)
    const path = composerHistoryPath('tui', { DSH_HOME: home }, home)
    expect(path).toBe(join(home, 'profiles', 'tui', COMPOSER_HISTORY_FILENAME))
    expect(loadComposerHistory(path, 200)).toEqual([])

    mkdirSync(join(home, 'profiles', 'tui'), { recursive: true })
    writeFileSync(path, '{not json')
    expect(loadComposerHistory(path, 200)).toEqual([])

    saveComposerHistory(path, ['alpha', 'beta'])
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(['alpha', 'beta'])
    expect(loadComposerHistory(path, 1)).toEqual(['alpha'])
    expect(loadComposerHistory(path, 0)).toEqual([])
  })
})
