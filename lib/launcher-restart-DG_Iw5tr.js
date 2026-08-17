import { lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

//#region src/host/app-handoff.ts
/** Inherited environment key carrying one single-use handoff path. */
const APP_HANDOFF_ENV = "DSH_APP_HANDOFF_FILE";
/** Maximum serialized handoff bytes; payloads carry references, never file bytes. */
const APP_HANDOFF_MAX_BYTES = 256 * 1024;
const PREFIX$1 = "deepseek-handoff-";
function allowedPath$1(path) {
	const absolute = resolve(path);
	return dirname(absolute) === resolve(tmpdir()) && basename(absolute).startsWith(PREFIX$1);
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
	const path = join(tmpdir(), `${PREFIX$1}${randomUUID()}.json`);
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
	if (!allowedPath$1(path)) throw new Error("app handoff path is outside the launcher temp boundary");
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
//#region src/launcher-restart.ts
/** Exit status that tells the product launcher to spawn dsh again. */
const LAUNCHER_RESTART_EXIT_CODE = 75;
const PREFIX = "deepseek-restart-";
function launcherRestartPath(launcherPid) {
	return join(tmpdir(), `${PREFIX}${launcherPid}.json`);
}
function allowedPath(path) {
	const absolute = resolve(path);
	return dirname(absolute) === resolve(tmpdir()) && basename(absolute).startsWith(PREFIX);
}
/**
* Record the next dsh invocation for the waiting `deepseek` parent.
* @param launcherPid - parent pid of this dsh process (`process.ppid`).
* @param request - Profile, forwarded args, and optional handoff path.
* @returns absolute ticket path.
*/
function writeLauncherRestart(launcherPid, request) {
	if (!Number.isInteger(launcherPid) || launcherPid <= 0) throw new Error("launcher restart pid is invalid");
	if (request.profile.trim() === "") throw new Error("launcher restart Profile cannot be blank");
	const body = JSON.stringify({
		version: 1,
		profile: request.profile,
		args: [...request.args],
		...request.handoffPath === void 0 ? {} : { handoffPath: request.handoffPath }
	});
	const path = launcherRestartPath(launcherPid);
	try {
		unlinkSync(path);
	} catch {}
	writeFileSync(path, body, {
		encoding: "utf8",
		flag: "wx",
		mode: 384
	});
	return path;
}
/**
* Consume and delete this launcher process's restart ticket.
* @param launcherPid - pid of the waiting `deepseek` process.
* @returns the next invocation, or undefined when dsh did not request a restart.
*/
function consumeLauncherRestart(launcherPid) {
	const path = launcherRestartPath(launcherPid);
	if (!allowedPath(path)) throw new Error("launcher restart path is outside the temp boundary");
	try {
		const stat = lstatSync(path);
		if (!stat.isFile()) throw new Error("launcher restart path is not a regular file");
		if (process.platform !== "win32" && (stat.mode & 63) !== 0) throw new Error("launcher restart file permissions are not owner-only");
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (parsed === null || parsed.version !== 1 || typeof parsed.profile !== "string" || parsed.profile.trim() === "" || !Array.isArray(parsed.args) || !parsed.args.every((argument) => typeof argument === "string")) throw new Error("launcher restart ticket is invalid");
		if (parsed.handoffPath !== void 0 && typeof parsed.handoffPath !== "string") throw new Error("launcher restart handoff path is invalid");
		return {
			profile: parsed.profile,
			args: parsed.args,
			...parsed.handoffPath === void 0 ? {} : { handoffPath: parsed.handoffPath }
		};
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	} finally {
		try {
			unlinkSync(path);
		} catch {}
	}
}

//#endregion
export { consumeAppHandoff as a, APP_HANDOFF_ENV as i, consumeLauncherRestart as n, writeAppHandoff as o, writeLauncherRestart as r, LAUNCHER_RESTART_EXIT_CODE as t };