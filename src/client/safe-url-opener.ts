/** Explicit UI browser handoff; no shell, fetch, login, or retry. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { safeArtifactUrl } from './artifact-view.ts'

function command(): string | undefined {
  if (process.platform === 'darwin') return existsSync('/usr/bin/open') ? '/usr/bin/open' : undefined
  const name = process.platform === 'linux' ? 'xdg-open' : process.platform === 'win32' ? 'explorer.exe' : undefined
  if (name === undefined) return undefined
  return (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(path => join(path, name)).find(existsSync)
}
export function safeUrlOpenReason(): string | undefined {
  return command() === undefined ? 'No system HTTP(S) URL opener is available on this terminal' : undefined
}
export async function openSafeUrl(href: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const url = safeArtifactUrl(href)
  const executable = command()
  if (executable === undefined) throw new Error(safeUrlOpenReason())
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY',
    'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'SYSTEMROOT', 'WINDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]!]))
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [url], { stdio: 'ignore', shell: false, windowsHide: true, signal, env })
    child.unref()
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`System URL opener exited with ${String(code)}; opening is not confirmed`)))
  })
  signal.throwIfAborted()
}
