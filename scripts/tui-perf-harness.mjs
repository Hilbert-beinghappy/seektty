#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const vitest = resolve(root, 'node_modules/vitest/vitest.mjs')
const test = resolve(root, 'tests/tui-performance.test.ts')
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
const positiveIntegers = (value, fallback) => {
  const parsed = (value ?? '').split(',').map(item => Number(item.trim()))
    .filter(item => Number.isInteger(item) && item > 0)
  return parsed.length === 0 ? fallback : parsed
}
const repeats = positiveIntegers(process.env.SEEKTTY_PERF_REPEATS, [3])[0] ?? 3
const sizes = positiveIntegers(process.env.SEEKTTY_PERF_SIZES, [1_000, 10_000, 50_000, 100_000])
const width = positiveIntegers(process.env.SEEKTTY_PERF_WIDTH, [80])[0] ?? 80
const rows = positiveIntegers(process.env.SEEKTTY_PERF_ROWS, [24])[0] ?? 24
const runs = []
let runtime

for (let repeat = 1; repeat <= repeats; repeat += 1) {
  for (const size of sizes) {
    const result = spawnSync(process.execPath, [
      '--expose-gc',
      vitest,
      'run',
      test,
      '--reporter=dot',
    ], {
      cwd: root,
      env: {
        ...process.env,
        NO_COLOR: '1',
        SEEKTTY_PERF_RUN: '1',
        SEEKTTY_PERF_COMMIT: commit,
        SEEKTTY_PERF_REPEAT_INDEX: String(repeat),
        SEEKTTY_PERF_REPEATS: '1',
        SEEKTTY_PERF_SIZES: String(size),
        SEEKTTY_PERF_WIDTH: String(width),
        SEEKTTY_PERF_ROWS: String(rows),
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) {
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
      process.exit(result.status ?? 1)
    }
    const match = result.stdout.match(/SEEKTTY_PERF_RESULT (\{[^\n]+\})/u)
    if (match?.[1] === undefined) {
      process.stderr.write(result.stdout)
      process.stderr.write('tui performance result marker was not emitted\n')
      process.exit(1)
    }
    const measured = JSON.parse(match[1])
    runtime ??= measured.runtime
    runs.push(...measured.runs)
  }
}

process.stdout.write(`${JSON.stringify({
  schema: 1,
  commit,
  runtime,
  fixture: {
    width,
    rows,
    linesPerNode: 100,
    cachedRenderSamples: 25,
    tailUpdateSamples: 10,
    repeats,
    sizes,
    processIsolation: 'one size/repeat per Vitest process',
  },
  runs,
}, null, 2)}\n`)
