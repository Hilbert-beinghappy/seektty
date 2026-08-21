/** Compare DeepSeek Harness versions declared in dsh.compatibility. */

export interface DshCompatibility {
  readonly minimum: string
  readonly tested: string
}

export const PACKAGE_NAME = 'seektty'
export const PACKAGE_VERSION = '1.2.0'
export const DSH_COMPATIBILITY: DshCompatibility = {
  minimum: '0.1.0-rc.6',
  tested: '0.1.0-rc.8',
}

/**
 * Value returned by official `@deepseek-ai/dsh-host-apiproxy` `host.describe`.
 * The gateway still hardcodes `version: '0.0.1'` as a TODO placeholder
 * (present in 0.1.0-rc.6 through 0.1.0-rc.8) instead of reading `apps/cli`
 * package.json. Treat it as "version unknown", not as a real 0.0.1 CLI.
 */
export const HOST_DESCRIBE_VERSION_PLACEHOLDER = '0.0.1'

interface VersionParts {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly pre: readonly (string | number)[]
}

function parseVersion(value: string): VersionParts | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/u.exec(value.trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: (match[4] ?? '').split('.').filter(part => part !== '').map((part) => {
      if (/^(0|[1-9]\d*)$/u.test(part)) return Number(part)
      return part
    }),
  }
}

function comparePre(left: readonly (string | number)[], right: readonly (string | number)[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    if (a === b) continue
    if (typeof a === 'number' && typeof b === 'number') return a - b
    if (typeof a === 'number') return -1
    if (typeof b === 'number') return 1
    return a < b ? -1 : 1
  }
  return 0
}

/**
 * Compare two dsh versions. Returns negative when `left` is older.
 * @param left - candidate version.
 * @param right - baseline version.
 */
export function compareDshVersion(left: string, right: string): number | undefined {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return undefined
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  return comparePre(a.pre, b.pre)
}

/**
 * Explain why a running dsh version is outside this Bundle's declared range.
 * @param hostVersion - Host-reported version. Official `host.describe` still
 *   returns the placeholder `0.0.1`; that value is ignored.
 * @param compatibility - package.json `dsh.compatibility`.
 * @param english - launcher-safe language choice (no locale.ts).
 */
export function dshCompatibilityError(
  hostVersion: string | undefined,
  compatibility: DshCompatibility,
  english: boolean,
): string | undefined {
  if (hostVersion === HOST_DESCRIBE_VERSION_PLACEHOLDER) return undefined
  if (hostVersion === undefined || hostVersion.trim() === '') {
    return english
      ? `Could not read the dsh version. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).`
      : `无法读取 dsh 版本。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`
  }
  const order = compareDshVersion(hostVersion, compatibility.minimum)
  if (order === undefined) {
    return english
      ? `Unrecognized dsh version ${hostVersion}. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).`
      : `无法识别 dsh 版本 ${hostVersion}。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`
  }
  if (order < 0) {
    return english
      ? `dsh ${hostVersion} is too old. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).`
      : `dsh ${hostVersion} 过旧。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`
  }
  return undefined
}

/**
 * Advisory notice when the running dsh is newer than the tested upper bound.
 * Newer hosts are allowed to boot; the notice keeps the tested range honest
 * without blocking forward compatibility.
 * @param hostVersion - Host-reported version; the `host.describe` placeholder
 *   and unreadable values produce no notice (they are handled by
 *   `dshCompatibilityError`).
 * @param compatibility - package.json `dsh.compatibility`.
 * @param english - launcher-safe language choice (no locale.ts).
 */
export function dshCompatibilityNotice(
  hostVersion: string | undefined,
  compatibility: DshCompatibility,
  english: boolean,
): string | undefined {
  if (hostVersion === undefined || hostVersion === HOST_DESCRIBE_VERSION_PLACEHOLDER) return undefined
  const newest = compareDshVersion(hostVersion, compatibility.tested)
  if (newest !== undefined && newest > 0) {
    return english
      ? `dsh ${hostVersion} is newer than the tested ${compatibility.tested}. SeekTTY continues; report issues if anything misbehaves.`
      : `dsh ${hostVersion} 新于已测试的 ${compatibility.tested}。SeekTTY 将继续运行；如有异常请反馈。`
  }
  return undefined
}

/**
 * Default GitHub plugin spec pinned to this package version.
 * @param version - package.json version without a leading v.
 */
export function defaultPluginSpec(version: string): string {
  return `github:Hilbert-beinghappy/seektty#v${version}`
}

/**
 * Launcher `--version` text. Must not import locale.ts.
 * @param facts - package identity and compatibility.
 * @param english - POSIX-derived language choice.
 */
export function versionMessage(
  facts: { readonly name: string; readonly version: string; readonly compatibility: DshCompatibility },
  english: boolean,
): string {
  return english
    ? `${facts.name} ${facts.version}\nRequires dsh >= ${facts.compatibility.minimum} (tested ${facts.compatibility.tested})\n`
    : `${facts.name} ${facts.version}\n需要 dsh >= ${facts.compatibility.minimum}（已测试 ${facts.compatibility.tested}）\n`
}

/** True when the launcher should print version and skip spawning dsh. */
export function isVersionRequest(args: readonly string[]): boolean {
  return args.includes('--version') || args.includes('-V')
}

/** POSIX-derived English preference used by the launcher only. */
export function launcherPrefersEnglish(env: NodeJS.ProcessEnv): boolean {
  const language = env.LANGUAGE?.split(':')[0] ?? ''
  if (/^en([_.]|$)/iu.test(language)) return true
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  return /^en([_.]|$)/iu.test(locale)
}

/**
 * Launcher-safe bilingual copy. Must not import locale.ts.
 * @param zh - Chinese text.
 * @param en - English text.
 * @param english - POSIX-derived language choice.
 */
export function launcherCopy(zh: string, en: string, english: boolean): string {
  return english ? en : zh
}
