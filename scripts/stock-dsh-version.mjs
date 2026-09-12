/** Verify the installed official CLI and every resolved internal dsh package. */
import crossSpawn from 'cross-spawn'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { load } from 'js-yaml'

const repository = resolve(import.meta.dirname, '..')
const nativeName = name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')

export function stockDshTarget(root = repository) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const version = manifest.dsh?.compatibility?.tested
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version)) {
    throw new Error('Invalid dsh.compatibility.tested')
  }
  const workspace = load(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
  const overrides = Object.fromEntries(Object.entries(workspace?.overrides ?? {})
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-')).sort(([a], [b]) => a.localeCompare(b)))
  if (Object.keys(overrides).length === 0 || Object.values(overrides).some(value => value !== version)) {
    throw new Error(`The workspace dsh closure must be pinned exactly to ${version}`)
  }
  return { version, overrides }
}

function packageForEntry(entry, name) {
  let directory = dirname(realpathSync(entry))
  while (true) {
    const path = join(directory, 'package.json')
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      if (manifest.name === name) return { directory, path, manifest }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Cannot locate ${name} for ${entry}`)
    directory = parent
  }
}

function resolvePackage(from, name) {
  const require = createRequire(from)
  let path
  try { path = require.resolve(`${name}/package.json`) } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
    return packageForEntry(require.resolve(name), name)
  }
  path = realpathSync(path)
  return { directory: dirname(path), path, manifest: JSON.parse(readFileSync(path, 'utf8')) }
}

/**
 * Resolve from actual installed package locations, not a lockfile or CLI banner
 * alone. The read-only preload identifies the Node entry behind .cmd/pnpm shims.
 * No official package file or normal DSH_HOME is changed.
 */
export function verifyStockDsh(dsh, target = stockDshTarget()) {
  const home = mkdtempSync(join(tmpdir(), 'seektty-stock-version-'))
  const marker = 'SEEKTTY_STOCK_DSH_ENTRY='
  const probe = `process.stderr.write(${JSON.stringify(marker)} + JSON.stringify(process.argv[1]) + '\\n')`
  const preload = `--import=data:text/javascript;base64,${Buffer.from(probe).toString('base64')}`
  let result
  try {
    result = crossSpawn.sync(resolve(dsh), ['--version'], {
      env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', SEEKTTY_UPDATE: 'off',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ') },
      encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000,
    })
  } finally { rmSync(home, { recursive: true, force: true }) }
  if (result.error) throw result.error
  if (result.status !== 0 || result.stdout.trim() !== target.version) {
    throw new Error(`Expected official dsh ${target.version}; CLI exited ${result.status} with ${JSON.stringify(result.stdout.trim())}`)
  }
  const entries = result.stderr.split(/\r?\n/u).filter(line => line.startsWith(marker))
    .map(line => JSON.parse(line.slice(marker.length)))
  let cli
  for (const entry of entries) {
    if (typeof entry !== 'string') continue
    try { cli = packageForEntry(entry, '@deepseek-ai/dsh') } catch { continue }
  }
  if (cli === undefined) throw new Error('The dsh executable did not resolve to the official @deepseek-ai/dsh package')
  // Resolve each dependency from its declaring package. In pnpm's strict/GVS
  // graph a transitive dependency is not necessarily visible from the CLI root.
  const pending = [cli]
  const seen = new Map()
  while (pending.length > 0) {
    const item = pending.pop()
    if (seen.has(item.path)) continue
    const { name, version, dependencies = {}, optionalDependencies = {}, peerDependencies = {}, peerDependenciesMeta = {} } = item.manifest
    if (!nativeName(name) || version !== target.version) {
      throw new Error(`Stock dsh closure mismatch: ${name}@${version}, expected ${target.version} (${item.path})`)
    }
    seen.set(item.path, name)
    for (const dependency of new Set([...Object.keys(dependencies), ...Object.keys(optionalDependencies), ...Object.keys(peerDependencies)])) {
      if (!nativeName(dependency)) continue
      const optional = Object.hasOwn(optionalDependencies, dependency)
        || (!Object.hasOwn(dependencies, dependency) && peerDependenciesMeta[dependency]?.optional === true)
      try { pending.push(resolvePackage(item.path, dependency)) } catch (error) {
        if (optional && error.code === 'MODULE_NOT_FOUND') continue
        throw error
      }
    }
  }
  const names = new Set(seen.values())
  const missing = Object.keys(target.overrides).filter(name => !names.has(name))
  if (missing.length > 0) throw new Error(`The installed dsh closure is incomplete: ${missing.join(', ')}`)
  const entry = resolve(cli.directory, typeof cli.manifest.bin === 'string' ? cli.manifest.bin : cli.manifest.bin.dsh)
  return { version: target.version, entry, packageDirectory: cli.directory, packageCount: seen.size }
}
