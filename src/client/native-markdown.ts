import { Worker } from 'node:worker_threads'
import { getCapabilities } from '@mariozechner/pi-tui'
import { markdownPresentation } from './theme.ts'
import type { NativePreparedRow, NativePreparedRows } from './transcript.ts'

/** Large indivisible Markdown stays authoritative; only its preparation leaves the UI thread. */
export const NATIVE_MARKDOWN_THRESHOLD = 32_768
export const NATIVE_MARKDOWN_PAGE_ROWS = 256
export type NativeMarkdownWorkerFactory = () => Worker
export interface NativeMarkdownPage { lines: string[]; done: boolean; total: number }

// Bound actual worker processes even with many concurrent large tool replies.
// Completed previews release their slot; pending history holds it until its
// last page is fetched, so slow output cannot cause unbounded prefetch.
const queued = new Set<() => void>()
let activeWorkers = 0
function schedule(): void {
  while (activeWorkers < 2 && queued.size) {
    const start = queued.values().next().value!
    queued.delete(start)
    start()
  }
}

/** One document, one requested page. No speculative queue of obsolete snapshots. */
export class NativeMarkdownPreparation {
  private worker: Worker | undefined
  private ready: NativeMarkdownPage | undefined
  private failure: Error | undefined
  private waiting: Promise<void> | undefined
  private wake: (() => void) | undefined
  private disposed = false
  private holdsSlot = false
  private closingWorker = false
  private readonly start: () => void

  constructor(
    readonly source: string,
    readonly width: number,
    readonly revision: number,
    readonly tailRows: number | undefined,
    private readonly changed: () => void,
    factory: NativeMarkdownWorkerFactory = () => new Worker(new URL('./native-markdown-worker.js', import.meta.url)),
    row?: NativePreparedRow,
    rows?: NativePreparedRows,
    first = true,
  ) {
    this.expectPage()
    const presentation = markdownPresentation()
    const capabilities = getCapabilities()
    this.start = () => {
      if (this.disposed) return
      activeWorkers++; this.holdsSlot = true
      try {
        const worker = this.worker = factory()
        worker.on('message', (message: NativeMarkdownPage | { error: string }) => {
          if (this.disposed) return
          if ('error' in message) this.fail(new Error(message.error))
          else { this.ready = message; if (message.done) this.closeWorker(); this.signal() }
        })
        worker.on('error', error => { if (this.worker === worker) this.fail(error) })
        worker.on('exit', code => {
          if (!this.disposed && this.worker === worker) this.fail(new Error(`Markdown worker exited before disposal (${code})`))
        })
        // A worker must not keep an abnormally stopped client alive.
        worker.unref()
        worker.postMessage({ source, row, rows, first, width, tailRows, presentation, capabilities })
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
    }
    queued.add(this.start)
    schedule()
  }

  page(): NativeMarkdownPage | undefined {
    if (this.failure) throw this.failure
    return this.ready
  }
  /** Called only after successful terminal delivery, never when merely taking a page. */
  advance(): void {
    if (!this.ready || this.ready.done) return
    this.ready = undefined
    this.expectPage()
    this.worker?.postMessage({ next: true })
  }
  async wait(): Promise<void> { await this.waiting; if (this.failure) throw this.failure }
  dispose(): void {
    this.disposed = true
    queued.delete(this.start)
    this.ready = undefined
    this.wake?.()
    this.wake = undefined
    this.closeWorker()
  }
  private expectPage(): void { this.waiting = new Promise(resolve => { this.wake = resolve }) }
  private signal(): void { this.wake?.(); this.wake = undefined; this.changed() }
  private fail(error: Error): void {
    if (this.disposed || this.failure) return
    this.failure = error
    this.closeWorker()
    this.signal()
  }
  private closeWorker(): void {
    if (this.closingWorker) return
    this.closingWorker = true
    const worker = this.worker
    this.worker = undefined
    const release = () => {
      if (!this.holdsSlot) return
      this.holdsSlot = false
      activeWorkers--
      schedule()
    }
    if (worker) void worker.terminate().then(release, release)
    else queueMicrotask(release)
  }
}
