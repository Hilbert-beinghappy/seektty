import { createRequire } from 'node:module'

const released = new WeakSet()

/**
 * Acceptance-only cleanup for node-pty 1.1.0 on Windows, tested with official
 * dsh 0.2.0-rc.2. Call only after onExit and after draining terminal output.
 * Natural ConPTY exit leaves its input socket and output worker alive in this
 * version. Release those handles without sending a signal to an exited PID.
 */
export function releaseExitedPty(terminal) {
  if (process.platform !== 'win32' || released.has(terminal)) return
  const version = createRequire(import.meta.url)('node-pty/package.json').version
  const agent = terminal._agent
  if (version !== '1.1.0' || typeof agent?._conoutSocketWorker?.dispose !== 'function'
    || typeof agent?.inSocket?.destroy !== 'function') {
    throw new Error(`Reaudit exited ConPTY cleanup for node-pty ${version}`)
  }
  agent._conoutSocketWorker.dispose()
  agent.inSocket.destroy()
  released.add(terminal)
}
