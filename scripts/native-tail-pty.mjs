import { build } from 'tsdown'
import { spawn } from 'node-pty'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { aliases } from '../tsdown.config.ts'

await build({ config: false, entry: ['scripts/native-tail-probe.ts'], outDir: '.artifacts/native-probe',
  platform: 'node', format: 'esm', target: 'node22', alias: aliases,
  noExternal: [/@mariozechner\/pi-tui/, /@deepseek-ai\/.+/], clean: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const runs = []
const sizes = (process.env.SEEKTTY_PROBE_SIZES ?? '1000,10000,100000').split(',').map(Number)
const repeats = Number(process.env.SEEKTTY_PROBE_REPEATS ?? 5)
async function run(count, candidate) {
  const resultPath = resolve('.artifacts', `native-probe-${randomUUID()}.json`)
  const child = spawn(process.execPath, [resolve('.artifacts/native-probe/native-tail-probe.js')], {
    cwd: process.cwd(), cols: 100, rows: 32, name: 'xterm-256color',
    env: { ...process.env, SEEKTTY_PROBE_RESULT: resultPath, SEEKTTY_PROBE_LINES: String(count), SEEKTTY_NATIVE_TAIL: candidate ? '1' : '0', NO_COLOR: '1' },
  })
  let text = '', exited = false
  const markers = new Set()
  const listeners = new Set()
  child.onData(data => {
    text = (text + data).slice(-4096)
    for (const match of text.matchAll(/PROBE_READY|ECHO_\d{4}/g)) markers.add(match[0])
    for (const notify of listeners) notify()
  })
  child.onExit(() => { exited = true })
  const wait = async (predicate, limit = 30000) => {
    const deadline = Date.now() + limit
    while (!predicate()) {
      if (exited || Date.now() > deadline) throw new Error(`PTY probe failed (${count}/${candidate}): ${text.slice(-1000)}`)
      await sleep(5)
    }
  }
  const waitMarker = marker => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listeners.delete(check); reject(new Error(`Missing ${marker}: ${text.slice(-1000)}`)) }, 30000)
    const check = () => {
      if (!markers.has(marker)) return
      clearTimeout(timer); listeners.delete(check); resolve()
    }
    listeners.add(check); check()
  })
  try {
    await waitMarker('PROBE_READY')
    await sleep(500)
    child.write('s')
    const echo = []
    for (let i = 1; i <= 75; i++) {
      const start = performance.now()
      child.write('p')
      await waitMarker(`ECHO_${String(i).padStart(4, '0')}`)
      echo.push(performance.now() - start)
      await sleep(30)
    }
    child.write('q')
    await wait(() => existsSync(resultPath))
    const result = JSON.parse(readFileSync(resultPath, 'utf8'))
    for (let i = 0; !exited && i < 100; i++) await sleep(10)
    const sorted = [...echo].sort((a,b) => a-b)
    return { ...result, echoSamples: echo, echoMs: { p50: sorted[37], p95: sorted[71], max: sorted.at(-1) } }
  } finally { if (!exited) child.kill() }
}
for (let repeat = 0; repeat < repeats; repeat++) {
  for (const count of sizes) {
    for (const candidate of repeat % 2 === 0 ? [false, true] : [true, false]) {
      const result = await run(count, candidate)
      runs.push({ repeat, ...result })
      console.log(JSON.stringify({ repeat, count, candidate, echoMs: result.echoMs, drift: result.drift }))
    }
  }
}
mkdirSync('.artifacts', { recursive: true })
writeFileSync('.artifacts/native-tail-pty.json', JSON.stringify({ synthetic: true, platform: process.platform, node: process.version, runs }, null, 2))
process.exit(0)
