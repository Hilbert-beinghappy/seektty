#!/usr/bin/env node

import crossSpawn from 'cross-spawn'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const dsh = process.env.DSH_BIN?.trim()
const pluginSpec = process.env.SEEKTTY_SPEC?.trim()
const spawnSync = crossSpawn.sync

if (!dsh || !pluginSpec) {
  process.stderr.write('用法：DSH_BIN=/path/to/dsh SEEKTTY_SPEC=/path/to/seektty.tgz pnpm test:stock\n')
  process.exit(2)
}

const home = mkdtempSync(join(tmpdir(), 'seektty-stock-cycle-'))
const environment = { ...process.env, DSH_HOME: home }

function run(args) {
  const result = spawnSync(resolve(dsh), args, {
    env: environment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`dsh ${args.join(' ')} 退出码 ${result.status}\n${result.stdout}\n${result.stderr}`)
  }
  return `${result.stdout}${result.stderr}`
}

function profileManifest() {
  return JSON.parse(readFileSync(join(home, 'profiles', 'tui', 'package.json'), 'utf8'))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  run(['plugin', '--profile', 'tui', 'add', pluginSpec])
  let manifest = profileManifest()
  assert(manifest.dependencies?.seektty !== undefined, 'add 后 Profile 缺少 seektty 依赖')
  assert(manifest.dsh?.profile?.bundles?.includes('seektty'), 'add 后 Bundle 未进入 Profile')

  let dump = run(['--profile', 'tui', '--dump-config'])
  assert(dump.includes('id: tui-runner') && dump.includes('name: seektty'), 'add 后 dump-config 未挂载 TUI entry')
  assert(run(['--profile', 'tui', '--help']).includes('Usage: deepseek'), 'TUI Bundle 无法由 stock dsh 加载')

  run(['plugin', '--profile', 'tui', 'remove', 'seektty'])
  manifest = profileManifest()
  assert(manifest.dependencies?.seektty === undefined, 'remove 后仍存在 seektty 依赖')
  assert(!manifest.dsh?.profile?.bundles?.includes('seektty'), 'remove 后 Bundle 仍在 Profile')
  dump = run(['--profile', 'tui', '--dump-config'])
  assert(!dump.includes('seektty'), 'remove 后 dump-config 仍包含 TUI entry')

  run(['plugin', '--profile', 'tui', 'add', pluginSpec])
  assert(run(['--profile', 'tui', '--help']).includes('Usage: deepseek'), 're-add 后 TUI Bundle 无法加载')
  process.stdout.write(`stock dsh 插拔契约通过：${home}\n`)
} finally {
  rmSync(home, { recursive: true, force: true })
}
