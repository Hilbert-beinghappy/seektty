/** Synchronous terminal restore used before any async Surface teardown. */

export const SHOW_CURSOR = '\u001B[?25h'
export const CLEANUP_TIMEOUT_MS = 2_000

export interface RestorableStdin {
  setRawMode?(mode: boolean): unknown
}

export interface RestorableTerminal {
  showCursor(): void
}

/**
 * Put the user terminal back into cooked mode and show the cursor.
 * Must run before drain, dispose, or Host cleanup that can hang.
 */
export function restoreTerminalSync(
  stdin: RestorableStdin = process.stdin,
  write: (chunk: string) => void = chunk => { process.stdout.write(chunk) },
  terminal?: RestorableTerminal,
): void {
  try { stdin.setRawMode?.(false) } catch { /* cooked restore is best-effort */ }
  try { terminal?.showCursor() } catch { /* prefer the explicit cursor write below */ }
  try { write(SHOW_CURSOR) } catch { /* cursor restore is best-effort */ }
}

/**
 * Bound a teardown step so a hung drain or dispose cannot trap the process.
 */
export async function withCleanupTimeout<T>(
  work: () => Promise<T>,
  ms: number = CLEANUP_TIMEOUT_MS,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Conventional exit status for SIGTERM (128 + 15). */
export const FATAL_SIGTERM_EXIT_CODE = 143
/** Conventional exit status for SIGHUP (128 + 1). */
export const FATAL_SIGHUP_EXIT_CODE = 129

export interface FatalGuardOptions {
  restore(): void
  cleanup(): Promise<void>
  writeError(message: string): void
  formatError(error: unknown): string
  exit(code: number): void
  cleanupTimeoutMs?: number
}

/** Directory hint for crash logs, derived from DSH_HOME. */
export function fatalLogHint(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME?.trim()
  return home === undefined || home === '' ? '~/.dsh' : home
}

/**
 * Build the shared one-shot fatal handler: restore the terminal
 * synchronously first, then run deadline-bounded cleanup, then exit.
 * Exported for tests; production code attaches it via attachFatalGuards.
 */
export function createFatalHandler(
  options: FatalGuardOptions,
): (error: unknown | undefined, code: number) => void {
  let handling = false
  return (error, code) => {
    if (handling) return
    handling = true
    try { options.restore() } catch { /* restore is best-effort */ }
    if (error !== undefined) {
      try { options.writeError(options.formatError(error)) } catch { /* diagnostics must not block exit */ }
    }
    void withCleanupTimeout(() => options.cleanup(), options.cleanupTimeoutMs)
      .catch(() => undefined)
      .then(() => { options.exit(code) })
  }
}

/**
 * Register one-shot uncaughtException, unhandledRejection, SIGTERM, and
 * SIGHUP guards around the TUI lifetime.
 * @returns a disposer that removes the listeners; safe to call more than once.
 */
export function attachFatalGuards(options: FatalGuardOptions): () => void {
  const handle = createFatalHandler(options)
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
