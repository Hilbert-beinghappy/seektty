#!/usr/bin/env node
import { a as PACKAGE_VERSION, c as isVersionRequest, d as versionMessage, i as PACKAGE_NAME, l as launcherCopy, n as measureStartupSync, o as defaultPluginSpec, r as DSH_COMPATIBILITY, u as launcherPrefersEnglish } from "./startup-trace-Bjb556WQ.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";
import { resolveProfileDir } from "@deepseek-ai/dsh-app-boot";

//#region src/bin.ts
const LEGACY_PACKAGE_NAME = "deepseek-tui";
const DEFAULT_SPEC = defaultPluginSpec(PACKAGE_VERSION);
const DSH_INSTALL_SPEC = `@deepseek-ai/dsh@${DSH_COMPATIBILITY.tested}`;
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
function directInvocation() {
	const entry = process.argv[1];
	if (entry === void 0) return false;
	try {
		return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
}
if (directInvocation()) try {
	process.exitCode = launch(process.argv.slice(2));
} catch (error) {
	process.stderr.write(`deepseek: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}

//#endregion
export { DSH_SPAWN_OPTIONS, installed, internals, launch, launcherArgs, run };