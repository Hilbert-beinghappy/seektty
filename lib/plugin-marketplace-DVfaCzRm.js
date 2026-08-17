import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { load } from "js-yaml";

//#region src/host/plugin-marketplace.ts
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_TARBALL_BYTES = 16 * 1024 * 1024;
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_TAR_ENTRIES = 8192;
const MAX_SEARCH_RESULTS = 12;
const SENSITIVE_QUERY_KEY = new RegExp(String.raw`(?:^|[-_])(?:access[-_]?token|api[-_]?key|auth|authorization|credential|password|secret|signature|token)(?:$|[-_])`, "i");
function sourceType(spec) {
	if (/^(?:git\+|github:|gitlab:|bitbucket:)|\.git(?:#|$)/i.test(spec)) return "git";
	if (/^https?:.*\.(?:tgz|tar\.gz)(?:[?#].*)?$/i.test(spec) || /\.(?:tgz|tar\.gz)$/i.test(spec)) return "tarball";
	if (/^(?:file:|link:)/.test(spec) || isAbsolute(spec) || /^\.{1,2}(?:[/\\]|$)/.test(spec)) return "local";
	return "npm";
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
function requestInit(headers, signal) {
	return {
		headers,
		...signal === void 0 ? {} : { signal }
	};
}
/**
* Reject a user-visible HTTP spec or Source URL that embeds a Credential.
* @param value - plugin spec or Catalog URL.
* @param label - diagnostic subject.
*/
function assertCredentialFreeUrl(value, label) {
	const raw = value.startsWith("git+") ? value.slice(4) : value;
	if (!/^https?:\/\//i.test(raw)) return;
	const url = new URL(raw);
	if (url.username !== "" || url.password !== "") throw new Error(`${label} 不能在 URL 中内嵌用户名或 Secret；请使用 Credential Ref`);
	const sensitive = [...url.searchParams.keys()].find((key) => SENSITIVE_QUERY_KEY.test(key));
	if (sensitive !== void 0) throw new Error(`${label} 不能在 URL query 中内嵌 ${JSON.stringify(sensitive)}；请使用 Credential Ref`);
}
function readLocalBounded(path, maxBytes, label) {
	const stat = statSync(path);
	if (!stat.isFile()) throw new Error(`${label} 不是普通文件`);
	if (stat.size > maxBytes) throw new Error(`${label} 超过 ${maxBytes} 字节限制`);
	return readFileSync(path);
}
function safePatchPath(patch) {
	const normalized = posix.normalize(patch.replaceAll("\\", "/")).replace(/^\.\//, "");
	if (normalized === "" || normalized === "." || normalized === ".." || normalized.startsWith("../") || posix.isAbsolute(normalized)) return void 0;
	return normalized;
}
function validPatchText(text) {
	try {
		return Array.isArray(load(text, { schema: entryListSchema }));
	} catch {
		return false;
	}
}
function parseJson(bytes, label) {
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch (error) {
		throw new Error(`${label} 不是有效 JSON：${messageOf(error)}`);
	}
}
async function readBounded(response, maxBytes, label) {
	if (!response.ok) throw new Error(`${label} 请求失败：HTTP ${response.status}`);
	const length = Number(response.headers.get("content-length"));
	if (Number.isFinite(length) && length > maxBytes) throw new Error(`${label} 超过 ${maxBytes} 字节限制`);
	if (response.body === null) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		for (;;) {
			const result = await reader.read();
			if (result.done) break;
			size += result.value.byteLength;
			if (size > maxBytes) {
				await reader.cancel();
				throw new Error(`${label} 超过 ${maxBytes} 字节限制`);
			}
			chunks.push(result.value);
		}
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}
function tarText(bytes, start, length) {
	return new TextDecoder().decode(bytes.subarray(start, start + length)).replace(/\0.*$/s, "");
}
function tarSize(bytes, offset) {
	const text = tarText(bytes, offset + 124, 12).trim();
	if (!/^[0-7]*$/.test(text)) throw new Error("tarball 含无效文件大小");
	return text === "" ? 0 : Number.parseInt(text, 8);
}
function paxPath(body) {
	let offset = 0;
	let found;
	while (offset < body.length) {
		const space = body.indexOf(" ", offset);
		if (space === -1) break;
		const length = Number.parseInt(body.slice(offset, space), 10);
		if (!Number.isFinite(length) || length <= 0) break;
		const record = body.slice(space + 1, offset + length).replace(/\n$/, "");
		const equals = record.indexOf("=");
		if (equals !== -1 && record.slice(0, equals) === "path") found = record.slice(equals + 1);
		offset += length;
	}
	return found;
}
function tarEntries(compressed) {
	const bytes = compressed[0] === 31 && compressed[1] === 139 ? gunzipSync(compressed, { maxOutputLength: MAX_INFLATED_BYTES }) : compressed;
	if (bytes.byteLength > MAX_INFLATED_BYTES) throw new Error("tarball 解压后超过限制");
	const entries = /* @__PURE__ */ new Map();
	let offset = 0;
	let count = 0;
	let nextPath;
	while (offset + 512 <= bytes.byteLength) {
		const header = bytes.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		if (++count > MAX_TAR_ENTRIES) throw new Error("tarball 文件数量超过限制");
		const size = tarSize(bytes, offset);
		const dataStart = offset + 512;
		const dataEnd = dataStart + size;
		if (!Number.isSafeInteger(dataEnd) || dataEnd > bytes.byteLength) throw new Error("tarball 文件边界无效");
		const name = tarText(bytes, offset, 100);
		const prefix = tarText(bytes, offset + 345, 155);
		const type = String.fromCharCode(header[156] ?? 0);
		const body = bytes.subarray(dataStart, dataEnd);
		if (type === "L") nextPath = new TextDecoder().decode(body).replace(/\0.*$/s, "");
		else if (type === "x") nextPath = paxPath(new TextDecoder().decode(body)) ?? nextPath;
		else if (type === "\0" || type === "0") {
			const rawPath = nextPath ?? (prefix === "" ? name : `${prefix}/${name}`);
			nextPath = void 0;
			const normalized = posix.normalize(rawPath.replaceAll("\\", "/")).replace(/^\.\//, "");
			if (normalized !== ".." && !normalized.startsWith("../") && !posix.isAbsolute(normalized)) entries.set(normalized, body.slice());
		}
		offset = dataStart + Math.ceil(size / 512) * 512;
	}
	return entries;
}
function packageCandidate(manifest, patchBytes, facts) {
	const diagnostics = [];
	const patch = manifest.dsh?.bundle?.patch;
	const normalized = patch === void 0 ? void 0 : safePatchPath(patch);
	const patchValid = normalized !== void 0 && patchBytes !== void 0 && patchBytes.byteLength <= MAX_PATCH_BYTES && validPatchText(new TextDecoder().decode(patchBytes));
	if (patch === void 0) diagnostics.push("package.json 未声明 dsh.bundle.patch");
	else if (normalized === void 0) diagnostics.push("dsh.bundle.patch 必须是包内相对路径");
	else if (patchBytes === void 0) diagnostics.push(`发布内容不含 ${normalized}`);
	else if (patchBytes.byteLength > MAX_PATCH_BYTES) diagnostics.push(`${normalized} 超过 ${MAX_PATCH_BYTES} 字节限制`);
	else if (!patchValid) diagnostics.push(`${normalized} 不是有效的 Loader patch 数组`);
	const scripts = Object.keys(manifest.scripts ?? {});
	if (scripts.length > 0) diagnostics.push(`安装包声明脚本：${scripts.join("、")}`);
	return {
		id: facts.id,
		name: manifest.name ?? facts.spec,
		...manifest.version === void 0 ? {} : { version: manifest.version },
		...manifest.description === void 0 ? {} : { description: manifest.description },
		...facts.publisher === void 0 ? {} : { publisher: facts.publisher },
		sourceId: facts.sourceId,
		source: facts.source,
		spec: facts.spec,
		bundle: patch !== void 0,
		patchValid,
		scripts,
		immutable: facts.immutable,
		diagnostics
	};
}
function manifestFromTarball(bytes, facts) {
	const entries = tarEntries(bytes);
	const manifestBytes = entries.get("package/package.json") ?? entries.get("package.json");
	if (manifestBytes === void 0) throw new Error("tarball 不含 package.json");
	const parsed = parseJson(manifestBytes, "package.json");
	if (typeof parsed !== "object" || parsed === null || typeof parsed.name !== "string") throw new Error("tarball package.json 缺少包名");
	const manifest = parsed;
	const patch = manifest.dsh?.bundle?.patch;
	const normalized = patch === void 0 ? void 0 : safePatchPath(patch);
	return packageCandidate(manifest, normalized === void 0 ? void 0 : entries.get(`package/${normalized}`) ?? entries.get(normalized), facts);
}
function parseNpmSpec(spec) {
	const value = spec.startsWith("npm:") ? spec.slice(4) : spec;
	if (value.startsWith("@")) {
		const slash = value.indexOf("/");
		const at$1 = value.lastIndexOf("@");
		if (slash <= 1) throw new Error(`无效 npm 包名 ${JSON.stringify(spec)}`);
		return at$1 > slash ? {
			name: value.slice(0, at$1),
			version: value.slice(at$1 + 1)
		} : { name: value };
	}
	const at = value.lastIndexOf("@");
	return at > 0 ? {
		name: value.slice(0, at),
		version: value.slice(at + 1)
	} : { name: value };
}
function publisherOf(manifest) {
	return manifest._npmUser?.name ?? manifest.maintainers?.find((row) => row.name !== void 0)?.name;
}
async function mapLimited(items, limit, work) {
	const results = [];
	let cursor = 0;
	const worker = async () => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await work(items[index]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}
/** Marketplace discovery service. It validates package bytes but never installs or executes them. */
var PluginMarketplace = class {
	cwd;
	resolveCredential;
	fetcher;
	providers;
	/** @param options - workspace base, Host credential resolver, and replaceable fetch seam. */
	constructor(options) {
		this.cwd = options.cwd;
		this.resolveCredential = options.resolveCredential;
		this.fetcher = options.fetch ?? fetch;
		this.providers = options.providers;
	}
	/**
	* Search every enabled Provider and validate returned candidates.
	* @param query - user search text.
	* @param sources - built-in npm and user Catalog providers.
	* @param signal - cancellation signal.
	* @returns validated candidates; incompatible rows carry diagnostics and are not installable.
	*/
	async search(query, sources, signal) {
		const text = query.trim();
		if (text === "") throw new Error("插件搜索词不能为空");
		const enabled = sources.filter((source) => source.enabled);
		const rows = await Promise.all(enabled.map((source) => {
			if (source.kind === "npm") return this.searchNpm(text, source, signal);
			if (source.kind === "catalog") return this.searchCatalog(text, source, signal);
			return this.searchProvider(text, source, sources, signal);
		}));
		const deduped = /* @__PURE__ */ new Map();
		for (const candidate of rows.flat()) deduped.set(`${candidate.sourceId}:${candidate.spec}`, candidate);
		return [...deduped.values()];
	}
	/**
	* Inspect one npm, tarball, local, or Git spec without installing it.
	* @param spec - final candidate spec.
	* @param sources - configured sources used to choose the npm Registry.
	* @param signal - cancellation signal.
	* @returns compatibility and trust metadata.
	*/
	async inspect(spec, sources, signal) {
		const value = spec.trim();
		if (value === "") throw new Error("插件 spec 不能为空");
		assertCredentialFreeUrl(value, "插件 spec");
		const type = sourceType(value);
		if (type === "git") {
			const immutable = /#[0-9a-f]{7,40}$/i.test(value);
			return {
				id: `direct:${value}`,
				name: value,
				sourceId: "direct",
				source: "git",
				spec: value,
				bundle: false,
				patchValid: false,
				scripts: [],
				immutable,
				diagnostics: ["Git 来源必须安装后由原生 Manager 再验证 Bundle；安装可能执行 prepare/install 脚本", ...immutable ? [] : ["Git spec 未固定 commit，后续内容可能变化"]]
			};
		}
		if (type === "local") return this.inspectLocal(value);
		if (type === "tarball") {
			if (/^https?:/i.test(value)) return manifestFromTarball(await readBounded(await this.fetcher(value, requestInit({}, signal)), MAX_TARBALL_BYTES, "插件 tarball"), {
				id: `direct:${value}`,
				sourceId: "direct",
				source: "tarball",
				spec: value,
				immutable: false
			});
			return this.inspectLocal(value);
		}
		const npm = sources.find((source) => source.kind === "npm" && source.enabled) ?? sources.find((source) => source.kind === "npm");
		if (npm === void 0) throw new Error("没有可用 npm Registry Source");
		return this.inspectNpm(value, npm, signal);
	}
	async headers(source, target = source.url) {
		if (source.credentialRef === void 0 || source.credentialRef === "") return {};
		const sourceUrl = new URL(source.url);
		const targetUrl = new URL(target);
		if (sourceUrl.origin !== targetUrl.origin) return {};
		const value = await this.resolveCredential(source.credentialRef);
		return value === void 0 ? {} : { authorization: `Bearer ${value}` };
	}
	async searchNpm(query, source, signal) {
		const url = new URL("-/v1/search", source.url.endsWith("/") ? source.url : `${source.url}/`);
		url.searchParams.set("text", `${query} keywords:dsh`);
		url.searchParams.set("size", String(MAX_SEARCH_RESULTS));
		const body = parseJson(await readBounded(await this.fetcher(url, requestInit(await this.headers(source, url), signal)), MAX_INDEX_BYTES, `npm Source ${source.label}`), "npm 搜索响应");
		return mapLimited((typeof body === "object" && body !== null && Array.isArray(body.objects) ? body.objects : []).flatMap((row) => {
			if (typeof row !== "object" || row === null) return [];
			const pkg = row.package;
			if (typeof pkg !== "object" || pkg === null) return [];
			const name = pkg.name;
			const version = pkg.version;
			return typeof name === "string" ? [`${name}${typeof version === "string" ? `@${version}` : ""}`] : [];
		}).slice(0, MAX_SEARCH_RESULTS), 4, async (spec) => {
			try {
				return await this.inspectNpm(spec, source, signal);
			} catch (error) {
				return {
					id: `${source.id}:${spec}`,
					name: parseNpmSpec(spec).name,
					sourceId: source.id,
					source: "npm",
					spec,
					bundle: false,
					patchValid: false,
					scripts: [],
					immutable: spec.includes("@"),
					diagnostics: [`验证失败：${messageOf(error)}`]
				};
			}
		});
	}
	async inspectNpm(spec, source, signal) {
		const parsed = parseNpmSpec(spec);
		const registry = source.url.endsWith("/") ? source.url : `${source.url}/`;
		const metadataUrl = new URL(encodeURIComponent(parsed.name), registry);
		const metadata = parseJson(await readBounded(await this.fetcher(metadataUrl, requestInit(await this.headers(source, metadataUrl), signal)), MAX_INDEX_BYTES, `npm 包 ${parsed.name}`), "npm 包元数据");
		if (typeof metadata !== "object" || metadata === null) throw new Error("npm 元数据不是对象");
		const record = metadata;
		const version = parsed.version ?? record["dist-tags"]?.latest;
		if (version === void 0) throw new Error(`${parsed.name} 没有 latest 版本`);
		const manifest = record.versions?.[version];
		if (manifest === void 0) throw new Error(`${parsed.name} 不含版本 ${version}`);
		const tarball = manifest.dist?.tarball;
		if (typeof tarball !== "string") throw new Error(`${parsed.name}@${version} 缺少 dist.tarball`);
		const tarballUrl = new URL(tarball);
		if (!["http:", "https:"].includes(tarballUrl.protocol)) throw new Error("npm dist.tarball 必须使用 HTTP(S)");
		const tarResponse = await this.fetcher(tarballUrl, requestInit(await this.headers(source, tarballUrl), signal));
		const exactSpec = `${parsed.name}@${version}`;
		const publisher = publisherOf(manifest);
		const candidate = manifestFromTarball(await readBounded(tarResponse, MAX_TARBALL_BYTES, `${exactSpec} tarball`), {
			id: `${source.id}:${exactSpec}`,
			sourceId: source.id,
			source: "npm",
			spec: exactSpec,
			...publisher === void 0 ? {} : { publisher },
			immutable: true
		});
		if (candidate.name !== parsed.name || candidate.version !== version) throw new Error(`${exactSpec} tarball 的 package.json 名称或版本与 Registry 元数据不一致`);
		return {
			...candidate,
			...candidate.description === void 0 && manifest.description !== void 0 ? { description: manifest.description } : {}
		};
	}
	inspectLocal(spec) {
		const fileUrl = spec.startsWith("file://");
		const prefix = /^(?:file:|link:)/.exec(spec)?.[0] ?? "";
		const raw = prefix === "" ? spec : spec.slice(prefix.length);
		const path = fileUrl ? fileURLToPath(spec) : resolve(this.cwd, raw);
		if (!existsSync(path)) throw new Error(`本地插件不存在：${path}`);
		const stat = statSync(path);
		if (stat.isFile()) {
			const finalSpec$1 = fileUrl ? spec : prefix === "" ? path : `${prefix}${path}`;
			return manifestFromTarball(readLocalBounded(path, MAX_TARBALL_BYTES, "本地插件 tarball"), {
				id: `local:${path}`,
				sourceId: "local",
				source: "tarball",
				spec: finalSpec$1,
				immutable: false
			});
		}
		if (!stat.isDirectory()) throw new Error(`本地插件不是目录或 tarball：${path}`);
		const root = realpathSync(path);
		const manifestPath = join(root, "package.json");
		const manifest = JSON.parse(new TextDecoder().decode(readLocalBounded(manifestPath, MAX_MANIFEST_BYTES, "本地插件 package.json")));
		const patch = manifest.dsh?.bundle?.patch;
		const normalized = patch === void 0 ? void 0 : safePatchPath(patch);
		let patchBytes;
		if (normalized !== void 0) {
			const target = resolve(root, normalized);
			if (existsSync(target)) {
				const realTarget = realpathSync(target);
				const within = relative(root, realTarget);
				if (within !== ".." && !within.startsWith(`..${sep}`) && !isAbsolute(within)) patchBytes = readLocalBounded(realTarget, MAX_PATCH_BYTES, "本地 Bundle patch");
			}
		}
		const finalSpec = fileUrl ? spec : prefix === "" ? path : `${prefix}${path}`;
		return packageCandidate(manifest, patchBytes, {
			id: `local:${path}`,
			sourceId: "local",
			source: "local",
			spec: finalSpec,
			immutable: false
		});
	}
	async searchCatalog(query, source, signal) {
		const localPath = source.url.startsWith("file:") ? fileURLToPath(source.url) : resolve(this.cwd, source.url);
		const body = parseJson(/^https?:/i.test(source.url) ? await readBounded(await this.fetcher(source.url, requestInit(await this.headers(source, source.url), signal)), MAX_INDEX_BYTES, `Catalog ${source.label}`) : readLocalBounded(localPath, MAX_INDEX_BYTES, `Catalog ${source.label}`), `Catalog ${source.label}`);
		const entries = Array.isArray(body) ? body : typeof body === "object" && body !== null && Array.isArray(body.plugins) ? body.plugins : [];
		const lowered = query.toLocaleLowerCase();
		return mapLimited(entries.flatMap((entry) => {
			if (typeof entry !== "object" || entry === null) return [];
			const candidate = entry;
			if (typeof candidate.spec !== "string" && typeof candidate.name !== "string") return [];
			if (!`${candidate.name ?? ""} ${candidate.spec ?? ""} ${candidate.description ?? ""}`.toLocaleLowerCase().includes(lowered)) return [];
			return [{
				name: candidate.name ?? candidate.spec,
				spec: candidate.spec ?? candidate.name,
				...candidate.description === void 0 ? {} : { description: candidate.description },
				...candidate.publisher === void 0 ? {} : { publisher: candidate.publisher }
			}];
		}).slice(0, MAX_SEARCH_RESULTS), 4, async (entry) => {
			const spec = entry.spec;
			try {
				const candidate = await this.inspect(spec, [source, {
					id: "npm",
					kind: "npm",
					label: "npm Registry",
					url: "https://registry.npmjs.org/",
					enabled: true,
					builtIn: true
				}], signal);
				return {
					...candidate,
					id: `${source.id}:${candidate.spec}`,
					sourceId: source.id,
					...candidate.description === void 0 && entry.description !== void 0 ? { description: entry.description } : {},
					...candidate.publisher === void 0 && entry.publisher !== void 0 ? { publisher: entry.publisher } : {}
				};
			} catch (error) {
				return {
					id: `${source.id}:${spec}`,
					name: entry.name,
					...entry.description === void 0 ? {} : { description: entry.description },
					...entry.publisher === void 0 ? {} : { publisher: entry.publisher },
					sourceId: source.id,
					source: sourceType(spec),
					spec,
					bundle: false,
					patchValid: false,
					scripts: [],
					immutable: false,
					diagnostics: [`验证失败：${messageOf(error)}`]
				};
			}
		});
	}
	async searchProvider(query, source, sources, signal) {
		if (this.providers === void 0) throw new Error(`Source Provider ${JSON.stringify(source.kind)} 未装配`);
		return mapLimited(await this.providers.search(query, source, signal), 4, async (entry) => {
			try {
				const candidate = await this.inspect(entry.spec, sources, signal);
				return {
					...candidate,
					id: `${source.id}:${candidate.spec}`,
					sourceId: source.id,
					...entry.name === void 0 ? {} : { name: entry.name },
					...candidate.description === void 0 && entry.description !== void 0 ? { description: entry.description } : {},
					...candidate.publisher === void 0 && entry.publisher !== void 0 ? { publisher: entry.publisher } : {}
				};
			} catch (error) {
				return {
					id: `${source.id}:${entry.spec}`,
					name: entry.name ?? entry.spec,
					...entry.description === void 0 ? {} : { description: entry.description },
					...entry.publisher === void 0 ? {} : { publisher: entry.publisher },
					sourceId: source.id,
					source: sourceType(entry.spec),
					spec: entry.spec,
					bundle: false,
					patchValid: false,
					scripts: [],
					immutable: false,
					diagnostics: [`Provider 候选验证失败：${messageOf(error)}`]
				};
			}
		});
	}
};

//#endregion
export { assertCredentialFreeUrl as n, PluginMarketplace as t };