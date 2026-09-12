/** dsh 0.1.5-rc.1 transient assistant projection; never consumes durable Session seqs. */
import { z } from 'zod'
import type { SessionAssistantStreamBaseline, SessionAssistantStreamFrame } from '@deepseek-ai/dsh-api-session-controller'
import type { PartialAssistant } from '../../vendor/client-runtime/client/sessions/conversation.js'
import { PartialAccumulator, emptyAssistantBlock } from '../../vendor/client-runtime/client/sessions/partial.js'
import { contentBlockSchema, imageAttachmentRefSchema } from '../../vendor/api-contract/api/sessions.schema.js'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { expandAssistantStream, type AssistantStreamRecord } from '@deepseek-ai/dsh-llm/assistant-stream'

const base = z.object({ type: z.string(), index: z.number().int().nonnegative() })
const textChunk = base.extend({ text: z.string() })

/** Keeps the latest generation and dense chunk position independently of log replay. */
export class NativeAssistantStream {
  private revision = -1
  private attemptId: string | undefined
  private nextIndex = 0
  private accumulator: PartialAccumulator | undefined
  private settlementSeq: number | undefined

  snapshot(): PartialAssistant | null { return this.accumulator?.toPartial() ?? null }

  baseline(value: SessionAssistantStreamBaseline): void {
    if (value.revision <= this.revision) return
    const active = value.activeAttempt
    const previous = this.accumulator
    this.accumulator = active === undefined ? undefined : new PartialAccumulator(active.turn, active.step)
    try {
      // The controller erases these records to JsonValue on the wire. The
      // official expansion function validates every record at this boundary.
      if (active !== undefined) {
        const expanded = expandAssistantStream(active.stream as readonly AssistantStreamRecord[])
        if (expanded.length !== active.nextIndex) throw new Error('Assistant baseline chunk count does not match nextIndex')
        for (const member of expanded) this.fold(member.chunk)
      }
    } catch (error) {
      this.accumulator = previous
      throw error
    }
    this.revision = value.revision
    this.attemptId = active?.attemptId
    this.nextIndex = active?.nextIndex ?? 0
    this.settlementSeq = undefined
  }

  accept(frame: SessionAssistantStreamFrame): void {
    if (frame.revision <= this.revision) return
    if (frame.type === 'start') {
      this.revision = frame.revision
      this.attemptId = frame.attemptId
      this.nextIndex = 0
      this.settlementSeq = undefined
      this.accumulator = new PartialAccumulator(frame.turn, frame.step)
      return
    }
    if (frame.attemptId !== this.attemptId || this.accumulator === undefined) {
      throw new Error('Assistant stream has no matching baseline')
    }
    if (frame.index !== this.nextIndex) throw new Error('Assistant stream chunk gap requires a new baseline')
    if (frame.type === 'chunk') {
      this.fold(frame.chunk)
      this.revision = frame.revision
      this.nextIndex += 1
      return
    }
    this.revision = frame.revision
    if (frame.outcome.kind === 'abandoned') this.accumulator = undefined
    else this.settlementSeq = frame.outcome.seq
  }

  /** Retire only when the committed assistant event has actually entered the loaded window. */
  settle(seq: number): void {
    if (this.settlementSeq !== undefined && seq >= this.settlementSeq) {
      this.accumulator = undefined
      this.settlementSeq = undefined
    }
  }

  private fold(value: unknown): void {
    if (this.accumulator === undefined) return
    const kind = z.object({ type: z.string() }).parse(value).type
    if (kind === 'usage' || kind === 'finish') return
    if (kind === 'text-delta' || kind === 'reasoning-delta') {
      const chunk = textChunk.parse(value)
      this.accumulator.push({ type: kind, index: chunk.index, text: chunk.text })
    } else if (kind === 'block-start') {
      const chunk = base.extend({ blockType: z.string() }).parse(value)
      this.accumulator.setBlock(chunk.index, emptyAssistantBlock(chunk.blockType))
    } else if (kind === 'tool-call-delta') {
      const chunk = base.extend({ id: z.string(), name: z.string().optional(), argumentsDelta: z.string() }).parse(value)
      this.accumulator.push({ type: 'tool-call-delta', index: chunk.index, id: ToolCallId(chunk.id), argumentsDelta: chunk.argumentsDelta,
        ...(chunk.name === undefined ? {} : { name: chunk.name }) })
    } else if (kind === 'block-end') {
      const chunk = base.extend({ block: contentBlockSchema }).parse(value)
      const block = chunk.block
      switch (block.type) {
        case 'text':
        case 'reasoning':
          this.accumulator.setBlock(chunk.index, { kind: block.type, text: z.string().parse(block.text) })
          break
        case 'tool-call': {
          const call = z.object({ id: z.string(), name: z.string(), arguments: z.string() }).parse(block)
          this.accumulator.setBlock(chunk.index, { kind: 'tool-call', callId: call.id, name: call.name, argsRaw: call.arguments })
          break
        }
        case 'image':
          this.accumulator.setBlock(chunk.index, { kind: 'image', attachment: imageAttachmentRefSchema.parse(block.attachment) })
          break
        default:
          this.accumulator.setBlock(chunk.index, { kind: 'other', block })
      }
    } else throw new Error(`Unsupported assistant chunk ${kind}`)
  }
}
