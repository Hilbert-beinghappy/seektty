#!/usr/bin/env node

/** Product launcher that provisions and boots the native dsh Profile. */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import crossSpawn from 'cross-spawn'
import { APP_HANDOFF_ENV, writeAppHandoff } from './host/app-handoff.ts'
import {
  consumeLauncherRestart,
  LAUNCHER_RESTART_EXIT_CODE,
  type LauncherRestartRequest,
} from './launcher-restart.ts'

const PACKAGE_NAME = 'seektty'
const LEGACY_PACKAGE_NAME = 'deepseek-tui'
const DEFAULT_SPEC = 'github:Hilbert-beinghappy/seektty'
const DSH_INSTALL_SPEC = '@deepseek-ai/dsh@0.1.0-rc.6'

interface ProfileManifest {
  readonly dependencies?: Readonly<Record<string, string>>
}

/** Spawn options that resolve PATHEXT shims on Windows and hide extra consoles. */
export const DSH_SPAWN_OPTIONS = { stdio: 'inherit' as const, windowsHide: true }

/** Replaceable spawn seam used by launcher tests. */
export const internals: {
  spawnSync: (
    command: string,
    args: readonly string[],
    options: typeof DSH_SPAWN_OPTIONS & { env?: NodeJS.ProcessEnv },
  ) => { error?: Error | null; signal: NodeJS.Signals | null; status: number | null }
} = {
  spawnSync: (command, args, options) => crossSpawn.sync(command, args, options),
}

function launcherLocale(env: NodeJS.ProcessEnv = process.env): 'zh' | 'en' {
  const candidates = [
    env.LC_ALL,
    env.LC_MESSAGES,
    ...(env.LANGUAGE?.split(':') ?? []),
    env.LANG,
  ]
  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase()
    if (normalized === undefined || normalized === '') continue
    if (/^en(?:[-_.@]|$)/u.test(normalized)) return 'en'
    if (/^zh(?:[-_.@]|$)/u.test(normalized)) return 'zh'
  }
  return 'zh'
}

function launcherText(zh: string, en: string, env: NodeJS.ProcessEnv = process.env): string {
  return launcherLocale(env) === 'en' ? en : zh
}

function missingDshMessage(command: string): string {
  return [
    launcherText(
      `${command} 未安装或不在 PATH 中。`,
      `${command} is not installed or not on PATH.`,
    ),
    launcherText(
      `请先安装 DeepSeek Harness：pnpm add --global ${DSH_INSTALL_SPEC}`,
      `Install DeepSeek Harness: pnpm add --global ${DSH_INSTALL_SPEC}`,
    ),
    launcherText(
      '或设置 DSH_BIN 指向 dsh 可执行文件后重试。',
      'Or set DSH_BIN to the dsh executable and retry.',
    ),
  ].join('\n')
}

function classifySpawnError(command: string, error: NodeJS.ErrnoException): Error {
  if (error.code === 'ENOENT') return new Error(missingDshMessage(command))
  return error instanceof Error ? error : new Error(String(error))
}

function readProfileManifest(path: string): ProfileManifest {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
  try {
    return JSON.parse(raw) as ProfileManifest
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error([
      launcherText(
        `无法解析 Profile manifest ${path}：${detail}`,
        `Cannot parse Profile manifest ${path}: ${detail}`,
      ),
      launcherText(
        '删除该文件后 deepseek 会重新初始化 Profile。',
        'Delete that file and deepseek will re-initialize the Profile.',
      ),
    ].join('\n'))
  }
}

export function launcherArgs(args: readonly string[]): { profile: string; inner: string[] } {
  let profile = 'tui'
  const inner: string[] = []
  const profileRequired = launcherText('--profile 需要一个 Profile 名称', '--profile requires a Profile name')
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--profile') {
      const value = args[index + 1]
      if (value === undefined || value.trim() === '') throw new Error(profileRequired)
      profile = value
      index += 1
      continue
    }
    if (argument?.startsWith('--profile=') === true) {
      const value = argument.slice('--profile='.length)
      if (value === '') throw new Error(profileRequired)
      profile = value
      continue
    }
    if (argument !== undefined) inner.push(argument)
  }
  return { profile, inner }
}

function hasDependency(profile: string, name: string): boolean {
  const manifestPath = join(resolveProfileDir(profile), 'package.json')
  if (!existsSync(manifestPath)) return false
  const manifest = readProfileManifest(manifestPath)
  return manifest.dependencies?.[name] !== undefined
}

export function installed(profile: string): boolean {
  return hasDependency(profile, PACKAGE_NAME)
}

export function run(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  const result = internals.spawnSync(command, [...args], { ...DSH_SPAWN_OPTIONS, env })
  if (result.error != null) throw classifySpawnError(command, result.error)
  if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') return 130
  if (result.signal !== null) {
    throw new Error(launcherText(
      `${command} 被信号 ${result.signal} 终止`,
      `${command} was terminated by ${result.signal}`,
    ))
  }
  return result.status ?? 1
}

function forwardedCwd(inner: readonly string[]): string {
  for (let index = 0; index < inner.length; index += 1) {
    const argument = inner[index]
    if (argument === '--cwd') {
      const value = inner[index + 1]
      if (value !== undefined && value.trim() !== '') return resolve(value)
    }
    if (argument?.startsWith('--cwd=') === true) {
      const value = argument.slice('--cwd='.length)
      if (value !== '') return resolve(value)
    }
  }
  return resolve(process.cwd())
}

function forwardedResume(inner: readonly string[]): string | undefined {
  for (let index = 0; index < inner.length; index += 1) {
    const argument = inner[index]
    if (argument === '--resume') {
      const value = inner[index + 1]
      if (value !== undefined && !value.startsWith('-') && value.trim() !== '') return value
      return undefined
    }
    if (argument?.startsWith('--resume=') === true) {
      const value = argument.slice('--resume='.length)
      if (value !== '') return value
    }
  }
  return undefined
}

/** Test seams for the outer-wait restart loop. */
export interface LaunchHooks {
  readonly pid?: number
  consumeRestart?(pid: number): LauncherRestartRequest | undefined
  writeFallbackHandoff?(payload: unknown): string
}

export function launch(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  execute: (command: string, args: readonly string[], env?: NodeJS.ProcessEnv) => number = run,
  hooks: LaunchHooks = {},
): number {
  let { profile, inner } = launcherArgs(args)
  const dsh = environment.DSH_BIN?.trim() || 'dsh'
  const spec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC
  const pid = hooks.pid ?? process.pid
  const consumeRestart = hooks.consumeRestart ?? consumeLauncherRestart
  const writeFallbackHandoff = hooks.writeFallbackHandoff ?? ((payload: unknown) => writeAppHandoff('seektty-v1', payload))
  consumeLauncherRestart(pid)
  let previous: { profile: string; inner: string[] } | undefined
  let fallingBack = false
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...environment }

  const recover = (failedProfile: string, reason: string): boolean => {
    if (previous === undefined || fallingBack) return false
    fallingBack = true
    const notice = launcherText(
      `无法启动 Profile ${failedProfile}，已回退到 ${previous.profile}：${reason}`,
      `Could not start Profile ${failedProfile}; fell back to ${previous.profile}: ${reason}`,
    )
    process.stderr.write(`deepseek: ${notice}\n`)
    profile = previous.profile
    inner = previous.inner
    const resume = forwardedResume(inner)
    try {
      childEnv[APP_HANDOFF_ENV] = writeFallbackHandoff({
        profile,
        cwd: forwardedCwd(inner),
        attachmentPaths: [],
        notice,
        ...(resume === undefined ? {} : { resume }),
      })
    } catch { /* stderr already carried the reason */ }
    return true
  }

  while (true) {
    try {
      if (hasDependency(profile, LEGACY_PACKAGE_NAME)) {
        const status = execute(dsh, ['plugin', '--profile', profile, 'remove', LEGACY_PACKAGE_NAME], childEnv)
        if (status !== 0) {
          if (recover(profile, `exit ${status}`)) continue
          return status
        }
      }
      if (!installed(profile)) {
        const status = execute(dsh, ['plugin', '--profile', profile, 'add', spec], childEnv)
        if (status !== 0) {
          if (recover(profile, `exit ${status}`)) continue
          return status
        }
      }
      const status = execute(dsh, ['--profile', profile, ...inner], childEnv)
      if (status === 130) return status
      if (status !== LAUNCHER_RESTART_EXIT_CODE) return status
      const ticket = consumeRestart(pid)
      if (ticket === undefined) return status
      previous = { profile, inner }
      fallingBack = false
      profile = ticket.profile
      inner = [...ticket.args]
      if (ticket.handoffPath === undefined) delete childEnv[APP_HANDOFF_ENV]
      else childEnv[APP_HANDOFF_ENV] = ticket.handoffPath
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (recover(profile, reason)) continue
      throw error
    }
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
  try {
    process.exitCode = launch(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`deepseek: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
