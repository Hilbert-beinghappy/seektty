#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import crossSpawn from "cross-spawn";
import { resolveProfileDir } from "@deepseek-ai/dsh-app-boot";

//#region src/bin.ts
const PACKAGE_NAME = "seektty";
const LEGACY_PACKAGE_NAME = "deepseek-tui";
const DEFAULT_SPEC = "github:Hilbert-beinghappy/seektty";
const DSH_INSTALL_SPEC = "@deepseek-ai/dsh@0.1.0-rc.6";
/** Spawn options that resolve PATHEXT shims on Windows and hide extra consoles. */
const DSH_SPAWN_OPTIONS = {
	stdio: "inherit",
	windowsHide: true
};
/** Replaceable spawn seam used by launcher tests. */
const internals = { spawnSync: (command, args, options) => crossSpawn.sync(command, args, options) };
function launcherLocale(env = process.env) {
	const candidates = [
		env.LC_ALL,
		env.LC_MESSAGES,
		...env.LANGUAGE?.split(":") ?? [],
		env.LANG
	];
	for (const candidate of candidates) {
		const normalized = candidate?.trim().toLowerCase();
		if (normalized === void 0 || normalized === "") continue;
		if (/^en(?:[-_.@]|$)/u.test(normalized)) return "en";
		if (/^zh(?:[-_.@]|$)/u.test(normalized)) return "zh";
	}
	return "zh";
}
function launcherText(zh, en, env = process.env) {
	return launcherLocale(env) === "en" ? en : zh;
}
function missingDshMessage(command) {
	return [
		launcherText(`${command} 未安装或不在 PATH 中。`, `${command} is not installed or not on PATH.`),
		launcherText(`请先安装 DeepSeek Harness：pnpm add --global ${DSH_INSTALL_SPEC}`, `Install DeepSeek Harness: pnpm add --global ${DSH_INSTALL_SPEC}`),
		launcherText("或设置 DSH_BIN 指向 dsh 可执行文件后重试。", "Or set DSH_BIN to the dsh executable and retry.")
	].join("\n");
}
function classifySpawnError(command, error) {
	if (error.code === "ENOENT") return new Error(missingDshMessage(command));
	return error instanceof Error ? error : new Error(String(error));
}
function readProfileManifest$1(path) {
	let raw;
	try {
		raw = readFileSync(path, "utf8");
	} catch (error) {
		throw error instanceof Error ? error : new Error(String(error));
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error([launcherText(`无法解析 Profile manifest ${path}：${detail}`, `Cannot parse Profile manifest ${path}: ${detail}`), launcherText("删除该文件后 deepseek 会重新初始化 Profile。", "Delete that file and deepseek will re-initialize the Profile.")].join("\n"));
	}
}
function launcherArgs(args) {
	let profile = "tui";
	const inner = [];
	const profileRequired = launcherText("--profile 需要一个 Profile 名称", "--profile requires a Profile name");
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--profile") {
			const value = args[index + 1];
			if (value === void 0 || value.trim() === "") throw new Error(profileRequired);
			profile = value;
			index += 1;
			continue;
		}
		if (argument?.startsWith("--profile=") === true) {
			const value = argument.slice(10);
			if (value === "") throw new Error(profileRequired);
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
function hasDependency(profile, name) {
	const manifestPath = join(resolveProfileDir(profile), "package.json");
	if (!existsSync(manifestPath)) return false;
	return readProfileManifest$1(manifestPath).dependencies?.[name] !== void 0;
}
function installed(profile) {
	return hasDependency(profile, PACKAGE_NAME);
}
function run(command, args) {
	const result = internals.spawnSync(command, [...args], DSH_SPAWN_OPTIONS);
	if (result.error != null) throw classifySpawnError(command, result.error);
	if (result.signal === "SIGINT" || result.signal === "SIGTERM") return 130;
	if (result.signal !== null) throw new Error(launcherText(`${command} 被信号 ${result.signal} 终止`, `${command} was terminated by ${result.signal}`));
	return result.status ?? 1;
}
function launch(args, environment = process.env, execute = run) {
	const { profile, inner } = launcherArgs(args);
	const dsh = environment.DSH_BIN?.trim() || "dsh";
	if (hasDependency(profile, LEGACY_PACKAGE_NAME)) {
		const status = execute(dsh, [
			"plugin",
			"--profile",
			profile,
			"remove",
			LEGACY_PACKAGE_NAME
		]);
		if (status !== 0) return status;
	}
	if (!installed(profile)) {
		const status = execute(dsh, [
			"plugin",
			"--profile",
			profile,
			"add",
			environment.SEEKTTY_SPEC?.trim() || environment.DEEPSEEK_TUI_SPEC?.trim() || DEFAULT_SPEC
		]);
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