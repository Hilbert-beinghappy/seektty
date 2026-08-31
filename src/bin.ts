#!/usr/bin/env node

/** Product launcher that provisions and boots the native dsh Profile. */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import crossSpawn from 'cross-spawn'
import {
  DSH_COMPATIBILITY,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  defaultPluginSpec,
  isVersionRequest,
  launcherCopy,
  launcherPrefersEnglish,
  versionMessage,
} from './dsh-compat.ts'
import {
  type InstalledFacts,
  type UpdatePlan,
  DEFAULT_SCAN_TIMEOUT_MS,
  exclusiveUpdatePlan,
  parseDshCliVersion,
  scanLatestVersions,
  updateAdvice,
  updatePlan,
} from './version-scan.ts'
import { measureStartupSync } from './startup-trace.ts'
import {
  dshPluginArgs,
  dshPluginCommand,
  pnpmCommand,
  pnpmGvsRecoveryAdvice,
  isPnpmGlobalVirtualStorePath,
  withPnpmGvsCompatibility,
} from './pnpm-compat.ts'

const LEGACY_PACKAGE_NAME = 'deepseek-tui'
const DEFAULT_SPEC = defaultPluginSpec(PACKAGE_VERSION)
const DSH_INSTALL_SPEC = `@deepseek-ai/dsh@${DSH_COMPATIBILITY.tested}`

function resolveProfileDir(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (
    name === ''
    || name === '.'
    || name === '..'
    || name === 'node_modules'
    || name.includes('/')
    || name.includes('\\')
  ) {
    throw new Error(`dsh: invalid profile name ${JSON.stringify(name)}`)
  }
  const configuredValue = Object.hasOwn(environment, 'DSH_HOME')
    ? environment.DSH_HOME
    : process.env.DSH_HOME
  const configured = configuredValue?.trim()
  const rawHome = configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured
  const expandedHome = rawHome === '~'
    ? homedir()
    : rawHome.startsWith('~/') || rawHome.startsWith('~\\')
      ? join(homedir(), rawHome.slice(2))
      : rawHome
  return join(resolve(expandedHome), 'profiles', name)
}

/** True when the launcher should run the update flow instead of booting. */
export function isUpdateRequest(args: readonly string[]): boolean {
  return args.includes('--update')
}

/** How the launcher follows the npm `latest` dist-tags for official dsh and SeekTTY. */
export type UpdateMode = 'auto' | 'check' | 'off'

/**
 * Resolve the update policy. Default is auto. `SEEKTTY_UPDATE` wins over the
 * legacy `SEEKTTY_UPDATE_CHECK=0` off switch.
 */
export function updateMode(environment: NodeJS.ProcessEnv = process.env): UpdateMode {
  const explicit = environment.SEEKTTY_UPDATE?.trim().toLowerCase()
  if (explicit !== undefined && explicit !== '') {
    if (explicit === '0' || explicit === 'off' || explicit === 'false' || explicit === 'manual') return 'off'
    if (explicit === 'check' || explicit === 'notice') return 'check'
    return 'auto'
  }
  return environment.SEEKTTY_UPDATE_CHECK?.trim() === '0' ? 'off' : 'auto'
}

/** True when a plugin spec is a local path, file URL, or link, not a release. */
export function isLocalPluginSpec(spec: string | undefined): boolean {
  if (spec === undefined) return false
  const value = spec.trim()
  if (value === '') return false
  if (/^(?:file:|link:)/iu.test(value)) return true
  if (/^(?:git\+|github:|gitlab:|bitbucket:|https?:|npm:)/iu.test(value)) return false
  return value.startsWith('.') || value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value)
}

function installedFacts(environment: NodeJS.ProcessEnv, profile = 'tui'): InstalledFacts {
  const override = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || ''
  const installedSpec = profileManifest(profile, environment)?.dependencies?.[PACKAGE_NAME]
  const dshPinned = (environment.DSH_BIN?.trim() ?? '') !== ''
  return {
    dshTested: DSH_COMPATIBILITY.tested,
    dshInstalled: dshPinned ? undefined : internals.readInstalledDshVersion('dsh', environment),
    seekttyVersion: PACKAGE_VERSION,
    dshPinned,
    seekttyPinned: override !== '' || isLocalPluginSpec(installedSpec),
  }
}

interface ProfileManifest {
  readonly dependencies?: Readonly<Record<string, string>>
}

export function launcherArgs(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): { profile: string; inner: string[] } {
  let profile = 'tui'
  const inner: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--profile') {
      const value = args[index + 1]
      if (value === undefined || value.trim() === '') {
        throw new Error(launcherCopy(
          '--profile 需要一个 Profile 名称',
          '--profile requires a Profile name',
          launcherPrefersEnglish(environment),
        ))
      }
      profile = value
      index += 1
      continue
    }
    if (argument?.startsWith('--profile=') === true) {
      const value = argument.slice('--profile='.length)
      if (value === '') {
        throw new Error(launcherCopy(
          '--profile 需要一个 Profile 名称',
          '--profile requires a Profile name',
          launcherPrefersEnglish(environment),
        ))
      }
      profile = value
      continue
    }
    if (argument !== undefined) inner.push(argument)
  }
  return { profile, inner }
}

function profileManifest(
  profile: string,
  environment: NodeJS.ProcessEnv = process.env,
): ProfileManifest | undefined {
  const manifestPath = join(resolveProfileDir(profile, environment), 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const raw = readFileSync(manifestPath, 'utf8')
  try {
    return JSON.parse(raw) as ProfileManifest
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const english = launcherPrefersEnglish(environment)
    throw new Error([
      launcherCopy(
        `无法解析 Profile manifest ${manifestPath}：${detail}`,
        `Cannot parse Profile manifest ${manifestPath}: ${detail}`,
        english,
      ),
      launcherCopy(
        '删除该文件后 deepseek 会重新初始化 Profile。',
        'Delete that file and deepseek will re-initialize the Profile.',
        english,
      ),
    ].join('\n'))
  }
}

function hasDependency(manifest: ProfileManifest | undefined, name: string): boolean {
  return manifest?.dependencies?.[name] !== undefined
}

export function installed(profile: string): boolean {
  return hasDependency(profileManifest(profile), PACKAGE_NAME)
}

/** Spawn options that resolve PATHEXT shims on Windows and hide extra consoles. */
export const DSH_SPAWN_OPTIONS = { stdio: 'inherit' as const, windowsHide: true }

/**
 * Env for `dsh --version`. Keep a normal subprocess environment so wrappers
 * that need HOME or NODE_OPTIONS still work. SeekTTY omits the caller's
 * explicit DSH_HOME; DSH_BIN is pinned and is not probed.
 */
export function dshVersionProbeEnv(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env, ...environment }
  delete env.DSH_HOME
  return env
}

/** Replaceable spawn seam used by launcher tests. */
export const internals: {
  spawnSync: (
    command: string,
    args: readonly string[],
    options: typeof DSH_SPAWN_OPTIONS,
  ) => { error?: Error | null; signal: NodeJS.Signals | null; status: number | null }
  /**
   * Read the installed Host version from PATH `dsh --version`.
   * DSH_BIN is pinned and is not probed. SeekTTY only captures the command's
   * version output; it does not inspect Profile or Session files itself.
   */
  readInstalledDshVersion: (command: string, environment: NodeJS.ProcessEnv) => string | undefined
} = {
  spawnSync: (command, args, options) => crossSpawn.sync(command, [...args], options),
  readInstalledDshVersion: (command, environment) => {
    try {
      const result = crossSpawn.sync(command, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: DEFAULT_SCAN_TIMEOUT_MS,
        env: dshVersionProbeEnv(environment),
      })
      if (result.error != null || result.status !== 0 || result.signal != null) return undefined
      return parseDshCliVersion(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
    } catch {
      return undefined
    }
  },
}

function missingDshMessage(command: string, english: boolean): string {
  const installCommand = pnpmCommand(['add', '--global', DSH_INSTALL_SPEC])
  return [
    launcherCopy(
      `${command} 未安装或不在 PATH 中。`,
      `${command} is not installed or not on PATH.`,
      english,
    ),
    launcherCopy(
      `请先安装 DeepSeek Harness：${installCommand}`,
      `Install DeepSeek Harness: ${installCommand}`,
      english,
    ),
    launcherCopy(
      '或设置 DSH_BIN 指向 dsh 可执行文件后重试。',
      'Or set DSH_BIN to the dsh executable and retry.',
      english,
    ),
  ].join('\n')
}

function classifySpawnError(command: string, error: NodeJS.ErrnoException, english: boolean): Error {
  if (error.code === 'ENOENT') return new Error(missingDshMessage(command, english))
  return error
}

function realPathUsesPnpmGvs(path: string): boolean {
  try {
    return existsSync(path) && isPnpmGlobalVirtualStorePath(realpathSync(path))
  } catch {
    return false
  }
}

/**
 * Detect a visible pnpm 11 GVS installation without probing or changing pnpm
 * configuration. The launcher module covers Profile/global SeekTTY installs;
 * explicit dsh paths and PNPM_HOME cover the stock Host installation.
 */
export function launcherUsesPnpmGvsLayout(
  dsh: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const candidates = [fileURLToPath(import.meta.url)]
  if (dsh.includes('/') || dsh.includes('\\')) {
    candidates.push(dsh, join(dirname(dsh), 'node_modules', '@deepseek-ai', 'dsh'))
  }
  const pnpmHome = environment.PNPM_HOME?.trim()
  if (pnpmHome !== undefined && pnpmHome !== '') {
    candidates.push(join(pnpmHome, 'node_modules', '@deepseek-ai', 'dsh'))
  }
  return candidates.some(realPathUsesPnpmGvs)
}

export function run(command: string, args: readonly string[]): number {
  const result = internals.spawnSync(command, [...args], DSH_SPAWN_OPTIONS)
  const english = launcherPrefersEnglish(process.env)
  if (result.error != null) throw classifySpawnError(command, result.error, english)
  if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') return 130
  if (result.signal !== null) {
    throw new Error(launcherCopy(
      `${command} 被信号 ${result.signal} 终止`,
      `${command} was terminated by signal ${result.signal}`,
      english,
    ))
  }
  return result.status ?? 1
}

export function launch(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  execute: (command: string, args: readonly string[]) => number = run,
  write: (chunk: string) => void = chunk => { process.stdout.write(chunk) },
  writeError: (chunk: string) => void = chunk => { process.stderr.write(chunk) },
): number {
  if (isVersionRequest(args)) {
    write(versionMessage({
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      compatibility: DSH_COMPATIBILITY,
    }, launcherPrefersEnglish(environment)))
    return 0
  }
  const { profile, inner } = launcherArgs(args, environment)
  const dsh = environment.DSH_BIN?.trim() || 'dsh'
  const stderr = writeError
  let manifest = measureStartupSync('launcher-manifest', () => profileManifest(profile, environment), environment, stderr)
  const recoverySpec = environment.SEEKTTY_SPEC?.trim()
    || environment.DEEPSEEK_TUI_SPEC?.trim()
    || manifest?.dependencies?.[PACKAGE_NAME]
    || DEFAULT_SPEC
  let compatibilityHintWritten = false
  const finish = (status: number): number => {
    if (status === 0 || compatibilityHintWritten || !launcherUsesPnpmGvsLayout(dsh, environment)) return status
    compatibilityHintWritten = true
    writeError(`${pnpmGvsRecoveryAdvice({
      english: launcherPrefersEnglish(environment),
      profile,
      dshSpec: DSH_INSTALL_SPEC,
      pluginSpec: recoverySpec,
    })}\n`)
    return status
  }
  if (hasDependency(manifest, LEGACY_PACKAGE_NAME)) {
    const status = execute(dsh, dshPluginArgs(profile, ['remove', LEGACY_PACKAGE_NAME]))
    if (status !== 0) return finish(status)
    manifest = measureStartupSync('launcher-manifest', () => profileManifest(profile, environment), environment, stderr)
  }
  if (!hasDependency(manifest, PACKAGE_NAME)) {
    const spec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC
    const status = measureStartupSync(
      'plugin-add',
      () => execute(dsh, dshPluginArgs(profile, ['add', spec])),
      environment,
      stderr,
    )
    if (status !== 0) return finish(status)
  }
  return finish(execute(dsh, ['--profile', profile, ...inner]))
}

async function applyUpdatePlan(
  plan: UpdatePlan,
  profile: string,
  facts: InstalledFacts,
  english: boolean,
  environment: NodeJS.ProcessEnv,
  execute: (command: string, args: readonly string[]) => number,
  write: (chunk: string) => void,
  options: { readonly announcePinnedDsh: boolean; readonly announceCurrentSeektty: boolean },
): Promise<number> {
  const exclusive = exclusiveUpdatePlan(plan)
  if (options.announcePinnedDsh && facts.dshPinned) {
    write(launcherCopy(
      'DSH_BIN 已固定 dsh 可执行文件，跳过 dsh 更新。\n',
      'DSH_BIN pins the dsh executable; skipping the dsh update.\n',
      english,
    ))
  }
  if (exclusive.dshSpec !== undefined) {
    const command = pnpmCommand(['add', '--global', exclusive.dshSpec])
    write(launcherCopy(`更新 dsh：${command}\n`, `Updating dsh: ${command}\n`, english))
    let status: number
    try {
      status = execute('pnpm', withPnpmGvsCompatibility(['add', '--global', exclusive.dshSpec]))
    } catch {
      write(launcherCopy(
        `pnpm 不可用。请手动运行：${command}\n`,
        `pnpm is unavailable. Run manually: ${command}\n`,
        english,
      ))
      return 1
    }
    if (status !== 0) return status
  }
  if (exclusive.seekttySpec !== undefined) {
    const dsh = environment.DSH_BIN?.trim() || 'dsh'
    const command = dshPluginCommand(profile, ['add', exclusive.seekttySpec])
    write(launcherCopy(`更新 SeekTTY：${command}\n`, `Updating SeekTTY: ${command}\n`, english))
    const status = execute(dsh, dshPluginArgs(profile, ['add', exclusive.seekttySpec]))
    if (status !== 0) return status
  } else if (options.announceCurrentSeektty) {
    write(facts.seekttyPinned
      ? launcherCopy(
        'SeekTTY 已由本地路径、link 或 SEEKTTY_SPEC 固定，跳过 SeekTTY 更新。\n',
        'SeekTTY is pinned by a local path, link, or SEEKTTY_SPEC; skipping the SeekTTY update.\n',
        english,
      )
      : launcherCopy(
        `SeekTTY 已是最新版本（${PACKAGE_VERSION}）。\n`,
        `SeekTTY is already the latest version (${PACKAGE_VERSION}).\n`,
        english,
      ))
  }
  return 0
}

/**
 * `deepseek --update`: same permit gate as auto. At most one component.
 * Future/gap Hosts are printed and never installed.
 */
export async function runUpdate(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  execute: (command: string, args: readonly string[]) => number = run,
  write: (chunk: string) => void = chunk => { process.stdout.write(chunk) },
  scan: typeof scanLatestVersions = scanLatestVersions,
): Promise<number> {
  const english = launcherPrefersEnglish(environment)
  const { profile } = launcherArgs(args.filter(argument => argument !== '--update'), environment)
  write(launcherCopy('正在检查 dsh 与 SeekTTY 的最新版本…\n', 'Checking the latest dsh and SeekTTY versions…\n', english))
  const facts = installedFacts(environment, profile)
  const result = await scan()
  if (result.dshLatest === undefined && result.seekttyLatest === undefined) {
    write(launcherCopy(
      '无法访问 npm Registry，请检查网络后重试。\n',
      'Could not reach the npm Registry. Check the network and retry.\n',
      english,
    ))
    return 1
  }
  const plan = updatePlan(result, facts)
  if (plan.dshSpec === undefined && plan.seekttySpec === undefined) {
    const lines = updateAdvice(result, facts, english)
    if (lines.length > 0) write(`${lines.join('\n')}\n`)
  }
  return applyUpdatePlan(plan, profile, facts, english, environment, execute, write, {
    announcePinnedDsh: true,
    announceCurrentSeektty: true,
  })
}

/**
 * Default launch policy: fetch the npm `latest` dist-tags for official dsh and
 * SeekTTY, then apply them. Offline and install failures never block boot.
 */
export async function maybeAutoUpdate(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  execute: (command: string, args: readonly string[]) => number = run,
  write: (chunk: string) => void = chunk => { process.stderr.write(chunk) },
  scan: typeof scanLatestVersions = scanLatestVersions,
): Promise<void> {
  if (updateMode(environment) !== 'auto') return
  if (isVersionRequest(args) || isUpdateRequest(args)) return
  try {
    const english = launcherPrefersEnglish(environment)
    const { profile } = launcherArgs(args, environment)
    const facts = installedFacts(environment, profile)
    const result = await scan()
    const plan = updatePlan(result, facts)
    if (plan.dshSpec === undefined && plan.seekttySpec === undefined) return
    await applyUpdatePlan(plan, profile, facts, english, environment, execute, write, {
      announcePinnedDsh: false,
      announceCurrentSeektty: false,
    })
  } catch {
    // 静默：自动更新绝不能挡住启动。
  }
}

/**
 * Passive post-session check used by `SEEKTTY_UPDATE=check`.
 * Network failures are silent.
 */
export async function postSessionUpdateNotice(
  environment: NodeJS.ProcessEnv = process.env,
  write: (chunk: string) => void = chunk => { process.stderr.write(chunk) },
  scan: typeof scanLatestVersions = scanLatestVersions,
): Promise<void> {
  if (updateMode(environment) !== 'check') return
  try {
    const result = await scan()
    const lines = updateAdvice(result, installedFacts(environment), launcherPrefersEnglish(environment))
    if (lines.length > 0) write(`${lines.join('\n')}\n`)
  } catch {
    // 静默：更新提示绝不能影响正常退出。
  }
}

function directInvocation(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (directInvocation()) {
  const args = process.argv.slice(2)
  try {
    if (isUpdateRequest(args)) {
      process.exitCode = await runUpdate(args)
    } else {
      await maybeAutoUpdate(args)
      process.exitCode = launch(args)
      if (!isVersionRequest(args) && process.stderr.isTTY === true) {
        await postSessionUpdateNotice()
      }
    }
  } catch (error) {
    process.stderr.write(`deepseek: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
