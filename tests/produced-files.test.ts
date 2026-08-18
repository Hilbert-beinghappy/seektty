import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  flattenProducedFiles,
  groupProducedFiles,
  producedFilesFromSessionLog,
  type ProducedChatNode,
} from '../src/client/produced-files.ts'

function assistant(
  turn: number,
  seq: number,
  produced: readonly { seq: number; path: string }[],
): ProducedChatNode {
  return {
    visibility: 'visible',
    location: {
      kind: 'turn',
      turn: {
        turn,
        data: { get: () => ({ produced }) },
      },
    },
    data: { kind: 'assistant', seq, blocks: [] },
  }
}

describe('produced files across turns', () => {
  it('groups first-seen paths by the turn that produced them', () => {
    const nodes = new Map<string, ProducedChatNode>([
      ['t1', assistant(1, 10, [{ seq: 1, path: 'src/a.ts' }, { seq: 2, path: 'src/b.ts' }])],
      ['t2', assistant(2, 20, [{ seq: 1, path: 'src/b.ts' }, { seq: 2, path: 'src/c.ts' }])],
    ])
    const groups = groupProducedFiles(['t1', 't2'], key => nodes.get(key))
    expect(groups).toEqual([
      { turn: 1, paths: ['src/a.ts', 'src/b.ts'] },
      { turn: 2, paths: ['src/c.ts'] },
    ])
    expect(flattenProducedFiles(groups)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  })

  it('reads the complete Host session produced-file index, not just loaded chat nodes', () => {
    const log = {
      producedFiles: [
        { turn: 1, paths: ['early/a.ts', 'early/b.ts'] },
        { turn: 8, paths: ['late/c.ts'] },
      ],
    }
    expect(producedFilesFromSessionLog(Buffer.from(JSON.stringify(log)))).toEqual([
      { turn: 1, paths: ['early/a.ts', 'early/b.ts'] },
      { turn: 8, paths: ['late/c.ts'] },
    ])
    const capabilities = readFileSync(resolve(import.meta.dirname, '../src/client/capabilities.ts'), 'utf8')
    expect(capabilities).toMatch(/sessionFiles\.index\(/u)
    const statAt = capabilities.indexOf('await stat(absolute)')
    const readAt = capabilities.indexOf('await readFile(absolute)')
    expect(statAt).toBeGreaterThan(-1)
    expect(readAt).toBeGreaterThan(statAt)
  })
})
