import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replaceCurrentTestedMentions } from '../scripts/bump-readme.mjs'

const root = resolve(import.meta.dirname, '..')

describe('bump README current-pin rewrite', () => {
  it('updates only the current Host badge and current-tested sentences', () => {
    const source = [
      '<img src="https://img.shields.io/badge/DeepSeek%20Harness-0.1.1--rc.2-5B5BD6" alt="DeepSeek Harness 0.1.1-rc.2">',
      'The current tested Host is official `0.1.1-rc.2`.',
      '当前已测 Host 是官方 `0.1.1-rc.2`。',
      'Last jointly accepted Release remains official `0.1.0-rc.8` with SeekTTY `1.2.0`.',
      'pnpm add --global @deepseek-ai/dsh@0.1.0-rc.8',
      'A previous tested pin of `0.1.1-rc.2` must stay historical.',
    ].join('\n')
    const next = replaceCurrentTestedMentions(source, '0.1.1-rc.2', '0.1.1-rc.3')
    expect(next).toContain('DeepSeek%20Harness-0.1.1--rc.3-5B5BD6')
    expect(next).toContain('alt="DeepSeek Harness 0.1.1-rc.3"')
    expect(next).toContain('The current tested Host is official `0.1.1-rc.3`.')
    expect(next).toContain('当前已测 Host 是官方 `0.1.1-rc.3`。')
    expect(next).toContain('official `0.1.0-rc.8` with SeekTTY `1.2.0`')
    expect(next).toContain('@deepseek-ai/dsh@0.1.0-rc.8')
    expect(next).toContain('A previous tested pin of `0.1.1-rc.2` must stay historical.')
  })
})

describe('bump-dsh.mjs current-pin contract', () => {
  it('rewrites README through current-pin helper and keeps AUTO exact on DSH_COMPATIBILITY', () => {
    const bump = readFileSync(resolve(root, 'scripts/bump-dsh.mjs'), 'utf8')
    const versionScan = readFileSync(resolve(root, 'src/version-scan.ts'), 'utf8')
    expect(bump).toContain("from './bump-readme.mjs'")
    expect(bump).toContain('replaceCurrentTestedMentions(')
    expect(bump).not.toContain('replaceAll(tested')
    expect(bump).toContain("tested: '${tested}'")
    expect(versionScan).toContain('AUTO_PERMITTED_DSH_EXACT = DSH_COMPATIBILITY.tested')
  })
})
