import { describe, expect, it, vi } from 'vitest'
import { instrumentTerminalWrites, TuiPerformanceProbe } from '../src/client/tui-performance.ts'

describe('content-free TUI performance probe', () => {
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
})
