#!/usr/bin/env node

/**
 * Scan the official dsh channels and bump this Bundle to the newest published
 * version. Newest means the higher of npm `latest`, npm `next`, and the first
 * GitHub harness release (including pre-releases). Used by the scheduled
 * dsh-version-scan workflow and runnable locally.
 *
 *   node scripts/bump-dsh.mjs --check   仅探测，输出 JSON，不改文件
 *   node scripts/bump-dsh.mjs           应用升级
 *   node scripts/bump-dsh.mjs 0.1.0-rc.9  升级到指定版本
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=5'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const requested = args.find(argument => !argument.startsWith('--'))

const manifestPath = resolve(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const tested = manifest.dsh?.compatibility?.tested
if (typeof tested !== 'string' || tested === '') {
  process.stderr.write('package.json 缺少 dsh.compatibility.tested\n')
  process.exit(2)
}

function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/u.exec(value.trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: (match[4] ?? '').split('.').filter(part => part !== ''),
  }
}

function compare(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return undefined
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  const text = (part) => (/^(0|[1-9]\d*)$/u.test(part) ? Number(part) : part)
  const length = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < length; index += 1) {
    if (a.pre[index] === undefined) return -1
    if (b.pre[index] === undefined) return 1
    const x = text(a.pre[index])
    const y = text(b.pre[index])
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x - y
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

function pickNewest(...values) {
  let best
  for (const raw of values) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const version = raw.replace(/^dsh-v/u, '').replace(/^v/u, '')
    if (best === undefined) {
      best = version
      continue
    }
    const order = compare(version, best)
    if (order !== undefined && order > 0) best = version
  }
  return best
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
  const [tags, releases] = await Promise.all([
    fetchJson(DIST_TAGS_URL),
    fetchJson(GITHUB_RELEASES_URL),
  ])
  const githubTag = Array.isArray(releases) ? releases[0]?.tag_name : undefined
  target = pickNewest(tags?.latest, tags?.next, githubTag)
}
if (typeof target !== 'string' || target === '') {
  process.stderr.write('无法确定目标 dsh 版本\n')
  process.exit(2)
}

const updateAvailable = target !== tested
if (checkOnly) {
  process.stdout.write(`${JSON.stringify({ tested, target, updateAvailable })}\n`)
  process.exit(0)
}
if (!updateAvailable) {
  process.stdout.write(`已是最新：tested ${tested} == ${target}\n`)
  process.exit(0)
}

async function packageHasVersion(name, version) {
  const json = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`)
  return json !== undefined && json.version === version
}

for (const name of Object.keys(manifest.dependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue
  if (await packageHasVersion(name, target)) {
    manifest.dependencies[name] = target
    continue
  }
  if (manifest.dependencies[name] === target && await packageHasVersion(name, tested)) {
    manifest.dependencies[name] = tested
  }
  process.stdout.write(`跳过 ${name}：registry 没有 ${target}，保持 ${manifest.dependencies[name]}\n`)
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
  writeFileSync(path, text.replaceAll(tested, target))
}

process.stdout.write(`已升级：dsh tested ${tested} -> ${target}\n`)
process.stdout.write('后续：pnpm install && pnpm run check，并对新版本重跑 stock 插拔契约。\n')
