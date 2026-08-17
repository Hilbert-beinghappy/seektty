//#region src/dsh-compat.ts
const PACKAGE_NAME = "seektty";
const PACKAGE_VERSION = "1.0.0";
const DSH_COMPATIBILITY = {
	minimum: "0.1.0-rc.6",
	tested: "0.1.0-rc.6"
};
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
* @param hostVersion - `host.describe` version, when known.
* @param compatibility - package.json `dsh.compatibility`.
* @param english - launcher-safe language choice (no locale.ts).
*/
function dshCompatibilityError(hostVersion, compatibility, english) {
	if (hostVersion === void 0 || hostVersion.trim() === "") return english ? `Could not read the dsh version. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).` : `无法读取 dsh 版本。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`;
	const order = compareDshVersion(hostVersion, compatibility.minimum);
	if (order === void 0) return english ? `Unrecognized dsh version ${hostVersion}. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).` : `无法识别 dsh 版本 ${hostVersion}。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`;
	if (order < 0) return english ? `dsh ${hostVersion} is too old. SeekTTY needs dsh >= ${compatibility.minimum} (tested ${compatibility.tested}).` : `dsh ${hostVersion} 过旧。SeekTTY 需要 dsh >= ${compatibility.minimum}（已测试 ${compatibility.tested}）。`;
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

//#endregion
export { dshCompatibilityError as a, versionMessage as c, defaultPluginSpec as i, PACKAGE_NAME as n, isVersionRequest as o, PACKAGE_VERSION as r, launcherPrefersEnglish as s, DSH_COMPATIBILITY as t };