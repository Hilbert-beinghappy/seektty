/** Busy-overlay chrome: spinner, elapsed time, and an in-progress Esc notice. */

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

export function formatBusyFooter(
  elapsedMs: number,
  notice?: string,
): string {
  const frame = SPINNER[Math.floor(Math.max(0, elapsedMs) / 80) % SPINNER.length] ?? '⠋'
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const status = `${frame} ${seconds}s`
  return notice === undefined || notice === '' ? status : `${status} · ${notice}`
}

export function lastOutputLines(output: string, maxLines: number): string {
  const lines = output.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').split('\n')
  const nonempty = lines.filter((line, index) => line !== '' || index === lines.length - 1)
  return nonempty.slice(-maxLines).join('\n')
}
