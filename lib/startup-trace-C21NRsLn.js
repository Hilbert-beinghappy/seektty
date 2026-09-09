/** Optional stderr timings for SeekTTY cold-start stages. */
/**
* Whether `SEEKTTY_STARTUP_TRACE=1` requested stage timings.
* @param env - process environment.
*/
function startupTraceEnabled(env = process.env) {
	return env.SEEKTTY_STARTUP_TRACE === "1";
}
/**
* Run one named startup stage and optionally print elapsed milliseconds.
* @param label - stage name in the trace line.
* @param run - synchronous or async stage body.
* @param env - process environment.
* @param write - stderr writer.
*/
function emitStartupTrace(label, started, env, write) {
	if (startupTraceEnabled(env)) write(`seektty-startup ${label} ${Math.round(performance.now() - started)} ms\n`);
}
async function measureStartup(label, run, env = process.env, write = (chunk) => {
	process.stderr.write(chunk);
}) {
	const started = performance.now();
	try {
		return await run();
	} finally {
		emitStartupTrace(label, started, env, write);
	}
}
/**
* Synchronous counterpart for the launcher, which cannot await.
* @param label - stage name in the trace line.
* @param run - stage body.
* @param env - process environment.
* @param write - stderr writer.
*/
function measureStartupSync(label, run, env = process.env, write = (chunk) => {
	process.stderr.write(chunk);
}) {
	const started = performance.now();
	try {
		return run();
	} finally {
		emitStartupTrace(label, started, env, write);
	}
}

export { measureStartupSync as n, measureStartup as t };