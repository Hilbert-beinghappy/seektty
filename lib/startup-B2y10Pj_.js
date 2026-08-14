import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { load } from "js-yaml";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { parseCmdline } from "@deepseek-ai/dsh-cmdline";
import { randomUUID } from "node:crypto";
import crossSpawn from "cross-spawn";
import { DEFAULT_PROFILE_BUNDLES, PROFILES_DIR, PROFILE_PATCH_FILENAME, PROFILE_TEMPLATES, initProfile, readProfileManifest, resolveBundleDir, resolveProfileDir, writeProfileManifest } from "@deepseek-ai/dsh-app-boot";

//#region src/host/app-handoff.ts
/** Inherited environment key carrying one single-use handoff path. */
const APP_HANDOFF_ENV = "DSH_APP_HANDOFF_FILE";
/** Maximum serialized handoff bytes; payloads carry references, never file bytes. */
const APP_HANDOFF_MAX_BYTES = 256 * 1024;
const PREFIX = "deepseek-handoff-";
function allowedPath(path) {
	const absolute = resolve(path);
	return dirname(absolute) === resolve(tmpdir()) && basename(absolute).startsWith(PREFIX);
}
/**
* Persist one opaque app payload for a child process. The file is exclusive,
* owner-only where the platform exposes POSIX modes, and never logged.
* @param channel - app protocol identifier.
* @param payload - JSON-compatible references and draft metadata.
* @returns absolute handoff path for {@link APP_HANDOFF_ENV}.
*/
function writeAppHandoff(channel, payload) {
	if (channel.trim() === "") throw new Error("app handoff channel cannot be blank");
	const body = JSON.stringify({
		version: 1,
		channel,
		payload
	});
	if (Buffer.byteLength(body) > APP_HANDOFF_MAX_BYTES) throw new Error("app handoff payload exceeds size limit");
	const path = join(tmpdir(), `${PREFIX}${randomUUID()}.json`);
	writeFileSync(path, body, {
		encoding: "utf8",
		flag: "wx",
		mode: 384
	});
	return path;
}
/**
* Consume and delete this process's handoff when its channel matches.
* Invalid paths, permissions, envelopes, or channels fail loud after the
* environment value is cleared; a missing value means ordinary startup.
* @param channel - expected app protocol identifier.
* @returns parsed opaque payload, or undefined when no handoff was supplied.
*/
function consumeAppHandoff(channel) {
	const path = process.env[APP_HANDOFF_ENV];
	delete process.env.DSH_APP_HANDOFF_FILE;
	if (path === void 0) return void 0;
	if (!allowedPath(path)) throw new Error("app handoff path is outside the launcher temp boundary");
	try {
		const stat = lstatSync(path);
		if (!stat.isFile()) throw new Error("app handoff path is not a regular file");
		if (stat.size > APP_HANDOFF_MAX_BYTES) throw new Error("app handoff file exceeds size limit");
		if (process.platform !== "win32" && (stat.mode & 63) !== 0) throw new Error("app handoff file permissions are not owner-only");
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (parsed === null || parsed.version !== 1 || parsed.channel !== channel || !("payload" in parsed)) throw new Error(`app handoff does not match channel ${JSON.stringify(channel)}`);
		return parsed.payload;
	} finally {
		try {
			unlinkSync(path);
		} catch {}
	}
}

//#endregion
//#region src/host/profile-plugin-manager.ts
const NAME = "dsh";
const MAX_CAPTURE_BYTES = 1024 * 1024;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const SENSITIVE_QUERY_KEY = new RegExp(String.raw`(?:^|[-_])(?:access[-_]?token|api[-_]?key|auth|authorization|credential|password|secret|signature|token)(?:$|[-_])`, "i");
function convertedBundles(bundles, options) {
	const removed = new Set(options.removeBundles ?? []);
	const converted = bundles.filter((bundle) => !removed.has(bundle));
	for (const bundle of options.addBundles ?? []) if (!converted.includes(bundle)) converted.push(bundle);
	return converted;
}
function inferSource(spec) {
	if (/^(?:git\+|github:|gitlab:|bitbucket:)|\.git(?:#|$)/i.test(spec)) return "git";
	if (/^(?:https?:).*\.(?:tgz|tar\.gz)(?:[?#].*)?$/i.test(spec) || /\.(?:tgz|tar\.gz)$/i.test(spec)) return "tarball";
	if (/^(?:file:|link:|workspace:|portal:)/.test(spec) || isAbsolute(spec) || /^\.{1,2}(?:[/\\]|$)/.test(spec)) return "local";
	if (/^https?:/i.test(spec)) return "unknown";
	return "npm";
}
function safeDependencySpec(spec) {
	const prefix = spec.startsWith("git+") ? "git+" : "";
	const raw = prefix === "" ? spec : spec.slice(prefix.length);
	if (!/^https?:\/\//i.test(raw)) return spec;
	try {
		const url = new URL(raw);
		if (url.username !== "" || url.password !== "") {
			url.username = "***";
			url.password = "";
		}
		for (const key of [...url.searchParams.keys()]) if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, "***");
		return `${prefix}${url.toString()}`;
	} catch {
		return spec.replace(/(https?:\/\/)[^\s/@]+@/iu, "$1***@");
	}
}
function readInstalledManifest(packageDir) {
	return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
}
function validPatch(packageDir, patch) {
	try {
		const root = realpathSync(packageDir);
		const path = resolve(root, patch);
		if (!existsSync(path) || statSync(path).size > MAX_PATCH_BYTES) return false;
		const realPath = realpathSync(path);
		const within = relative(root, realPath);
		if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) return false;
		return Array.isArray(load(readFileSync(realPath, "utf8"), { schema: entryListSchema }));
	} catch {
		return false;
	}
}
function appendBounded(current, chunk) {
	const joined = current + chunk;
	return Buffer.byteLength(joined) <= MAX_CAPTURE_BYTES ? joined : joined.slice(Math.max(0, joined.length - MAX_CAPTURE_BYTES));
}
function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}
function sameMultiset(left, right) {
	if (left.length !== right.length) return false;
	const counts = /* @__PURE__ */ new Map();
	for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1);
	for (const item of right) {
		const remaining = counts.get(item);
		if (remaining === void 0 || remaining === 0) return false;
		counts.set(item, remaining - 1);
	}
	return [...counts.values()].every((value) => value === 0);
}
function sameSnapshotState(left, right) {
	return sameJson(left.dependencies, right.dependencies) && sameJson(left.bundles, right.bundles) && sameJson(left.plugins, right.plugins);
}
function mutatesProfile(command) {
	return new Set([
		"add",
		"install",
		"i",
		"remove",
		"rm",
		"uninstall",
		"update",
		"up",
		"link",
		"unlink",
		"prune",
		"rebuild",
		"patch",
		"patch-commit"
	]).has(command[0] ?? "");
}
/**
* Native Profile manager. Its only durable state is the Profile's existing
* manifest, lockfile, installed dependency tree, and ordered Bundle list.
*/
var ProfilePluginManager = class {
	/** Target Profile name selected by the launcher. */
	profile;
	/** Resolved target Profile directory. */
	dir;
	installAnchor;
	invokingCwd;
	home;
	/** @param options - target Profile, installation resolution anchor, and invoking directory. */
	constructor(options) {
		this.profile = options.profile;
		this.installAnchor = options.installAnchor;
		this.invokingCwd = options.invokingCwd ?? process.cwd();
		this.home = options.home;
		this.dir = resolveProfileDir(options.profile, options.home);
	}
	/**
	* Initialize the target Profile when absent.
	* @returns true only when this call created its manifest.
	*/
	ensureProfile() {
		if (existsSync(join(this.dir, "package.json"))) return false;
		initProfile(this.dir, PROFILE_TEMPLATES[this.profile] ?? DEFAULT_PROFILE_BUNDLES);
		return true;
	}
	/**
	* Read native dependency and Bundle state without creating another store.
	* @returns a detached Profile snapshot.
	*/
	snapshot() {
		this.ensureProfile();
		const manifest = readProfileManifest(NAME, this.dir);
		const dependencies = { ...manifest.dependencies };
		const bundles = [...manifest.dsh?.profile?.bundles ?? []];
		const plugins = Object.entries(dependencies).map(([packageName, spec]) => this.inspectInstalled(packageName, spec, bundles));
		return Object.freeze({
			profile: this.profile,
			dir: this.dir,
			dependencies: Object.freeze(dependencies),
			bundles: Object.freeze(bundles),
			plugins: Object.freeze(plugins)
		});
	}
	/**
	* Run pnpm asynchronously inside the Profile and reconcile Bundle state.
	* @param args - native pnpm arguments.
	* @param options - cancellation and non-secret output callback.
	* @returns command output, resulting native snapshot, and restart impact.
	*/
	async run(args, options = {}) {
		options.signal?.throwIfAborted();
		const initialized = this.ensureProfile();
		const beforeSnapshot = this.snapshot();
		const before = readProfileManifest(NAME, this.dir);
		const command = args.map((argument) => this.anchorPathSpec(argument));
		let stdout = "";
		let stderr = "";
		const exitCode = await new Promise((resolvePromise, reject) => {
			const child = crossSpawn("pnpm", command, {
				cwd: this.dir,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			const abort = () => {
				child.kill();
			};
			options.signal?.addEventListener("abort", abort, { once: true });
			if (child.stdout === null || child.stderr === null) {
				reject(/* @__PURE__ */ new Error("pnpm output pipes are unavailable"));
				return;
			}
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk) => {
				stdout = appendBounded(stdout, chunk);
				options.onOutput?.("stdout", chunk);
			});
			child.stderr.on("data", (chunk) => {
				stderr = appendBounded(stderr, chunk);
				options.onOutput?.("stderr", chunk);
			});
			child.once("error", (error) => {
				options.signal?.removeEventListener("abort", abort);
				reject(error);
			});
			child.once("close", (code, signal) => {
				options.signal?.removeEventListener("abort", abort);
				if (options.signal?.aborted === true) {
					const reason = options.signal.reason;
					reject(reason instanceof Error ? reason : new Error("pnpm operation aborted", { cause: reason }));
					return;
				}
				if (signal !== null) {
					reject(/* @__PURE__ */ new Error(`pnpm terminated by signal ${signal}`));
					return;
				}
				resolvePromise(code ?? 1);
			});
		}).catch((error) => {
			if (error?.code === "ENOENT") return 127;
			throw error;
		});
		const warnings = exitCode === 0 ? this.reconcile(before) : this.failureWarnings(command, exitCode);
		const snapshot = this.snapshot();
		const changed = initialized || !sameSnapshotState(beforeSnapshot, snapshot);
		return {
			profile: this.profile,
			dir: this.dir,
			command: ["pnpm", ...command.map(safeDependencySpec)],
			exitCode,
			stdout,
			stderr,
			warnings,
			initialized,
			changed,
			restartRequired: exitCode === 0 && (changed || mutatesProfile(command)),
			snapshot
		};
	}
	/**
	* Run pnpm synchronously for the compatible `dsh plugin` entry.
	* @param args - native pnpm arguments.
	* @param stdio - child stdio policy; the CLI uses `inherit`.
	* @returns exit status and resulting native snapshot.
	*/
	runSync(args, stdio = "inherit") {
		const initialized = this.ensureProfile();
		const beforeSnapshot = this.snapshot();
		const before = readProfileManifest(NAME, this.dir);
		const command = args.map((argument) => this.anchorPathSpec(argument));
		const result = crossSpawn.sync("pnpm", command, {
			cwd: this.dir,
			encoding: "utf8",
			stdio
		});
		const spawnError = result.error ?? void 0;
		const exitCode = spawnError === void 0 ? result.status ?? 1 : spawnError.code === "ENOENT" ? 127 : 1;
		if (spawnError !== void 0 && spawnError.code !== "ENOENT") throw spawnError;
		const warnings = exitCode === 0 ? this.reconcile(before) : this.failureWarnings(command, exitCode);
		const snapshot = this.snapshot();
		const changed = initialized || !sameSnapshotState(beforeSnapshot, snapshot);
		return {
			profile: this.profile,
			dir: this.dir,
			command: ["pnpm", ...command.map(safeDependencySpec)],
			exitCode,
			stdout: typeof result.stdout === "string" ? result.stdout : "",
			stderr: typeof result.stderr === "string" ? result.stderr : "",
			warnings,
			initialized,
			changed,
			restartRequired: exitCode === 0 && (changed || mutatesProfile(command)),
			snapshot
		};
	}
	/**
	* Replace Bundle order after proving the exact current multiset is retained.
	* @param orderedBundles - complete next Bundle order.
	* @returns the resulting native snapshot.
	*/
	reorderBundles(orderedBundles) {
		this.ensureProfile();
		const manifest = readProfileManifest(NAME, this.dir);
		const current = manifest.dsh?.profile?.bundles ?? [];
		if (new Set(orderedBundles).size !== orderedBundles.length || !sameMultiset(current, orderedBundles)) throw new Error("bundle reorder must contain every current Bundle exactly once");
		manifest.dsh = {
			...manifest.dsh,
			profile: {
				...manifest.dsh?.profile,
				bundles: [...orderedBundles]
			}
		};
		writeProfileManifest(this.dir, manifest);
		return this.snapshot();
	}
	/**
	* Check native Profile composition and pnpm availability.
	* @returns structured diagnostics without running plugin code.
	*/
	doctor() {
		const snapshot = this.snapshot();
		const diagnostics = [];
		const version = crossSpawn.sync("pnpm", ["--version"], {
			cwd: this.dir,
			encoding: "utf8"
		});
		const pnpm = version.status === 0 && typeof version.stdout === "string" ? version.stdout.trim() : void 0;
		diagnostics.push(pnpm === void 0 ? {
			level: "error",
			message: "pnpm 不可用；Profile 插件操作需要 PATH 中的 pnpm"
		} : {
			level: "info",
			message: `pnpm ${pnpm}`
		});
		for (const plugin of snapshot.plugins) for (const diagnostic of plugin.diagnostics) diagnostics.push({
			level: plugin.active ? "error" : "warning",
			message: `${plugin.name}: ${diagnostic}`
		});
		for (const bundle of snapshot.bundles) try {
			const dir = resolveBundleDir(NAME, bundle, this.installAnchor, this.dir);
			const patch = readInstalledManifest(dir).dsh?.bundle?.patch;
			if (patch === void 0) diagnostics.push({
				level: "error",
				message: `${bundle} 未声明 dsh.bundle.patch`
			});
			else if (!validPatch(dir, patch)) diagnostics.push({
				level: "error",
				message: `${bundle} 的 Bundle patch 缺失或格式无效`
			});
		} catch (error) {
			diagnostics.push({
				level: "error",
				message: error instanceof Error ? error.message : String(error)
			});
		}
		if (diagnostics.every((item) => item.level !== "error")) diagnostics.push({
			level: "info",
			message: "Profile Bundle 结构可解析"
		});
		return {
			profile: this.profile,
			...pnpm === void 0 ? {} : { pnpm },
			diagnostics,
			snapshot
		};
	}
	/**
	* List initialized Profile directories under the same Harness home.
	* @returns sorted Profile summaries with compatibility diagnostics.
	*/
	listProfiles() {
		const root = join(this.home ?? resolve(this.dir, "..", ".."), PROFILES_DIR);
		const names = new Set(Object.keys(PROFILE_TEMPLATES));
		if (existsSync(root)) {
			for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== "node_modules") names.add(entry.name);
		}
		return [...names].map((name$1) => this.profileSummary(name$1)).sort((left, right) => left.name.localeCompare(right.name));
	}
	/**
	* Create a Profile from a shipped template or a copy of another Profile.
	* Installed dependencies are deliberately not copied; `pnpm install` is the
	* native materialization step and remains explicit to the caller.
	* @param name - new Profile name.
	* @param copyFrom - optional source Profile name.
	* @param options - optional Bundle additions/removals owned by the caller's product Surface.
	* @returns the created Profile summary.
	*/
	createProfile(name$1, copyFrom, options = {}) {
		const target = resolveProfileDir(name$1, this.home);
		if (existsSync(join(target, "package.json"))) throw new Error(`Profile ${JSON.stringify(name$1)} 已存在`);
		if (copyFrom === void 0) {
			initProfile(target, convertedBundles(PROFILE_TEMPLATES[name$1] ?? PROFILE_TEMPLATES.tui ?? DEFAULT_PROFILE_BUNDLES, options));
			return this.profileSummary(name$1);
		}
		const source = resolveProfileDir(copyFrom, this.home);
		const sourceManifest = readProfileManifest(NAME, source);
		const bundles = convertedBundles(sourceManifest.dsh?.profile?.bundles ?? [], options);
		mkdirSync(target, { recursive: true });
		writeProfileManifest(target, {
			...sourceManifest,
			name: `dsh-profile-${basename(target)}`,
			dependencies: { ...sourceManifest.dependencies },
			dsh: {
				...sourceManifest.dsh,
				profile: {
					...sourceManifest.dsh?.profile,
					bundles
				}
			}
		});
		for (const filename of [
			PROFILE_PATCH_FILENAME,
			"pnpm-workspace.yaml",
			"pnpm-lock.yaml"
		]) {
			const sourcePath = join(source, filename);
			if (existsSync(sourcePath)) copyFileSync(sourcePath, join(target, filename));
		}
		if (!existsSync(join(target, PROFILE_PATCH_FILENAME))) initProfile(target, bundles);
		return this.profileSummary(name$1);
	}
	profileSummary(name$1) {
		const dir = resolveProfileDir(name$1, this.home);
		const initialized = existsSync(join(dir, "package.json"));
		try {
			const manifest = initialized ? readProfileManifest(NAME, dir) : void 0;
			const bundles = [...manifest?.dsh?.profile?.bundles ?? PROFILE_TEMPLATES[name$1] ?? []];
			for (const bundle of bundles) resolveBundleDir(NAME, bundle, this.installAnchor, dir);
			return {
				name: name$1,
				dir,
				initialized,
				bundles,
				dependencyCount: Object.keys(manifest?.dependencies ?? {}).length,
				compatible: true
			};
		} catch (error) {
			return {
				name: name$1,
				dir,
				initialized,
				bundles: [],
				dependencyCount: 0,
				compatible: false,
				diagnostic: error instanceof Error ? error.message : String(error)
			};
		}
	}
	inspectInstalled(packageName, spec, bundles) {
		const diagnostics = [];
		let manifest;
		let packageDir;
		try {
			packageDir = resolveBundleDir(NAME, packageName, this.installAnchor, this.dir);
			manifest = readInstalledManifest(packageDir);
		} catch (error) {
			diagnostics.push(error instanceof Error ? error.message : String(error));
		}
		const patch = manifest?.dsh?.bundle?.patch;
		const patchValid = packageDir !== void 0 && patch !== void 0 && validPatch(packageDir, patch);
		if (patch !== void 0 && !patchValid) diagnostics.push(`声明的 Bundle patch ${JSON.stringify(patch)} 缺失或格式无效`);
		if (bundles.includes(packageName) && patch === void 0) diagnostics.push("位于 Bundle 顺序中但未声明 dsh.bundle.patch");
		return Object.freeze({
			name: packageName,
			spec: safeDependencySpec(spec),
			...manifest?.version === void 0 ? {} : { version: manifest.version },
			...manifest?.description === void 0 ? {} : { description: manifest.description },
			source: inferSource(spec),
			bundle: patch !== void 0,
			active: bundles.includes(packageName),
			...patch === void 0 ? {} : { patch },
			patchValid,
			scripts: Object.freeze(Object.keys(manifest?.scripts ?? {})),
			diagnostics: Object.freeze(diagnostics)
		});
	}
	reconcile(before) {
		const after = readProfileManifest(NAME, this.dir);
		const beforeDeps = new Set(Object.keys(before.dependencies ?? {}));
		const dependencies = Object.keys(after.dependencies ?? {});
		const bundles = [...after.dsh?.profile?.bundles ?? []];
		const warnings = [];
		let changed = false;
		for (const packageName of dependencies) {
			const isBundle = this.exportsPatch(packageName);
			if (isBundle && !bundles.includes(packageName)) {
				bundles.push(packageName);
				changed = true;
			} else if (!isBundle && !beforeDeps.has(packageName)) warnings.push(`${packageName} 未声明 dsh.bundle；它只是 Profile 依赖，不会成为 Harness Bundle`);
		}
		const dependencySet = new Set(dependencies);
		for (const packageName of [...bundles]) {
			const managed = beforeDeps.has(packageName) || dependencySet.has(packageName);
			const stillBundle = dependencySet.has(packageName) && this.exportsPatch(packageName);
			if (managed && !stillBundle) {
				bundles.splice(bundles.indexOf(packageName), 1);
				changed = true;
			}
		}
		if (changed) {
			after.dsh = {
				...after.dsh,
				profile: {
					...after.dsh?.profile,
					bundles
				}
			};
			writeProfileManifest(this.dir, after);
		}
		return warnings;
	}
	exportsPatch(packageName) {
		try {
			const dir = resolveBundleDir(NAME, packageName, this.installAnchor, this.dir);
			const patch = readInstalledManifest(dir).dsh?.bundle?.patch;
			return patch !== void 0 && validPatch(dir, patch);
		} catch {
			return false;
		}
	}
	anchorPathSpec(argument) {
		const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument);
		if (match?.groups?.path === void 0) return argument;
		return `${match.groups.prefix ?? ""}${resolve(this.invokingCwd, match.groups.path)}`;
	}
	failureWarnings(command, exitCode) {
		if (exitCode === 127) return ["pnpm 不在 PATH 中；请安装 pnpm 后重试"];
		const warnings = [`pnpm 在 Profile 目录 ${this.dir} 中失败，退出码 ${exitCode}`];
		if (command.some((argument) => /^git\+|^github:|\.git(?:#|$)/.test(argument))) warnings.push(`Git 插件的 prepare/install 脚本可能需要在 ${join(this.dir, "pnpm-workspace.yaml")} 的 allowBuilds 中明确授权`);
		return warnings;
	}
};

//#endregion
//#region src/host/startup.ts
/** Stable Cordis plugin name. */
const name = "tui-startup";
/** Services required before launch values can be resolved. */
const inject = ["cmdlineArgs"];
/** Service provided to the Host-to-Client TUI runner. */
const TUI_STARTUP_SERVICE = "tuiStartup";
function activeProfile(argv = process.argv.slice(2)) {
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--profile") {
			const value = argv[index + 1];
			if (value !== void 0 && value.trim() !== "") return value;
		}
		if (argument?.startsWith("--profile=") === true) {
			const value = argument.slice(10);
			if (value !== "") return value;
		}
	}
	throw new Error("TUI Bundle 必须通过 dsh --profile <name> 启动");
}
function dshInstallAnchor() {
	const entry = process.argv[1];
	if (entry === void 0) throw new Error("无法定位 dsh 安装目录");
	return resolve(dirname(realpathSync(entry)), "../package.json");
}
function restartProvider(ctx) {
	return async (request) => {
		const entry = process.argv[1];
		if (entry === void 0) throw new Error("无法定位 dsh 启动文件");
		const handoffPath = request.handoff === void 0 ? void 0 : writeAppHandoff(request.handoff.channel, request.handoff.payload);
		const child = spawn(process.execPath, [
			realpathSync(entry),
			"--profile",
			request.profile,
			...request.args
		], {
			stdio: "inherit",
			env: {
				...process.env,
				...handoffPath === void 0 ? {} : { [APP_HANDOFF_ENV]: handoffPath }
			}
		});
		try {
			await new Promise((resolveSpawn, reject) => {
				child.once("spawn", resolveSpawn);
				child.once("error", reject);
			});
		} catch (error) {
			if (handoffPath !== void 0) try {
				unlinkSync(handoffPath);
			} catch {}
			throw error;
		}
		ctx.get("appExit")?.(0);
	};
}
function tuiCommand() {
	return new Command().name("deepseek").description("启动 DeepSeek Harness 终端界面。").helpOption("-h, --help", "显示帮助").option("--cwd <path>", "在指定工作目录开始；默认使用当前目录").option("--resume [sessionId]", "恢复指定会话；省略 id 时恢复最近会话").argument("[task...]", "进入后立即发送的初始任务").addHelpText("after", `
启动器选项：
  deepseek --profile <name> ...    覆盖默认 tui Profile；必须写在任务和 TUI 参数之前

示例：
  deepseek                         在当前目录打开新会话
  deepseek "检查这个项目"          打开后立即发送任务
  deepseek --resume               恢复最近会话
  deepseek --resume <sessionId>   恢复指定会话
  deepseek --cwd ../project       在指定目录开始
  deepseek --profile team-tui     使用指定 Harness Profile
`);
}
function restartHandoff(value) {
	if (value === void 0) return void 0;
	if (typeof value !== "object" || value === null) throw new Error("TUI 重启交接不是对象");
	const row = value;
	if (typeof row.profile !== "string" || typeof row.cwd !== "string" || !Array.isArray(row.attachmentPaths) || !row.attachmentPaths.every((path) => typeof path === "string")) throw new Error("TUI 重启交接缺少 Profile、工作区或附件路径");
	if (row.attachmentPaths.length > 32) throw new Error("TUI 重启交接附件数量超过限制");
	if (row.resume !== void 0 && typeof row.resume !== "string") throw new Error("TUI 重启交接会话 id 无效");
	if (row.draft !== void 0 && typeof row.draft !== "string") throw new Error("TUI 重启交接草稿无效");
	if (row.notice !== void 0 && typeof row.notice !== "string") throw new Error("TUI 重启交接提示无效");
	return {
		profile: row.profile,
		cwd: resolve(row.cwd),
		...typeof row.resume === "string" ? { resume: row.resume } : {},
		...typeof row.draft === "string" ? { draft: row.draft } : {},
		attachmentPaths: row.attachmentPaths,
		...typeof row.notice === "string" ? { notice: row.notice } : {}
	};
}
/**
* Parse TUI-owned flags and provide immutable launch values.
* @param ctx - Host context carrying the launcher argument snapshot.
*/
function apply(ctx) {
	const profile = activeProfile();
	ctx.provide("profilePluginManager", new ProfilePluginManager({
		profile,
		installAnchor: dshInstallAnchor(),
		invokingCwd: process.cwd()
	}));
	ctx.provide("appRestart", restartProvider(ctx));
	const handoff = restartHandoff(consumeAppHandoff("deepseek-tui-v1"));
	const program = tuiCommand();
	program.action(() => {
		const options = program.opts();
		const task = program.args.join(" ").trim();
		const resume = options.resume === true ? true : typeof options.resume === "string" && options.resume.trim() !== "" ? options.resume : void 0;
		const cwd = resolve(options.cwd ?? process.cwd());
		if (handoff !== void 0 && (handoff.profile !== profile || handoff.cwd !== cwd || handoff.resume !== resume)) throw new Error("TUI 重启交接与 launcher 参数不一致");
		ctx.provide(TUI_STARTUP_SERVICE, {
			profile,
			cwd,
			...resume !== void 0 && { resume },
			...task !== "" && { task },
			...handoff?.draft === void 0 ? {} : { draft: handoff.draft },
			...handoff === void 0 ? {} : { attachmentPaths: handoff.attachmentPaths },
			...handoff?.notice === void 0 ? {} : { startupNotice: handoff.notice }
		});
	});
	parseCmdline(ctx, program);
}

//#endregion
export { name as i, apply as n, inject as r, TUI_STARTUP_SERVICE as t };