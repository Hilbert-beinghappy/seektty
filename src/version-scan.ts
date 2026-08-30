/**
 * Live version scan against the official dsh npm `latest` dist-tag and the
 * SeekTTY GitHub releases. npm `next` and harness GitHub pre-releases are
 * ignored: those channels are not the stable line this Bundle follows.
 * Network failures degrade silently. Must not import locale.ts.
 */

import {
  compareDshVersion,
  DSH_COMPATIBILITY,
  HOST_DESCRIBE_VERSION_PLACEHOLDER,
  launcherCopy,
} from './dsh-compat.ts'

export const DSH_DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'
export const SEEKTTY_LATEST_RELEASE_URL = 'https://api.github.com/repos/Hilbert-beinghappy/seektty/releases/latest'
export const DEFAULT_SCAN_TIMEOUT_MS = 3_000

/** Peer-aligned auto-install floor for the rc.6–rc.8 Host line. */
export const AUTO_PERMITTED_DSH_MINIMUM = DSH_COMPATIBILITY.minimum
/** Peer-aligned auto-install ceiling for the legacy Host line. */
export const AUTO_PERMITTED_DSH_LEGACY_MAXIMUM = '0.1.0-rc.8'
/** Exact extra Host pin that auto-update may install. */
export const AUTO_PERMITTED_DSH_EXACT = DSH_COMPATIBILITY.tested

/** Stable published versions discovered by a live scan. */
export interface VersionScan {
  /** npm `latest` dist-tag of `@deepseek-ai/dsh`. */
  readonly dshLatest?: string | undefined
  /** Tag name of the newest SeekTTY GitHub release, e.g. `v1.1.0`. */
  readonly seekttyLatestTag?: string | undefined
}

/** Local facts the scan is compared against. */
export interface InstalledFacts {
  /** `dsh.compatibility.tested` from package.json. */
  readonly dshTested: string
  /** Version printed by PATH `dsh --version`. Absent when unread or DSH_BIN is pinned. */
  readonly dshInstalled?: string | undefined
  /** This package's version. */
  readonly seekttyVersion: string
  /** True when DSH_BIN pins the dsh executable, so dsh must not be auto-updated. */
  readonly dshPinned: boolean
  /** True when SeekTTY is a local path/link or an explicit install spec override. */
  readonly seekttyPinned: boolean
}

/** Concrete update actions `deepseek --update` should execute. */
export interface UpdatePlan {
  /** Global install spec for dsh, e.g. `@deepseek-ai/dsh@0.1.0-rc.7`. */
  readonly dshSpec?: string | undefined
  /** Exact npm spec for the newest SeekTTY release, e.g. `seektty@1.2.1`. */
  readonly seekttySpec?: string | undefined
}

type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  ok: boolean
  json: () => Promise<unknown>
}>

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', 'user-agent': 'seektty-version-scan' },
  })
  if (!response.ok) return undefined
  return await response.json()
}

function cleanVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Query npm `latest` and the SeekTTY GitHub `releases/latest` tag.
 * Each source fails independently and silently; the result never rejects.
 * @param fetchImpl - injectable fetch used by tests.
 * @param timeoutMs - per-request abort timeout.
 */
export async function scanLatestVersions(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs: number = DEFAULT_SCAN_TIMEOUT_MS,
): Promise<VersionScan> {
  const [distTags, release] = await Promise.all([
    fetchJson(fetchImpl, DSH_DIST_TAGS_URL, timeoutMs).catch(() => undefined),
    fetchJson(fetchImpl, SEEKTTY_LATEST_RELEASE_URL, timeoutMs).catch(() => undefined),
  ])
  const tags = distTags as { latest?: unknown } | undefined
  const rel = release as { tag_name?: unknown } | undefined
  return {
    dshLatest: cleanVersion(tags?.latest),
    seekttyLatestTag: cleanVersion(rel?.tag_name),
  }
}

/** Strip a single leading `v` so release tags compare as versions. */
export function tagToVersion(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag
}

const DSH_CLI_VERSION_LINE = /^(?:dsh\s+)?v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/u

/**
 * Parse the official `dsh --version` text. Only accepts a whole line that is
 * the version itself (optional `dsh` / `v` prefix). Banner text, paths, the
 * host.describe placeholder `0.0.1`, and conflicting versions are rejected
 * so the updater treats the Host as unknown instead of guessing. Does not
 * read Profile files.
 * @param output - combined stdout/stderr from `dsh --version`.
 */
export function parseDshCliVersion(output: string): string | undefined {
  const found = new Set<string>()
  for (const raw of output.split(/\r?\n/u)) {
    const line = raw.trim()
    if (line === '') continue
    const version = DSH_CLI_VERSION_LINE.exec(line)?.[1]
    if (version === undefined || version === HOST_DESCRIBE_VERSION_PLACEHOLDER) continue
    found.add(version)
  }
  if (found.size !== 1) return undefined
  return found.values().next().value
}

/**
 * True when auto-update may install this exact Host version.
 * Matches the optional peer contract: the declared legacy floor through
 * rc.8, or the exact current tested pin. Versions in between are excluded.
 * @param version - candidate from npm `latest`.
 */
export function isAutoPermittedDshVersion(version: string): boolean {
  if (compareDshVersion(version, AUTO_PERMITTED_DSH_EXACT) === 0) return true
  const vsMin = compareDshVersion(version, AUTO_PERMITTED_DSH_MINIMUM)
  const vsLegacyMax = compareDshVersion(version, AUTO_PERMITTED_DSH_LEGACY_MAXIMUM)
  return vsMin !== undefined && vsLegacyMax !== undefined && vsMin >= 0 && vsLegacyMax <= 0
}

function seekttyIsNewer(scan: VersionScan, facts: InstalledFacts): boolean {
  if (scan.seekttyLatestTag === undefined) return false
  const order = compareDshVersion(tagToVersion(scan.seekttyLatestTag), facts.seekttyVersion)
  return order !== undefined && order > 0
}

function dshIsInstallable(scan: VersionScan, facts: InstalledFacts): boolean {
  if (facts.dshPinned || scan.dshLatest === undefined || facts.dshInstalled === undefined) return false
  if (!isAutoPermittedDshVersion(scan.dshLatest)) return false
  const order = compareDshVersion(scan.dshLatest, facts.dshInstalled)
  return order !== undefined && order > 0
}

function dshIsOutsideAutoRange(scan: VersionScan): boolean {
  return scan.dshLatest !== undefined && !isAutoPermittedDshVersion(scan.dshLatest)
}

/**
 * Keep at most one spec, preferring SeekTTY. Used by both `--update` and auto.
 */
export function exclusiveUpdatePlan(plan: UpdatePlan): UpdatePlan {
  if (plan.seekttySpec !== undefined) {
    return { dshSpec: undefined, seekttySpec: plan.seekttySpec }
  }
  return { dshSpec: plan.dshSpec, seekttySpec: undefined }
}

/**
 * Decide what one launch/update round should install.
 * npm `latest` is discovery only. SeekTTY self-update wins the round and
 * excludes dsh. Otherwise dsh installs only when `latest` is in the
 * peer-aligned auto range and newer than the actually installed Host.
 */
export function updatePlan(scan: VersionScan, facts: InstalledFacts): UpdatePlan {
  const seekttyVersion = scan.seekttyLatestTag === undefined ? undefined : tagToVersion(scan.seekttyLatestTag)
  if (!facts.seekttyPinned && seekttyVersion !== undefined && seekttyIsNewer(scan, facts)) {
    return exclusiveUpdatePlan({
      dshSpec: undefined,
      seekttySpec: `seektty@${seekttyVersion}`,
    })
  }
  return exclusiveUpdatePlan({
    dshSpec: dshIsInstallable(scan, facts) ? `@deepseek-ai/dsh@${scan.dshLatest}` : undefined,
    seekttySpec: undefined,
  })
}

/**
 * Human advice lines for the passive post-session check. Empty when both
 * sides are current or the scan learned nothing. Future/gap Host versions
 * are mentioned but never presented as installable.
 * @param english - POSIX-derived language choice.
 */
export function updateAdvice(scan: VersionScan, facts: InstalledFacts, english: boolean): string[] {
  const lines: string[] = []
  const installable = updatePlan(scan, facts)
  if (dshIsOutsideAutoRange(scan)) {
    lines.push(launcherCopy(
      `dsh ${scan.dshLatest} 超出 SeekTTY 当前许可范围，不会安装。`,
      `dsh ${scan.dshLatest} is outside SeekTTY's permitted range and will not be installed.`,
      english,
    ))
  } else if (
    scan.dshLatest !== undefined
    && isAutoPermittedDshVersion(scan.dshLatest)
    && !facts.dshPinned
    && facts.dshInstalled === undefined
  ) {
    lines.push(launcherCopy(
      '无法读取已安装的 dsh 版本，本轮不会更新 dsh。',
      'Could not read the installed dsh version; dsh will not be updated this round.',
      english,
    ))
  } else if (installable.dshSpec !== undefined) {
    lines.push(launcherCopy(
      `dsh 有可安装版本 ${scan.dshLatest}（当前已装 ${facts.dshInstalled}）。`,
      `An installable dsh ${scan.dshLatest} is available (installed ${facts.dshInstalled}).`,
      english,
    ))
  }
  if (!facts.seekttyPinned && seekttyIsNewer(scan, facts)) {
    lines.push(launcherCopy(
      `SeekTTY 有新版本 ${scan.seekttyLatestTag}（当前 ${facts.seekttyVersion}）。`,
      `A newer SeekTTY ${scan.seekttyLatestTag} is available (running ${facts.seekttyVersion}).`,
      english,
    ))
  }
  if (installable.dshSpec !== undefined || installable.seekttySpec !== undefined) {
    lines.push(launcherCopy(
      '运行 deepseek --update 即可更新本轮许可的那一个组件。',
      'Run deepseek --update to install this round\'s permitted component.',
      english,
    ))
  }
  return lines
}
