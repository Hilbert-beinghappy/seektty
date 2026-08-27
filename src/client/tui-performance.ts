import { appendFileSync } from 'node:fs'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

const PROCESS_EVENTS = ['uncaughtException', 'unhandledRejection', 'SIGINT', 'SIGTERM', 'SIGHUP'] as const
const LATENCY_RETAINED_CAP = 4096

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function activeResources(): number {
  return typeof process.getActiveResourcesInfo === 'function' ? process.getActiveResourcesInfo().length : 0
}

function processListeners(): number {
  return PROCESS_EVENTS.reduce((sum, event) => sum + process.listenerCount(event), 0)
}

function mergeCounts(into: Map<string, number>, from: ReadonlyMap<string, number>): void {
  for (const [reason, count] of from) into.set(reason, (into.get(reason) ?? 0) + count)
}

function explicitBucketPath(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function rankStandardError(retained: number): { p95: number; p99: number } {
  return {
    p95: Number(Math.sqrt(0.95 * 0.05 / retained).toFixed(6)),
    p99: Number(Math.sqrt(0.99 * 0.01 / retained).toFixed(6)),
  }
}

/** Parse `SEEKTTY_TUI_PERF_BUCKET_MS` as a positive integer milliseconds value. */
export function parsePerfBucketIntervalMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (!/^[0-9]+$/u.test(trimmed)) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export interface TuiLatencySummary {
  readonly p50: number
  readonly p95: number
  readonly p99: number
  readonly max: number
  readonly count: number
  readonly retained: number
  readonly approximate: boolean
  readonly probabilistic?: true
  readonly rankStandardError?: { readonly p95: number; readonly p99: number }
}

class BoundedLatencySeries {
  private readonly samples: number[] = []
  private readonly random: () => number
  private total = 0
  private peak = 0

  constructor(random: () => number) {
    this.random = random
  }

  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return
    this.total += 1
    if (value > this.peak) this.peak = value
    if (this.samples.length < LATENCY_RETAINED_CAP) {
      this.samples.push(value)
      return
    }
    const index = Math.floor(this.random() * this.total)
    if (index < LATENCY_RETAINED_CAP) this.samples[index] = value
  }

  reset(): void {
    this.samples.length = 0
    this.total = 0
    this.peak = 0
  }

  summarize(): TuiLatencySummary {
    const retained = this.samples.length
    const approximate = this.total > LATENCY_RETAINED_CAP
    const rounded = (value: number): number => Number(value.toFixed(3))
    const summary: TuiLatencySummary = {
      p50: rounded(percentile(this.samples, 0.5)),
      p95: rounded(percentile(this.samples, 0.95)),
      p99: rounded(percentile(this.samples, 0.99)),
      max: rounded(this.peak),
      count: this.total,
      retained,
      approximate,
    }
    if (!approximate || retained === 0) return summary
    return {
      ...summary,
      probabilistic: true,
      rankStandardError: rankStandardError(retained),
    }
  }
}

export interface TuiPerformanceSnapshot {
  readonly schema: 1
  readonly durationMs: number
  readonly inputEvents: number
  readonly snapshots: number
  readonly refreshHeaderCalls: number
  readonly updateStatusCalls: number
  readonly renderRequests: Readonly<Record<string, number>>
  readonly renderDurationMs: TuiLatencySummary
  readonly inputToWriteMs: TuiLatencySummary
  readonly terminalWrites: { calls: number; bytes: number; backpressureSignals: number; drains: number }
  readonly eventLoop: { p99DelayMs: number; utilization: number }
  readonly memory: NodeJS.MemoryUsage
  readonly resource: NodeJS.ResourceUsage
  readonly lifecycle: {
    activeResourcesStart: number
    activeResourcesEnd: number
    processListenersStart: number
    processListenersEnd: number
    subscriptions: number
  }
}

export interface TuiPerformanceBucketSnapshot extends TuiPerformanceSnapshot {
  readonly kind: 'bucket'
  readonly t: string
}

export interface TuiPerformanceFinalSnapshot extends TuiPerformanceSnapshot {
  readonly kind: 'final'
  readonly t: string
}

export interface TuiPerformanceProbeOptions {
  readonly bucketIntervalMs?: number
  readonly onBucket?: (snapshot: TuiPerformanceBucketSnapshot) => void
  readonly now?: () => number
  readonly random?: () => number
}

interface TerminalWriteTarget {
  write(data: string): void
}

interface BackpressureSource {
  readonly writableNeedDrain: boolean
  once(event: 'drain', listener: () => void): unknown
  off(event: 'drain', listener: () => void): unknown
}

/** Keep the production terminal untouched unless performance collection is enabled. */
export function instrumentTerminalWrites<T extends TerminalWriteTarget>(
  rawTerminal: T,
  probe: TuiPerformanceProbe,
  output: BackpressureSource,
): { readonly terminal: T; release(): void } {
  if (!probe.isEnabled) return { terminal: rawTerminal, release: () => undefined }
  let waitingForDrain = false
  const onDrain = (): void => {
    waitingForDrain = false
    probe.markDrain()
  }
  const measuredWrite = (data: string): void => {
    rawTerminal.write(data)
    const backpressured = output.writableNeedDrain
    probe.markWrite(data, backpressured)
    if (backpressured && !waitingForDrain) {
      waitingForDrain = true
      output.once('drain', onDrain)
    }
  }
  const terminal = new Proxy(rawTerminal, {
    get(target, property) {
      if (property === 'write') return measuredWrite
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return {
    terminal,
    release: () => {
      if (!waitingForDrain) return
      output.off('drain', onDrain)
      waitingForDrain = false
    },
  }
}

/** Default-off, content-free aggregate metrics for terminal performance acceptance. */
export class TuiPerformanceProbe {
  private readonly enabled: boolean
  private readonly nowFn: () => number
  private readonly startedAt = performance.now()
  private readonly eventLoop = monitorEventLoopDelay({ resolution: 20 })
  private readonly eventLoopStart = performance.eventLoopUtilization()
  private readonly activeResourcesStart = activeResources()
  private readonly processListenersStart = processListeners()
  private readonly onBucket: ((snapshot: TuiPerformanceBucketSnapshot) => void) | undefined
  private readonly bucketPath: string | undefined
  private readonly allRenderDurations: BoundedLatencySeries
  private readonly allInputToWrite: BoundedLatencySeries
  private readonly windowRenderDurations: BoundedLatencySeries
  private readonly windowInputToWrite: BoundedLatencySeries
  private readonly bucketEventLoop: ReturnType<typeof monitorEventLoopDelay> | undefined
  private bucketEventLoopStart = this.eventLoopStart
  private bucketWindowStartedAt = this.startedAt
  private bucketTimer: ReturnType<typeof setInterval> | undefined
  private fileSinkEnabled = true
  private readonly allRenderRequests = new Map<string, number>()
  private windowRenderRequests = new Map<string, number>()
  private lastInputAt: number | undefined
  private inputs = 0
  private windowInputs = 0
  private snapshotCount = 0
  private windowSnapshots = 0
  private headerCount = 0
  private windowHeaders = 0
  private statusCount = 0
  private windowStatus = 0
  private writeCalls = 0
  private windowWriteCalls = 0
  private writeBytes = 0
  private windowWriteBytes = 0
  private backpressureSignals = 0
  private windowBackpressure = 0
  private drains = 0
  private windowDrains = 0
  private subscriptions = 0
  private finished = false

  constructor(
    enabled = process.env.SEEKTTY_TUI_PERF === '1',
    options: TuiPerformanceProbeOptions = {},
  ) {
    this.enabled = enabled
    this.nowFn = options.now ?? (() => performance.now())
    const random = options.random ?? Math.random
    this.allRenderDurations = new BoundedLatencySeries(random)
    this.allInputToWrite = new BoundedLatencySeries(random)
    this.windowRenderDurations = new BoundedLatencySeries(random)
    this.windowInputToWrite = new BoundedLatencySeries(random)
    this.bucketPath = explicitBucketPath(process.env.SEEKTTY_TUI_PERF_BUCKET_PATH)
    this.onBucket = options.onBucket
    if (enabled) this.eventLoop.enable()
    const interval = options.bucketIntervalMs
      ?? parsePerfBucketIntervalMs(process.env.SEEKTTY_TUI_PERF_BUCKET_MS)
    if (!enabled || interval === undefined) return
    this.bucketEventLoop = monitorEventLoopDelay({ resolution: 20 })
    this.bucketEventLoop.enable()
    this.bucketEventLoopStart = performance.eventLoopUtilization()
    this.bucketTimer = setInterval(() => { this.emitBucket() }, interval)
    this.bucketTimer.unref()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  markInput(): void {
    if (!this.enabled) return
    this.inputs += 1
    this.windowInputs += 1
    this.lastInputAt = this.nowFn()
  }

  markSnapshot(): void {
    if (!this.enabled) return
    this.snapshotCount += 1
    this.windowSnapshots += 1
  }

  markHeader(): void {
    if (!this.enabled) return
    this.headerCount += 1
    this.windowHeaders += 1
  }

  markStatus(): void {
    if (!this.enabled) return
    this.statusCount += 1
    this.windowStatus += 1
  }

  markRenderRequest(reason: string): void {
    if (!this.enabled) return
    this.windowRenderRequests.set(reason, (this.windowRenderRequests.get(reason) ?? 0) + 1)
  }

  measureRender<T>(render: () => T): T {
    if (!this.enabled) return render()
    const started = this.nowFn()
    try {
      return render()
    } finally {
      const duration = this.nowFn() - started
      this.windowRenderDurations.add(duration)
      this.allRenderDurations.add(duration)
    }
  }

  markWrite(data: string, backpressured: boolean): void {
    if (!this.enabled) return
    const bytes = Buffer.byteLength(data)
    this.writeCalls += 1
    this.windowWriteCalls += 1
    this.writeBytes += bytes
    this.windowWriteBytes += bytes
    if (backpressured) {
      this.backpressureSignals += 1
      this.windowBackpressure += 1
    }
    if (this.lastInputAt !== undefined) {
      const delta = this.nowFn() - this.lastInputAt
      this.windowInputToWrite.add(delta)
      this.allInputToWrite.add(delta)
      this.lastInputAt = undefined
    }
  }

  markDrain(): void {
    if (!this.enabled) return
    this.drains += 1
    this.windowDrains += 1
  }

  changeSubscriptions(delta: 1 | -1): void {
    if (this.enabled) this.subscriptions = Math.max(0, this.subscriptions + delta)
  }

  finish(): TuiPerformanceSnapshot | undefined {
    if (!this.enabled || this.finished) return undefined
    this.finished = true
    this.stopBucketTimer()
    this.eventLoop.disable()
    this.bucketEventLoop?.disable()
    this.foldWindowIntoTotals()
    return this.snapshot({
      durationMs: performance.now() - this.startedAt,
      inputEvents: this.inputs,
      snapshots: this.snapshotCount,
      headers: this.headerCount,
      status: this.statusCount,
      renderRequests: this.allRenderRequests,
      renderDurations: this.allRenderDurations,
      inputToWrite: this.allInputToWrite,
      writes: this.writeCalls,
      bytes: this.writeBytes,
      backpressure: this.backpressureSignals,
      drains: this.drains,
      histogram: this.eventLoop,
      utilizationSince: this.eventLoopStart,
    })
  }

  reportFinal(snapshot: TuiPerformanceSnapshot): void {
    if (!this.enabled) return
    this.writeDiagnosticSink({
      ...snapshot,
      kind: 'final',
      t: new Date().toISOString(),
    })
  }

  private emitBucket(): void {
    if (!this.enabled || this.finished || this.bucketEventLoop === undefined) return
    try {
      const snapshot: TuiPerformanceBucketSnapshot = {
        ...this.snapshot({
          durationMs: performance.now() - this.bucketWindowStartedAt,
          inputEvents: this.windowInputs,
          snapshots: this.windowSnapshots,
          headers: this.windowHeaders,
          status: this.windowStatus,
          renderRequests: this.windowRenderRequests,
          renderDurations: this.windowRenderDurations,
          inputToWrite: this.windowInputToWrite,
          writes: this.windowWriteCalls,
          bytes: this.windowWriteBytes,
          backpressure: this.windowBackpressure,
          drains: this.windowDrains,
          histogram: this.bucketEventLoop,
          utilizationSince: this.bucketEventLoopStart,
        }),
        kind: 'bucket',
        t: new Date().toISOString(),
      }
      try {
        if (this.onBucket !== undefined) this.onBucket(snapshot)
        else this.writeDiagnosticSink(snapshot)
      } catch {
        // User callbacks and sinks must not escape the timer.
      }
    } finally {
      if (!this.finished) {
        this.foldWindowIntoTotals()
        this.resetWindow()
      }
    }
  }

  private writeDiagnosticSink(record: TuiPerformanceBucketSnapshot | TuiPerformanceFinalSnapshot): void {
    if (this.bucketPath !== undefined) {
      if (!this.fileSinkEnabled) return
      try {
        appendFileSync(this.bucketPath, `${JSON.stringify(record)}\n`)
      } catch {
        this.fileSinkEnabled = false
      }
      return
    }
    if (process.stderr.isTTY) return
    try {
      process.stderr.write(`SEEKTTY_TUI_PERF ${JSON.stringify(record)}\n`)
    } catch {
      // Diagnostics must never break callers.
    }
  }

  private foldWindowIntoTotals(): void {
    mergeCounts(this.allRenderRequests, this.windowRenderRequests)
  }

  private resetWindow(): void {
    this.windowRenderRequests = new Map()
    this.windowRenderDurations.reset()
    this.windowInputToWrite.reset()
    this.windowInputs = 0
    this.windowSnapshots = 0
    this.windowHeaders = 0
    this.windowStatus = 0
    this.windowWriteCalls = 0
    this.windowWriteBytes = 0
    this.windowBackpressure = 0
    this.windowDrains = 0
    this.bucketEventLoop?.reset()
    this.bucketEventLoopStart = performance.eventLoopUtilization()
    this.bucketWindowStartedAt = performance.now()
  }

  private stopBucketTimer(): void {
    if (this.bucketTimer === undefined) return
    clearInterval(this.bucketTimer)
    this.bucketTimer = undefined
  }

  private snapshot(source: {
    readonly durationMs?: number
    readonly inputEvents: number
    readonly snapshots: number
    readonly headers: number
    readonly status: number
    readonly renderRequests: ReadonlyMap<string, number>
    readonly renderDurations: BoundedLatencySeries
    readonly inputToWrite: BoundedLatencySeries
    readonly writes: number
    readonly bytes: number
    readonly backpressure: number
    readonly drains: number
    readonly histogram: ReturnType<typeof monitorEventLoopDelay>
    readonly utilizationSince: ReturnType<typeof performance.eventLoopUtilization>
  }): TuiPerformanceSnapshot {
    const utilization = performance.eventLoopUtilization(source.utilizationSince).utilization
    return {
      schema: 1,
      durationMs: Number((source.durationMs ?? 0).toFixed(3)),
      inputEvents: source.inputEvents,
      snapshots: source.snapshots,
      refreshHeaderCalls: source.headers,
      updateStatusCalls: source.status,
      renderRequests: Object.fromEntries(source.renderRequests),
      renderDurationMs: source.renderDurations.summarize(),
      inputToWriteMs: source.inputToWrite.summarize(),
      terminalWrites: {
        calls: source.writes,
        bytes: source.bytes,
        backpressureSignals: source.backpressure,
        drains: source.drains,
      },
      eventLoop: {
        p99DelayMs: Number((source.histogram.percentile(99) / 1e6).toFixed(3)),
        utilization: Number(utilization.toFixed(6)),
      },
      memory: process.memoryUsage(),
      resource: process.resourceUsage(),
      lifecycle: {
        activeResourcesStart: this.activeResourcesStart,
        activeResourcesEnd: activeResources(),
        processListenersStart: this.processListenersStart,
        processListenersEnd: processListeners(),
        subscriptions: this.subscriptions,
      },
    }
  }
}
