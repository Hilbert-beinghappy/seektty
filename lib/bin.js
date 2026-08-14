#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveProfileDir } from "@deepseek-ai/dsh-app-boot";

//#region src/bin.ts
const PACKAGE_NAME = "seektty";
const LEGACY_PACKAGE_NAME = "deepseek-tui";
const DEFAULT_SPEC = "github:Hilbert-beinghappy/seektty";
function launcherArgs(args) {
	let profile = "tui";
	const inner = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--profile") {
			const value = args[index + 1];
			if (value === void 0 || value.trim() === "") throw new Error("--profile 需要一个 Profile 名称");
			profile = value;
			index += 1;
			continue;
		}
		if (argument?.startsWith("--profile=") === true) {
			const value = argument.slice(10);
			if (value === "") throw new Error("--profile 需要一个 Profile 名称");
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
	return JSON.parse(readFileSync(manifestPath, "utf8")).dependencies?.[name] !== void 0;
}
function installed(profile) {
	return hasDependency(profile, PACKAGE_NAME);
}
function run(command, args) {
	const result = spawnSync(command, [...args], { stdio: "inherit" });
	if (result.error !== void 0) throw result.error;
	if (result.signal !== null) throw new Error(`${command} 被信号 ${result.signal} 终止`);
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
export { installed, launch, launcherArgs, run };