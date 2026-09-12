#!/usr/bin/env node

/** Install unchanged official npm packages with the audited internal closure. */
import crossSpawn from 'cross-spawn'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { stockDshTarget, verifyStockDsh } from './stock-dsh-version.mjs'

const target = stockDshTarget()
const args = process.argv.slice(2)
if (args.length > 1 || args[0]?.startsWith('--')) {
  throw new Error('Usage: node scripts/install-stock-dsh.mjs [new-install-directory]')
}
const directory = resolve(args[0] ?? `.artifacts/stock-dsh-${target.version}`)
const manifest = { private: true, dependencies: { '@deepseek-ai/dsh': target.version }, overrides: target.overrides }
const manifestPath = join(directory, 'package.json')
const dsh = join(directory, 'node_modules', '.bin', process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
const reused = existsSync(directory)
if (reused) {
  if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()
    || !existsSync(manifestPath) || !isDeepStrictEqual(JSON.parse(readFileSync(manifestPath, 'utf8')), manifest)) {
    throw new Error(`Refusing to overwrite existing directory: ${directory}. Choose a new install directory.`)
  }
  // An existing installation is read-only: failed or partial installs are not
  // repaired in place because later user changes must remain untouched.
} else {
  mkdirSync(dirname(directory), { recursive: true })
  mkdirSync(directory)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  const result = crossSpawn.sync('npm', ['install', '--prefix', directory, '--no-audit', '--no-fund'], {
    cwd: directory, env: process.env, stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Official dsh install failed (${result.status}); kept ${directory} for inspection. Retry in a new directory.`)
}
const verified = verifyStockDsh(dsh, target)
process.stdout.write(`${reused ? 'Reused' : 'Installed'} official dsh ${verified.version}; ${verified.packageCount} exact dsh packages verified.\nDSH_BIN=${dsh}\n`)
