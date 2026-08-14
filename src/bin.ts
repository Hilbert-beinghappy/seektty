#!/usr/bin/env node

/** Product launcher that provisions and boots the native dsh Profile. */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'

const PACKAGE_NAME = 'seektty'
const LEGACY_PACKAGE_NAME = 'deepseek-tui'
const DEFAULT_SPEC = 'github:Hilbert-beinghappy/seektty'

interface ProfileManifest {
  readonly dependencies?: Readonly<Record<string, string>>
}

export function launcherArgs(args: readonly string[]): { profile: string; inner: string[] } {
  let profile = 'tui'
  const inner: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--profile') {
      const value = args[index + 1]
      if (value === undefined || value.trim() === '') throw new Error('--profile 需要一个 Profile 名称')
      profile = value
      index += 1
      continue
    }
    if (argument?.startsWith('--profile=') === true) {
      const value = argument.slice('--profile='.length)
      if (value === '') throw new Error('--profile 需要一个 Profile 名称')
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
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ProfileManifest
  return manifest.dependencies?.[name] !== undefined
}

export function installed(profile: string): boolean {
  return hasDependency(profile, PACKAGE_NAME)
}

export function run(command: string, args: readonly string[]): number {
  const result = spawnSync(command, [...args], { stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.signal !== null) throw new Error(`${command} 被信号 ${result.signal} 终止`)
  return result.status ?? 1
}

export function launch(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  execute: (command: string, args: readonly string[]) => number = run,
): number {
  const { profile, inner } = launcherArgs(args)
  const dsh = environment.DSH_BIN?.trim() || 'dsh'
  if (hasDependency(profile, LEGACY_PACKAGE_NAME)) {
    const status = execute(dsh, ['plugin', '--profile', profile, 'remove', LEGACY_PACKAGE_NAME])
    if (status !== 0) return status
  }
  if (!installed(profile)) {
    const spec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC
    const status = execute(dsh, ['plugin', '--profile', profile, 'add', spec])
    if (status !== 0) return status
  }
  return execute(dsh, ['--profile', profile, ...inner])
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
