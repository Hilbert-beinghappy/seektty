#!/usr/bin/env node

/**
 * Scan the official dsh npm dist-tags and bump this Bundle to the newest
 * release. Used by the scheduled dsh-version-scan workflow and runnable
 * locally.
 *
 *   node scripts/bump-dsh.mjs --check   仅探测，输出 JSON，不改文件
 *   node scripts/bump-dsh.mjs           应用升级：package.json、src/dsh-compat.ts、README
 *   node scripts/bump-dsh.mjs 0.1.0-rc.9  升级到指定版本而非 latest
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'

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

let target = requested
if (target === undefined) {
  const response = await fetch(DIST_TAGS_URL, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json', 'user-agent': 'seektty-bump-dsh' },
  })
  if (!response.ok) {
    process.stderr.write(`npm Registry 响应 ${response.status}\n`)
    process.exit(2)
  }
  const tags = await response.json()
  target = tags.latest
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

// package.json：所有官方 dsh 子包精确锁到目标版本，tested 跟进；minimum 不动。
for (const name of Object.keys(manifest.dependencies ?? {})) {
  if (name.startsWith('@deepseek-ai/dsh-') && manifest.dependencies[name] === tested) {
    manifest.dependencies[name] = target
  }
}
manifest.dsh.compatibility.tested = target
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

// src/dsh-compat.ts：tested 常量跟进。
const compatPath = resolve(root, 'src/dsh-compat.ts')
const compatSource = readFileSync(compatPath, 'utf8')
const bumped = compatSource.replace(`tested: '${tested}',`, `tested: '${target}',`)
if (bumped === compatSource) {
  process.stderr.write(`src/dsh-compat.ts 中未找到 tested: '${tested}'\n`)
  process.exit(2)
}
writeFileSync(compatPath, bumped)

// README：把旧 tested 基线字符串替换为新版本（minimum 的提及不受影响，
// 因为 minimum 与 tested 分离后字符串不同）。
for (const readme of ['README.md', 'README.zh.md']) {
  const path = resolve(root, readme)
  const text = readFileSync(path, 'utf8')
  writeFileSync(path, text.replaceAll(tested, target))
}

process.stdout.write(`已升级：dsh tested ${tested} -> ${target}\n`)
process.stdout.write('后续：pnpm install && pnpm run check，并对新版本重跑 stock 插拔契约。\n')
