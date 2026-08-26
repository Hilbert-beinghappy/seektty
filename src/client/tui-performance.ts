import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

const PROCESS_EVENTS = ['uncaughtException', 'unhandledRejection', 'SIGINT', 'SIGTERM', 'SIGHUP'] as const

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function latencySummary(values: readonly number[]): { p50: number; p95: number; p99: number; max: number } {
  const rounded = (value: number): number => Number(value.toFixed(3))
  return {
    p50: rounded(percentile(values, 0.5)),
    p95: rounded(percentile(values, 0.95)),
    p99: rounded(percentile(values, 0.99)),
    max: rounded(Math.max(0, ...values)),
  }
}

function activeResources(): number {
  return typeof process.getActiveResourcesInfo === 'function' ? process.getActiveResourcesInfo().length : 0
}

function processListeners(): number {
  return PROCESS_EVENTS.reduce((sum, event) => sum + process.listenerCount(event), 0)
}

export interface TuiPerformanceSnapshot {
  readonly schema: 1
  readonly durationMs: number
  readonly inputEvents: number
  readonly snapshots: number
  readonly refreshHeaderCalls: number
  readonly updateStatusCalls: number
  readonly renderRequests: Readonly<Record<string, number>>
  readonly renderDurationMs: { p50: number; p95: number; p99: number; max: number }
  readonly inputToWriteMs: { p50: number; p95: number; p99: number; max: number }
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
  private readonly startedAt = performance.now()
  private readonly eventLoop = monitorEventLoopDelay({ resolution: 20 })
  private readonly eventLoopStart = performance.eventLoopUtilization()
  private readonly activeResourcesStart = activeResources()
  private readonly processListenersStart = processListeners()
  private readonly renderRequests = new Map<string, number>()
  private readonly renderDurations: number[] = []
  private readonly inputToWrite: number[] = []
  private lastInputAt: number | undefined
  private inputs = 0
  private snapshotCount = 0
  private headerCount = 0
  private statusCount = 0
  private writeCalls = 0
  private writeBytes = 0
  private backpressureSignals = 0
  private drains = 0
  private subscriptions = 0
  private finished = false

  constructor(enabled = process.env.SEEKTTY_TUI_PERF === '1') {
    this.enabled = enabled
    if (enabled) this.eventLoop.enable()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  markInput(): void {
    if (!this.enabled) return
    this.inputs += 1
    this.lastInputAt = performance.now()
  }

  markSnapshot(): void {
    if (this.enabled) this.snapshotCount += 1
  }

  markHeader(): void {
    if (this.enabled) this.headerCount += 1
  }

  markStatus(): void {
    if (this.enabled) this.statusCount += 1
  }

  markRenderRequest(reason: string): void {
    if (!this.enabled) return
    this.renderRequests.set(reason, (this.renderRequests.get(reason) ?? 0) + 1)
  }

  measureRender<T>(render: () => T): T {
    if (!this.enabled) return render()
    const started = performance.now()
    try {
      return render()
    } finally {
      this.renderDurations.push(performance.now() - started)
    }
  }

  markWrite(data: string, backpressured: boolean): void {
    if (!this.enabled) return
    this.writeCalls += 1
    this.writeBytes += Buffer.byteLength(data)
    if (backpressured) this.backpressureSignals += 1
    if (this.lastInputAt !== undefined) {
      this.inputToWrite.push(performance.now() - this.lastInputAt)
      this.lastInputAt = undefined
    }
  }

  markDrain(): void {
    if (this.enabled) this.drains += 1
  }

  changeSubscriptions(delta: 1 | -1): void {
    if (this.enabled) this.subscriptions = Math.max(0, this.subscriptions + delta)
  }

  finish(): TuiPerformanceSnapshot | undefined {
    if (!this.enabled || this.finished) return undefined
    this.finished = true
    this.eventLoop.disable()
    const utilization = performance.eventLoopUtilization(this.eventLoopStart).utilization
    return {
      schema: 1,
      durationMs: Number((performance.now() - this.startedAt).toFixed(3)),
      inputEvents: this.inputs,
      snapshots: this.snapshotCount,
      refreshHeaderCalls: this.headerCount,
      updateStatusCalls: this.statusCount,
      renderRequests: Object.fromEntries(this.renderRequests),
      renderDurationMs: latencySummary(this.renderDurations),
      inputToWriteMs: latencySummary(this.inputToWrite),
      terminalWrites: {
        calls: this.writeCalls,
        bytes: this.writeBytes,
        backpressureSignals: this.backpressureSignals,
        drains: this.drains,
      },
      eventLoop: {
        p99DelayMs: Number((this.eventLoop.percentile(99) / 1e6).toFixed(3)),
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
