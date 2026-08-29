#!/usr/bin/env node

import crossSpawn from 'cross-spawn'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, join, resolve } from 'node:path'

const mode = process.argv[2] ?? process.env.SEEKTTY_GVS_MODE ?? 'false'
if (mode !== 'false' && mode !== 'true') {
  process.stderr.write('Usage: node scripts/pnpm11-layout-acceptance.mjs <false|true> [candidate.tgz|artifact-directory]\n')
  process.exit(2)
}

const candidateInput = process.argv[3] ?? process.env.SEEKTTY_SPEC ?? '.artifacts'
const testedDsh = process.env.SEEKTTY_TESTED_DSH?.trim() || '0.1.1-rc.2'
const root = mkdtempSync(join(tmpdir(), `seektty-pnpm11-gvs-${mode}-`))
const globalDir = join(root, 'global')
const binDir = join(root, 'bin')
const storeDir = join(root, 'store')
const dshHome = join(root, 'dsh-home')
const gvsOption = `--config.enable-global-virtual-store=${mode}`
const compatibilityOption = '--config.enable-global-virtual-store=false'
const maxBuffer = 32 * 1024 * 1024

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function candidateSpec(input) {
  const path = resolve(input)
  if (!existsSync(path)) throw new Error(`SeekTTY candidate not found: ${path}`)
  if (!path.toLowerCase().endsWith('.tgz')) {
    const archives = readdirSync(path)
      .filter(name => /^seektty-.*\.tgz$/u.test(name))
      .map(name => join(path, name))
    assert(archives.length === 1, `Expected exactly one seektty-*.tgz in ${path}; found ${archives.length}`)
    return archives[0]
  }
  return path
}

const pluginSpec = candidateSpec(candidateInput)
const environment = {
  ...process.env,
  DSH_HOME: dshHome,
  PNPM_HOME: binDir,
  PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
  SEEKTTY_SPEC: pluginSpec,
  SEEKTTY_UPDATE: 'off',
}

function spawn(command, args, options = {}) {
  const result = crossSpawn.sync(command, args, {
    env: environment,
    encoding: 'utf8',
    maxBuffer,
    windowsHide: true,
    ...options,
  })
  if (result.error) throw result.error
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

function requireSuccess(command, args) {
  const result = spawn(command, args)
  assert(result.status === 0, `${command} ${args.join(' ')} failed (${result.status}):\n${result.output}`)
  return result.output
}

function globalInstall(spec) {
  requireSuccess('pnpm', [
    'add',
    '--global',
    '--global-dir', globalDir,
    '--global-bin-dir', binDir,
    '--store-dir', storeDir,
    gvsOption,
    spec,
  ])
}

function executable(name) {
  const candidates = process.platform === 'win32'
    ? [join(binDir, `${name}.CMD`), join(binDir, `${name}.cmd`), join(binDir, `${name}.exe`)]
    : [join(binDir, name)]
  const found = candidates.find(existsSync)
  if (found === undefined) throw new Error(`Global ${name} executable not found in ${binDir}`)
  return found
}

function packageLink(packageName) {
  const segments = packageName.split('/')
  const pending = [{ dir: globalDir, depth: 0 }]
  while (pending.length > 0) {
    const current = pending.shift()
    if (current === undefined) break
    const direct = join(current.dir, 'node_modules', ...segments)
    if (existsSync(direct)) return direct
    if (current.depth >= 3) continue
    for (const entry of readdirSync(current.dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        pending.push({ dir: join(current.dir, entry.name), depth: current.depth + 1 })
      }
    }
  }
  throw new Error(`Could not locate ${packageName} below pnpm global-dir ${globalDir}`)
}

function assertLayout(packageName, expectedGvs) {
  const packageDir = realpathSync(packageLink(packageName))
  const normalized = packageDir.replaceAll('\\', '/')
  const usesGvs = /\/store\/v11\/links(?:\/|$)/u.test(normalized)
  assert(
    usesGvs === expectedGvs,
    `${packageName} layout assertion failed: expected GVS=${expectedGvs}, real path=${packageDir}`,
  )
  return packageDir
}

try {
  const pnpmVersion = requireSuccess('pnpm', ['--version']).trim()
  assert(pnpmVersion === '11.7.0', `Expected pnpm 11.7.0, received ${JSON.stringify(pnpmVersion)}`)

  globalInstall(`@deepseek-ai/dsh@${testedDsh}`)
  globalInstall(pluginSpec)
  const dshPackageDir = assertLayout('@deepseek-ai/dsh', mode === 'true')
  const seekttyPackageDir = assertLayout('seektty', mode === 'true')
  const dsh = executable('dsh')
  const deepseek = executable('deepseek')
  environment.DSH_BIN = dsh

  const version = spawn(deepseek, ['--version'])
  assert(version.status === 0 && version.output.includes('seektty'), `deepseek --version failed:\n${version.output}`)

  if (mode === 'true') {
    const boot = spawn(deepseek, [])
    if (boot.status !== 0) {
      assert(/store[/\\]v11[/\\]links/iu.test(boot.output), `GVS failure omitted its real layout:\n${boot.output}`)
      assert(
        /plugin tree failed to load|cordis:include|loader entries failed to apply/iu.test(boot.output),
        `GVS failure was not the known dsh/Cordis loader incompatibility:\n${boot.output}`,
      )
      assert(boot.output.includes(compatibilityOption), `SeekTTY launcher omitted the per-command recovery option:\n${boot.output}`)
      process.stdout.write([
        `pnpm ${pnpmVersion} GVS=true known incompatibility classified`,
        `dsh=${dshPackageDir}`,
        `seektty=${seekttyPackageDir}`,
      ].join('\n') + '\n')
    } else {
      process.stdout.write('GVS=true boot succeeded; running the full stock lifecycle because the upstream loader may now be compatible.\n')
      requireSuccess(process.execPath, [resolve('scripts/stock-dsh-cycle.mjs')])
    }
  } else {
    requireSuccess(process.execPath, [resolve('scripts/stock-dsh-cycle.mjs')])
    process.stdout.write([
      `pnpm ${pnpmVersion} GVS=false full lifecycle passed`,
      `dsh=${dshPackageDir}`,
      `seektty=${seekttyPackageDir}`,
      `candidate=${basename(pluginSpec)}`,
    ].join('\n') + '\n')
  }
} finally {
  const resolvedRoot = realpathSync(root)
  const resolvedTemp = realpathSync(tmpdir())
  assert(resolvedRoot.startsWith(`${resolvedTemp}${process.platform === 'win32' ? '\\' : '/'}`), `Refusing to remove non-temporary path: ${resolvedRoot}`)
  if (process.env.SEEKTTY_KEEP_ACCEPTANCE_TEMP === '1') {
    process.stderr.write(`Kept acceptance directory for diagnosis: ${resolvedRoot}\n`)
  } else {
    rmSync(resolvedRoot, { recursive: true, force: true })
  }
}
