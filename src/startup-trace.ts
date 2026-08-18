/** Optional stderr timings for SeekTTY cold-start stages. */

/**
 * Whether `SEEKTTY_STARTUP_TRACE=1` requested stage timings.
 * @param env - process environment.
 */
export function startupTraceEnabled(
  env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.SEEKTTY_STARTUP_TRACE === '1'
}

/**
 * Run one named startup stage and optionally print elapsed milliseconds.
 * @param label - stage name in the trace line.
 * @param run - synchronous or async stage body.
 * @param env - process environment.
 * @param write - stderr writer.
 */
function emitStartupTrace(
  label: string,
  started: number,
  env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
  write: (chunk: string) => void,
): void {
  if (startupTraceEnabled(env)) {
    write(`seektty-startup ${label} ${Math.round(performance.now() - started)} ms\n`)
  }
}

export async function measureStartup<T>(
  label: string,
  run: () => T | Promise<T>,
  env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
  write: (chunk: string) => void = chunk => { process.stderr.write(chunk) },
): Promise<T> {
  const started = performance.now()
  try {
    return await run()
  } finally {
    emitStartupTrace(label, started, env, write)
  }
}

/**
 * Synchronous counterpart for the launcher, which cannot await.
 * @param label - stage name in the trace line.
 * @param run - stage body.
 * @param env - process environment.
 * @param write - stderr writer.
 */
export function measureStartupSync<T>(
  label: string,
  run: () => T,
  env: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
  write: (chunk: string) => void = chunk => { process.stderr.write(chunk) },
): T {
  const started = performance.now()
  try {
    return run()
  } finally {
    emitStartupTrace(label, started, env, write)
  }
}
