#!/usr/bin/env node

/**
 * Scan the official dsh npm `latest` dist-tag and bump this Bundle to that
 * stable version. npm `next` and GitHub harness pre-releases are ignored.
 * Used by the scheduled dsh-version-scan workflow and runnable locally.
 *
 *   node scripts/bump-dsh.mjs --check   仅探测，输出 JSON，不改文件
 *   node scripts/bump-dsh.mjs           应用升级
 *   node scripts/bump-dsh.mjs 0.1.0-rc.9  升级到指定版本
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { replaceCurrentTestedMentions } from './bump-readme.mjs'
import { compareDshVersions, dshPeerRange } from './dsh-peer-range.mjs'

const root = resolve(import.meta.dirname, '..')
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const requested = args.find(argument => !argument.startsWith('--'))

const manifestPath = resolve(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const tested = manifest.dsh?.compatibility?.tested
const minimum = manifest.dsh?.compatibility?.minimum
if (typeof tested !== 'string' || tested === '') {
  process.stderr.write('package.json 缺少 dsh.compatibility.tested\n')
  process.exit(2)
}
if (typeof minimum !== 'string' || minimum === '') {
  process.stderr.write('package.json 缺少 dsh.compatibility.minimum\n')
  process.exit(2)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json', 'user-agent': 'seektty-bump-dsh' },
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`Registry request failed (${response.status}): ${url}`)
  return await response.json()
}

let target = requested
if (target === undefined) {
  const tags = await fetchJson(DIST_TAGS_URL)
  target = typeof tags?.latest === 'string' ? tags.latest.trim() : undefined
}
if (typeof target !== 'string' || target === '') {
  process.stderr.write('无法确定目标 dsh 版本：npm latest 不可用\n')
  process.exit(2)
}

const order = compareDshVersions(target, tested)
const updateAvailable = order !== undefined && order > 0
if (checkOnly) {
  process.stdout.write(`${JSON.stringify({ tested, target, updateAvailable })}\n`)
  process.exit(0)
}
if (!updateAvailable) {
  process.stdout.write(`无需升级：tested ${tested}，npm latest ${target}\n`)
  process.exit(0)
}

async function packageHasVersion(name, version) {
  const json = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`)
  return json !== undefined && json.version === version
}

const packages = Object.keys(manifest.devDependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/dsh-'))
const workspacePath = resolve(root, 'pnpm-workspace.yaml')
const workspace = readFileSync(workspacePath, 'utf8')
const closureRows = [...workspace.matchAll(/^  '(@deepseek-ai\/dsh-[^']+)': ([^\s]+)$/gmu)]
if (closureRows.length === 0 || closureRows.some(row => row[2] !== tested)) {
  throw new Error('pnpm-workspace.yaml 的 dsh 闭包与当前 tested 不一致，未修改文件')
}
const requiredPackages = [...new Set([...packages, ...closureRows.map(row => row[1])])]
const missing = []
for (const name of requiredPackages) {
  if (!await packageHasVersion(name, target)) missing.push(name)
}
if (missing.length > 0) {
  process.stderr.write(`需要人工迁移：以下包没有 ${target}，未修改任何文件：\n${missing.join('\n')}\n`)
  process.exit(2)
}
for (const name of packages) manifest.devDependencies[name] = target
for (const name of Object.keys(manifest.peerDependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  manifest.peerDependencies[name] = dshPeerRange(minimum, target)
}
manifest.dsh.compatibility.tested = target

const compatPath = resolve(root, 'src/dsh-compat.ts')
const compatSource = readFileSync(compatPath, 'utf8')
const bumped = compatSource.replace(`tested: '${tested}',`, `tested: '${target}',`)
if (bumped === compatSource) {
  process.stderr.write(`src/dsh-compat.ts 中未找到 tested: '${tested}'\n`)
  process.exit(2)
}
const updates = new Map([[manifestPath, `${JSON.stringify(manifest, null, 2)}\n`], [compatPath, bumped]])
updates.set(workspacePath, workspace.replace(/^  '(@deepseek-ai\/dsh-[^']+)': [^\s]+$/gmu,
  (_line, name) => `  '${name}': ${target}`).replace(`audited dsh ${tested}`, `audited dsh ${target}`))
const pnpmPath = resolve(root, 'src/pnpm-compat.ts')
const pnpmSource = readFileSync(pnpmPath, 'utf8')
if (!pnpmSource.includes(`PNPM_GVS_DSH_RANGE = '${dshPeerRange(minimum, tested)}'`)
  || !pnpmSource.includes(`dsh: '${tested}'`)) {
  throw new Error('pnpm compatibility pins are incomplete or inconsistent; no files written')
}
const pnpmBumped = pnpmSource.replace(/(PNPM_GVS_DSH_RANGE = ')[^']+(')/u, `$1${dshPeerRange(minimum, target)}$2`)
  .replace(`dsh: '${tested}'`, `dsh: '${target}'`)
if (pnpmBumped === pnpmSource) throw new Error('pnpm compatibility pin was not updated; no files written')
updates.set(pnpmPath, pnpmBumped)

for (const readme of ['README.md', 'README.zh.md']) {
  const path = resolve(root, readme)
  const text = readFileSync(path, 'utf8')
  updates.set(path, replaceCurrentTestedMentions(text, tested, target))
}

// Validate every input and registry result before touching the first file.
for (const [path, content] of updates) writeFileSync(path, content)

process.stdout.write(`已升级：dsh tested ${tested} -> ${target}\n`)
process.stdout.write('后续：pnpm install && pnpm run check，并对新版本重跑 stock 插拔契约。\n')
