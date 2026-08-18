import { c as ui, n as localeFromEnvironment, o as setUiLocale } from "./locale-CnWu_5tm.js";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { load } from "js-yaml";
import { Command } from "commander";
import { parseCmdline } from "@deepseek-ai/dsh-cmdline";
import crossSpawn from "cross-spawn";
import { DEFAULT_PROFILE_BUNDLES, PROFILES_DIR, PROFILE_PATCH_FILENAME, PROFILE_TEMPLATES, initProfile, readProfileManifest, resolveBundleDir, resolveProfileDir, writeProfileManifest } from "@deepseek-ai/dsh-app-boot";

//#region src/host/installer-output.ts
/** Stateful redaction of pnpm installer streams that may split secrets across chunks. */
const INSTALLER_OUTPUT_LIMIT = 1024 * 1024;
const DEFAULT_HOLD = 512;
function appendBounded(current, chunk, maxBytes) {
	const joined = current + chunk;
	if (Buffer.byteLength(joined) <= maxBytes) return joined;
	let start = Math.max(0, joined.length - maxBytes);
	while (start < joined.length && Buffer.byteLength(joined.slice(start)) > maxBytes) start += 1;
	return joined.slice(start);
}
/**
* Collect environment values that must never appear in installer output.
* @param env - process environment.
*/
function installerSecrets(env = process.env) {
	return Object.entries(env).flatMap(([key, secret]) => {
		if (secret === void 0 || secret.length < 4) return [];
		if (!/(?:TOKEN|KEY|SECRET|PASSWORD|AUTH|CREDENTIAL)/iu.test(key)) return [];
		return [secret];
	});
}
/**
* Redact credentials in one complete installer fragment.
* @param value - text that will not be extended by a later chunk.
* @param secrets - explicit environment secrets to erase.
*/
function redactInstallerText(value, secrets = []) {
	let redacted = value.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1***@").replace(/(https?:\/\/)[^\s/@]+@/giu, "$1***@").replace(/((?:_authToken|authorization|password|token)\s*[=:]\s*)[^\s]+/giu, "$1***");
	for (const secret of secrets) if (secret.length >= 4) redacted = redacted.replaceAll(secret, "***");
	return redacted;
}
function holdLength(secrets, hold) {
	const longest = secrets.reduce((max, secret) => Math.max(max, secret.length), 0);
	return Math.max(hold, longest + 32);
}
/** One stdout or stderr stream that only releases prefixes that cannot complete a later secret match. */
var InstallerOutputRedactor = class {
	pending = "";
	released = "";
	secrets;
	maxBytes;
	hold;
	constructor(options = {}) {
		this.secrets = options.secrets ?? installerSecrets();
		this.maxBytes = options.maxBytes ?? INSTALLER_OUTPUT_LIMIT;
		this.hold = holdLength(this.secrets, options.hold ?? DEFAULT_HOLD);
	}
	/**
	* Absorb one chunk and return only the redacted prefix that is safe to display.
	* @param chunk - raw installer bytes.
	*/
	push(chunk) {
		this.pending += chunk;
		const split = this.splitIndex(this.pending);
		if (split <= 0) return "";
		const emit = redactInstallerText(this.pending.slice(0, split), this.secrets);
		this.pending = this.pending.slice(split);
		this.released = appendBounded(this.released, emit, this.maxBytes);
		return emit;
	}
	splitIndex(value) {
		let split = value.length - this.hold;
		if (split < 0) split = 0;
		const url = /https?:\/\/\S*$/iu.exec(value);
		if (url !== null && url.index < split) split = url.index;
		const token = /(?:_authToken|authorization|password|token)\s*[=:]\s*\S*$/iu.exec(value);
		if (token !== null && token.index < split) split = token.index;
		return split;
	}
	/** Redact and release every held suffix. */
	flush() {
		const emit = redactInstallerText(this.pending, this.secrets);
		this.pending = "";
		this.released = appendBounded(this.released, emit, this.maxBytes);
		return emit;
	}
	/** Bounded redacted capture for the completed stream. */
	text() {
		return this.released;
	}
};

//#endregion
//#region src/host/app-handoff.ts
/** Inherited environment key carrying one single-use handoff path. */
const APP_HANDOFF_ENV = "DSH_APP_HANDOFF_FILE";
/** Maximum serialized handoff bytes; payloads carry references, never file bytes. */
const APP_HANDOFF_MAX_BYTES = 256 * 1024;
/** Filename prefix for launcher-owned handoff files in the process temp directory. */
const APP_HANDOFF_PREFIX = "deepseek-handoff-";
/** Private subdirectory under the process temp directory. */
const APP_HANDOFF_DIRNAME = "seektty-handoff";
function handoffDirectory() {
	const directory = join(internals.tmpdir(), APP_HANDOFF_DIRNAME);
	mkdirSync(directory, {
		recursive: true,
		mode: 448
	});
	return directory;
}
/** Replaceable process seams used by handoff tests. */
const internals = {
	tmpdir,
	now: Date.now,
	staleMs: 1440 * 60 * 1e3
};
function canonical(path) {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}
function allowedPath(path) {
	const absolute = canonical(path);
	return dirname(absolute) === canonical(handoffDirectory()) && basename(absolute).startsWith(APP_HANDOFF_PREFIX);
}
function degrade(reason) {
	return {
		kind: "degraded",
		reason
	};
}
/**
* Remove leftover prefix files older than the stale window.
* Called on write and consume so a child crash does not fill tmpdir.
*/
function sweepStaleAppHandoffs() {
	let directory;
	try {
		directory = handoffDirectory();
	} catch {
		return;
	}
	let names;
	try {
		names = readdirSync(directory);
	} catch {
		return;
	}
	const cutoff = internals.now() - internals.staleMs;
	for (const name$1 of names) {
		if (!name$1.startsWith(APP_HANDOFF_PREFIX)) continue;
		const path = join(directory, name$1);
		if (!allowedPath(path)) continue;
		try {
			const stat = lstatSync(path);
			if (!stat.isFile() || stat.mtimeMs > cutoff) continue;
			unlinkSync(path);
		} catch {}
	}
}
/**
* Persist one opaque app payload for a child process. The file is exclusive,
* owner-only where the platform exposes POSIX modes, and never logged.
* @param channel - app protocol identifier.
* @param payload - JSON-compatible references and draft metadata.
* @returns absolute handoff path for {@link APP_HANDOFF_ENV}.
*/
/**
* Build a child process env that never inherits a stale handoff ticket.
* Only a path from a successful {@link writeAppHandoff} is published.
* @param parentEnv - current process environment.
* @param handoffPath - newly written ticket, when restart carries a payload.
*/
function restartChildEnv(parentEnv, handoffPath) {
	const env = { ...parentEnv };
	delete env[APP_HANDOFF_ENV];
	if (handoffPath !== void 0) env[APP_HANDOFF_ENV] = handoffPath;
	return env;
}
function writeAppHandoff(channel, payload) {
	if (channel.trim() === "") throw new Error("app handoff channel cannot be blank");
	sweepStaleAppHandoffs();
	const body = JSON.stringify({
		version: 1,
		channel,
		payload
	});
	if (Buffer.byteLength(body) > APP_HANDOFF_MAX_BYTES) throw new Error("app handoff payload exceeds size limit");
	const path = join(handoffDirectory(), `${APP_HANDOFF_PREFIX}${randomUUID()}.json`);
	writeFileSync(path, body, {
		encoding: "utf8",
		flag: "wx",
		mode: 384
	});
	return path;
}
/**
* Consume and delete this process's handoff when its channel matches.
* Invalid paths, permissions, envelopes, or channels degrade instead of aborting boot.
* @param channel - expected app protocol identifier.
* @param env - process environment carrying {@link APP_HANDOFF_ENV}.
*/
function consumeAppHandoff(channel, env = process.env) {
	sweepStaleAppHandoffs();
	const path = env[APP_HANDOFF_ENV];
	delete env[APP_HANDOFF_ENV];
	if (path === void 0) return { kind: "missing" };
	if (!allowedPath(path)) return degrade("app handoff path is outside the launcher temp boundary");
	try {
		const stat = lstatSync(path);
		if (!stat.isFile()) return degrade("app handoff path is not a regular file");
		if (stat.size > APP_HANDOFF_MAX_BYTES) return degrade("app handoff file exceeds size limit");
		if (process.platform !== "win32" && (stat.mode & 63) !== 0) return degrade("app handoff file permissions are not owner-only");
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (parsed === null || parsed.version !== 1 || parsed.channel !== channel || !("payload" in parsed)) return degrade(`app handoff does not match channel ${JSON.stringify(channel)}`);
		return {
			kind: "payload",
			payload: parsed.payload
		};
	} catch (error) {
		return degrade(error instanceof Error ? error.message : String(error));
	} finally {
		try {
			unlinkSync(path);
		} catch {}
	}
}

//#endregion
//#region src/host/profile-plugin-manager.ts
const NAME = "dsh";
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
	snapshotCache;
	installedFactsCache = /* @__PURE__ */ new Map();
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
		const stamp = this.profileStamp();
		if (this.snapshotCache?.stamp === stamp) return this.snapshotCache.snapshot;
		this.installedFactsCache.clear();
		const manifest = readProfileManifest(NAME, this.dir);
		const dependencies = { ...manifest.dependencies };
		const bundles = [...manifest.dsh?.profile?.bundles ?? []];
		const plugins = Object.entries(dependencies).map(([packageName, spec]) => this.inspectInstalled(packageName, spec, bundles));
		const snapshot = Object.freeze({
			profile: this.profile,
			dir: this.dir,
			dependencies: Object.freeze(dependencies),
			bundles: Object.freeze(bundles),
			plugins: Object.freeze(plugins)
		});
		this.snapshotCache = {
			stamp,
			snapshot
		};
		return snapshot;
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
		const stdoutRedactor = new InstallerOutputRedactor();
		const stderrRedactor = new InstallerOutputRedactor();
		const flushVisible = () => {
			const stdoutTail = stdoutRedactor.flush();
			const stderrTail = stderrRedactor.flush();
			if (stdoutTail !== "") options.onOutput?.("stdout", stdoutTail);
			if (stderrTail !== "") options.onOutput?.("stderr", stderrTail);
			stdout = stdoutRedactor.text();
			stderr = stderrRedactor.text();
		};
		let exitCode;
		try {
			exitCode = await new Promise((resolvePromise, reject) => {
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
					const visible = stdoutRedactor.push(chunk);
					if (visible !== "") options.onOutput?.("stdout", visible);
				});
				child.stderr.on("data", (chunk) => {
					const visible = stderrRedactor.push(chunk);
					if (visible !== "") options.onOutput?.("stderr", visible);
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
		} finally {
			flushVisible();
		}
		this.forgetInstalled();
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
		this.forgetInstalled();
		const warnings = exitCode === 0 ? this.reconcile(before) : this.failureWarnings(command, exitCode);
		const snapshot = this.snapshot();
		const changed = initialized || !sameSnapshotState(beforeSnapshot, snapshot);
		return {
			profile: this.profile,
			dir: this.dir,
			command: ["pnpm", ...command.map(safeDependencySpec)],
			exitCode,
			stdout: typeof result.stdout === "string" ? redactInstallerText(result.stdout, installerSecrets()) : "",
			stderr: typeof result.stderr === "string" ? redactInstallerText(result.stderr, installerSecrets()) : "",
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
		this.forgetInstalled();
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
			message: ui("pnpm 不可用；Profile 插件操作需要 PATH 中的 pnpm", "pnpm is unavailable; Profile plugin operations require pnpm on PATH")
		} : {
			level: "info",
			message: `pnpm ${pnpm}`
		});
		for (const plugin of snapshot.plugins) for (const diagnostic of plugin.diagnostics) diagnostics.push({
			level: plugin.active ? "error" : "warning",
			message: `${plugin.name}: ${diagnostic}`
		});
		for (const bundle of snapshot.bundles) {
			const facts = this.installedFacts(bundle);
			const patch = facts.manifest?.dsh?.bundle?.patch;
			if (facts.manifest === void 0) diagnostics.push({
				level: "error",
				message: facts.diagnostic ?? ui(`${bundle} 无法读取已安装清单`, `${bundle} cannot read the installed manifest`)
			});
			else if (patch === void 0) diagnostics.push({
				level: "error",
				message: ui(`${bundle} 未声明 dsh.bundle.patch`, `${bundle} does not declare dsh.bundle.patch`)
			});
			else if (!facts.patchValid) diagnostics.push({
				level: "error",
				message: ui(`${bundle} 的 Bundle patch 缺失或格式无效`, `The Bundle patch of ${bundle} is missing or invalid`)
			});
		}
		if (diagnostics.every((item) => item.level !== "error")) diagnostics.push({
			level: "info",
			message: ui("Profile Bundle 结构可解析", "Profile Bundle structure is valid")
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
		if (existsSync(join(target, "package.json"))) throw new Error(ui(`Profile ${JSON.stringify(name$1)} 已存在`, `Profile ${JSON.stringify(name$1)} already exists`));
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
		const facts = this.installedFacts(packageName);
		const diagnostics = [];
		if (facts.diagnostic !== void 0) diagnostics.push(facts.diagnostic);
		const patch = facts.manifest?.dsh?.bundle?.patch;
		if (patch !== void 0 && !facts.patchValid) diagnostics.push(ui(`声明的 Bundle patch ${JSON.stringify(patch)} 缺失或格式无效`, `Declared Bundle patch ${JSON.stringify(patch)} is missing or invalid`));
		if (bundles.includes(packageName) && patch === void 0) diagnostics.push(ui("位于 Bundle 顺序中但未声明 dsh.bundle.patch", "Listed in Bundle order but does not declare dsh.bundle.patch"));
		return Object.freeze({
			name: packageName,
			spec: safeDependencySpec(spec),
			...facts.manifest?.version === void 0 ? {} : { version: facts.manifest.version },
			...facts.manifest?.description === void 0 ? {} : { description: facts.manifest.description },
			source: inferSource(spec),
			bundle: patch !== void 0,
			active: bundles.includes(packageName),
			...patch === void 0 ? {} : { patch },
			patchValid: facts.patchValid,
			scripts: Object.freeze(Object.keys(facts.manifest?.scripts ?? {})),
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
			} else if (!isBundle && !beforeDeps.has(packageName)) warnings.push(ui(`${packageName} 未声明 dsh.bundle；它只是 Profile 依赖，不会成为 Harness Bundle`, `${packageName} does not declare dsh.bundle; it is only a Profile dependency and will not become a Harness Bundle`));
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
			this.forgetInstalled();
		}
		return warnings;
	}
	exportsPatch(packageName) {
		const facts = this.installedFacts(packageName);
		return facts.manifest?.dsh?.bundle?.patch !== void 0 && facts.patchValid;
	}
	installedFacts(packageName) {
		const cached = this.installedFactsCache.get(packageName);
		if (cached !== void 0) return cached;
		let facts;
		try {
			const packageDir = resolveBundleDir(NAME, packageName, this.installAnchor, this.dir);
			const manifest = readInstalledManifest(packageDir);
			const patch = manifest.dsh?.bundle?.patch;
			facts = {
				packageDir,
				manifest,
				patchValid: patch !== void 0 && validPatch(packageDir, patch)
			};
		} catch (error) {
			facts = {
				patchValid: false,
				diagnostic: error instanceof Error ? error.message : String(error)
			};
		}
		this.installedFactsCache.set(packageName, facts);
		return facts;
	}
	profileStamp() {
		return [
			join(this.dir, "package.json"),
			join(this.dir, "pnpm-lock.yaml"),
			join(this.dir, "package-lock.json"),
			join(this.dir, PROFILE_PATCH_FILENAME),
			join(this.dir, "node_modules")
		].map((path) => this.pathStamp(path)).join("|");
	}
	pathStamp(path) {
		if (!existsSync(path)) return `${basename(path)}:missing`;
		const stat = statSync(path);
		return `${basename(path)}:${stat.mtimeMs}:${stat.isFile() ? stat.size : "dir"}`;
	}
	forgetInstalled() {
		this.snapshotCache = void 0;
		this.installedFactsCache.clear();
	}
	anchorPathSpec(argument) {
		const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument);
		if (match?.groups?.path === void 0) return argument;
		return `${match.groups.prefix ?? ""}${resolve(this.invokingCwd, match.groups.path)}`;
	}
	failureWarnings(command, exitCode) {
		if (exitCode === 127) return [{
			zh: "pnpm 不在 PATH 中；请安装 pnpm 后重试",
			en: "pnpm is not on PATH; install pnpm and retry"
		}.zh];
		const warnings = [ui(`pnpm 在 Profile 目录 ${this.dir} 中失败，退出码 ${exitCode}`, `pnpm failed in Profile directory ${this.dir} with exit code ${exitCode}`)];
		if (command.some((argument) => /^git\+|^github:|\.git(?:#|$)/.test(argument))) warnings.push(ui(`Git 插件的 prepare/install 脚本可能需要在 ${join(this.dir, "pnpm-workspace.yaml")} 的 allowBuilds 中明确授权`, `prepare/install scripts for a Git plugin may need an explicit allowBuilds entry in ${join(this.dir, "pnpm-workspace.yaml")}`));
		return warnings;
	}
};

//#endregion
//#region src/host/restart-handoff.ts
function degradedNotice() {
	return ui("重启交接无效，已按普通启动继续", "Restart handoff was invalid; continuing with a normal start");
}
function parseRestartHandoff(value) {
	if (typeof value !== "object" || value === null) throw new Error(ui("TUI 重启交接不是对象", "TUI restart handoff is not an object"));
	const row = value;
	if (typeof row.profile !== "string" || typeof row.cwd !== "string" || !Array.isArray(row.attachmentPaths) || !row.attachmentPaths.every((path) => typeof path === "string")) throw new Error(ui("TUI 重启交接缺少 Profile、工作区或附件路径", "TUI restart handoff is missing the Profile, workspace, or attachment paths"));
	if (row.attachmentPaths.length > 32) throw new Error(ui("TUI 重启交接附件数量超过限制", "TUI restart handoff exceeds the attachment limit"));
	if (row.resume !== void 0 && typeof row.resume !== "string") throw new Error(ui("TUI 重启交接会话 id 无效", "TUI restart handoff has an invalid session ID"));
	if (row.draft !== void 0 && typeof row.draft !== "string") throw new Error(ui("TUI 重启交接草稿无效", "TUI restart handoff has an invalid draft"));
	if (row.notice !== void 0 && typeof row.notice !== "string") throw new Error(ui("TUI 重启交接提示无效", "TUI restart handoff has an invalid notice"));
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
* Turn a consume result into a parsed handoff or a startup notice.
* Invalid envelopes never throw; boot continues without the draft.
*/
function readRestartHandoff(consumed) {
	if (consumed.kind === "missing") return {};
	if (consumed.kind === "degraded") return { startupNotice: degradedNotice() };
	try {
		return { handoff: parseRestartHandoff(consumed.payload) };
	} catch {
		return { startupNotice: degradedNotice() };
	}
}
/**
* Drop a parsed handoff when it disagrees with this process's launcher args.
*/
function reconcileHandoff(pending, launch) {
	if (pending.handoff === void 0) return pending;
	if (pending.handoff.profile !== launch.profile || pending.handoff.cwd !== resolve(launch.cwd) || pending.handoff.resume !== launch.resume) return { startupNotice: degradedNotice() };
	return {
		handoff: pending.handoff,
		...pending.handoff.notice === void 0 && pending.startupNotice === void 0 ? {} : { startupNotice: pending.handoff.notice ?? pending.startupNotice }
	};
}

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
	throw new Error(ui("TUI Bundle 必须通过 dsh --profile <name> 启动", "The TUI Bundle must be started through dsh --profile <name>"));
}
function dshInstallAnchor() {
	const entry = process.argv[1];
	if (entry === void 0) throw new Error(ui("无法定位 dsh 安装目录", "Cannot locate the dsh installation directory"));
	return resolve(dirname(realpathSync(entry)), "../package.json");
}
function restartProvider(ctx) {
	return async (request) => {
		const entry = process.argv[1];
		if (entry === void 0) throw new Error(ui("无法定位 dsh 启动文件", "Cannot locate the dsh entry file"));
		delete process.env[APP_HANDOFF_ENV];
		const handoffPath = request.handoff === void 0 ? void 0 : writeAppHandoff(request.handoff.channel, request.handoff.payload);
		const child = spawn(process.execPath, [
			realpathSync(entry),
			"--profile",
			request.profile,
			...request.args
		], {
			stdio: "inherit",
			windowsHide: true,
			env: restartChildEnv(process.env, handoffPath)
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
	return new Command().name("deepseek").description(ui("启动 DeepSeek Harness 终端界面。", "Start the DeepSeek Harness terminal interface.")).helpOption("-h, --help", ui("显示帮助", "Display help")).option("--cwd <path>", ui("在指定工作目录开始；默认使用当前目录", "Start in the specified working directory; defaults to the current directory")).option("--resume [sessionId]", ui("恢复指定会话；省略 id 时恢复最近会话", "Resume a session; omit the id to resume the most recent session")).argument("[task...]", ui("进入后立即发送的初始任务", "Initial task to send after entering the interface")).addHelpText("after", ui(`
启动器选项：
  deepseek --profile <name> ...    覆盖默认 tui Profile；必须写在任务和 TUI 参数之前

示例：
  deepseek                         在当前目录打开新会话
  deepseek "检查这个项目"          打开后立即发送任务
  deepseek --resume               恢复最近会话
  deepseek --resume <sessionId>   恢复指定会话
  deepseek --cwd ../project       在指定目录开始
  deepseek --profile team-tui     使用指定 Harness Profile
`, `
Launcher options:
  deepseek --profile <name> ...    Override the default tui Profile; place it before the task and TUI options

Examples:
  deepseek                         Open a new session in the current directory
  deepseek "review this project"   Open the interface and immediately send a task
  deepseek --resume               Resume the most recent session
  deepseek --resume <sessionId>   Resume the specified session
  deepseek --cwd ../project       Start in the specified directory
  deepseek --profile team-tui     Use the specified Harness Profile
`));
}
/**
* Parse TUI-owned flags and provide immutable launch values.
* @param ctx - Host context carrying the launcher argument snapshot.
*/
function apply(ctx) {
	setUiLocale(localeFromEnvironment());
	const profile = activeProfile();
	ctx.provide("profilePluginManager", new ProfilePluginManager({
		profile,
		installAnchor: dshInstallAnchor(),
		invokingCwd: process.cwd()
	}));
	ctx.provide("appRestart", restartProvider(ctx));
	const pendingHandoff = readRestartHandoff(consumeAppHandoff("seektty-v1"));
	const program = tuiCommand();
	program.action(() => {
		const options = program.opts();
		const task = program.args.join(" ").trim();
		const resume = options.resume === true ? true : typeof options.resume === "string" && options.resume.trim() !== "" ? options.resume : void 0;
		const cwd = resolve(options.cwd ?? process.cwd());
		const { handoff, startupNotice } = reconcileHandoff(pendingHandoff, {
			profile,
			cwd,
			...resume === void 0 ? {} : { resume }
		});
		ctx.provide(TUI_STARTUP_SERVICE, {
			profile,
			cwd,
			...resume !== void 0 && { resume },
			...task !== "" && { task },
			...handoff?.draft === void 0 ? {} : { draft: handoff.draft },
			...handoff === void 0 ? {} : { attachmentPaths: handoff.attachmentPaths },
			...startupNotice === void 0 ? {} : { startupNotice }
		});
	});
	parseCmdline(ctx, program);
}

//#endregion
export { installerSecrets as a, name as i, apply as n, redactInstallerText as o, inject as r, TUI_STARTUP_SERVICE as t };