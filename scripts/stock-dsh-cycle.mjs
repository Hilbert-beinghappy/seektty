#!/usr/bin/env node

import crossSpawn from 'cross-spawn'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { verifyStockDsh } from './stock-dsh-version.mjs'

const dsh = process.env.DSH_BIN?.trim()
const pluginSpec = process.env.SEEKTTY_SPEC?.trim()
const spawnSync = crossSpawn.sync
const pnpmGvsFlag = '--config.enable-global-virtual-store=false'

if (!dsh || !pluginSpec) {
  process.stderr.write('用法：DSH_BIN=/path/to/dsh SEEKTTY_SPEC=/path/to/seektty.tgz pnpm test:stock\n')
  process.exit(2)
}

// Reject a CLI whose caret dependencies drifted to another prerelease before
// installing the candidate or claiming an exact-version lifecycle pass.
const stock = verifyStockDsh(dsh)
process.stdout.write(`Verified official dsh ${stock.version}: ${stock.packageCount} exact dsh packages\n`)

const home = mkdtempSync(join(tmpdir(), 'seektty-stock-cycle-'))
const packedRoot = mkdtempSync(join(tmpdir(), 'seektty-packed-launcher-'))
const launcherHome = mkdtempSync(join(tmpdir(), 'seektty-launcher-home-'))
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

function assertFullBootReachesTui() {
  const result = spawnSync(resolve(dsh), ['--profile', 'tui'], {
    env: environment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  const output = `${result.stdout}${result.stderr}`
  assert(!output.includes('plugin tree failed to load'), `完整 boot 在插件树失败：\n${output}`)
  assert(output.includes('TTY') && output.includes('headless'), `完整 boot 未到达 SeekTTY 非交互边界：\n${output}`)
}

function profileManifest() {
  return JSON.parse(readFileSync(join(home, 'profiles', 'tui', 'package.json'), 'utf8'))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertPackedLauncher() {
  writeFileSync(join(packedRoot, 'package.json'), JSON.stringify({ private: true }))
  const install = spawnSync('pnpm', [
    'add',
    pnpmGvsFlag,
    '--dir', packedRoot,
    '--prod',
    '--ignore-scripts',
    '--config.auto-install-peers=false',
    pluginSpec,
  ], {
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (install.error) throw install.error
  assert(install.status === 0, `packed launcher 隔离安装失败：\n${install.stdout}\n${install.stderr}`)

  const installedScope = join(packedRoot, 'node_modules', '@deepseek-ai')
  const installedHostPackages = existsSync(installedScope) ? readdirSync(installedScope).sort() : []
  assert(
    installedHostPackages.length === 0,
    `packed launcher 不得携带官方 Host 包：${installedHostPackages.join(', ')}`,
  )

  const launcher = join(packedRoot, 'node_modules', '.bin', 'deepseek')
  const launcherEnvironment = {
    ...process.env,
    DSH_BIN: resolve(dsh),
    DSH_HOME: launcherHome,
    SEEKTTY_SPEC: pluginSpec,
    SEEKTTY_UPDATE: 'off',
  }
  const version = spawnSync(launcher, ['--version'], {
    env: launcherEnvironment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (version.error) throw version.error
  const versionOutput = `${version.stdout}${version.stderr}`
  assert(version.status === 0 && versionOutput.includes('seektty'), `packed deepseek --version 失败：\n${versionOutput}`)

  const launch = spawnSync(launcher, [], {
    env: launcherEnvironment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (launch.error) throw launch.error
  const output = `${launch.stdout}${launch.stderr}`
  assert(
    !/ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/u.test(output),
    `packed deepseek 存在外部模块缺失：\n${output}`,
  )
  assert(!output.includes('plugin tree failed to load'), `packed deepseek 在插件树失败：\n${output}`)
  assert(output.includes('TTY') && output.includes('headless'), `packed deepseek 未到达 SeekTTY 非交互边界：\n${output}`)
}

function assertOfficialModuleIdentity() {
  const profileModules = join(home, 'profiles', 'tui', 'node_modules')
  const profileScope = join(profileModules, '@deepseek-ai')
  const shadowed = existsSync(profileScope) ? readdirSync(profileScope).sort() : []
  assert(
    shadowed.length === 0,
    `SeekTTY 不得把官方 Host 包物理安装进 Profile：${shadowed.join(', ')}`,
  )

  // Node follows the installed package's real path into pnpm's virtual store.
  // Probe from that same directory, not the lexical node_modules symlink path.
  const probe = join(realpathSync(join(profileModules, 'seektty')), 'identity-probe.mjs')
  const overlay = join(home, 'identity-probe.patch.yml')
  const names = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-api-session-controller']
  const officialRequire = createRequire(stock.entry)
  const expected = Object.fromEntries(names.map(name => [name, realpathSync(officialRequire.resolve(name))]))
  writeFileSync(probe, `
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Service } from '@deepseek-ai/cordis';
import { SessionStore } from '@deepseek-ai/dsh-session';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { SessionController } from '@deepseek-ai/dsh-api-session-controller';
export const inject = ['sessions', 'tools', 'sessionController'];
export function apply(ctx) {
  if (!(ctx.sessions instanceof SessionStore) || !(ctx.tools instanceof ToolRuntime)
    || !(ctx.sessionController instanceof SessionController) || !(ctx.sessionController instanceof Service)) {
    throw new Error('Official Host service identity split');
  }
  const actual = Object.fromEntries(${JSON.stringify(names)}.map(name => [name, realpathSync(fileURLToPath(import.meta.resolve(name)))]));
  if (JSON.stringify(actual) !== ${JSON.stringify(JSON.stringify(expected))}) throw new Error('Official Host resolution identity split: ' + JSON.stringify(actual));
  console.log('SEEKTTY_OFFICIAL_IDENTITY_OK');
}
`)
  writeFileSync(overlay, `- insert:\n    - id: seektty-identity-probe\n      name: ${JSON.stringify(probe)}\n`)
  const result = spawnSync(resolve(dsh), ['--profile', 'tui', '--patch', overlay], {
    env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
  })
  if (result.error) throw result.error
  const output = `${result.stdout}${result.stderr}`
  assert(output.includes('SEEKTTY_OFFICIAL_IDENTITY_OK'), `官方加载器内模块身份验证失败：\n${output}`)
  assert(!output.includes('plugin tree failed to load'), `身份探针启动失败：\n${output}`)

}

async function assertNativePreparationWorker() {
  const worker = new Worker(join(home, 'profiles', 'tui', 'node_modules', 'seektty', 'lib', 'native-markdown-worker.js'))
  let timeout
  try {
    const page = await new Promise((resolvePage, reject) => {
      timeout = setTimeout(() => reject(new Error('Packed native worker did not respond')), 30000)
      worker.once('error', reject)
      worker.once('exit', code => reject(new Error(`Packed native worker exited: ${code}`)))
      worker.once('message', resolvePage)
      worker.postMessage({ next: true })
    })
    assert(page.done === true && page.total === 0 && page.lines.length === 0, 'Packed native worker protocol failed')
  } finally { clearTimeout(timeout); await worker.terminate() }
}

try {
  assertPackedLauncher()
  run(['plugin', '--profile', 'tui', 'add', pnpmGvsFlag, pluginSpec])
  let manifest = profileManifest()
  assert(manifest.dependencies?.seektty !== undefined, 'add 后 Profile 缺少 seektty 依赖')
  assert(manifest.dsh?.profile?.bundles?.includes('seektty'), 'add 后 Bundle 未进入 Profile')

  let dump = run(['--profile', 'tui', '--dump-config'])
  assert(dump.includes('id: tui-runner') && dump.includes('name: seektty'), 'add 后 dump-config 未挂载 TUI entry')
  assertOfficialModuleIdentity()
  await assertNativePreparationWorker()
  assert(run(['--profile', 'tui', '--help']).includes('Usage: deepseek'), 'TUI Bundle 无法由 stock dsh 加载')
  assertFullBootReachesTui()

  run(['plugin', '--profile', 'tui', 'remove', pnpmGvsFlag, 'seektty'])
  manifest = profileManifest()
  assert(manifest.dependencies?.seektty === undefined, 'remove 后仍存在 seektty 依赖')
  assert(!manifest.dsh?.profile?.bundles?.includes('seektty'), 'remove 后 Bundle 仍在 Profile')
  dump = run(['--profile', 'tui', '--dump-config'])
  assert(!dump.includes('seektty'), 'remove 后 dump-config 仍包含 TUI entry')

  run(['plugin', '--profile', 'tui', 'add', pnpmGvsFlag, pluginSpec])
  const help = run(['--profile', 'tui', '--help'])
  assertOfficialModuleIdentity()
  await assertNativePreparationWorker()
  assert(help.includes('Usage: deepseek'), 're-add 后 TUI Bundle 无法加载')
  assertFullBootReachesTui()
  process.stdout.write(`stock dsh 插拔契约通过：${home}\n`)
} finally {
  rmSync(home, { recursive: true, force: true })
  rmSync(packedRoot, { recursive: true, force: true })
  rmSync(launcherHome, { recursive: true, force: true })
}
