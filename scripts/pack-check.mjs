#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isForbiddenPackEntry } from './pack-policy.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const tarballName = `${manifest.name}-${manifest.version}.tgz`
const dir = mkdtempSync(join(tmpdir(), 'seektty-pack-'))
const pnpmCli = process.env.npm_execpath
const packer = pnpmCli === undefined
  ? ['pnpm', ['pack', '--pack-destination', dir]]
  : [process.execPath, [pnpmCli, 'pack', '--pack-destination', dir]]

function filePatternToRegExp(pattern) {
  const body = String(pattern).replaceAll('\\', '/').replace(/^\.\//u, '')
  const escaped = body.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '[^/]+')
  return new RegExp(`^package/${escaped}$`)
}

try {
  execFileSync(process.execPath, [join(root, 'scripts/remove-appledouble.mjs'), '--delete'], {
    cwd: root,
    stdio: 'inherit',
  })
  execFileSync(packer[0], packer[1], { cwd: root, stdio: 'inherit' })
  const tgz = join(dir, tarballName)
  const listing = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' }).replaceAll('\r', '')
  const entries = listing.trim().split('\n').filter(Boolean)
  const appleDouble = entries.filter((entry) => isForbiddenPackEntry(entry))
  if (appleDouble.length > 0) {
    throw new Error(`packed AppleDouble or Finder metadata:\n${appleDouble.join('\n')}`)
  }
  if (entries.some((entry) => entry.includes('/scripts/') || entry.endsWith('/scripts'))) {
    throw new Error(`packed helper scripts:\n${entries.filter((entry) => entry.includes('scripts')).join('\n')}`)
  }
  const allowed = [
    /^package\/package\.json$/,
    ...((manifest.files ?? []).map((pattern) => filePatternToRegExp(pattern))),
  ]
  const unexpected = entries.filter((entry) => !allowed.some((pattern) => pattern.test(entry)))
  if (unexpected.length > 0) {
    throw new Error(`packed unexpected paths:\n${unexpected.join('\n')}`)
  }
  if (listing.includes('workspace:')) {
    throw new Error('packed tarball contains workspace: protocol')
  }
  const pkgJson = execFileSync('tar', ['-xzf', tgz, '-O', 'package/package.json'], { encoding: 'utf8' })
  if (pkgJson.includes('workspace:')) {
    throw new Error('packed package.json contains workspace:')
  }
  if (!pkgJson.includes(`"name": "seektty"`) || !pkgJson.includes(`"version": "${manifest.version}"`)) {
    throw new Error(`packed package.json is not seektty@${manifest.version}`)
  }
  console.log(`pack-check ok (${entries.length} entries)`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
