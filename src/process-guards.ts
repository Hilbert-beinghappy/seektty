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
