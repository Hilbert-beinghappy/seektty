//#region src/dsh-compat.ts
const PACKAGE_NAME = "seektty";
const PACKAGE_VERSION = "1.0.1";
const DSH_COMPATIBILITY = {
	minimum: "0.1.0-rc.6",
	tested: "0.1.0-rc.6"
};
/**
* Value returned by official `@deepseek-ai/dsh-host-apiproxy` `host.describe`.
* The gateway still hardcodes `version: '0.0.1'` as a TODO placeholder
* (present in 0.1.0-rc.6 and 0.1.0-rc.7) instead of reading `apps/cli`
* package.json. Treat it as "version unknown", not as a real 0.0.1 CLI.
*/
const HOST_DESCRIBE_VERSION_PLACEHOLDER = "0.0.1";
function parseVersion(value) {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/u.exec(value.trim());
	if (match === null) return void 0;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		pre: (match[4] ?? "").split(".").filter((part) => part !== "").map((part) => {
			if (/^(0|[1-9]\d*)$/u.test(part)) return Number(part);
			return part;
		})
	};
}
function comparePre(left, right) {
	if (left.length === 0 && right.length === 0) return 0;
	if (left.length === 0) return 1;
	if (right.length === 0) return -1;
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		const a = left[index];
		const b = right[index];
		if (a === void 0) return -1;
		if (b === void 0) return 1;
		if (a === b) continue;
		if (typeof a === "number" && typeof b === "number") return a - b;
		if (typeof a === "number") return -1;
		if (typeof b === "number") return 1;
		return a < b ? -1 : 1;
	}
	return 0;
}
/**
* Compare two dsh versions. Returns negative when `left` is older.
* @param left - candidate version.
* @param right - baseline version.
*/
function compareDshVersion(left, right) {
	const a = parseVersion(left);
	const b = parseVersion(right);
	if (a === void 0 || b === void 0) return void 0;
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	if (a.patch !== b.patch) return a.patch - b.patch;
	return comparePre(a.pre, b.pre);
}
/**
* Explain why a running dsh version is outside this Bundle's declared range.
* @param hostVersion - Host-reported version. Official `host.describe` still
*   returns the placeholder `0.0.1`; that value is ignored.
* @param compatibility - package.json `dsh.compatibility`.
* @param english - launcher-safe language choice (no locale.ts).
*/
function dshCompatibilityError(hostVersion, compatibility, english) {
	if (hostVersion === HOST_DESCRIBE_VERSION_PLACEHOLDER) return void 0;
	if (hostVersion === void 0 || hostVersion.trim() === "") return english ? `Could not read the dsh version. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).` : `无法读取 dsh 版本。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`;
	const order = compareDshVersion(hostVersion, compatibility.minimum);
	if (order === void 0) return english ? `Unrecognized dsh version ${hostVersion}. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).` : `无法识别 dsh 版本 ${hostVersion}。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`;
	if (order < 0) return english ? `dsh ${hostVersion} is too old. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).` : `dsh ${hostVersion} 过旧。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`;
	const newest = compareDshVersion(hostVersion, compatibility.tested);
	if (newest !== void 0 && newest > 0) return english ? `dsh ${hostVersion} is newer than the tested range. SeekTTY needs dsh ${compatibility.minimum}–${compatibility.tested} (tested ${compatibility.tested}).` : `dsh ${hostVersion} 新于已测范围。SeekTTY 需要 dsh ${compatibility.minimum}–${compatibility.tested}（已测试 ${compatibility.tested}）。`;
}
/**
* Default GitHub plugin spec pinned to this package version.
* @param version - package.json version without a leading v.
*/
function defaultPluginSpec(version) {
	return `github:Hilbert-beinghappy/seektty#v${version}`;
}
/**
* Launcher `--version` text. Must not import locale.ts.
* @param facts - package identity and compatibility.
* @param english - POSIX-derived language choice.
*/
function versionMessage(facts, english) {
	return english ? `${facts.name} ${facts.version}\nRequires dsh >= ${facts.compatibility.minimum} (tested ${facts.compatibility.tested})\n` : `${facts.name} ${facts.version}\n需要 dsh >= ${facts.compatibility.minimum}（已测试 ${facts.compatibility.tested}）\n`;
}
/** True when the launcher should print version and skip spawning dsh. */
function isVersionRequest(args) {
	return args.includes("--version") || args.includes("-V");
}
/** POSIX-derived English preference used by the launcher only. */
function launcherPrefersEnglish(env) {
	const language = env.LANGUAGE?.split(":")[0] ?? "";
	if (/^en([_.]|$)/iu.test(language)) return true;
	const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
	return /^en([_.]|$)/iu.test(locale);
}
/**
* Launcher-safe bilingual copy. Must not import locale.ts.
* @param zh - Chinese text.
* @param en - English text.
* @param english - POSIX-derived language choice.
*/
function launcherCopy(zh, en, english) {
	return english ? en : zh;
}

//#endregion
//#region src/startup-trace.ts
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

//#endregion
export { PACKAGE_VERSION as a, isVersionRequest as c, versionMessage as d, PACKAGE_NAME as i, launcherCopy as l, measureStartupSync as n, defaultPluginSpec as o, DSH_COMPATIBILITY as r, dshCompatibilityError as s, measureStartup as t, launcherPrefersEnglish as u };