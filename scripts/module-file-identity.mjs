import { statSync } from 'node:fs'

/** Physical identity, unaffected by Windows long/8.3 aliases; never a content hash. */
export function moduleFileIdentity(path) {
  return physicalModuleIdentity(statSync, path)
}

/** Explicit filesystem argument keeps the generated Loader probe closure-free. */
export function physicalModuleIdentity(stat, path) {
  const file = stat(path, { bigint: true })
  if (!file.isFile() || file.ino === 0n) throw new Error('Module physical file identity unavailable')
  return `${file.dev}:${file.ino}`
}
