#!/usr/bin/env node
import { a as PACKAGE_NAME, c as defaultPluginSpec, d as isVersionRequest, f as launcherCopy, i as HOST_DESCRIBE_VERSION_PLACEHOLDER, m as versionMessage, n as measureStartupSync, o as PACKAGE_VERSION, p as launcherPrefersEnglish, r as DSH_COMPATIBILITY, s as compareDshVersion } from "./startup-trace-CP4shtZL.js";
import { c as pnpmGvsRecoveryAdvice, i as dshPluginCommand, l as withPnpmGvsCompatibility, o as isPnpmGlobalVirtualStorePath, r as dshPluginArgs, s as pnpmCommand } from "./pnpm-compat-CJOPs__B.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";

const DSH_DIST_TAGS_URL = "https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags";
const SEEKTTY_LATEST_RELEASE_URL = "https://api.github.com/repos/Hilbert-beinghappy/seektty/releases/latest";
const DEFAULT_SCAN_TIMEOUT_MS = 3e3;
/** Peer-aligned auto-install floor for the rc.6–rc.8 Host line. */
const AUTO_PERMITTED_DSH_MINIMUM = DSH_COMPATIBILITY.minimum;
/** Peer-aligned auto-install ceiling for the legacy Host line. */
const AUTO_PERMITTED_DSH_LEGACY_MAXIMUM = "0.1.0-rc.8";
/** Exact extra Host pin that auto-update may install. */
const AUTO_PERMITTED_DSH_EXACT = DSH_COMPATIBILITY.tested;
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
const DSH_CLI_VERSION_LINE = /^(?:dsh\s+)?v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/u;
/**
* Parse the official `dsh --version` text. Only accepts a whole line that is
* the version itself (optional `dsh` / `v` prefix). Banner text, paths, the
* host.describe placeholder `0.0.1`, and conflicting versions are rejected
* so the updater treats the Host as unknown instead of guessing. Does not
* read Profile files.
* @param output - combined stdout/stderr from `dsh --version`.
*/
function parseDshCliVersion(output) {
	const found = /* @__PURE__ */ new Set();
	for (const raw of output.split(/\r?\n/u)) {
		const line = raw.trim();
		if (line === "") continue;
		const version = DSH_CLI_VERSION_LINE.exec(line)?.[1];
		if (version === void 0 || version === HOST_DESCRIBE_VERSION_PLACEHOLDER) continue;
		found.add(version);
	}
	if (found.size !== 1) return void 0;
	return found.values().next().value;
}
/**
* True when auto-update may install this exact Host version.
* Matches the optional peer contract: the declared legacy floor through
* rc.8, or the exact current tested pin. Versions in between are excluded.
* @param version - candidate from npm `latest`.
*/
function isAutoPermittedDshVersion(version) {
	if (compareDshVersion(version, AUTO_PERMITTED_DSH_EXACT) === 0) return true;
	const vsMin = compareDshVersion(version, AUTO_PERMITTED_DSH_MINIMUM);
	const vsLegacyMax = compareDshVersion(version, AUTO_PERMITTED_DSH_LEGACY_MAXIMUM);
	return vsMin !== void 0 && vsLegacyMax !== void 0 && vsMin >= 0 && vsLegacyMax <= 0;
}
function seekttyIsNewer(scan, facts) {
	if (scan.seekttyLatestTag === void 0) return false;
	const order = compareDshVersion(tagToVersion(scan.seekttyLatestTag), facts.seekttyVersion);
	return order !== void 0 && order > 0;
}
function dshIsInstallable(scan, facts) {
	if (facts.dshPinned || scan.dshLatest === void 0 || facts.dshInstalled === void 0) return false;
	if (!isAutoPermittedDshVersion(scan.dshLatest)) return false;
	const order = compareDshVersion(scan.dshLatest, facts.dshInstalled);
	return order !== void 0 && order > 0;
}
function dshIsOutsideAutoRange(scan) {
	return scan.dshLatest !== void 0 && !isAutoPermittedDshVersion(scan.dshLatest);
}
/**
* Keep at most one spec, preferring SeekTTY. Used by both `--update` and auto.
*/
function exclusiveUpdatePlan(plan) {
	if (plan.seekttySpec !== void 0) return {
		dshSpec: void 0,
		seekttySpec: plan.seekttySpec
	};
	return {
		dshSpec: plan.dshSpec,
		seekttySpec: void 0
	};
}
/**
* Decide what one launch/update round should install.
* npm `latest` is discovery only. SeekTTY self-update wins the round and
* excludes dsh. Otherwise dsh installs only when `latest` is in the
* peer-aligned auto range and newer than the actually installed Host.
*/
function updatePlan(scan, facts) {
	if (!facts.seekttyPinned && seekttyIsNewer(scan, facts)) return exclusiveUpdatePlan({
		dshSpec: void 0,
		seekttySpec: `github:Hilbert-beinghappy/seektty#${scan.seekttyLatestTag}`
	});
	return exclusiveUpdatePlan({
		dshSpec: dshIsInstallable(scan, facts) ? `@deepseek-ai/dsh@${scan.dshLatest}` : void 0,
		seekttySpec: void 0
	});
}
/**
* Human advice lines for the passive post-session check. Empty when both
* sides are current or the scan learned nothing. Future/gap Host versions
* are mentioned but never presented as installable.
* @param english - POSIX-derived language choice.
*/
function updateAdvice(scan, facts, english) {
	const lines = [];
	const installable = updatePlan(scan, facts);
	if (dshIsOutsideAutoRange(scan)) lines.push(launcherCopy(`dsh ${scan.dshLatest} 超出 SeekTTY 当前许可范围，不会安装。`, `dsh ${scan.dshLatest} is outside SeekTTY's permitted range and will not be installed.`, english));
	else if (scan.dshLatest !== void 0 && isAutoPermittedDshVersion(scan.dshLatest) && !facts.dshPinned && facts.dshInstalled === void 0) lines.push(launcherCopy("无法读取已安装的 dsh 版本，本轮不会更新 dsh。", "Could not read the installed dsh version; dsh will not be updated this round.", english));
	else if (installable.dshSpec !== void 0) lines.push(launcherCopy(`dsh 有可安装版本 ${scan.dshLatest}（当前已装 ${facts.dshInstalled}）。`, `An installable dsh ${scan.dshLatest} is available (installed ${facts.dshInstalled}).`, english));
	if (!facts.seekttyPinned && seekttyIsNewer(scan, facts)) lines.push(launcherCopy(`SeekTTY 有新版本 ${scan.seekttyLatestTag}（当前 ${facts.seekttyVersion}）。`, `A newer SeekTTY ${scan.seekttyLatestTag} is available (running ${facts.seekttyVersion}).`, english));
	if (installable.dshSpec !== void 0 || installable.seekttySpec !== void 0) lines.push(launcherCopy("运行 deepseek --update 即可更新本轮许可的那一个组件。", "Run deepseek --update to install this round's permitted component.", english));
	return lines;
}

const LEGACY_PACKAGE_NAME = "deepseek-tui";
const DEFAULT_SPEC = defaultPluginSpec(PACKAGE_VERSION);
const DSH_INSTALL_SPEC = `@deepseek-ai/dsh@${DSH_COMPATIBILITY.tested}`;
function resolveProfileDir(name, environment = process.env) {
	if (name === "" || name === "." || name === ".." || name === "node_modules" || name.includes("/") || name.includes("\\")) throw new Error(`dsh: invalid profile name ${JSON.stringify(name)}`);
	const configured = (Object.hasOwn(environment, "DSH_HOME") ? environment.DSH_HOME : process.env.DSH_HOME)?.trim();
	const rawHome = configured === void 0 || configured === "" ? join(homedir(), ".dsh") : configured;
	return join(resolve(rawHome === "~" ? homedir() : rawHome.startsWith("~/") || rawHome.startsWith("~\\") ? join(homedir(), rawHome.slice(2)) : rawHome), "profiles", name);
}
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
	const dshPinned = (environment.DSH_BIN?.trim() ?? "") !== "";
	return {
		dshTested: DSH_COMPATIBILITY.tested,
		dshInstalled: dshPinned ? void 0 : internals.readInstalledDshVersion("dsh", environment),
		seekttyVersion: PACKAGE_VERSION,
		dshPinned,
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
	const manifestPath = join(resolveProfileDir(profile, environment), "package.json");
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
/**
* Env for `dsh --version`. Keep a normal subprocess environment so wrappers
* that need HOME or NODE_OPTIONS still work. SeekTTY omits the caller's
* explicit DSH_HOME; DSH_BIN is pinned and is not probed.
*/
function dshVersionProbeEnv(environment) {
	const env = {
		...process.env,
		...environment
	};
	delete env.DSH_HOME;
	return env;
}
/** Replaceable spawn seam used by launcher tests. */
const internals = {
	spawnSync: (command, args, options) => crossSpawn.sync(command, [...args], options),
	readInstalledDshVersion: (command, environment) => {
		try {
			const result = crossSpawn.sync(command, ["--version"], {
				encoding: "utf8",
				windowsHide: true,
				timeout: DEFAULT_SCAN_TIMEOUT_MS,
				env: dshVersionProbeEnv(environment)
			});
			if (result.error != null || result.status !== 0 || result.signal != null) return void 0;
			return parseDshCliVersion(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
		} catch {
			return;
		}
	}
};
function missingDshMessage(command, english) {
	const installCommand = pnpmCommand([
		"add",
		"--global",
		DSH_INSTALL_SPEC
	]);
	return [
		launcherCopy(`${command} 未安装或不在 PATH 中。`, `${command} is not installed or not on PATH.`, english),
		launcherCopy(`请先安装 DeepSeek Harness：${installCommand}`, `Install DeepSeek Harness: ${installCommand}`, english),
		launcherCopy("或设置 DSH_BIN 指向 dsh 可执行文件后重试。", "Or set DSH_BIN to the dsh executable and retry.", english)
	].join("\n");
}
function classifySpawnError(command, error, english) {
	if (error.code === "ENOENT") return new Error(missingDshMessage(command, english));
	return error;
}
function realPathUsesPnpmGvs(path) {
	try {
		return existsSync(path) && isPnpmGlobalVirtualStorePath(realpathSync(path));
	} catch {
		return false;
	}
}
/**
* Detect a visible pnpm 11 GVS installation without probing or changing pnpm
* configuration. The launcher module covers Profile/global SeekTTY installs;
* explicit dsh paths and PNPM_HOME cover the stock Host installation.
*/
function launcherUsesPnpmGvsLayout(dsh, environment = process.env) {
	const candidates = [fileURLToPath(import.meta.url)];
	if (dsh.includes("/") || dsh.includes("\\")) candidates.push(dsh, join(dirname(dsh), "node_modules", "@deepseek-ai", "dsh"));
	const pnpmHome = environment.PNPM_HOME?.trim();
	if (pnpmHome !== void 0 && pnpmHome !== "") candidates.push(join(pnpmHome, "node_modules", "@deepseek-ai", "dsh"));
	return candidates.some(realPathUsesPnpmGvs);
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
}, writeError = (chunk) => {
	process.stderr.write(chunk);
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
	const stderr = writeError;
	let manifest = measureStartupSync("launcher-manifest", () => profileManifest(profile, environment), environment, stderr);
	const recoverySpec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || manifest?.dependencies?.[PACKAGE_NAME] || DEFAULT_SPEC;
	let compatibilityHintWritten = false;
	const finish = (status) => {
		if (status === 0 || compatibilityHintWritten || !launcherUsesPnpmGvsLayout(dsh, environment)) return status;
		compatibilityHintWritten = true;
		writeError(`${pnpmGvsRecoveryAdvice({
			english: launcherPrefersEnglish(environment),
			profile,
			dshSpec: DSH_INSTALL_SPEC,
			pluginSpec: recoverySpec
		})}\n`);
		return status;
	};
	if (hasDependency(manifest, LEGACY_PACKAGE_NAME)) {
		const status = execute(dsh, dshPluginArgs(profile, ["remove", LEGACY_PACKAGE_NAME]));
		if (status !== 0) return finish(status);
		manifest = measureStartupSync("launcher-manifest", () => profileManifest(profile, environment), environment, stderr);
	}
	if (!hasDependency(manifest, PACKAGE_NAME)) {
		const spec = environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC;
		const status = measureStartupSync("plugin-add", () => execute(dsh, dshPluginArgs(profile, ["add", spec])), environment, stderr);
		if (status !== 0) return finish(status);
	}
	return finish(execute(dsh, [
		"--profile",
		profile,
		...inner
	]));
}
async function applyUpdatePlan(plan, profile, facts, english, environment, execute, write, options) {
	const exclusive = exclusiveUpdatePlan(plan);
	if (options.announcePinnedDsh && facts.dshPinned) write(launcherCopy("DSH_BIN 已固定 dsh 可执行文件，跳过 dsh 更新。\n", "DSH_BIN pins the dsh executable; skipping the dsh update.\n", english));
	if (exclusive.dshSpec !== void 0) {
		const command = pnpmCommand([
			"add",
			"--global",
			exclusive.dshSpec
		]);
		write(launcherCopy(`更新 dsh：${command}\n`, `Updating dsh: ${command}\n`, english));
		let status;
		try {
			status = execute("pnpm", withPnpmGvsCompatibility([
				"add",
				"--global",
				exclusive.dshSpec
			]));
		} catch {
			write(launcherCopy(`pnpm 不可用。请手动运行：${command}\n`, `pnpm is unavailable. Run manually: ${command}\n`, english));
			return 1;
		}
		if (status !== 0) return status;
	}
	if (exclusive.seekttySpec !== void 0) {
		const dsh = environment.DSH_BIN?.trim() || "dsh";
		const command = dshPluginCommand(profile, ["add", exclusive.seekttySpec]);
		write(launcherCopy(`更新 SeekTTY：${command}\n`, `Updating SeekTTY: ${command}\n`, english));
		const status = execute(dsh, dshPluginArgs(profile, ["add", exclusive.seekttySpec]));
		if (status !== 0) return status;
	} else if (options.announceCurrentSeektty) write(facts.seekttyPinned ? launcherCopy("SeekTTY 已由本地路径、link 或 SEEKTTY_SPEC 固定，跳过 SeekTTY 更新。\n", "SeekTTY is pinned by a local path, link, or SEEKTTY_SPEC; skipping the SeekTTY update.\n", english) : launcherCopy(`SeekTTY 已是最新版本（${PACKAGE_VERSION}）。\n`, `SeekTTY is already the latest version (${PACKAGE_VERSION}).\n`, english));
	return 0;
}
/**
* `deepseek --update`: same permit gate as auto. At most one component.
* Future/gap Hosts are printed and never installed.
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
	const plan = updatePlan(result, facts);
	if (plan.dshSpec === void 0 && plan.seekttySpec === void 0) {
		const lines = updateAdvice(result, facts, english);
		if (lines.length > 0) write(`${lines.join("\n")}\n`);
	}
	return applyUpdatePlan(plan, profile, facts, english, environment, execute, write, {
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

export { DSH_SPAWN_OPTIONS, dshVersionProbeEnv, installed, internals, isLocalPluginSpec, isUpdateRequest, launch, launcherArgs, launcherUsesPnpmGvsLayout, maybeAutoUpdate, postSessionUpdateNotice, run, runUpdate, updateMode };