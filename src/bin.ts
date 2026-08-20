#!/usr/bin/env node

/** Product launcher that provisions and boots the native dsh Profile. */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
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
  scanLatestVersions,
  updateAdvice,
  updatePlan,
} from './version-scan.ts'
import { measureStartupSync } from './startup-trace.ts'

const LEGACY_PACKAGE_NAME = 'deepseek-tui'
const DEFAULT_SPEC = defaultPluginSpec(PACKAGE_VERSION)
const DSH_INSTALL_SPEC = `@deepseek-ai/dsh@${DSH_COMPATIBILITY.tested}`

/** True when the launcher should run the update flow instead of booting. */
export function isUpdateRequest(args: readonly string[]): boolean {
  return args.includes('--update')
}

function installedFacts(environment: NodeJS.ProcessEnv): InstalledFacts {
  return {
    dshTested: DSH_COMPATIBILITY.tested,
    seekttyVersion: PACKAGE_VERSION,
    dshPinned: (environment.DSH_BIN?.trim() ?? '') !== '',
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
  const manifestPath = join(resolveProfileDir(profile), 'package.json')
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

/** Replaceable spawn seam used by launcher tests. */
export const internals: {
  spawnSync: (
    command: string,
    args: readonly string[],
    options: typeof DSH_SPAWN_OPTIONS,
  ) => { error?: Error | null; signal: NodeJS.Signals | null; status: number | null }
} = {
  spawnSync: (command, args, options) => crossSpawn.sync(command, [...args], options),
}

function missingDshMessage(command: string, english: boolean): string {
  return [
    launcherCopy(
      `${command} 未安装或不在 PATH 中。`,
      `${command} is not installed or not on PATH.`,
      english,
    ),
    launcherCopy(
      `请先安装 DeepSeek Harness：pnpm add --global ${DSH_INSTALL_SPEC}`,
      `Install DeepSeek Harness: pnpm add --global ${DSH_INSTALL_SPEC}`,
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
  const stderr = (chunk: string): void => { process.stderr.write(chunk) }
  let manifest = measureStartupSync('launcher-manifest', () => profileManifest(profile, environment), environment, stderr)
  if (hasDependency(manifest, LEGACY_PACKAGE_NAME)) {
    const status = execute(dsh, ['plugin', '--profile', profile, 'remove', LEGACY_PACKAGE_NAME])
    if (status !== 0) return status
    manifest = measureStartupSync('launcher-manifest', () => profileManifest(profile, environment), environment, stderr)
  }
  if (!hasDependency(manifest, PACKAGE_NAME)) {
    const spec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC
    const status = measureStartupSync(
      'plugin-add',
      () => execute(dsh, ['plugin', '--profile', profile, 'add', spec]),
      environment,
      stderr,
    )
    if (status !== 0) return status
  }
  return execute(dsh, ['--profile', profile, ...inner])
}

/**
 * `deepseek --update`: scan the live dsh and SeekTTY release channels, then
 * update the global dsh install (unless DSH_BIN pins it) and the SeekTTY
 * Bundle inside the target Profile through native `dsh plugin add`.
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
  const facts = installedFacts(environment)
  const result = await scan()
  if (result.dshLatest === undefined && result.seekttyLatestTag === undefined) {
    write(launcherCopy(
      '无法访问 npm Registry 或 GitHub Releases，请检查网络后重试。\n',
      'Could not reach the npm Registry or GitHub Releases. Check the network and retry.\n',
      english,
    ))
    return 1
  }
  const plan = updatePlan(result, facts)
  if (facts.dshPinned) {
    write(launcherCopy(
      'DSH_BIN 已固定 dsh 可执行文件，跳过 dsh 更新。\n',
      'DSH_BIN pins the dsh executable; skipping the dsh update.\n',
      english,
    ))
  }
  if (plan.dshSpec !== undefined) {
    write(launcherCopy(`更新 dsh：pnpm add --global ${plan.dshSpec}\n`, `Updating dsh: pnpm add --global ${plan.dshSpec}\n`, english))
    let status: number
    try {
      status = execute('pnpm', ['add', '--global', plan.dshSpec])
    } catch {
      write(launcherCopy(
        `pnpm 不可用。请手动运行：pnpm add --global ${plan.dshSpec}\n`,
        `pnpm is unavailable. Run manually: pnpm add --global ${plan.dshSpec}\n`,
        english,
      ))
      return 1
    }
    if (status !== 0) return status
  }
  if (plan.seekttySpec !== undefined) {
    const dsh = environment.DSH_BIN?.trim() || 'dsh'
    write(launcherCopy(`更新 SeekTTY：dsh plugin --profile ${profile} add ${plan.seekttySpec}\n`, `Updating SeekTTY: dsh plugin --profile ${profile} add ${plan.seekttySpec}\n`, english))
    const status = execute(dsh, ['plugin', '--profile', profile, 'add', plan.seekttySpec])
    if (status !== 0) return status
  } else {
    write(launcherCopy(
      `SeekTTY 已是最新版本（${PACKAGE_VERSION}）。\n`,
      `SeekTTY is already the latest version (${PACKAGE_VERSION}).\n`,
      english,
    ))
  }
  return 0
}

/**
 * Passive post-session check. Prints advice lines to stderr when newer dsh or
 * SeekTTY releases exist. Disabled with SEEKTTY_UPDATE_CHECK=0; every network
 * failure is silent.
 */
export async function postSessionUpdateNotice(
  environment: NodeJS.ProcessEnv = process.env,
  write: (chunk: string) => void = chunk => { process.stderr.write(chunk) },
  scan: typeof scanLatestVersions = scanLatestVersions,
): Promise<void> {
  if (environment.SEEKTTY_UPDATE_CHECK?.trim() === '0') return
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
