import { sameStructuralToken, type StructuralToken } from './structural-token.ts'

export type NativeSourceToken = string | StructuralToken
export interface NativeReceipt {
  readonly epoch: number
  readonly key: string
  readonly token: NativeSourceToken
  readonly from: number
  readonly to: number
  readonly source: string | undefined
  readonly settled: boolean
}

/** Display-only ledger. Source offsets are UTF-16 offsets into Harness text. */
export class NativeHistory {
  private generation = 0
  private readonly committed = new Map<string, NativeReceipt>()
  private readonly pending = new Map<string, NativeReceipt>()
  reset(): void { this.generation++; this.committed.clear(); this.pending.clear() }
  get(key: string): NativeReceipt | undefined { return this.committed.get(key) }
  isCommitted(key: string, token: NativeSourceToken): boolean {
    const entry = this.committed.get(key)
    return entry?.settled === true && sameStructuralToken(entry.token, token)
  }
  reserve(key: string, token: NativeSourceToken, from: number, to: number, source: string | undefined, settled: boolean): NativeReceipt {
    if (this.pending.has(key)) throw new Error('Native history transaction already pending')
    const receipt = { epoch: this.generation, key, token, from, to, source, settled }
    this.pending.set(key, receipt)
    return receipt
  }
  acknowledge(receipt: NativeReceipt): boolean {
    if (this.pending.get(receipt.key) !== receipt || receipt.epoch !== this.generation) return false
    this.committed.set(receipt.key, receipt); this.pending.delete(receipt.key)
    return true
  }
  busy(): boolean { return this.pending.size > 0 }
  reserved(key: string): boolean { return this.pending.has(key) }
  pendingFor(key: string): NativeReceipt | undefined { return this.pending.get(key) }
  discardPending(): void { this.pending.clear() }
}

/** Conservative paragraph boundary: uncertain Markdown stays mutable in full. */
export function stableParagraphEnd(text: string): number {
  // Lists, fences, tables, HTML, references and multiline inline constructs can
  // reinterpret earlier lines. Do not infer stability from two matching frames.
  if (/[`~*_[\]<>|\\\r\x1b]/u.test(text) || /^(?: {4}|\t|\s*[-+>#]|\s*\d+[.)])/mu.test(text)) return 0
  const end = text.lastIndexOf('\n\n')
  return end < 0 ? 0 : end + 2
}

/** Top-level fenced code only. Indented/nested fences stay with Markdown. */
export function fencedCodeRange(text: string): {
  bodyStart: number; bodyEnd: number; stableEnd: number; closeEnd: number | undefined; language: string
} | undefined {
  if (text.includes('\r') || text.includes('\x1b')) return undefined
  const opening = /^(`{3,}|~{3,})([^\n`]*)\n/u.exec(text)
  if (!opening) return undefined
  const bodyStart = opening[0].length
  const fence = opening[1]!
  const closing = new RegExp(`^${fence[0]}{${fence.length},}[ \\t]*(?:\\n|$)`, 'mu')
  const match = closing.exec(text.slice(bodyStart))
  const bodyEnd = match ? bodyStart + match.index : text.length
  const closeEnd = match ? bodyEnd + match[0].length : undefined
  const stableEnd = closeEnd ?? Math.max(bodyStart, text.lastIndexOf('\n') + 1)
  return { bodyStart, bodyEnd, stableEnd, closeEnd, language: opening[2]!.trim().split(/\s/u)[0] ?? '' }
}
