#!/usr/bin/env node
import { readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const allowDirs = new Set(['src', 'tests', 'scripts', 'lib', 'assets', '.github'])
const skip = new Set(['.git', 'node_modules'])
const del = process.argv.includes('--delete')
const listed = []

function consider(abs) {
  const name = abs.split('/').pop() ?? ''
  if (!name.startsWith('._') && name !== '.DS_Store') return
  try {
    const st = statSync(abs)
    if (!st.isFile() || st.size > 8192) return
  } catch {
    return
  }
  listed.push(relative(root, abs))
}

function walkAllowed(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkAllowed(path)
      continue
    }
    consider(path)
  }
}

for (const name of readdirSync(root, { withFileTypes: true })) {
  if (skip.has(name.name)) continue
  const path = join(root, name.name)
  if (name.isFile()) {
    consider(path)
    continue
  }
  if (name.isDirectory() && allowDirs.has(name.name)) walkAllowed(path)
}

if (listed.length === 0) {
  console.log('no AppleDouble files in allowlisted dirs')
  process.exit(0)
}

console.log(del ? `deleting ${listed.length} AppleDouble files:` : `listed ${listed.length} AppleDouble files (pass --delete to remove exactly these):`)
for (const path of listed) console.log(path)
if (del) {
  for (const path of listed) unlinkSync(join(root, path))
}
