/** Synthetic PTY fixture: no Host, credentials, persisted Session or model call. */
import { ProcessTerminal, TUI } from '@mariozechner/pi-tui'
import { Transcript, internals } from '../src/client/transcript.ts'
import { NativeOutput, streamSink } from '../src/client/native-output.ts'
import type { ManagedTerminal } from '../src/client/terminal-session.ts'
import { welcomeAssistant, welcomeSnapshot } from '../tests/helpers/welcome-fixture.ts'
import { CanvasLineCache } from '../src/client/canvas-line-cache.ts'
import { writeFileSync } from 'node:fs'

const count = Number(process.env.SEEKTTY_PROBE_LINES ?? 1000)
const candidate = process.env.SEEKTTY_NATIVE_TAIL === '1'
const terminal = new ProcessTerminal() as ProcessTerminal & ManagedTerminal
terminal.__seekttyManagedAlternateScreen = false
const output = new NativeOutput(streamSink(process.stdout), error => { throw error })
if (candidate) terminal.__seekttyWrite = bytes => { output.control(bytes) }
const tui = new TUI(terminal, false)
const transcript = new Transcript(() => 24, () => tui.requestRender())
transcript.setNativeMode(true); transcript.setNativeTailEnabled(candidate)
const history = Array.from({ length: Math.ceil(count / 100) }, (_, i) => welcomeAssistant(`h${i}`, Array.from({ length: Math.min(100, count - i * 100) }, (_, j) => `H${i * 100 + j}`).join('\n'), 'settled', i + 1))
let iteration = 0, input = 0, closing = false, writing = false, again = false
const snapshotMs: number[] = [], frameMs: number[] = [], drift: number[] = []
const canvas = new CanvasLineCache(), historyCanvas = new CanvasLineCache()
const update = (): void => {
  const start = performance.now()
  transcript.update(welcomeSnapshot([...history, welcomeAssistant('live', `ACTIVE ${iteration} 中文😀`, 'running', history.length + 1)]))
  snapshotMs.push(performance.now() - start)
}
update()
const component = { focused: true, invalidate() {}, handleInput(data: string) {
  if (data.includes('p')) { input++; tui.requestRender() }
}, render(width: number) {
  const start = performance.now()
  const tail = transcript.render(width)
  const ready = candidate && transcript.nativeHistoryPending() ? 'PROBE_LOADING' : 'PROBE_READY'
  const result = canvas.render([...tail, `ECHO_${String(input).padStart(4, '0')}`, ready], width)
  frameMs.push(performance.now() - start)
  return result
} }
tui.addChild(component)
tui.setFocus(component)
if (candidate) terminal.__seekttyNativeFrame = (lines, cursor, width, height) => {
  if (writing) { again = true; return true }
  const batch = transcript.takeNativeHistoryBatch()
  writing = true
  void output.frame(historyCanvas.render(batch?.lines ?? [], width), lines, width, height, cursor).then(success => {
    writing = false
    if (!success || closing) return
    batch?.acknowledge()
    if (again) { again = false; tui.requestRender() }
  })
  return true
}
const summary = (values: number[]) => {
  const sorted = [...values].sort((a,b) => a-b)
  return { p50: sorted[Math.floor(sorted.length * .5)] ?? 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0, max: Math.max(0, ...values) }
}
let ticks: ReturnType<typeof setInterval> | undefined, clock: ReturnType<typeof setInterval> | undefined
let started = false
tui.addInputListener(data => {
  if (data.includes('p')) return undefined
  if (data.includes('s') && !started) {
    started = true; snapshotMs.length = 0; frameMs.length = 0
    let last = performance.now()
    clock = setInterval(() => { const now = performance.now(); drift.push(Math.max(0, now - last - 10)); last = now }, 10)
    ticks = setInterval(() => { iteration++; update(); tui.requestRender() }, 25)
  }
  if (data.includes('q') && !closing) {
    closing = true; clearInterval(ticks); clearInterval(clock)
    ;(tui as unknown as { stopRenderingSync(): void }).stopRenderingSync()
    void output.drain().then(() => {
      transcript.dispose(); tui.stop()
      return output.drain()
    }).then(() => {
      writeFileSync(process.env.SEEKTTY_PROBE_RESULT!, JSON.stringify({ candidate, count, snapshotMs: summary(snapshotMs), frameMs: summary(frameMs), drift: summary(drift), memory: process.memoryUsage(), counters: internals }))
      process.exit(0)
    })
  }
  return { consume: true }
})
tui.start()
