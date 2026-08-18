/**
 * Shared Profile and plugin management over the native Profile manifest,
 * pnpm installation, and ordered `dsh.profile.bundles` contract.
 * @module @deepseek-ai/dsh-app-boot/profile-plugin-manager
 */

import type { SpawnSyncOptions } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { load } from 'js-yaml'
import crossSpawn from 'cross-spawn'
import type {} from '@deepseek-ai/cordis'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  PROFILES_DIR,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { ui } from '../client/locale.ts'

const NAME = 'dsh'
const MAX_CAPTURE_BYTES = 1024 * 1024
const MAX_PATCH_BYTES = 2 * 1024 * 1024
const SENSITIVE_QUERY_KEY = new RegExp(
  String.raw`(?:^|[-_])(?:access[-_]?token|api[-_]?key|auth|authorization|credential|password|secret|signature|token)(?:$|[-_])`,
  'i',
)

/** Installation source inferred from one Profile dependency spec. */
export type ProfilePluginSource = 'npm' | 'git' | 'tarball' | 'local' | 'unknown'

/** Safe installed-package facts used by CLI and terminal surfaces. */
export interface ProfilePluginEntry {
  /** Installed dependency package name. */
  readonly name: string
  /** Spec recorded by pnpm in the Profile manifest. */
  readonly spec: string
  /** Installed package version, when its manifest declares one. */
  readonly version?: string
  /** Installed package description, when declared. */
  readonly description?: string
  /** Inferred installation source. */
  readonly source: ProfilePluginSource
  /** Whether the installed package declares `dsh.bundle.patch`. */
  readonly bundle: boolean
  /** Whether the dependency currently participates in Profile composition. */
  readonly active: boolean
  /** Declared patch path, when this is a Bundle. */
  readonly patch?: string
  /** Whether the declared patch exists and parses as a patch-list array. */
  readonly patchValid: boolean
  /** Lifecycle scripts declared by the installed package. */
  readonly scripts: readonly string[]
  /** Non-secret compatibility diagnostics. */
  readonly diagnostics: readonly string[]
}

/** Point-in-time native Profile state. */
export interface ProfilePluginSnapshot {
  readonly profile: string
  readonly dir: string
  readonly dependencies: Readonly<Record<string, string>>
  readonly bundles: readonly string[]
  readonly plugins: readonly ProfilePluginEntry[]
}

/** One Profile directory available under the Harness home. */
export interface ProfileSummary {
  readonly name: string
  readonly dir: string
  readonly initialized: boolean
  readonly bundles: readonly string[]
  readonly dependencyCount: number
  readonly compatible: boolean
  readonly diagnostic?: string
}

/** Optional ordered-Bundle conversion applied while creating a Profile. */
export interface ProfileCreateOptions {
  readonly addBundles?: readonly string[]
  readonly removeBundles?: readonly string[]
}

/** Result of one native pnpm operation and the following Bundle reconciliation. */
export interface ProfilePluginOperationResult {
  readonly profile: string
  readonly dir: string
  readonly command: readonly string[]
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly warnings: readonly string[]
  readonly initialized: boolean
  readonly changed: boolean
  readonly restartRequired: boolean
  readonly snapshot: ProfilePluginSnapshot
}

/** Result of Profile compatibility and pnpm availability checks. */
export interface ProfileDoctorResult {
  readonly profile: string
  readonly pnpm?: string
  readonly diagnostics: readonly { readonly level: 'info' | 'warning' | 'error'; readonly message: string }[]
  readonly snapshot: ProfilePluginSnapshot
}

/** Output sink for long-running pnpm operations. */
export interface ProfilePluginRunOptions {
  readonly signal?: AbortSignal
  readonly onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
}

function convertedBundles(bundles: readonly string[], options: ProfileCreateOptions): string[] {
  const removed = new Set(options.removeBundles ?? [])
  const converted = bundles.filter(bundle => !removed.has(bundle))
  for (const bundle of options.addBundles ?? []) {
    if (!converted.includes(bundle)) converted.push(bundle)
  }
  return converted
}

/** Construction facts shared by the CLI and a booted Profile surface. */
export interface ProfilePluginManagerOptions {
  readonly profile: string
  readonly installAnchor: string
  readonly invokingCwd?: string
  readonly home?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Launcher-owned native Profile/pnpm manager for the active Profile. */
    profilePluginManager?: ProfilePluginManager
  }
}

interface InstalledManifest extends ProfileManifest {
  version?: string
  description?: string
  scripts?: Record<string, string>
}

interface InstalledFacts {
  readonly packageDir?: string
  readonly manifest?: InstalledManifest
  readonly patchValid: boolean
  readonly diagnostic?: string
}

function inferSource(spec: string): ProfilePluginSource {
  if (/^(?:git\+|github:|gitlab:|bitbucket:)|\.git(?:#|$)/i.test(spec)) return 'git'
  if (/^(?:https?:).*\.(?:tgz|tar\.gz)(?:[?#].*)?$/i.test(spec) || /\.(?:tgz|tar\.gz)$/i.test(spec)) return 'tarball'
  if (/^(?:file:|link:|workspace:|portal:)/.test(spec) || isAbsolute(spec) || /^\.{1,2}(?:[/\\]|$)/.test(spec)) {
    return 'local'
  }
  if (/^https?:/i.test(spec)) return 'unknown'
  // Profile manifests normally record a semver range, not the package name
  // originally passed to `pnpm add`; all remaining pnpm registry forms are npm.
  return 'npm'
}

function safeDependencySpec(spec: string): string {
  const prefix = spec.startsWith('git+') ? 'git+' : ''
  const raw = prefix === '' ? spec : spec.slice(prefix.length)
  if (!/^https?:\/\//i.test(raw)) return spec
  try {
    const url = new URL(raw)
    if (url.username !== '' || url.password !== '') {
      url.username = '***'
      url.password = ''
    }
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, '***')
    }
    return `${prefix}${url.toString()}`
  } catch {
    return spec.replace(/(https?:\/\/)[^\s/@]+@/iu, '$1***@')
  }
}

function readInstalledManifest(packageDir: string): InstalledManifest {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as InstalledManifest
}

function validPatch(packageDir: string, patch: string): boolean {
  try {
    const root = realpathSync(packageDir)
    const path = resolve(root, patch)
    if (!existsSync(path) || statSync(path).size > MAX_PATCH_BYTES) return false
    const realPath = realpathSync(path)
    const within = relative(root, realPath)
    if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) return false
    return Array.isArray(load(readFileSync(realPath, 'utf8'), { schema: entryListSchema }))
  } catch {
    return false
  }
}

function appendBounded(current: string, chunk: string): string {
  const joined = current + chunk
  return Buffer.byteLength(joined) <= MAX_CAPTURE_BYTES
    ? joined
    : joined.slice(Math.max(0, joined.length - MAX_CAPTURE_BYTES))
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const counts = new Map<string, number>()
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1)
  for (const item of right) {
    const remaining = counts.get(item)
    if (remaining === undefined || remaining === 0) return false
    counts.set(item, remaining - 1)
  }
  return [...counts.values()].every(value => value === 0)
}

function sameSnapshotState(left: ProfilePluginSnapshot, right: ProfilePluginSnapshot): boolean {
  return sameJson(left.dependencies, right.dependencies)
    && sameJson(left.bundles, right.bundles)
    && sameJson(left.plugins, right.plugins)
}

function mutatesProfile(command: readonly string[]): boolean {
  return new Set([
    'add', 'install', 'i', 'remove', 'rm', 'uninstall', 'update', 'up',
    'link', 'unlink', 'prune', 'rebuild', 'patch', 'patch-commit',
  ]).has(command[0] ?? '')
}

/**
 * Native Profile manager. Its only durable state is the Profile's existing
 * manifest, lockfile, installed dependency tree, and ordered Bundle list.
 */
export class ProfilePluginManager {
  /** Target Profile name selected by the launcher. */
  readonly profile: string
  /** Resolved target Profile directory. */
  readonly dir: string
  private readonly installAnchor: string
  private readonly invokingCwd: string
  private readonly home: string | undefined
  private snapshotCache: { stamp: string; snapshot: ProfilePluginSnapshot } | undefined
  private readonly installedFactsCache = new Map<string, InstalledFacts>()

  /** @param options - target Profile, installation resolution anchor, and invoking directory. */
  constructor(options: ProfilePluginManagerOptions) {
    this.profile = options.profile
    this.installAnchor = options.installAnchor
    this.invokingCwd = options.invokingCwd ?? process.cwd()
    this.home = options.home
    this.dir = resolveProfileDir(options.profile, options.home)
  }

  /**
   * Initialize the target Profile when absent.
   * @returns true only when this call created its manifest.
   */
  ensureProfile(): boolean {
    if (existsSync(join(this.dir, 'package.json'))) return false
    initProfile(this.dir, PROFILE_TEMPLATES[this.profile] ?? DEFAULT_PROFILE_BUNDLES)
    return true
  }

  /**
   * Read native dependency and Bundle state without creating another store.
   * @returns a detached Profile snapshot.
   */
  snapshot(): ProfilePluginSnapshot {
    this.ensureProfile()
    const stamp = this.profileStamp()
    if (this.snapshotCache?.stamp === stamp) return this.snapshotCache.snapshot
    this.installedFactsCache.clear()
    const manifest = readProfileManifest(NAME, this.dir)
    const dependencies = { ...manifest.dependencies }
    const bundles = [...manifest.dsh?.profile?.bundles ?? []]
    const plugins = Object.entries(dependencies).map(([packageName, spec]) =>
      this.inspectInstalled(packageName, spec, bundles))
    const snapshot = Object.freeze({
      profile: this.profile,
      dir: this.dir,
      dependencies: Object.freeze(dependencies),
      bundles: Object.freeze(bundles),
      plugins: Object.freeze(plugins),
    })
    this.snapshotCache = { stamp, snapshot }
    return snapshot
  }

  /**
   * Run pnpm asynchronously inside the Profile and reconcile Bundle state.
   * @param args - native pnpm arguments.
   * @param options - cancellation and non-secret output callback.
   * @returns command output, resulting native snapshot, and restart impact.
   */
  async run(args: readonly string[], options: ProfilePluginRunOptions = {}): Promise<ProfilePluginOperationResult> {
    options.signal?.throwIfAborted()
    const initialized = this.ensureProfile()
    const beforeSnapshot = this.snapshot()
    const before = readProfileManifest(NAME, this.dir)
    const command = args.map(argument => this.anchorPathSpec(argument))
    let stdout = ''
    let stderr = ''
    const exitCode = await new Promise<number>((resolvePromise, reject) => {
      const child = crossSpawn('pnpm', command, {
        cwd: this.dir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const abort = (): void => { child.kill() }
      options.signal?.addEventListener('abort', abort, { once: true })
      if (child.stdout === null || child.stderr === null) {
        reject(new Error('pnpm output pipes are unavailable'))
        return
      }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout = appendBounded(stdout, chunk)
        options.onOutput?.('stdout', chunk)
      })
      child.stderr.on('data', (chunk: string) => {
        stderr = appendBounded(stderr, chunk)
        options.onOutput?.('stderr', chunk)
      })
      child.once('error', (error) => {
        options.signal?.removeEventListener('abort', abort)
        reject(error)
      })
      child.once('close', (code, signal) => {
        options.signal?.removeEventListener('abort', abort)
        if (options.signal?.aborted === true) {
          const reason = options.signal.reason as unknown
          reject(reason instanceof Error ? reason : new Error('pnpm operation aborted', { cause: reason }))
          return
        }
        if (signal !== null) {
          reject(new Error(`pnpm terminated by signal ${signal}`))
          return
        }
        resolvePromise(code ?? 1)
      })
    }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return 127
      throw error
    })
    this.forgetInstalled()
    const warnings = exitCode === 0 ? this.reconcile(before) : this.failureWarnings(command, exitCode)
    const snapshot = this.snapshot()
    const changed = initialized || !sameSnapshotState(beforeSnapshot, snapshot)
    return {
      profile: this.profile,
      dir: this.dir,
      command: ['pnpm', ...command.map(safeDependencySpec)],
      exitCode,
      stdout,
      stderr,
      warnings,
      initialized,
      changed,
      restartRequired: exitCode === 0 && (changed || mutatesProfile(command)),
      snapshot,
    }
  }

  /**
   * Run pnpm synchronously for the compatible `dsh plugin` entry.
   * @param args - native pnpm arguments.
   * @param stdio - child stdio policy; the CLI uses `inherit`.
   * @returns exit status and resulting native snapshot.
   */
  runSync(args: readonly string[], stdio: SpawnSyncOptions['stdio'] = 'inherit'): ProfilePluginOperationResult {
    const initialized = this.ensureProfile()
    const beforeSnapshot = this.snapshot()
    const before = readProfileManifest(NAME, this.dir)
    const command = args.map(argument => this.anchorPathSpec(argument))
    const result = crossSpawn.sync('pnpm', command, {
      cwd: this.dir,
      encoding: 'utf8',
      stdio,
    })
    const spawnError = result.error ?? undefined
    const exitCode = spawnError === undefined
      ? result.status ?? 1
      : (spawnError as NodeJS.ErrnoException).code === 'ENOENT' ? 127 : 1
    if (spawnError !== undefined && (spawnError as NodeJS.ErrnoException).code !== 'ENOENT') throw spawnError
    this.forgetInstalled()
    const warnings = exitCode === 0 ? this.reconcile(before) : this.failureWarnings(command, exitCode)
    const snapshot = this.snapshot()
    const changed = initialized || !sameSnapshotState(beforeSnapshot, snapshot)
    return {
      profile: this.profile,
      dir: this.dir,
      command: ['pnpm', ...command.map(safeDependencySpec)],
      exitCode,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      warnings,
      initialized,
      changed,
      restartRequired: exitCode === 0 && (changed || mutatesProfile(command)),
      snapshot,
    }
  }

  /**
   * Replace Bundle order after proving the exact current multiset is retained.
   * @param orderedBundles - complete next Bundle order.
   * @returns the resulting native snapshot.
   */
  reorderBundles(orderedBundles: readonly string[]): ProfilePluginSnapshot {
    this.ensureProfile()
    const manifest = readProfileManifest(NAME, this.dir)
    const current = manifest.dsh?.profile?.bundles ?? []
    if (new Set(orderedBundles).size !== orderedBundles.length || !sameMultiset(current, orderedBundles)) {
      throw new Error('bundle reorder must contain every current Bundle exactly once')
    }
    manifest.dsh = {
      ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles: [...orderedBundles] },
    }
    writeProfileManifest(this.dir, manifest)
    this.forgetInstalled()
    return this.snapshot()
  }

  /**
   * Check native Profile composition and pnpm availability.
   * @returns structured diagnostics without running plugin code.
   */
  doctor(): ProfileDoctorResult {
    const snapshot = this.snapshot()
    const diagnostics: Array<{ level: 'info' | 'warning' | 'error'; message: string }> = []
    const version = crossSpawn.sync('pnpm', ['--version'], {
      cwd: this.dir,
      encoding: 'utf8',
    })
    const pnpm = version.status === 0 && typeof version.stdout === 'string' ? version.stdout.trim() : undefined
    diagnostics.push(pnpm === undefined
      ? { level: 'error', message: ui('pnpm 不可用；Profile 插件操作需要 PATH 中的 pnpm', 'pnpm is unavailable; Profile plugin operations require pnpm on PATH') }
      : { level: 'info', message: `pnpm ${pnpm}` })
    for (const plugin of snapshot.plugins) {
      for (const diagnostic of plugin.diagnostics) {
        diagnostics.push({ level: plugin.active ? 'error' : 'warning', message: `${plugin.name}: ${diagnostic}` })
      }
    }
    for (const bundle of snapshot.bundles) {
      const facts = this.installedFacts(bundle)
      const patch = facts.manifest?.dsh?.bundle?.patch
      if (facts.manifest === undefined) {
        diagnostics.push({
          level: 'error',
          message: facts.diagnostic ?? ui(`${bundle} 无法读取已安装清单`, `${bundle} cannot read the installed manifest`),
        })
      } else if (patch === undefined) {
        diagnostics.push({
          level: 'error',
          message: ui(`${bundle} 未声明 dsh.bundle.patch`, `${bundle} does not declare dsh.bundle.patch`),
        })
      } else if (!facts.patchValid) {
        diagnostics.push({
          level: 'error',
          message: ui(`${bundle} 的 Bundle patch 缺失或格式无效`, `The Bundle patch of ${bundle} is missing or invalid`),
        })
      }
    }
    if (diagnostics.every(item => item.level !== 'error')) {
      diagnostics.push({
        level: 'info',
        message: ui('Profile Bundle 结构可解析', 'Profile Bundle structure is valid'),
      })
    }
    return { profile: this.profile, ...(pnpm === undefined ? {} : { pnpm }), diagnostics, snapshot }
  }

  /**
   * List initialized Profile directories under the same Harness home.
   * @returns sorted Profile summaries with compatibility diagnostics.
   */
  listProfiles(): readonly ProfileSummary[] {
    const root = join(this.home ?? resolve(this.dir, '..', '..'), PROFILES_DIR)
    const names = new Set(Object.keys(PROFILE_TEMPLATES))
    if (existsSync(root)) {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== 'node_modules') names.add(entry.name)
      }
    }
    return [...names]
      .map(name => this.profileSummary(name))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  /**
   * Create a Profile from a shipped template or a copy of another Profile.
   * Installed dependencies are deliberately not copied; `pnpm install` is the
   * native materialization step and remains explicit to the caller.
   * @param name - new Profile name.
   * @param copyFrom - optional source Profile name.
   * @param options - optional Bundle additions/removals owned by the caller's product Surface.
   * @returns the created Profile summary.
   */
  createProfile(name: string, copyFrom?: string, options: ProfileCreateOptions = {}): ProfileSummary {
    const target = resolveProfileDir(name, this.home)
    if (existsSync(join(target, 'package.json'))) {
      throw new Error(ui(
        `Profile ${JSON.stringify(name)} 已存在`,
        `Profile ${JSON.stringify(name)} already exists`,
      ))
    }
    if (copyFrom === undefined) {
      initProfile(target, convertedBundles(
        PROFILE_TEMPLATES[name] ?? PROFILE_TEMPLATES.tui ?? DEFAULT_PROFILE_BUNDLES,
        options,
      ))
      return this.profileSummary(name)
    }
    const source = resolveProfileDir(copyFrom, this.home)
    const sourceManifest = readProfileManifest(NAME, source)
    const bundles = convertedBundles(sourceManifest.dsh?.profile?.bundles ?? [], options)
    mkdirSync(target, { recursive: true })
    writeProfileManifest(target, {
      ...sourceManifest,
      name: `dsh-profile-${basename(target)}`,
      dependencies: { ...sourceManifest.dependencies },
      dsh: {
        ...sourceManifest.dsh,
        profile: { ...sourceManifest.dsh?.profile, bundles },
      },
    })
    for (const filename of [PROFILE_PATCH_FILENAME, 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
      const sourcePath = join(source, filename)
      if (existsSync(sourcePath)) copyFileSync(sourcePath, join(target, filename))
    }
    if (!existsSync(join(target, PROFILE_PATCH_FILENAME))) {
      initProfile(target, bundles)
    }
    return this.profileSummary(name)
  }

  private profileSummary(name: string): ProfileSummary {
    const dir = resolveProfileDir(name, this.home)
    const initialized = existsSync(join(dir, 'package.json'))
    try {
      const manifest = initialized ? readProfileManifest(NAME, dir) : undefined
      const bundles = [...manifest?.dsh?.profile?.bundles ?? PROFILE_TEMPLATES[name] ?? []]
      for (const bundle of bundles) resolveBundleDir(NAME, bundle, this.installAnchor, dir)
      return {
        name,
        dir,
        initialized,
        bundles,
        dependencyCount: Object.keys(manifest?.dependencies ?? {}).length,
        compatible: true,
      }
    } catch (error) {
      return {
        name,
        dir,
        initialized,
        bundles: [],
        dependencyCount: 0,
        compatible: false,
        diagnostic: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private inspectInstalled(packageName: string, spec: string, bundles: readonly string[]): ProfilePluginEntry {
    const facts = this.installedFacts(packageName)
    const diagnostics: string[] = []
    if (facts.diagnostic !== undefined) diagnostics.push(facts.diagnostic)
    const patch = facts.manifest?.dsh?.bundle?.patch
    if (patch !== undefined && !facts.patchValid) {
      diagnostics.push(ui(
        `声明的 Bundle patch ${JSON.stringify(patch)} 缺失或格式无效`,
        `Declared Bundle patch ${JSON.stringify(patch)} is missing or invalid`,
      ))
    }
    if (bundles.includes(packageName) && patch === undefined) {
      diagnostics.push(ui(
        '位于 Bundle 顺序中但未声明 dsh.bundle.patch',
        'Listed in Bundle order but does not declare dsh.bundle.patch',
      ))
    }
    return Object.freeze({
      name: packageName,
      spec: safeDependencySpec(spec),
      ...(facts.manifest?.version === undefined ? {} : { version: facts.manifest.version }),
      ...(facts.manifest?.description === undefined ? {} : { description: facts.manifest.description }),
      source: inferSource(spec),
      bundle: patch !== undefined,
      active: bundles.includes(packageName),
      ...(patch === undefined ? {} : { patch }),
      patchValid: facts.patchValid,
      scripts: Object.freeze(Object.keys(facts.manifest?.scripts ?? {})),
      diagnostics: Object.freeze(diagnostics),
    })
  }

  private reconcile(before: ProfileManifest): readonly string[] {
    const after = readProfileManifest(NAME, this.dir)
    const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
    const dependencies = Object.keys(after.dependencies ?? {})
    const bundles = [...after.dsh?.profile?.bundles ?? []]
    const warnings: string[] = []
    let changed = false
    for (const packageName of dependencies) {
      const isBundle = this.exportsPatch(packageName)
      if (isBundle && !bundles.includes(packageName)) {
        bundles.push(packageName)
        changed = true
      } else if (!isBundle && !beforeDeps.has(packageName)) {
        warnings.push(ui(
          `${packageName} 未声明 dsh.bundle；它只是 Profile 依赖，不会成为 Harness Bundle`,
          `${packageName} does not declare dsh.bundle; it is only a Profile dependency and will not become a Harness Bundle`,
        ))
      }
    }
    const dependencySet = new Set(dependencies)
    for (const packageName of [...bundles]) {
      const managed = beforeDeps.has(packageName) || dependencySet.has(packageName)
      const stillBundle = dependencySet.has(packageName) && this.exportsPatch(packageName)
      if (managed && !stillBundle) {
        bundles.splice(bundles.indexOf(packageName), 1)
        changed = true
      }
    }
    if (changed) {
      after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles } }
      writeProfileManifest(this.dir, after)
      this.forgetInstalled()
    }
    return warnings
  }

  private exportsPatch(packageName: string): boolean {
    const facts = this.installedFacts(packageName)
    return facts.manifest?.dsh?.bundle?.patch !== undefined && facts.patchValid
  }

  private installedFacts(packageName: string): InstalledFacts {
    const cached = this.installedFactsCache.get(packageName)
    if (cached !== undefined) return cached
    let facts: InstalledFacts
    try {
      const packageDir = resolveBundleDir(NAME, packageName, this.installAnchor, this.dir)
      const manifest = readInstalledManifest(packageDir)
      const patch = manifest.dsh?.bundle?.patch
      facts = {
        packageDir,
        manifest,
        patchValid: patch !== undefined && validPatch(packageDir, patch),
      }
    } catch (error) {
      facts = {
        patchValid: false,
        diagnostic: error instanceof Error ? error.message : String(error),
      }
    }
    this.installedFactsCache.set(packageName, facts)
    return facts
  }

  private profileStamp(): string {
    const path = join(this.dir, 'package.json')
    return existsSync(path) ? String(statSync(path).mtimeMs) : 'missing'
  }

  private forgetInstalled(): void {
    this.snapshotCache = undefined
    this.installedFactsCache.clear()
  }

  private anchorPathSpec(argument: string): string {
    const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
    if (match?.groups?.path === undefined) return argument
    return `${match.groups.prefix ?? ''}${resolve(this.invokingCwd, match.groups.path)}`
  }

  private failureWarnings(command: readonly string[], exitCode: number): readonly string[] {
    if (exitCode === 127) {
      return [ui('pnpm 不在 PATH 中；请安装 pnpm 后重试', 'pnpm is not on PATH; install pnpm and retry')]
    }
    const warnings = [ui(
      `pnpm 在 Profile 目录 ${this.dir} 中失败，退出码 ${exitCode}`,
      `pnpm failed in Profile directory ${this.dir} with exit code ${exitCode}`,
    )]
    if (command.some(argument => /^git\+|^github:|\.git(?:#|$)/.test(argument))) {
      warnings.push(ui(
        `Git 插件的 prepare/install 脚本可能需要在 ${join(this.dir, 'pnpm-workspace.yaml')} 的 allowBuilds 中明确授权`,
        `prepare/install scripts for a Git plugin may need an explicit allowBuilds entry in ${join(this.dir, 'pnpm-workspace.yaml')}`,
      ))
    }
    return warnings
  }
}
