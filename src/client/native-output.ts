import type { Writable } from 'node:stream'

/** A successful write means delivery to the stream, never durable terminal storage. */
export type NativeSink = (bytes: string) => Promise<void>

export function streamSink(stream: Writable): NativeSink {
  return bytes => new Promise((resolve, reject) => {
    let callbackDone = false
    let drained = false
    let finished = false
    const cleanup = (keepErrorListener = false): void => {
      if (!keepErrorListener) stream.off('error', fail)
      stream.off('close', closed); stream.off('drain', drain)
    }
    const fail = (error: Error, keepErrorListener = false): void => {
      if (finished) return
      finished = true; cleanup(keepErrorListener); reject(error)
    }
    const closed = (): void => { fail(new Error('Native output stream closed')) }
    const done = (): void => {
      if (finished || !callbackDone || !drained) return
      finished = true; cleanup(); resolve()
    }
    const drain = (): void => { drained = true; done() }
    stream.once('error', fail); stream.once('close', closed); stream.once('drain', drain)
    try {
      const accepted = stream.write(bytes, error => {
        // Writable reports a failed write to the callback *before* emitting its
        // error event. Keep the once-listener through that event, otherwise a
        // handled EPIPE becomes an uncaught exception during shutdown.
        if (error) { fail(error, true); return }
        callbackDone = true; done()
      })
      drained ||= accepted
      done()
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
  })
}

/** One transaction at a time. Cancellation drops only work not yet handed to the sink. */
export class NativeOutput {
  private chain: Promise<void> = Promise.resolve()
  private failure: Error | undefined
  private generation = 0
  private anchor = false
  private size = ''
  private previousTail: string[] = []
  private tailRow = 0
  private previousCursor = ''
  readonly metrics = { writes: 0, bytes: 0, cancelled: 0, frames: 0, historyLines: 0 }

  constructor(private readonly sink: NativeSink, private readonly onError: (error: Error) => void) {}

  epoch(): number { return this.generation }
  reset(preserveViewport = false): void { this.generation++; if (!preserveViewport) this.anchor = false }
  drain(): Promise<void> { return this.chain.then(() => { if (this.failure) throw this.failure }) }

  enqueue(task: () => Promise<void>, generation?: number): Promise<boolean> {
    let accepted = false
    const run = this.chain.then(async () => {
      if (this.failure) return
      if (generation !== undefined && generation !== this.generation) { this.metrics.cancelled++; return }
      await task(); accepted = true
    })
    this.chain = run.catch((error: unknown) => {
      this.failure = error instanceof Error ? error : new Error(String(error))
      this.onError(this.failure)
    })
    return this.chain.then(() => accepted)
  }

  private async write(bytes: string): Promise<void> {
    await this.sink(bytes)
    this.metrics.writes++; this.metrics.bytes += Buffer.byteLength(bytes)
  }

  control(bytes: string): void { void this.enqueue(() => this.write(bytes)) }

  frame(
    history: readonly string[], tail: readonly string[], width: number, height: number,
    cursor: { row: number; col: number } | null, generation = this.generation,
  ): Promise<boolean> {
    return this.enqueue(async () => {
      const size = `${width}:${height}`
      const reusable = this.anchor && this.size === size
      const visible = tail.slice(-height)
      const viewport = visible.length ? visible : ['']
      // Only the mutable tail is owned. Padding it to a whole screen inserts a
      // blank viewport between committed history and the next response/composer.
      const start = reusable ? this.tailRow : height - 1
      const overflow = Math.max(0, start + history.length + viewport.length - height)
      const tailRow = start + history.length - overflow
      const row = cursor === null ? height - 1 : tailRow + cursor.row - Math.max(0, tail.length - height)
      const cursorCode = cursor !== null && row >= 0 && row < height
        ? `\x1b[${row + 1};${Math.min(width, cursor.col + 1)}H\x1b[?25h` : '\x1b[?25l'
      if (reusable && history.length === 0 && viewport.length === this.previousTail.length) {
        let changed = ''
        for (let i = 0; i < viewport.length; i++) {
          if (viewport[i] !== this.previousTail[i]) changed += `\x1b[${tailRow + i + 1};1H\x1b[2K${viewport[i]}`
        }
        if (changed === '' && cursorCode === this.previousCursor) return
        await this.write('\x1b[?2026h' + changed + cursorCode + '\x1b[?2026l')
        this.previousTail = viewport; this.previousCursor = cursorCode
        this.metrics.frames++
        return
      }
      // Erase from the old tail, preserving committed rows above it. On unknown
      // coordinates start on a new bottom line; terminal reflow owns old history.
      // A shrinking tail leaves spare rows below, never a gap before the tail.
      let bytes = '\x1b[?2026h\x1b[?25l' + (reusable
        ? `\x1b[${start + 1};1H\x1b[0J`
        : `\x1b[${height};1H\r\n`)
      if (history.length) bytes += history.join('\r\n') + '\r\n'
      bytes += viewport.join('\r\n') + cursorCode
      bytes += '\x1b[?2026l'
      await this.write(bytes)
      this.anchor = generation === this.generation; this.size = size
      this.tailRow = tailRow
      this.previousTail = viewport; this.previousCursor = cursorCode
      this.metrics.frames++; this.metrics.historyLines += history.length
    }, generation)
  }
}
