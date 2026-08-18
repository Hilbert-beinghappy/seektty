import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  composerHistoryFromDocuments,
  rememberComposerHistory,
} from '../src/client/composer-history.ts'
import { visibleSettingsDocuments } from '../src/client/settings.ts'
import {
  TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE,
  type TuiSettingsDocument,
} from '../src/protocol.ts'

function document(namespace: string, value: unknown, revision = 3): TuiSettingsDocument {
  return {
    namespace,
    schema: {},
    value,
    revision,
    applies: 'live',
    secrets: [],
  }
}

describe('composer history persistence', () => {
  it('keeps newest-first entries, skips consecutive duplicates, and honors a zero limit', () => {
    expect(rememberComposerHistory(['older'], '  newest  ', 2)).toEqual(['newest', 'older'])
    expect(rememberComposerHistory(['same'], 'same', 8)).toEqual(['same'])
    expect(rememberComposerHistory(['a', 'b'], 'c', 2)).toEqual(['c', 'a'])
    expect(rememberComposerHistory(['keep'], 'gone', 0)).toEqual([])
    expect(rememberComposerHistory(['keep'], '   ', 8)).toEqual(['keep'])
  })

  it('reads entries and revision from the Host Settings document', () => {
    expect(composerHistoryFromDocuments([], 200)).toEqual({ entries: [], revision: 0 })
    expect(composerHistoryFromDocuments([
      document(TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE, { entries: ['alpha', 'beta', 1, ''] }, 7),
    ], 1)).toEqual({ entries: ['alpha'], revision: 7 })
    expect(composerHistoryFromDocuments([
      document(TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE, { entries: ['keep'] }, 4),
    ], 0)).toEqual({ entries: [], revision: 4 })
  })

  it('does not read or write Profile-directory JSON from the client', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/client/composer-history.ts'), 'utf8')
    expect(source).not.toMatch(/node:fs|writeFileSync|readFileSync|mkdirSync|DSH_HOME|seektty-composer-history\.json/u)
  })

  it('hides the history namespace from the Settings editor', () => {
    const history = document(TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE, { entries: ['secret prompt'] })
    const behavior = document('seektty-behavior', { composerHistoryLimit: 200 })
    expect(visibleSettingsDocuments([history, behavior]).map(item => item.namespace)).toEqual(['seektty-behavior'])
  })
})
