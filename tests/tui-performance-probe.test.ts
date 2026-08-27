import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  instrumentTerminalWrites,
  parsePerfBucketIntervalMs,
  TuiPerformanceProbe,
  type TuiPerformanceBucketSnapshot,
} from '../src/client/tui-performance.ts'

const LATENCY_CAP = 4096
const tempDirs: string[] = []
const REAL_PROBE_SOURCE = fileURLToPath(new URL('../src/client/tui-performance.ts', import.meta.url))

function probeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'seektty-tui-perf-'))
  tempDirs.push(dir)
  return dir
}

function spawnWhitespaceUnsetProbe(modulePath: string, tempRoot: string) {
  const childCwd = join(tempRoot, 'child-cwd')
  mkdirSync(childCwd, { recursive: true })
  const scriptPath = join(tempRoot, 'whitespace-probe.mjs')
  writeFileSync(scriptPath, `const { TuiPerformanceProbe } = await import(${JSON.stringify(pathToFileURL(modulePath).href)})
const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 10 })
probe.markInput()
await new Promise((resolve) => { setTimeout(resolve, 50) })
const snapshot = probe.finish()
if (snapshot === undefined) throw new Error('expected snapshot')
probe.reportFinal(snapshot)
`)
  const env: NodeJS.ProcessEnv = {
    NODE_NO_WARNINGS: '1',
    SEEKTTY_TUI_PERF_BUCKET_PATH: '   ',
  }
  return {
    childCwd,
    result: spawnSync(process.execPath, ['--experimental-strip-types', scriptPath], {
      cwd: childCwd,
      encoding: 'utf8',
      env,
      timeout: 10_000,
    }),
  }
}

/** One-standard-error estimate sqrt(q(1-q)/n). Not a guaranteed rank bound. */
function rankStandardError(retained: number): { p95: number; p99: number } {
  return {
    p95: Number(Math.sqrt(0.95 * 0.05 / retained).toFixed(6)),
    p99: Number(Math.sqrt(0.99 * 0.01 / retained).toFixed(6)),
  }
}

function ceilRank(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

describe('content-free TUI performance probe', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stays inert unless explicitly enabled', () => {
    const probe = new TuiPerformanceProbe(false)
    probe.markInput()
    probe.markSnapshot()
    probe.markWrite('secret user text', false)
    expect(probe.finish()).toBeUndefined()
  })

  it('preserves terminal identity and listeners while disabled', () => {
    const terminal = { write: vi.fn() }
    const output = { writableNeedDrain: true, once: vi.fn(), off: vi.fn() }
    const measured = instrumentTerminalWrites(terminal, new TuiPerformanceProbe(false), output)

    expect(measured.terminal).toBe(terminal)
    measured.terminal.write('plain path')
    measured.release()
    expect(terminal.write).toHaveBeenCalledWith('plain path')
    expect(output.once).not.toHaveBeenCalled()
    expect(output.off).not.toHaveBeenCalled()
  })

  it('does not start a bucket timer when diagnostics are off even with an interval', () => {
    vi.useFakeTimers()
    const onBucket = vi.fn()
    const probe = new TuiPerformanceProbe(false, { bucketIntervalMs: 1_000, onBucket })
    vi.advanceTimersByTime(5_000)
    expect(onBucket).not.toHaveBeenCalled()
    expect(probe.finish()).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('parses the bucket interval as a positive integer only', () => {
    expect(parsePerfBucketIntervalMs(undefined)).toBeUndefined()
    expect(parsePerfBucketIntervalMs('')).toBeUndefined()
    expect(parsePerfBucketIntervalMs('abc')).toBeUndefined()
    expect(parsePerfBucketIntervalMs('0')).toBeUndefined()
    expect(parsePerfBucketIntervalMs('-5')).toBeUndefined()
    expect(parsePerfBucketIntervalMs('1.5')).toBeUndefined()
    expect(parsePerfBucketIntervalMs('1000')).toBe(1_000)
    expect(parsePerfBucketIntervalMs(' 2000 ')).toBe(2_000)
  })

  it('removes an enabled backpressure listener during cleanup', () => {
    const terminal = { write: vi.fn() }
    const output = { writableNeedDrain: true, once: vi.fn(), off: vi.fn() }
    const measured = instrumentTerminalWrites(terminal, new TuiPerformanceProbe(true), output)

    expect(measured.terminal).not.toBe(terminal)
    measured.terminal.write('measured path')
    expect(output.once).toHaveBeenCalledTimes(1)
    measured.release()
    expect(output.off).toHaveBeenCalledWith('drain', output.once.mock.calls[0]?.[1])
  })

  it('reports only aggregate counts and timings', () => {
    const probe = new TuiPerformanceProbe(true)
    probe.markInput()
    probe.markSnapshot()
    probe.markHeader()
    probe.markStatus()
    probe.markRenderRequest('input')
    probe.measureRender(() => undefined)
    probe.markWrite('sensitive payload', true)
    probe.markDrain()
    probe.changeSubscriptions(1)
    probe.changeSubscriptions(-1)

    const report = probe.finish()

    expect(report?.inputEvents).toBe(1)
    expect(report?.snapshots).toBe(1)
    expect(report?.terminalWrites).toMatchObject({ calls: 1, bytes: 17, backpressureSignals: 1, drains: 1 })
    expect(report?.renderRequests).toEqual({ input: 1 })
    expect(report?.lifecycle.subscriptions).toBe(0)
    expect(JSON.stringify(report)).not.toContain('sensitive')
  })

  it('emits timestamped buckets then resets window samples before the next interval', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T13:00:00.000Z'))
    const onBucket = vi.fn()
    const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000, onBucket })
    probe.markInput()
    vi.advanceTimersByTime(50)
    probe.measureRender(() => undefined)
    probe.markWrite('bucket-secret-text', false)
    vi.advanceTimersByTime(950)
    expect(onBucket).toHaveBeenCalledTimes(1)
    const first = onBucket.mock.calls[0]?.[0]
    expect(first?.kind).toBe('bucket')
    expect(first?.t).toBe('2026-08-26T13:00:01.000Z')
    expect(first?.inputToWriteMs.max).toBeGreaterThan(0)
    expect(JSON.stringify(first)).not.toContain('bucket-secret-text')

    vi.advanceTimersByTime(1_000)
    expect(onBucket).toHaveBeenCalledTimes(2)
    const second = onBucket.mock.calls[1]?.[0]
    expect(second?.inputToWriteMs.max).toBe(0)
    expect(second?.renderDurationMs.max).toBe(0)

    const report = probe.finish()
    expect(report).not.toHaveProperty('kind')
    expect(report?.inputEvents).toBe(1)
    expect(JSON.stringify(report)).not.toContain('bucket-secret-text')
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5_000)
    expect(onBucket).toHaveBeenCalledTimes(2)
  })

  it('starts exactly one unrefed bucket timer and clears it on finish', () => {
    vi.useFakeTimers()
    const onBucket = vi.fn()
    const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 5_000, onBucket })
    expect(vi.getTimerCount()).toBe(1)
    probe.finish()
    expect(vi.getTimerCount()).toBe(0)
    expect(onBucket).not.toHaveBeenCalled()
  })

  it('keeps exact ceil-rank percentiles when a series has at most 4096 samples', () => {
    let now = 0
    const probe = new TuiPerformanceProbe(true, {
      now: () => now,
      random: () => 0,
    })
    const durations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for (const duration of durations) {
      now = 0
      probe.measureRender(() => {
        now = duration
      })
    }
    const report = probe.finish()
    expect(report?.renderDurationMs).toMatchObject({
      p50: ceilRank(durations, 0.5),
      p95: ceilRank(durations, 0.95),
      p99: ceilRank(durations, 0.99),
      max: 10,
      count: 10,
      retained: 10,
      approximate: false,
    })
    expect(report?.renderDurationMs).not.toHaveProperty('rankBound')
    expect(report?.renderDurationMs).not.toHaveProperty('rankStandardError')
    expect(report?.renderDurationMs).not.toHaveProperty('confidence')
    expect(report?.renderDurationMs).not.toHaveProperty('confidenceLevel')
  })

  it('bounds retained latency storage at 4096 while keeping exact count and max', () => {
    let now = 0
    const probe = new TuiPerformanceProbe(true, {
      now: () => now,
      random: () => 0,
    })
    let report: ReturnType<TuiPerformanceProbe['finish']>
    expect(() => {
      for (let index = 0; index < 130_000; index += 1) {
        now = 0
        probe.measureRender(() => {
          now = index + 1
        })
      }
      report = probe.finish()
    }).not.toThrow()
    const standardError = rankStandardError(LATENCY_CAP)
    expect(report?.renderDurationMs.count).toBe(130_000)
    expect(report?.renderDurationMs.retained).toBe(LATENCY_CAP)
    expect(report?.renderDurationMs.retained).toBeLessThanOrEqual(LATENCY_CAP)
    expect(report?.renderDurationMs.max).toBe(130_000)
    expect(report?.renderDurationMs.approximate).toBe(true)
    expect(report?.renderDurationMs.probabilistic).toBe(true)
    expect(report?.renderDurationMs.rankStandardError).toEqual(standardError)
    expect(report?.renderDurationMs).not.toHaveProperty('rankBound')
    expect(report?.renderDurationMs).not.toHaveProperty('confidence')
    expect(report?.renderDurationMs).not.toHaveProperty('confidenceLevel')
    expect(report?.inputToWriteMs.count).toBe(0)
    expect(report?.inputToWriteMs.retained).toBe(0)
  })

  it('resets the bucket window when onBucket throws and does not let the error escape', () => {
    vi.useFakeTimers()
    const onBucket = vi.fn((_snapshot: TuiPerformanceBucketSnapshot) => {
      throw new Error('bucket-callback-boom')
    })
    const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000, onBucket })
    probe.markInput()
    probe.markWrite('x', false)
    expect(() => vi.advanceTimersByTime(1_000)).not.toThrow()
    expect(onBucket).toHaveBeenCalledTimes(1)
    probe.measureRender(() => undefined)
    expect(() => vi.advanceTimersByTime(1_000)).not.toThrow()
    expect(onBucket).toHaveBeenCalledTimes(2)
    const second = onBucket.mock.calls[1]?.[0]
    expect(second?.inputEvents).toBe(0)
    expect(second?.renderDurationMs.count).toBe(1)
    expect(probe.finish()?.inputEvents).toBe(1)
  })

  it('emits nothing to a TTY stderr when no explicit bucket path is set', () => {
    vi.useFakeTimers()
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true })
    try {
      const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000 })
      probe.markInput()
      vi.advanceTimersByTime(1_000)
      probe.finish()
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('appends bucket JSONL only to an explicit path and never falls back to stdio', () => {
    vi.useFakeTimers()
    const bucketPath = join(probeTempDir(), 'buckets.jsonl')
    vi.stubEnv('SEEKTTY_TUI_PERF_BUCKET_PATH', bucketPath)
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true })
    try {
      const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000 })
      probe.markInput()
      vi.advanceTimersByTime(1_000)
      probe.markHeader()
      vi.advanceTimersByTime(1_000)
      probe.finish()
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    const body = readFileSync(bucketPath, 'utf8')
    const lines = body.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines.every(line => !line.startsWith('SEEKTTY_TUI_PERF'))).toBe(true)
    expect(JSON.parse(lines[0]!).kind).toBe('bucket')
    expect(JSON.parse(lines[1]!).kind).toBe('bucket')
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('disables a failing explicit path sink without crashing the TUI or falling back to stdio', () => {
    vi.useFakeTimers()
    const failingDir = join(probeTempDir(), 'missing-bucket-parent')
    const failingPath = join(failingDir, 'buckets.jsonl')
    expect(existsSync(failingDir)).toBe(false)
    vi.stubEnv('SEEKTTY_TUI_PERF_BUCKET_PATH', failingPath)
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000 })
      probe.markInput()
      expect(() => vi.advanceTimersByTime(1_000)).not.toThrow()
      probe.measureRender(() => undefined)
      expect(() => vi.advanceTimersByTime(1_000)).not.toThrow()
      expect(probe.finish()?.inputEvents).toBe(1)
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
    }
    expect(existsSync(failingDir)).toBe(false)
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('treats a whitespace-only bucket path as unset', () => {
    const { childCwd, result } = spawnWhitespaceUnsetProbe(REAL_PROBE_SOURCE, probeTempDir())
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    const lines = result.stderr.split('\n').filter(line => line.length > 0)
    expect(lines.every(line => line.startsWith('SEEKTTY_TUI_PERF '))).toBe(true)
    const records = lines.map(line => JSON.parse(line.slice('SEEKTTY_TUI_PERF '.length)) as { kind: string })
    expect(records.filter(record => record.kind === 'bucket').length).toBeGreaterThanOrEqual(1)
    expect(records.filter(record => record.kind === 'final')).toHaveLength(1)
    expect(existsSync(join(childCwd, '   '))).toBe(false)
  })

  it('writes one kind-final JSONL record only from reportFinal, never from finish', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T14:00:00.000Z'))
    const bucketPath = join(probeTempDir(), 'final.jsonl')
    vi.stubEnv('SEEKTTY_TUI_PERF_BUCKET_PATH', bucketPath)
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true })
    try {
      const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000 })
      probe.markInput()
      vi.advanceTimersByTime(1_000)
      const afterBucket = readFileSync(bucketPath, 'utf8').trim().split('\n')
      expect(afterBucket).toHaveLength(1)
      expect(JSON.parse(afterBucket[0]!).kind).toBe('bucket')
      const snapshot = probe.finish()
      expect(readFileSync(bucketPath, 'utf8').trim().split('\n')).toHaveLength(1)
      probe.reportFinal(snapshot!)
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    const lines = readFileSync(bucketPath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).kind).toBe('bucket')
    expect(JSON.parse(lines[1]!).kind).toBe('final')
    expect(lines.every(line => !line.startsWith('SEEKTTY_TUI_PERF'))).toBe(true)
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('emits nothing from reportFinal to a TTY when no path is set', () => {
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true })
    try {
      const probe = new TuiPerformanceProbe(true)
      probe.markInput()
      probe.reportFinal(probe.finish()!)
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('keeps a failed bucket file sink disabled for reportFinal without stdio fallback', () => {
    vi.useFakeTimers()
    const failingDir = join(probeTempDir(), 'missing-bucket-parent')
    const failingPath = join(failingDir, 'buckets.jsonl')
    expect(existsSync(failingDir)).toBe(false)
    vi.stubEnv('SEEKTTY_TUI_PERF_BUCKET_PATH', failingPath)
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000 })
      probe.markInput()
      expect(() => vi.advanceTimersByTime(1_000)).not.toThrow()
      const snapshot = probe.finish()
      expect(() => probe.reportFinal(snapshot!)).not.toThrow()
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
    }
    expect(existsSync(failingDir)).toBe(false)
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('prefixes a non-TTY stderr final record only when no path is set', () => {
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: false })
    try {
      const probe = new TuiPerformanceProbe(true)
      probe.markInput()
      probe.reportFinal(probe.finish()!)
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    const text = stderrChunks.join('')
    expect(text.startsWith('SEEKTTY_TUI_PERF ')).toBe(true)
    expect(JSON.parse(text.slice('SEEKTTY_TUI_PERF '.length)).kind).toBe('final')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('does not let reportFinal throw when non-TTY stderr.write fails', () => {
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = (() => {
      throw new Error('stderr-boom')
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: false })
    try {
      const probe = new TuiPerformanceProbe(true)
      probe.markInput()
      const snapshot = probe.finish()
      expect(snapshot).toBeDefined()
      expect(() => probe.reportFinal(snapshot!)).not.toThrow()
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('trims leading and trailing whitespace on an explicit bucket path', () => {
    vi.useFakeTimers()
    const intended = join(probeTempDir(), 'trimmed-path.jsonl')
    const padded = `  ${intended}  `
    vi.stubEnv('SEEKTTY_TUI_PERF_BUCKET_PATH', padded)
    const stderrChunks: string[] = []
    const stdoutChunks: string[] = []
    const stderrWrite = process.stderr.write.bind(process.stderr)
    const stdoutWrite = process.stdout.write.bind(process.stdout)
    const stderrIsTTY = process.stderr.isTTY
    process.stderr.write = ((chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }) as typeof process.stderr.write
    process.stdout.write = ((chunk: unknown) => {
      stdoutChunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true })
    try {
      const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000 })
      probe.markInput()
      vi.advanceTimersByTime(1_000)
      probe.reportFinal(probe.finish()!)
    } finally {
      process.stderr.write = stderrWrite
      process.stdout.write = stdoutWrite
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: stderrIsTTY })
    }
    expect(existsSync(intended)).toBe(true)
    const lines = readFileSync(intended, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!).kind).toBe('bucket')
    expect(JSON.parse(lines[1]!).kind).toBe('final')
    expect(stderrChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
    expect(stdoutChunks.join('')).not.toContain('SEEKTTY_TUI_PERF')
  })

  it('counts renderRequests once when onBucket calls finish and does not emit a second bucket', () => {
    vi.useFakeTimers()
    let probe!: TuiPerformanceProbe
    let fromCallback: ReturnType<TuiPerformanceProbe['finish']>
    const onBucket = vi.fn(() => {
      fromCallback = probe.finish()
    })
    probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000, onBucket })
    probe.markRenderRequest('normal')
    probe.markRenderRequest('normal')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1_000)
    expect(onBucket).toHaveBeenCalledTimes(1)
    expect(fromCallback?.renderRequests).toEqual({ normal: 2 })
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5_000)
    expect(onBucket).toHaveBeenCalledTimes(1)
    expect(probe.finish()).toBeUndefined()
  })

  it('still folds the leftover tail window when finish runs outside a bucket callback', () => {
    vi.useFakeTimers()
    const onBucket = vi.fn()
    const probe = new TuiPerformanceProbe(true, { bucketIntervalMs: 1_000, onBucket })
    probe.markRenderRequest('input')
    vi.advanceTimersByTime(1_000)
    expect(onBucket.mock.calls[0]?.[0]?.renderRequests).toEqual({ input: 1 })
    probe.markRenderRequest('resize')
    const report = probe.finish()
    expect(report?.renderRequests).toEqual({ input: 1, resize: 1 })
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5_000)
    expect(onBucket).toHaveBeenCalledTimes(1)
  })

  it('rejects NaN, Infinity, and negative durations on both latency series while keeping a valid zero', () => {
    let now = 0
    const probe = new TuiPerformanceProbe(true, { now: () => now })
    now = 0
    probe.measureRender(() => {
      now = Number.NaN
    })
    now = 0
    probe.measureRender(() => {
      now = Number.POSITIVE_INFINITY
    })
    now = 10
    probe.measureRender(() => {
      now = 3
    })
    now = 4
    probe.measureRender(() => {
      now = 4
    })
    now = 1
    probe.markInput()
    now = Number.NaN
    probe.markWrite('x', false)
    now = 2
    probe.markInput()
    now = Number.POSITIVE_INFINITY
    probe.markWrite('x', false)
    now = 10
    probe.markInput()
    now = 4
    probe.markWrite('x', false)
    now = 8
    probe.markInput()
    now = 8
    probe.markWrite('x', false)
    const report = probe.finish()
    expect(report?.renderDurationMs).toMatchObject({
      count: 1,
      retained: 1,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      approximate: false,
    })
    expect(report?.inputToWriteMs).toMatchObject({
      count: 1,
      retained: 1,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      approximate: false,
    })
    expect(report?.inputEvents).toBe(4)
    expect(report?.terminalWrites.calls).toBe(4)
  })
})
