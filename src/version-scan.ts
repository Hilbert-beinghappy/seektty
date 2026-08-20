/**
 * Live version scan against the official dsh npm dist-tags and the SeekTTY
 * GitHub releases. Network failures degrade silently: every field of the
 * scan is optional and the caller decides whether to say anything at all.
 * Must not import locale.ts (launcher-safe, same rule as dsh-compat.ts).
 */

import { compareDshVersion, launcherCopy } from './dsh-compat.ts'

export const DSH_DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'
export const DSH_GITHUB_RELEASES_URL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=5'
export const SEEKTTY_LATEST_RELEASE_URL = 'https://api.github.com/repos/Hilbert-beinghappy/seektty/releases/latest'
export const DEFAULT_SCAN_TIMEOUT_MS = 3_000

/** Newest published versions discovered by a live scan. */
export interface VersionScan {
  /** npm `latest` dist-tag of `@deepseek-ai/dsh`. */
  readonly dshLatest?: string | undefined
  /** npm `next` dist-tag of `@deepseek-ai/dsh`, when published. */
  readonly dshNext?: string | undefined
  /** Newest official dsh: max of npm tags and the GitHub harness release. */
  readonly dshNewest?: string | undefined
  /** Tag name of the newest SeekTTY GitHub release, e.g. `v1.1.0`. */
  readonly seekttyLatestTag?: string | undefined
}

/** Local facts the scan is compared against. */
export interface InstalledFacts {
  /** `dsh.compatibility.tested` from package.json. */
  readonly dshTested: string
  /** This package's version. */
  readonly seekttyVersion: string
  /** True when DSH_BIN pins the dsh executable, so dsh must not be auto-updated. */
  readonly dshPinned: boolean
}

/** Concrete update actions `deepseek --update` should execute. */
export interface UpdatePlan {
  /** Global install spec for dsh, e.g. `@deepseek-ai/dsh@0.1.0-rc.8`. */
  readonly dshSpec?: string | undefined
  /** Plugin spec for the newest SeekTTY release, e.g. `github:...#v1.2.0`. */
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

/** Strip `dsh-v` / `v` prefixes used by official harness release tags. */
export function dshTagToVersion(tag: string): string {
  return tag.replace(/^dsh-v/u, '').replace(/^v/u, '')
}

/**
 * Highest version among the given candidates. Undefined entries are ignored.
 * @param versions - npm tags, GitHub tags, or already-normalized versions.
 */
export function pickNewestDsh(...versions: Array<string | undefined>): string | undefined {
  let best: string | undefined
  for (const raw of versions) {
    const version = raw === undefined ? undefined : dshTagToVersion(raw)
    if (version === undefined || version === '') continue
    if (best === undefined) {
      best = version
      continue
    }
    const order = compareDshVersion(version, best)
    if (order !== undefined && order > 0) best = version
  }
  return best
}

function githubDshVersion(payload: unknown): string | undefined {
  if (!Array.isArray(payload) || payload.length === 0) return undefined
  const first = payload[0] as { tag_name?: unknown }
  const tag = cleanVersion(first.tag_name)
  return tag === undefined ? undefined : dshTagToVersion(tag)
}

/**
 * Query npm, the official harness GitHub releases, and SeekTTY GitHub releases.
 * Each source fails independently and silently; the result never rejects.
 * @param fetchImpl - injectable fetch used by tests.
 * @param timeoutMs - per-request abort timeout.
 */
export async function scanLatestVersions(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs: number = DEFAULT_SCAN_TIMEOUT_MS,
): Promise<VersionScan> {
  const [distTags, harnessReleases, release] = await Promise.all([
    fetchJson(fetchImpl, DSH_DIST_TAGS_URL, timeoutMs).catch(() => undefined),
    fetchJson(fetchImpl, DSH_GITHUB_RELEASES_URL, timeoutMs).catch(() => undefined),
    fetchJson(fetchImpl, SEEKTTY_LATEST_RELEASE_URL, timeoutMs).catch(() => undefined),
  ])
  const tags = distTags as { latest?: unknown; next?: unknown } | undefined
  const rel = release as { tag_name?: unknown } | undefined
  const dshLatest = cleanVersion(tags?.latest)
  const dshNext = cleanVersion(tags?.next)
  const dshGithub = githubDshVersion(harnessReleases)
  return {
    dshLatest,
    dshNext,
    dshNewest: pickNewestDsh(dshLatest, dshNext, dshGithub),
    seekttyLatestTag: cleanVersion(rel?.tag_name),
  }
}

/** Strip a single leading `v` so release tags compare as versions. */
export function tagToVersion(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag
}

function newestDsh(scan: VersionScan): string | undefined {
  return pickNewestDsh(scan.dshNewest, scan.dshLatest, scan.dshNext)
}

function dshIsNewer(scan: VersionScan, facts: InstalledFacts): boolean {
  const newest = newestDsh(scan)
  if (newest === undefined) return false
  const order = compareDshVersion(newest, facts.dshTested)
  return order !== undefined && order > 0
}

function seekttyIsNewer(scan: VersionScan, facts: InstalledFacts): boolean {
  if (scan.seekttyLatestTag === undefined) return false
  const order = compareDshVersion(tagToVersion(scan.seekttyLatestTag), facts.seekttyVersion)
  return order !== undefined && order > 0
}

/**
 * Decide what `deepseek --update` should install.
 * dsh follows the newest official published version (npm `latest`/`next` and
 * the GitHub harness release, whichever is newer) unless DSH_BIN pins the
 * executable. SeekTTY follows its newest GitHub release tag when it is newer
 * than this running copy.
 */
export function updatePlan(scan: VersionScan, facts: InstalledFacts): UpdatePlan {
  const dsh = newestDsh(scan)
  return {
    dshSpec: !facts.dshPinned && dsh !== undefined
      ? `@deepseek-ai/dsh@${dsh}`
      : undefined,
    seekttySpec: seekttyIsNewer(scan, facts)
      ? `github:Hilbert-beinghappy/seektty#${scan.seekttyLatestTag}`
      : undefined,
  }
}

/**
 * Human advice lines for the passive post-session check. Empty when both
 * sides are current or the scan learned nothing.
 * @param english - POSIX-derived language choice.
 */
export function updateAdvice(scan: VersionScan, facts: InstalledFacts, english: boolean): string[] {
  const lines: string[] = []
  if (dshIsNewer(scan, facts)) {
    const newest = newestDsh(scan)
    lines.push(launcherCopy(
      `dsh 有新版本 ${newest}（SeekTTY 当前已测 ${facts.dshTested}）。`,
      `A newer dsh ${newest} is available (SeekTTY currently tested against ${facts.dshTested}).`,
      english,
    ))
  }
  if (seekttyIsNewer(scan, facts)) {
    lines.push(launcherCopy(
      `SeekTTY 有新版本 ${scan.seekttyLatestTag}（当前 ${facts.seekttyVersion}）。`,
      `A newer SeekTTY ${scan.seekttyLatestTag} is available (running ${facts.seekttyVersion}).`,
      english,
    ))
  }
  if (lines.length > 0) {
    lines.push(launcherCopy(
      '运行 deepseek --update 即可更新到最新版本。',
      'Run deepseek --update to update to the latest versions.',
      english,
    ))
  }
  return lines
}
