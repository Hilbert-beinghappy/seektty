#!/usr/bin/env node
import { a as PACKAGE_VERSION, d as launcherCopy, f as launcherPrefersEnglish, i as PACKAGE_NAME, n as measureStartupSync, o as compareDshVersion, p as versionMessage, r as DSH_COMPATIBILITY, s as defaultPluginSpec, u as isVersionRequest } from "./startup-trace-oQui160r.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";
import { resolveProfileDir } from "@deepseek-ai/dsh-app-boot";

//#region src/version-scan.ts
const DSH_DIST_TAGS_URL = "https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags";
const SEEKTTY_LATEST_RELEASE_URL = "https://api.github.com/repos/Hilbert-beinghappy/seektty/releases/latest";
const DEFAULT_SCAN_TIMEOUT_MS = 3e3;
async function fetchJson(fetchImpl, url, timeoutMs) {
	const response = await fetchImpl(url, {
		signal: AbortSignal.timeout(timeoutMs),
		headers: {
			accept: "application/json",
			"user-agent": "seektty-version-scan"
		}
	});
	if (!response.ok) return void 0;
	return await response.json();
}
function cleanVersion(value) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed === "" ? void 0 : trimmed;
}
/**
* Query npm `latest` and the SeekTTY GitHub `releases/latest` tag.
* Each source fails independently and silently; the result never rejects.
* @param fetchImpl - injectable fetch used by tests.
* @param timeoutMs - per-request abort timeout.
*/
async function scanLatestVersions(fetchImpl = fetch, timeoutMs = DEFAULT_SCAN_TIMEOUT_MS) {
	const [distTags, release] = await Promise.all([fetchJson(fetchImpl, DSH_DIST_TAGS_URL, timeoutMs).catch(() => void 0), fetchJson(fetchImpl, SEEKTTY_LATEST_RELEASE_URL, timeoutMs).catch(() => void 0)]);
	const tags = distTags;
	const rel = release;
	return {
		dshLatest: cleanVersion(tags?.latest),
		seekttyLatestTag: cleanVersion(rel?.tag_name)
	};
}
/** Strip a single leading `v` so release tags compare as versions. */
function tagToVersion(tag) {
	return tag.startsWith("v") ? tag.slice(1) : tag;
}
function dshIsNewer(scan, facts) {
	if (scan.dshLatest === void 0) return false;
	const order = compareDshVersion(scan.dshLatest, facts.dshTested);
	return order !== void 0 && order > 0;
}
function seekttyIsNewer(scan, facts) {
	if (scan.seekttyLatestTag === void 0) return false;
	const order = compareDshVersion(tagToVersion(scan.seekttyLatestTag), facts.seekttyVersion);
	return order !== void 0 && order > 0;
}
/**
* Decide what `deepseek --update` should install.
* dsh follows the npm `latest` dist-tag when that version is newer than the
* tested baseline, unless DSH_BIN pins the executable. SeekTTY follows its
* newest GitHub release tag when it is newer than this running copy.
*/
function updatePlan(scan, facts) {
	return {
		dshSpec: !facts.dshPinned && dshIsNewer(scan, facts) ? `@deepseek-ai/dsh@${scan.dshLatest}` : void 0,
		seekttySpec: !facts.seekttyPinned && seekttyIsNewer(scan, facts) ? `github:Hilbert-beinghappy/seektty#${scan.seekttyLatestTag}` : void 0
	};
}
/**
* Human advice lines for the passive post-session check. Empty when both
* sides are current or the scan learned nothing.
* @param english - POSIX-derived language choice.
*/
function updateAdvice(scan, facts, english) {
	const lines = [];
	if (dshIsNewer(scan, facts)) lines.push(launcherCopy(`dsh 有新版本 ${scan.dshLatest}（SeekTTY 当前已测 ${facts.dshTested}）。`, `A newer dsh ${scan.dshLatest} is available (SeekTTY currently tested against ${facts.dshTested}).`, english));
	if (seekttyIsNewer(scan, facts)) lines.push(launcherCopy(`SeekTTY 有新版本 ${scan.seekttyLatestTag}（当前 ${facts.seekttyVersion}）。`, `A newer SeekTTY ${scan.seekttyLatestTag} is available (running ${facts.seekttyVersion}).`, english));
	if (lines.length > 0) lines.push(launcherCopy("运行 deepseek --update 即可更新到最新版本。", "Run deepseek --update to update to the latest versions.", english));
	return lines;
}

//#endregion
//#region src/bin.ts
const LEGACY_PACKAGE_NAME = "deepseek-tui";
const DEFAULT_SPEC = defaultPluginSpec(PACKAGE_VERSION);
const DSH_INSTALL_SPEC = `@deepseek-ai/dsh@${DSH_COMPATIBILITY.tested}`;
/** True when the launcher should run the update flow instead of booting. */
function isUpdateRequest(args) {
	return args.includes("--update");
}
/**
* Resolve the update policy. Default is auto. `SEEKTTY_UPDATE` wins over the
* legacy `SEEKTTY_UPDATE_CHECK=0` off switch.
*/
function updateMode(environment = process.env) {
	const explicit = environment.SEEKTTY_UPDATE?.trim().toLowerCase();
	if (explicit !== void 0 && explicit !== "") {
		if (explicit === "0" || explicit === "off" || explicit === "false" || explicit === "manual") return "off";
		if (explicit === "check" || explicit === "notice") return "check";
		return "auto";
	}
	return environment.SEEKTTY_UPDATE_CHECK?.trim() === "0" ? "off" : "auto";
}
/** True when a plugin spec is a local path, file URL, or link, not a release. */
function isLocalPluginSpec(spec) {
	if (spec === void 0) return false;
	const value = spec.trim();
	if (value === "") return false;
	if (/^(?:file:|link:)/iu.test(value)) return true;
	if (/^(?:git\+|github:|gitlab:|bitbucket:|https?:|npm:)/iu.test(value)) return false;
	return value.startsWith(".") || value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value);
}
function installedFacts(environment, profile = "tui") {
	const override = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || "";
	const installedSpec = profileManifest(profile, environment)?.dependencies?.[PACKAGE_NAME];
	return {
		dshTested: DSH_COMPATIBILITY.tested,
		seekttyVersion: PACKAGE_VERSION,
		dshPinned: (environment.DSH_BIN?.trim() ?? "") !== "",
		seekttyPinned: override !== "" || isLocalPluginSpec(installedSpec)
	};
}
function launcherArgs(args, environment = process.env) {
	let profile = "tui";
	const inner = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--profile") {
			const value = args[index + 1];
			if (value === void 0 || value.trim() === "") throw new Error(launcherCopy("--profile 需要一个 Profile 名称", "--profile requires a Profile name", launcherPrefersEnglish(environment)));
			profile = value;
			index += 1;
			continue;
		}
		if (argument?.startsWith("--profile=") === true) {
			const value = argument.slice(10);
			if (value === "") throw new Error(launcherCopy("--profile 需要一个 Profile 名称", "--profile requires a Profile name", launcherPrefersEnglish(environment)));
			profile = value;
			continue;
		}
		if (argument !== void 0) inner.push(argument);
	}
	return {
		profile,
		inner
	};
}
function profileManifest(profile, environment = process.env) {
	const manifestPath = join(resolveProfileDir(profile), "package.json");
	if (!existsSync(manifestPath)) return void 0;
	const raw = readFileSync(manifestPath, "utf8");
	try {
		return JSON.parse(raw);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const english = launcherPrefersEnglish(environment);
		throw new Error([launcherCopy(`无法解析 Profile manifest ${manifestPath}：${detail}`, `Cannot parse Profile manifest ${manifestPath}: ${detail}`, english), launcherCopy("删除该文件后 deepseek 会重新初始化 Profile。", "Delete that file and deepseek will re-initialize the Profile.", english)].join("\n"));
	}
}
function hasDependency(manifest, name) {
	return manifest?.dependencies?.[name] !== void 0;
}
function installed(profile) {
	return hasDependency(profileManifest(profile), PACKAGE_NAME);
}
/** Spawn options that resolve PATHEXT shims on Windows and hide extra consoles. */
const DSH_SPAWN_OPTIONS = {
	stdio: "inherit",
	windowsHide: true
};
/** Replaceable spawn seam used by launcher tests. */
const internals = { spawnSync: (command, args, options) => crossSpawn.sync(command, [...args], options) };
function missingDshMessage(command, english) {
	return [
		launcherCopy(`${command} 未安装或不在 PATH 中。`, `${command} is not installed or not on PATH.`, english),
		launcherCopy(`请先安装 DeepSeek Harness：pnpm add --global ${DSH_INSTALL_SPEC}`, `Install DeepSeek Harness: pnpm add --global ${DSH_INSTALL_SPEC}`, english),
		launcherCopy("或设置 DSH_BIN 指向 dsh 可执行文件后重试。", "Or set DSH_BIN to the dsh executable and retry.", english)
	].join("\n");
}
function classifySpawnError(command, error, english) {
	if (error.code === "ENOENT") return new Error(missingDshMessage(command, english));
	return error;
}
function run(command, args) {
	const result = internals.spawnSync(command, [...args], DSH_SPAWN_OPTIONS);
	const english = launcherPrefersEnglish(process.env);
	if (result.error != null) throw classifySpawnError(command, result.error, english);
	if (result.signal === "SIGINT" || result.signal === "SIGTERM") return 130;
	if (result.signal !== null) throw new Error(launcherCopy(`${command} 被信号 ${result.signal} 终止`, `${command} was terminated by signal ${result.signal}`, english));
	return result.status ?? 1;
}
function launch(args, environment = process.env, execute = run, write = (chunk) => {
	process.stdout.write(chunk);
}) {
	if (isVersionRequest(args)) {
		write(versionMessage({
			name: PACKAGE_NAME,
			version: PACKAGE_VERSION,
			compatibility: DSH_COMPATIBILITY
		}, launcherPrefersEnglish(environment)));
		return 0;
	}
	const { profile, inner } = launcherArgs(args, environment);
	const dsh = environment.DSH_BIN?.trim() || "dsh";
	const stderr = (chunk) => {
		process.stderr.write(chunk);
	};
	let manifest = measureStartupSync("launcher-manifest", () => profileManifest(profile, environment), environment, stderr);
	if (hasDependency(manifest, LEGACY_PACKAGE_NAME)) {
		const status = execute(dsh, [
			"plugin",
			"--profile",
			profile,
			"remove",
			LEGACY_PACKAGE_NAME
		]);
		if (status !== 0) return status;
		manifest = measureStartupSync("launcher-manifest", () => profileManifest(profile, environment), environment, stderr);
	}
	if (!hasDependency(manifest, PACKAGE_NAME)) {
		const spec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC;
		const status = measureStartupSync("plugin-add", () => execute(dsh, [
			"plugin",
			"--profile",
			profile,
			"add",
			spec
		]), environment, stderr);
		if (status !== 0) return status;
	}
	return execute(dsh, [
		"--profile",
		profile,
		...inner
	]);
}
async function applyUpdatePlan(plan, profile, facts, english, environment, execute, write, options) {
	if (options.announcePinnedDsh && facts.dshPinned) write(launcherCopy("DSH_BIN 已固定 dsh 可执行文件，跳过 dsh 更新。\n", "DSH_BIN pins the dsh executable; skipping the dsh update.\n", english));
	if (plan.dshSpec !== void 0) {
		write(launcherCopy(`更新 dsh：pnpm add --global ${plan.dshSpec}\n`, `Updating dsh: pnpm add --global ${plan.dshSpec}\n`, english));
		let status;
		try {
			status = execute("pnpm", [
				"add",
				"--global",
				plan.dshSpec
			]);
		} catch {
			write(launcherCopy(`pnpm 不可用。请手动运行：pnpm add --global ${plan.dshSpec}\n`, `pnpm is unavailable. Run manually: pnpm add --global ${plan.dshSpec}\n`, english));
			return 1;
		}
		if (status !== 0) return status;
	}
	if (plan.seekttySpec !== void 0) {
		const dsh = environment.DSH_BIN?.trim() || "dsh";
		write(launcherCopy(`更新 SeekTTY：dsh plugin --profile ${profile} add ${plan.seekttySpec}\n`, `Updating SeekTTY: dsh plugin --profile ${profile} add ${plan.seekttySpec}\n`, english));
		const status = execute(dsh, [
			"plugin",
			"--profile",
			profile,
			"add",
			plan.seekttySpec
		]);
		if (status !== 0) return status;
	} else if (options.announceCurrentSeektty) write(launcherCopy(`SeekTTY 已是最新版本（${PACKAGE_VERSION}）。\n`, `SeekTTY is already the latest version (${PACKAGE_VERSION}).\n`, english));
	return 0;
}
/**
* `deepseek --update`: scan npm `latest` and the SeekTTY GitHub release, then
* update the global dsh install (unless DSH_BIN pins it) and the SeekTTY
* Bundle inside the target Profile through native `dsh plugin add`.
*/
async function runUpdate(args, environment = process.env, execute = run, write = (chunk) => {
	process.stdout.write(chunk);
}, scan = scanLatestVersions) {
	const english = launcherPrefersEnglish(environment);
	const { profile } = launcherArgs(args.filter((argument) => argument !== "--update"), environment);
	write(launcherCopy("正在检查 dsh 与 SeekTTY 的最新版本…\n", "Checking the latest dsh and SeekTTY versions…\n", english));
	const facts = installedFacts(environment, profile);
	const result = await scan();
	if (result.dshLatest === void 0 && result.seekttyLatestTag === void 0) {
		write(launcherCopy("无法访问 npm Registry 或 GitHub Releases，请检查网络后重试。\n", "Could not reach the npm Registry or GitHub Releases. Check the network and retry.\n", english));
		return 1;
	}
	return applyUpdatePlan(updatePlan(result, facts), profile, facts, english, environment, execute, write, {
		announcePinnedDsh: true,
		announceCurrentSeektty: true
	});
}
/**
* Default launch policy: fetch official dsh `latest` and the SeekTTY GitHub
* Release, then apply them. Offline and install failures never block boot.
*/
async function maybeAutoUpdate(args, environment = process.env, execute = run, write = (chunk) => {
	process.stderr.write(chunk);
}, scan = scanLatestVersions) {
	if (updateMode(environment) !== "auto") return;
	if (isVersionRequest(args) || isUpdateRequest(args)) return;
	try {
		const english = launcherPrefersEnglish(environment);
		const { profile } = launcherArgs(args, environment);
		const facts = installedFacts(environment, profile);
		const plan = updatePlan(await scan(), facts);
		if (plan.dshSpec === void 0 && plan.seekttySpec === void 0) return;
		await applyUpdatePlan(plan, profile, facts, english, environment, execute, write, {
			announcePinnedDsh: false,
			announceCurrentSeektty: false
		});
	} catch {}
}
/**
* Passive post-session check used by `SEEKTTY_UPDATE=check`.
* Network failures are silent.
*/
async function postSessionUpdateNotice(environment = process.env, write = (chunk) => {
	process.stderr.write(chunk);
}, scan = scanLatestVersions) {
	if (updateMode(environment) !== "check") return;
	try {
		const lines = updateAdvice(await scan(), installedFacts(environment), launcherPrefersEnglish(environment));
		if (lines.length > 0) write(`${lines.join("\n")}\n`);
	} catch {}
}
function directInvocation() {
	const entry = process.argv[1];
	if (entry === void 0) return false;
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
}
if (directInvocation()) {
	const args = process.argv.slice(2);
	try {
		if (isUpdateRequest(args)) process.exitCode = await runUpdate(args);
		else {
			await maybeAutoUpdate(args);
			process.exitCode = launch(args);
			if (!isVersionRequest(args) && process.stderr.isTTY === true) await postSessionUpdateNotice();
		}
	} catch (error) {
		process.stderr.write(`deepseek: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}

//#endregion
export { DSH_SPAWN_OPTIONS, installed, internals, isLocalPluginSpec, isUpdateRequest, launch, launcherArgs, maybeAutoUpdate, postSessionUpdateNotice, run, runUpdate, updateMode };