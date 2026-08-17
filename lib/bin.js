#!/usr/bin/env node
import { a as PACKAGE_VERSION, c as isVersionRequest, d as versionMessage, i as PACKAGE_NAME, l as launcherCopy, n as measureStartupSync, o as defaultPluginSpec, r as DSH_COMPATIBILITY, u as launcherPrefersEnglish } from "./startup-trace-QEGhP-_i.js";
import { join } from "node:path";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveProfileDir } from "@deepseek-ai/dsh-app-boot";

//#region src/bin.ts
const LEGACY_PACKAGE_NAME = "deepseek-tui";
const DEFAULT_SPEC = defaultPluginSpec(PACKAGE_VERSION);
function launcherArgs(args) {
	let profile = "tui";
	const inner = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--profile") {
			const value = args[index + 1];
			if (value === void 0 || value.trim() === "") throw new Error(launcherCopy("--profile 需要一个 Profile 名称", "--profile requires a Profile name", launcherPrefersEnglish(process.env)));
			profile = value;
			index += 1;
			continue;
		}
		if (argument?.startsWith("--profile=") === true) {
			const value = argument.slice(10);
			if (value === "") throw new Error(launcherCopy("--profile 需要一个 Profile 名称", "--profile requires a Profile name", launcherPrefersEnglish(process.env)));
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
function profileManifest(profile) {
	const manifestPath = join(resolveProfileDir(profile), "package.json");
	if (!existsSync(manifestPath)) return void 0;
	return JSON.parse(readFileSync(manifestPath, "utf8"));
}
function hasDependency(manifest, name) {
	return manifest?.dependencies?.[name] !== void 0;
}
function installed(profile) {
	return hasDependency(profileManifest(profile), PACKAGE_NAME);
}
function run(command, args) {
	const result = spawnSync(command, [...args], { stdio: "inherit" });
	if (result.error !== void 0) throw result.error;
	if (result.signal !== null) throw new Error(launcherCopy(`${command} 被信号 ${result.signal} 终止`, `${command} was terminated by signal ${result.signal}`, launcherPrefersEnglish(process.env)));
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
	const { profile, inner } = launcherArgs(args);
	const dsh = environment.DSH_BIN?.trim() || "dsh";
	const stderr = (chunk) => {
		process.stderr.write(chunk);
	};
	let manifest = measureStartupSync("launcher-manifest", () => profileManifest(profile), environment, stderr);
	if (hasDependency(manifest, LEGACY_PACKAGE_NAME)) {
		const status = execute(dsh, [
			"plugin",
			"--profile",
			profile,
			"remove",
			LEGACY_PACKAGE_NAME
		]);
		if (status !== 0) return status;
		manifest = measureStartupSync("launcher-manifest", () => profileManifest(profile), environment, stderr);
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
export { installed, launch, launcherArgs, run };