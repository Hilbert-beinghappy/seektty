/** Client-side Markdown export of a conversation snapshot. */

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
