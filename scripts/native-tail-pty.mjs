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
  child.onData(data => { text += data })
  child.onExit(() => { exited = true })
  const wait = async (predicate, limit = 30000) => {
    const deadline = Date.now() + limit
    while (!predicate()) {
      if (exited || Date.now() > deadline) throw new Error(`PTY probe failed (${count}/${candidate}): ${text.slice(-1000)}`)
      await sleep(5)
    }
  }
  try {
    await wait(() => text.includes('PROBE_READY'))
    await sleep(500)
    child.write('s')
    const echo = []
    for (let i = 1; i <= 25; i++) {
      const start = performance.now()
      child.write('p')
      await wait(() => text.includes(`ECHO_${String(i).padStart(4, '0')}`))
      echo.push(performance.now() - start)
      await sleep(30)
    }
    child.write('q')
    await wait(() => existsSync(resultPath))
    const result = JSON.parse(readFileSync(resultPath, 'utf8'))
    for (let i = 0; !exited && i < 100; i++) await sleep(10)
    echo.sort((a,b) => a-b)
    return { ...result, echoMs: { p50: echo[12], p95: echo[23], max: echo.at(-1) } }
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
