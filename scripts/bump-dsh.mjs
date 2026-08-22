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
  if (!response.ok) return undefined
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

for (const name of Object.keys(manifest.devDependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  if (await packageHasVersion(name, target)) {
    manifest.devDependencies[name] = target
    continue
  }
  if (manifest.devDependencies[name] === target && await packageHasVersion(name, tested)) {
    manifest.devDependencies[name] = tested
  }
  process.stdout.write(`跳过 ${name}：registry 没有 ${target}，保持 ${manifest.devDependencies[name]}\n`)
}
for (const name of Object.keys(manifest.peerDependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  manifest.peerDependencies[name] = dshPeerRange(minimum, target)
}
manifest.dsh.compatibility.tested = target
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const compatPath = resolve(root, 'src/dsh-compat.ts')
const compatSource = readFileSync(compatPath, 'utf8')
const bumped = compatSource.replace(`tested: '${tested}',`, `tested: '${target}',`)
if (bumped === compatSource) {
  process.stderr.write(`src/dsh-compat.ts 中未找到 tested: '${tested}'\n`)
  process.exit(2)
}
writeFileSync(compatPath, bumped)

for (const readme of ['README.md', 'README.zh.md']) {
  const path = resolve(root, readme)
  const text = readFileSync(path, 'utf8')
  writeFileSync(path, replaceCurrentTestedMentions(text, tested, target))
}

process.stdout.write(`已升级：dsh tested ${tested} -> ${target}\n`)
process.stdout.write('后续：pnpm install && pnpm run check，并对新版本重跑 stock 插拔契约。\n')
