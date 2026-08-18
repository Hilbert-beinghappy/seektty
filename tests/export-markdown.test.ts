import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatByteSize } from '../src/client/byte-size.ts'
import { conversationMarkdown, markdownFromSessionLog } from '../src/client/conversation-markdown.ts'

describe('export size and markdown', () => {
  it('renders binary byte sizes with one decimal below 100 units', () => {
    expect(formatByteSize(0)).toBe('0 B')
    expect(formatByteSize(500)).toBe('500 B')
    expect(formatByteSize(1024)).toBe('1 KB')
    expect(formatByteSize(12_345_678)).toBe('11.8 MB')
  })

  it('renders user and assistant turns as Markdown without ANSI', () => {
    const markdown = conversationMarkdown('Demo session', [
      {
        kind: 'user',
        content: [{ type: 'text', text: '列出改动' }],
      },
      {
        kind: 'assistant',
        blocks: [
          { kind: 'text', text: '改了 `src/bin.ts`。' },
          { kind: 'tool-call', name: 'Read' },
        ],
      },
    ])
    expect(markdown).toBe([
      '# Demo session',
      '',
      '## User',
      '',
      '列出改动',
      '',
      '## Assistant',
      '',
      '改了 `src/bin.ts`。',
      '',
      '- tool `Read`',
      '',
    ].join('\n'))
  })

  it('builds Markdown from a Host session-log snapshot, not the loaded client page', () => {
    const log = {
      title: 'Full session',
      nodes: [
        { kind: 'user', content: [{ type: 'text', text: 'early turn that paging hid' }] },
        { kind: 'assistant', blocks: [{ kind: 'text', text: 'complete answer' }] },
      ],
    }
    const markdown = markdownFromSessionLog(Buffer.from(JSON.stringify(log)), 'fallback')
    expect(markdown).toContain('early turn that paging hid')
    expect(markdown).toContain('complete answer')
    expect(markdown).toContain('# Full session')
    const capabilities = readFileSync(resolve(import.meta.dirname, '../src/client/capabilities.ts'), 'utf8')
    expect(capabilities).toMatch(/sessionExport\.markdown\(/u)
    expect(capabilities).not.toMatch(/exportMarkdown[\s\S]*getSnapshot\(\)\.nodes/u)
  })
})
