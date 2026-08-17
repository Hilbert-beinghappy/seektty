/** One-shot process guards that restore cooked terminal mode after a crash or signal. */

import { ui } from './locale.ts'

/** Conventional exit status for SIGTERM (128 + 15). */
export const FATAL_SIGTERM_EXIT_CODE = 143
/** Conventional exit status for SIGHUP (128 + 1). */
export const FATAL_SIGHUP_EXIT_CODE = 129

const SHOW_CURSOR_LEAVE_PRIVATE_MODES = '\u001B[?25h\u001B[?1049l\u001B[?2004l'

export interface FatalGuardOptions {
  cleanup(): Promise<void>
  writeError(message: string): void
  exit(code: number): void
  logHint?: string
  restoreStdin?: () => void
  restoreFallback?: (chunk: string) => void
}

export function formatFatalMessage(error: unknown, logHint: string): string {
  const summary = error instanceof Error ? error.message : String(error)
  return [
    ui(`deepseek: 未捕获异常：${summary}`, `deepseek: uncaught exception: ${summary}`),
    ui(`日志目录：${logHint}`, `Log directory: ${logHint}`),
  ].join('\n')
}

export function fatalLogHint(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim()
  return home === undefined || home === '' ? '~/.dsh' : home
}

function restoreCookedMode(options: FatalGuardOptions, write: (chunk: string) => void): void {
  try {
    options.restoreStdin?.()
  } catch { /* best-effort restore must not throw */ }
  try {
    write(SHOW_CURSOR_LEAVE_PRIVATE_MODES)
  } catch { /* ignore a closed stdout */ }
}

/**
 * Register one-shot SIGTERM/SIGHUP and crash handlers.
 * @returns a disposer that removes the listeners; safe to call more than once.
 */
export function attachFatalGuards(options: FatalGuardOptions): () => void {
  let handling = false
  const restore = options.restoreFallback ?? (chunk => {
    process.stdout.write(chunk)
  })
  const handle = (error: unknown | undefined, code: number): void => {
    if (handling) return
    handling = true
    if (error !== undefined) {
      try {
        options.writeError(formatFatalMessage(error, options.logHint ?? fatalLogHint()))
      } catch { /* diagnostics must not break restore */ }
    }
    const finish = (): void => {
      restoreCookedMode(options, restore)
      options.exit(code)
    }
    try {
      const pending = options.cleanup()
      void Promise.resolve(pending).finally(finish)
    } catch {
      finish()
    }
  }
  const onException = (error: unknown): void => { handle(error, 1) }
  const onRejection = (reason: unknown): void => { handle(reason, 1) }
  const onTerm = (): void => { handle(undefined, FATAL_SIGTERM_EXIT_CODE) }
  const onHup = (): void => { handle(undefined, FATAL_SIGHUP_EXIT_CODE) }
  process.on('uncaughtException', onException)
  process.on('unhandledRejection', onRejection)
  process.on('SIGTERM', onTerm)
  process.on('SIGHUP', onHup)
  return () => {
    process.off('uncaughtException', onException)
    process.off('unhandledRejection', onRejection)
    process.off('SIGTERM', onTerm)
    process.off('SIGHUP', onHup)
  }
}
