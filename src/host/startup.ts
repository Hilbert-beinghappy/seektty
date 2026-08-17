/** TUI command-line provider for the `deepseek` product entry. */

import { realpathSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { localeFromEnvironment, setUiLocale, ui } from '../client/locale.ts'
import { consumeAppHandoff, writeAppHandoff } from './app-handoff.ts'
import { ProfilePluginManager } from './profile-plugin-manager.ts'
import { LAUNCHER_RESTART_EXIT_CODE, writeLauncherRestart } from '../launcher-restart.ts'

/** Stable Cordis plugin name. */
export const name = 'tui-startup'

/** Services required before launch values can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided to the Host-to-Client TUI runner. */
export const TUI_STARTUP_SERVICE = 'tuiStartup'

/** Immutable invocation values consumed by the terminal surface. */
export interface TuiStartupValues {
  /** Launcher-selected Profile name. */
  readonly profile: string
  /** Absolute workspace path for a new session. */
  readonly cwd: string
  /** Explicit session id, or `true` for the most recent visible session. */
  readonly resume?: string | true
  /** Optional initial prompt. */
  readonly task?: string
  readonly draft?: string
  readonly attachmentPaths?: readonly string[]
  readonly startupNotice?: string
}

interface TuiRestartHandoff {
  readonly profile: string
  readonly cwd: string
  readonly resume?: string
  readonly draft?: string
  readonly attachmentPaths: readonly string[]
  readonly notice?: string
}

interface TuiOptions {
  cwd?: string
  resume?: string | boolean
}

interface AppRestartRequest {
  readonly profile: string
  readonly args: readonly string[]
  readonly handoff?: {
    readonly channel: string
    readonly payload: unknown
  }
}

type AppRestart = (request: AppRestartRequest) => Promise<void>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Native Profile manager supplied by this out-of-tree Bundle. */
    profilePluginManager?: ProfilePluginManager
    /** Controlled replacement of the current stock dsh process. */
    appRestart?: AppRestart
  }
}

function activeProfile(argv: readonly string[] = process.argv.slice(2)): string {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--profile') {
      const value = argv[index + 1]
      if (value !== undefined && value.trim() !== '') return value
    }
    if (argument?.startsWith('--profile=') === true) {
      const value = argument.slice('--profile='.length)
      if (value !== '') return value
    }
  }
  throw new Error(ui(
    'TUI Bundle 必须通过 dsh --profile <name> 启动',
    'The TUI Bundle must be started through dsh --profile <name>',
  ))
}

function dshInstallAnchor(): string {
  const entry = process.argv[1]
  if (entry === undefined) throw new Error(ui(
    '无法定位 dsh 安装目录',
    'Cannot locate the dsh installation directory',
  ))
  return resolve(dirname(realpathSync(entry)), '../package.json')
}

function restartProvider(ctx: Context): AppRestart {
  return async (request) => {
    const handoffPath = request.handoff === undefined
      ? undefined
      : writeAppHandoff(request.handoff.channel, request.handoff.payload)
    try {
      writeLauncherRestart(process.ppid, {
        profile: request.profile,
        args: request.args,
        ...(handoffPath === undefined ? {} : { handoffPath }),
      })
    } catch (error) {
      if (handoffPath !== undefined) {
        try { unlinkSync(handoffPath) } catch { /* failed ticket retains no usable handoff owner */ }
      }
      throw error
    }
    ctx.get('appExit')?.(LAUNCHER_RESTART_EXIT_CODE)
  }
}

function tuiCommand(): Command {
  return new Command()
    .name('deepseek')
    .description(ui(
      '启动 DeepSeek Harness 终端界面。',
      'Start the DeepSeek Harness terminal interface.',
    ))
    .helpOption('-h, --help', ui('显示帮助', 'Display help'))
    .option('--cwd <path>', ui(
      '在指定工作目录开始；默认使用当前目录',
      'Start in the specified working directory; defaults to the current directory',
    ))
    .option('--resume [sessionId]', ui(
      '恢复指定会话；省略 id 时恢复最近会话',
      'Resume a session; omit the id to resume the most recent session',
    ))
    .argument('[task...]', ui(
      '进入后立即发送的初始任务',
      'Initial task to send after entering the interface',
    ))
    .addHelpText('after', ui(`
启动器选项：
  deepseek --profile <name> ...    覆盖默认 tui Profile；必须写在任务和 TUI 参数之前

示例：
  deepseek                         在当前目录打开新会话
  deepseek "检查这个项目"          打开后立即发送任务
  deepseek --resume               恢复最近会话
  deepseek --resume <sessionId>   恢复指定会话
  deepseek --cwd ../project       在指定目录开始
  deepseek --profile team-tui     使用指定 Harness Profile
`, `
Launcher options:
  deepseek --profile <name> ...    Override the default tui Profile; place it before the task and TUI options

Examples:
  deepseek                         Open a new session in the current directory
  deepseek "review this project"   Open the interface and immediately send a task
  deepseek --resume               Resume the most recent session
  deepseek --resume <sessionId>   Resume the specified session
  deepseek --cwd ../project       Start in the specified directory
  deepseek --profile team-tui     Use the specified Harness Profile
`))
}

function restartHandoff(value: unknown): TuiRestartHandoff | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) throw new Error('TUI 重启交接不是对象')
  const row = value as Record<string, unknown>
  if (typeof row.profile !== 'string' || typeof row.cwd !== 'string'
    || !Array.isArray(row.attachmentPaths)
    || !row.attachmentPaths.every(path => typeof path === 'string')) {
    throw new Error('TUI 重启交接缺少 Profile、工作区或附件路径')
  }
  if (row.attachmentPaths.length > 32) throw new Error('TUI 重启交接附件数量超过限制')
  if (row.resume !== undefined && typeof row.resume !== 'string') throw new Error('TUI 重启交接会话 id 无效')
  if (row.draft !== undefined && typeof row.draft !== 'string') throw new Error('TUI 重启交接草稿无效')
  if (row.notice !== undefined && typeof row.notice !== 'string') throw new Error('TUI 重启交接提示无效')
  return {
    profile: row.profile,
    cwd: resolve(row.cwd),
    ...(typeof row.resume === 'string' ? { resume: row.resume } : {}),
    ...(typeof row.draft === 'string' ? { draft: row.draft } : {}),
    attachmentPaths: row.attachmentPaths,
    ...(typeof row.notice === 'string' ? { notice: row.notice } : {}),
  }
}

/**
 * Parse TUI-owned flags and provide immutable launch values.
 * @param ctx - Host context carrying the launcher argument snapshot.
 */
export function apply(ctx: Context): void {
  // Commander renders help before the Settings service is available. Use the
  // terminal locale here; the interactive Surface replaces it with an
  // explicit Harness locale.preference after connecting.
  setUiLocale(localeFromEnvironment())
  const profile = activeProfile()
  ctx.provide('profilePluginManager', new ProfilePluginManager({
    profile,
    installAnchor: dshInstallAnchor(),
    invokingCwd: process.cwd(),
  }))
  ctx.provide('appRestart', restartProvider(ctx))
  const handoff = restartHandoff(consumeAppHandoff('seektty-v1'))
  const program = tuiCommand()
  program.action(() => {
    const options = program.opts<TuiOptions>()
    const task = program.args.join(' ').trim()
    const resume = options.resume === true
      ? true
      : typeof options.resume === 'string' && options.resume.trim() !== ''
        ? options.resume
        : undefined
    const cwd = resolve(options.cwd ?? process.cwd())
    if (handoff !== undefined && (handoff.profile !== profile || handoff.cwd !== cwd || handoff.resume !== resume)) {
      throw new Error('TUI 重启交接与 launcher 参数不一致')
    }
    ctx.provide(TUI_STARTUP_SERVICE, {
      profile,
      cwd,
      ...resume !== undefined && { resume },
      ...task !== '' && { task },
      ...(handoff?.draft === undefined ? {} : { draft: handoff.draft }),
      ...(handoff === undefined ? {} : { attachmentPaths: handoff.attachmentPaths }),
      ...(handoff?.notice === undefined ? {} : { startupNotice: handoff.notice }),
    } satisfies TuiStartupValues)
  })
  parseCmdline(ctx, program)
}
