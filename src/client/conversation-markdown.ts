/** Markdown export of an authoritative Host Session-log snapshot. */

import { inflateRawSync } from 'node:zlib'

export interface MarkdownUserNode {
  readonly kind: 'user'
  readonly content: readonly unknown[]
}

export interface MarkdownAssistantNode {
  readonly kind: 'assistant'
  readonly blocks: readonly {
    readonly kind: string
    readonly text?: string
    readonly name?: string
  }[]
}

export interface MarkdownSteeringNode {
  readonly kind: 'steering'
  readonly content: readonly unknown[]
}

export type MarkdownConversationNode =
  | MarkdownUserNode
  | MarkdownAssistantNode
  | MarkdownSteeringNode
  | { readonly kind: string }

function contentBlockText(block: unknown): string {
  if (typeof block !== 'object' || block === null) return String(block)
  const value = block as Record<string, unknown>
  if (value.type === 'text' || value.type === 'reasoning') {
    return typeof value.text === 'string' ? value.text : `[${value.type}]`
  }
  if (value.type === 'image') return '[image]'
  if (value.type === 'tool-result') return '[tool result]'
  return `[${typeof value.type === 'string' ? value.type : 'content'}]`
}

function userSection(heading: string, content: readonly unknown[]): string | undefined {
  const text = content.map(contentBlockText).join('\n').trim()
  if (text === '') return undefined
  return `## ${heading}\n\n${text}`
}

function assistantSection(node: MarkdownAssistantNode): string | undefined {
  const parts: string[] = []
  for (const block of node.blocks) {
    if (block.kind === 'text' && block.text !== undefined && block.text.trim() !== '') {
      parts.push(block.text.trimEnd())
    } else if (block.kind === 'tool-call' && block.name !== undefined) {
      parts.push(`- tool \`${block.name}\``)
    } else if (block.kind === 'image') {
      parts.push('[image]')
    }
  }
  if (parts.length === 0) return undefined
  return `## Assistant\n\n${parts.join('\n\n')}`
}

/**
 * Render visible conversation nodes as Markdown for `/export md`.
 * @param title - session display title used as the document heading.
 * @param nodes - Runtime conversation nodes in display order.
 * @returns Markdown with a trailing newline.
 */
export function conversationMarkdown(
  title: string,
  nodes: readonly MarkdownConversationNode[],
): string {
  const sections: string[] = [`# ${title === '' ? 'Session' : title}`]
  for (const node of nodes) {
    if (node.kind === 'user' && 'content' in node) {
      const section = userSection('User', node.content)
      if (section !== undefined) sections.push(section)
    } else if (node.kind === 'steering' && 'content' in node) {
      const section = userSection('Steering', node.content)
      if (section !== undefined) sections.push(section)
    } else if (node.kind === 'assistant' && 'blocks' in node) {
      const section = assistantSection(node)
      if (section !== undefined) sections.push(section)
    }
  }
  return `${sections.join('\n\n')}\n`
}

function asNodes(value: unknown): readonly MarkdownConversationNode[] | undefined {
  if (Array.isArray(value)) return value as MarkdownConversationNode[]
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (Array.isArray(record.nodes)) return record.nodes as MarkdownConversationNode[]
  if (typeof record.conversation === 'object' && record.conversation !== null) {
    const conversation = record.conversation as Record<string, unknown>
    if (Array.isArray(conversation.nodes)) return conversation.nodes as MarkdownConversationNode[]
  }
  if (Array.isArray(record.messages)) return record.messages as MarkdownConversationNode[]
  return undefined
}

function titleOf(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null && 'title' in value) {
    const title = (value as { title?: unknown }).title
    if (typeof title === 'string' && title !== '') return title
  }
  return fallback
}

function parseJsonSnapshot(bytes: Uint8Array): unknown | undefined {
  const text = Buffer.from(bytes).toString('utf8').trim()
  if (text === '' || (text[0] !== '{' && text[0] !== '[')) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function zipEntries(bytes: Uint8Array): readonly { readonly name: string; readonly data: Uint8Array }[] {
  const buffer = Buffer.from(bytes)
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) return []
  const entries: { name: string; data: Uint8Array }[] = []
  let offset = 0
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8)
    const compressed = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressed
    if (dataEnd > buffer.length) break
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const payload = buffer.subarray(dataStart, dataEnd)
    const data = method === 0
      ? payload
      : method === 8
        ? inflateRawSync(payload)
        : undefined
    if (data !== undefined) entries.push({ name, data })
    offset = dataEnd
  }
  return entries
}

/**
 * Render a complete Host Session-log payload as Markdown.
 * Accepts JSON snapshots and ZIP exports that contain a conversation JSON file.
 * @param bytes - authoritative Session-log body.
 * @param fallbackTitle - used when the log does not name the session.
 */
/**
 * Parse a Host Session-log body as JSON or a ZIP that contains conversation JSON.
 * @param bytes - authoritative Session-log payload.
 */
export function sessionLogSnapshot(bytes: Uint8Array): unknown {
  const direct = parseJsonSnapshot(bytes)
  const snapshot = direct ?? zipEntries(bytes).reduce<unknown | undefined>((found, entry) => {
    if (found !== undefined || !entry.name.endsWith('.json')) return found
    return parseJsonSnapshot(entry.data)
  }, undefined)
  if (snapshot === undefined) {
    throw new Error('Session-log snapshot is not a conversation JSON or ZIP')
  }
  return snapshot
}

export function markdownFromSessionLog(bytes: Uint8Array, fallbackTitle: string): string {
  const snapshot = sessionLogSnapshot(bytes)
  const nodes = asNodes(snapshot)
  if (nodes === undefined) {
    throw new Error('Session-log snapshot does not contain conversation nodes')
  }
  return conversationMarkdown(titleOf(snapshot, fallbackTitle), nodes)
}
