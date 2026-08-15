import { n as assertCredentialFreeUrl, t as PluginMarketplace } from "./plugin-marketplace-7IgFXB0u.js";
import { t as TUI_STARTUP_SERVICE } from "./startup-D6OtNOWF.js";
import { createRequire } from "node:module";
import { InProcessApiClient, toFetchHandler } from "@deepseek-ai/dsh-host-apiproxy";
import { spawn } from "child_process";
import { readdirSync, statSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import * as fs from "node:fs";
import * as os from "node:os";
import { homedir as homedir$1 } from "node:os";
import * as path from "node:path";
import { basename as basename$1, dirname as dirname$1, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { EventEmitter } from "events";
import { Context, Service } from "@deepseek-ai/cordis";
import commandsRemote from "@deepseek-ai/dsh-commands/remote";
import goalsRemote from "@deepseek-ai/dsh-goal/remote";
import dynamicRemote from "@deepseek-ai/dsh-cordis-host-runner/remote";
import pluginInventoryRemote from "@deepseek-ai/dsh-host-plugin-inventory/remote";
import messageFeedbackRemote from "@deepseek-ai/dsh-message-feedback/remote";
import { isTokenDelta } from "@deepseek-ai/dsh-llm/message";
import "@deepseek-ai/dsh-llm/brand";
import { isAppendSurfaceEvent, isReplacementSurfaceEvent } from "@deepseek-ai/dsh-session/surface";
import { SESSION_SEARCH_RESULT_LIMIT, transportError } from "@deepseek-ai/dsh-host-apiproxy/api";
import "@deepseek-ai/dsh-host-apiproxy/client";
import "@deepseek-ai/dsh-host-apiproxy/api/events.schema";
import "@deepseek-ai/dsh-host-apiproxy/api/rpc.schema";
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { produce } from "immer";
import { z } from "zod";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPath, hasPath, rehydrateSchema } from "@deepseek-ai/dsh-client-schema-form";
import z$1 from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { SettingsConflictError, settingsNamespace } from "@deepseek-ai/dsh-settings";

//#region rolldown:runtime
var __defProp = Object.defineProperty;
var __export = (all) => {
	let target = {};
	for (var name$1 in all) __defProp(target, name$1, {
		get: all[name$1],
		enumerable: true
	});
	return target;
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/fuzzy.js
/**
* Fuzzy matching utilities.
* Matches if all query characters appear in order (not necessarily consecutive).
* Lower score = better match.
*/
function fuzzyMatch(query, text) {
	const queryLower = query.toLowerCase();
	const textLower = text.toLowerCase();
	const matchQuery = (normalizedQuery) => {
		if (normalizedQuery.length === 0) return {
			matches: true,
			score: 0
		};
		if (normalizedQuery.length > textLower.length) return {
			matches: false,
			score: 0
		};
		let queryIndex = 0;
		let score = 0;
		let lastMatchIndex = -1;
		let consecutiveMatches = 0;
		for (let i = 0; i < textLower.length && queryIndex < normalizedQuery.length; i++) if (textLower[i] === normalizedQuery[queryIndex]) {
			const isWordBoundary = i === 0 || /[\s\-_./:]/.test(textLower[i - 1]);
			if (lastMatchIndex === i - 1) {
				consecutiveMatches++;
				score -= consecutiveMatches * 5;
			} else {
				consecutiveMatches = 0;
				if (lastMatchIndex >= 0) score += (i - lastMatchIndex - 1) * 2;
			}
			if (isWordBoundary) score -= 10;
			score += i * .1;
			lastMatchIndex = i;
			queryIndex++;
		}
		if (queryIndex < normalizedQuery.length) return {
			matches: false,
			score: 0
		};
		if (normalizedQuery === textLower) score -= 100;
		return {
			matches: true,
			score
		};
	};
	const primaryMatch = matchQuery(queryLower);
	if (primaryMatch.matches) return primaryMatch;
	const alphaNumericMatch = queryLower.match(/^(?<letters>[a-z]+)(?<digits>[0-9]+)$/);
	const numericAlphaMatch = queryLower.match(/^(?<digits>[0-9]+)(?<letters>[a-z]+)$/);
	const swappedQuery = alphaNumericMatch ? `${alphaNumericMatch.groups?.digits ?? ""}${alphaNumericMatch.groups?.letters ?? ""}` : numericAlphaMatch ? `${numericAlphaMatch.groups?.letters ?? ""}${numericAlphaMatch.groups?.digits ?? ""}` : "";
	if (!swappedQuery) return primaryMatch;
	const swappedMatch = matchQuery(swappedQuery);
	if (!swappedMatch.matches) return primaryMatch;
	return {
		matches: true,
		score: swappedMatch.score + 5
	};
}
/**
* Filter and sort items by fuzzy match quality (best matches first).
* Supports space-separated tokens: all tokens must match.
*/
function fuzzyFilter(items, query, getText) {
	if (!query.trim()) return items;
	const tokens = query.trim().split(/\s+/).filter((t) => t.length > 0);
	if (tokens.length === 0) return items;
	const results = [];
	for (const item of items) {
		const text = getText(item);
		let totalScore = 0;
		let allMatch = true;
		for (const token of tokens) {
			const match = fuzzyMatch(token, text);
			if (match.matches) totalScore += match.score;
			else {
				allMatch = false;
				break;
			}
		}
		if (allMatch) results.push({
			item,
			totalScore
		});
	}
	results.sort((a, b) => a.totalScore - b.totalScore);
	return results.map((r) => r.item);
}

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/autocomplete.js
const PATH_DELIMITERS = new Set([
	" ",
	"	",
	"\"",
	"'",
	"="
]);
function toDisplayPath(value) {
	return value.replace(/\\/g, "/");
}
function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildFdPathQuery(query) {
	const normalized = toDisplayPath(query);
	if (!normalized.includes("/")) return normalized;
	const hasTrailingSeparator = normalized.endsWith("/");
	const trimmed = normalized.replace(/^\/+|\/+$/g, "");
	if (!trimmed) return normalized;
	const separatorPattern = "[\\\\/]";
	const segments = trimmed.split("/").filter(Boolean).map((segment) => escapeRegex(segment));
	if (segments.length === 0) return normalized;
	let pattern = segments.join(separatorPattern);
	if (hasTrailingSeparator) pattern += separatorPattern;
	return pattern;
}
function findLastDelimiter(text) {
	for (let i = text.length - 1; i >= 0; i -= 1) if (PATH_DELIMITERS.has(text[i] ?? "")) return i;
	return -1;
}
function findUnclosedQuoteStart(text) {
	let inQuotes = false;
	let quoteStart = -1;
	for (let i = 0; i < text.length; i += 1) if (text[i] === "\"") {
		inQuotes = !inQuotes;
		if (inQuotes) quoteStart = i;
	}
	return inQuotes ? quoteStart : null;
}
function isTokenStart(text, index) {
	return index === 0 || PATH_DELIMITERS.has(text[index - 1] ?? "");
}
function extractQuotedPrefix(text) {
	const quoteStart = findUnclosedQuoteStart(text);
	if (quoteStart === null) return null;
	if (quoteStart > 0 && text[quoteStart - 1] === "@") {
		if (!isTokenStart(text, quoteStart - 1)) return null;
		return text.slice(quoteStart - 1);
	}
	if (!isTokenStart(text, quoteStart)) return null;
	return text.slice(quoteStart);
}
function parsePathPrefix(prefix) {
	if (prefix.startsWith("@\"")) return {
		rawPrefix: prefix.slice(2),
		isAtPrefix: true,
		isQuotedPrefix: true
	};
	if (prefix.startsWith("\"")) return {
		rawPrefix: prefix.slice(1),
		isAtPrefix: false,
		isQuotedPrefix: true
	};
	if (prefix.startsWith("@")) return {
		rawPrefix: prefix.slice(1),
		isAtPrefix: true,
		isQuotedPrefix: false
	};
	return {
		rawPrefix: prefix,
		isAtPrefix: false,
		isQuotedPrefix: false
	};
}
function buildCompletionValue(path$1, options$1) {
	const needsQuotes = options$1.isQuotedPrefix || path$1.includes(" ");
	const prefix = options$1.isAtPrefix ? "@" : "";
	if (!needsQuotes) return `${prefix}${path$1}`;
	return `${`${prefix}"`}${path$1}"`;
}
async function walkDirectoryWithFd(baseDir, fdPath, query, maxResults, signal) {
	const args = [
		"--base-directory",
		baseDir,
		"--max-results",
		String(maxResults),
		"--type",
		"f",
		"--type",
		"d",
		"--follow",
		"--hidden",
		"--exclude",
		".git",
		"--exclude",
		".git/*",
		"--exclude",
		".git/**"
	];
	if (toDisplayPath(query).includes("/")) args.push("--full-path");
	if (query) args.push(buildFdPathQuery(query));
	return await new Promise((resolve$1) => {
		if (signal.aborted) {
			resolve$1([]);
			return;
		}
		const child = spawn(fdPath, args, { stdio: [
			"ignore",
			"pipe",
			"pipe"
		] });
		let stdout = "";
		let resolved = false;
		const finish = (results) => {
			if (resolved) return;
			resolved = true;
			signal.removeEventListener("abort", onAbort);
			resolve$1(results);
		};
		const onAbort = () => {
			if (child.exitCode === null) child.kill("SIGKILL");
		};
		signal.addEventListener("abort", onAbort, { once: true });
		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.on("error", () => {
			finish([]);
		});
		child.on("close", (code) => {
			if (signal.aborted || code !== 0 || !stdout) {
				finish([]);
				return;
			}
			const lines = stdout.trim().split("\n").filter(Boolean);
			const results = [];
			for (const line of lines) {
				const displayLine = toDisplayPath(line);
				const hasTrailingSeparator = displayLine.endsWith("/");
				const normalizedPath = hasTrailingSeparator ? displayLine.slice(0, -1) : displayLine;
				if (normalizedPath === ".git" || normalizedPath.startsWith(".git/") || normalizedPath.includes("/.git/")) continue;
				results.push({
					path: displayLine,
					isDirectory: hasTrailingSeparator
				});
			}
			finish(results);
		});
	});
}
var CombinedAutocompleteProvider = class {
	commands;
	basePath;
	fdPath;
	constructor(commands = [], basePath, fdPath = null) {
		this.commands = commands;
		this.basePath = basePath;
		this.fdPath = fdPath;
	}
	async getSuggestions(lines, cursorLine, cursorCol, options$1) {
		const textBeforeCursor = (lines[cursorLine] || "").slice(0, cursorCol);
		const atPrefix = this.extractAtPrefix(textBeforeCursor);
		if (atPrefix) {
			const { rawPrefix, isQuotedPrefix } = parsePathPrefix(atPrefix);
			const suggestions$1 = await this.getFuzzyFileSuggestions(rawPrefix, {
				isQuotedPrefix,
				signal: options$1.signal
			});
			if (suggestions$1.length === 0) return null;
			return {
				items: suggestions$1,
				prefix: atPrefix
			};
		}
		if (!options$1.force && textBeforeCursor.startsWith("/")) {
			const spaceIndex = textBeforeCursor.indexOf(" ");
			if (spaceIndex === -1) {
				const prefix = textBeforeCursor.slice(1);
				const filtered = fuzzyFilter(this.commands.map((cmd) => {
					const name$1 = "name" in cmd ? cmd.name : cmd.value;
					const hint = "argumentHint" in cmd && cmd.argumentHint ? cmd.argumentHint : void 0;
					const desc = cmd.description ?? "";
					return {
						name: name$1,
						label: name$1,
						description: (hint ? desc ? `${hint} — ${desc}` : hint : desc) || void 0
					};
				}), prefix, (item) => item.name).map((item) => ({
					value: item.name,
					label: item.label,
					...item.description && { description: item.description }
				}));
				if (filtered.length === 0) return null;
				return {
					items: filtered,
					prefix: textBeforeCursor
				};
			}
			const commandName = textBeforeCursor.slice(1, spaceIndex);
			const argumentText = textBeforeCursor.slice(spaceIndex + 1);
			const command = this.commands.find((cmd) => {
				return ("name" in cmd ? cmd.name : cmd.value) === commandName;
			});
			if (!command || !("getArgumentCompletions" in command) || !command.getArgumentCompletions) return null;
			const argumentSuggestions = await command.getArgumentCompletions(argumentText);
			if (!Array.isArray(argumentSuggestions) || argumentSuggestions.length === 0) return null;
			return {
				items: argumentSuggestions,
				prefix: argumentText
			};
		}
		const pathMatch = this.extractPathPrefix(textBeforeCursor, options$1.force ?? false);
		if (pathMatch === null) return null;
		const suggestions = this.getFileSuggestions(pathMatch);
		if (suggestions.length === 0) return null;
		return {
			items: suggestions,
			prefix: pathMatch
		};
	}
	applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
		const currentLine = lines[cursorLine] || "";
		const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
		const afterCursor = currentLine.slice(cursorCol);
		const isQuotedPrefix = prefix.startsWith("\"") || prefix.startsWith("@\"");
		const hasLeadingQuoteAfterCursor = afterCursor.startsWith("\"");
		const hasTrailingQuoteInItem = item.value.endsWith("\"");
		const adjustedAfterCursor = isQuotedPrefix && hasTrailingQuoteInItem && hasLeadingQuoteAfterCursor ? afterCursor.slice(1) : afterCursor;
		if (prefix.startsWith("/") && beforePrefix.trim() === "" && !prefix.slice(1).includes("/")) {
			const newLine$1 = `${beforePrefix}/${item.value} ${adjustedAfterCursor}`;
			const newLines$1 = [...lines];
			newLines$1[cursorLine] = newLine$1;
			return {
				lines: newLines$1,
				cursorLine,
				cursorCol: beforePrefix.length + item.value.length + 2
			};
		}
		if (prefix.startsWith("@")) {
			const isDirectory$1 = item.label.endsWith("/");
			const suffix = isDirectory$1 ? "" : " ";
			const newLine$1 = `${beforePrefix + item.value}${suffix}${adjustedAfterCursor}`;
			const newLines$1 = [...lines];
			newLines$1[cursorLine] = newLine$1;
			const hasTrailingQuote$1 = item.value.endsWith("\"");
			const cursorOffset$1 = isDirectory$1 && hasTrailingQuote$1 ? item.value.length - 1 : item.value.length;
			return {
				lines: newLines$1,
				cursorLine,
				cursorCol: beforePrefix.length + cursorOffset$1 + suffix.length
			};
		}
		const textBeforeCursor = currentLine.slice(0, cursorCol);
		if (textBeforeCursor.includes("/") && textBeforeCursor.includes(" ")) {
			const newLine$1 = beforePrefix + item.value + adjustedAfterCursor;
			const newLines$1 = [...lines];
			newLines$1[cursorLine] = newLine$1;
			const isDirectory$1 = item.label.endsWith("/");
			const hasTrailingQuote$1 = item.value.endsWith("\"");
			const cursorOffset$1 = isDirectory$1 && hasTrailingQuote$1 ? item.value.length - 1 : item.value.length;
			return {
				lines: newLines$1,
				cursorLine,
				cursorCol: beforePrefix.length + cursorOffset$1
			};
		}
		const newLine = beforePrefix + item.value + adjustedAfterCursor;
		const newLines = [...lines];
		newLines[cursorLine] = newLine;
		const isDirectory = item.label.endsWith("/");
		const hasTrailingQuote = item.value.endsWith("\"");
		const cursorOffset = isDirectory && hasTrailingQuote ? item.value.length - 1 : item.value.length;
		return {
			lines: newLines,
			cursorLine,
			cursorCol: beforePrefix.length + cursorOffset
		};
	}
	extractAtPrefix(text) {
		const quotedPrefix = extractQuotedPrefix(text);
		if (quotedPrefix?.startsWith("@\"")) return quotedPrefix;
		const lastDelimiterIndex = findLastDelimiter(text);
		const tokenStart = lastDelimiterIndex === -1 ? 0 : lastDelimiterIndex + 1;
		if (text[tokenStart] === "@") return text.slice(tokenStart);
		return null;
	}
	extractPathPrefix(text, forceExtract = false) {
		const quotedPrefix = extractQuotedPrefix(text);
		if (quotedPrefix) return quotedPrefix;
		const lastDelimiterIndex = findLastDelimiter(text);
		const pathPrefix = lastDelimiterIndex === -1 ? text : text.slice(lastDelimiterIndex + 1);
		if (forceExtract) return pathPrefix;
		if (pathPrefix.includes("/") || pathPrefix.startsWith(".") || pathPrefix.startsWith("~/")) return pathPrefix;
		if (pathPrefix === "" && text.endsWith(" ")) return pathPrefix;
		return null;
	}
	expandHomePath(path$1) {
		if (path$1.startsWith("~/")) {
			const expandedPath = join(homedir(), path$1.slice(2));
			return path$1.endsWith("/") && !expandedPath.endsWith("/") ? `${expandedPath}/` : expandedPath;
		} else if (path$1 === "~") return homedir();
		return path$1;
	}
	resolveScopedFuzzyQuery(rawQuery) {
		const normalizedQuery = toDisplayPath(rawQuery);
		const slashIndex = normalizedQuery.lastIndexOf("/");
		if (slashIndex === -1) return null;
		const displayBase = normalizedQuery.slice(0, slashIndex + 1);
		const query = normalizedQuery.slice(slashIndex + 1);
		let baseDir;
		if (displayBase.startsWith("~/")) baseDir = this.expandHomePath(displayBase);
		else if (displayBase.startsWith("/")) baseDir = displayBase;
		else baseDir = join(this.basePath, displayBase);
		try {
			if (!statSync(baseDir).isDirectory()) return null;
		} catch {
			return null;
		}
		return {
			baseDir,
			query,
			displayBase
		};
	}
	scopedPathForDisplay(displayBase, relativePath) {
		const normalizedRelativePath = toDisplayPath(relativePath);
		if (displayBase === "/") return `/${normalizedRelativePath}`;
		return `${toDisplayPath(displayBase)}${normalizedRelativePath}`;
	}
	getFileSuggestions(prefix) {
		try {
			let searchDir;
			let searchPrefix;
			const { rawPrefix, isAtPrefix, isQuotedPrefix } = parsePathPrefix(prefix);
			let expandedPrefix = rawPrefix;
			if (expandedPrefix.startsWith("~")) expandedPrefix = this.expandHomePath(expandedPrefix);
			if (rawPrefix === "" || rawPrefix === "./" || rawPrefix === "../" || rawPrefix === "~" || rawPrefix === "~/" || rawPrefix === "/" || isAtPrefix && rawPrefix === "") {
				if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) searchDir = expandedPrefix;
				else searchDir = join(this.basePath, expandedPrefix);
				searchPrefix = "";
			} else if (rawPrefix.endsWith("/")) {
				if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) searchDir = expandedPrefix;
				else searchDir = join(this.basePath, expandedPrefix);
				searchPrefix = "";
			} else {
				const dir = dirname(expandedPrefix);
				const file = basename(expandedPrefix);
				if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) searchDir = dir;
				else searchDir = join(this.basePath, dir);
				searchPrefix = file;
			}
			const entries = readdirSync(searchDir, { withFileTypes: true });
			const suggestions = [];
			for (const entry of entries) {
				if (!entry.name.toLowerCase().startsWith(searchPrefix.toLowerCase())) continue;
				let isDirectory = entry.isDirectory();
				if (!isDirectory && entry.isSymbolicLink()) try {
					isDirectory = statSync(join(searchDir, entry.name)).isDirectory();
				} catch {}
				let relativePath;
				const name$1 = entry.name;
				const displayPrefix = rawPrefix;
				if (displayPrefix.endsWith("/")) relativePath = displayPrefix + name$1;
				else if (displayPrefix.includes("/") || displayPrefix.includes("\\")) if (displayPrefix.startsWith("~/")) {
					const dir = dirname(displayPrefix.slice(2));
					relativePath = `~/${dir === "." ? name$1 : join(dir, name$1)}`;
				} else if (displayPrefix.startsWith("/")) {
					const dir = dirname(displayPrefix);
					if (dir === "/") relativePath = `/${name$1}`;
					else relativePath = `${dir}/${name$1}`;
				} else {
					relativePath = join(dirname(displayPrefix), name$1);
					if (displayPrefix.startsWith("./") && !relativePath.startsWith("./")) relativePath = `./${relativePath}`;
				}
				else if (displayPrefix.startsWith("~")) relativePath = `~/${name$1}`;
				else relativePath = name$1;
				relativePath = toDisplayPath(relativePath);
				const value = buildCompletionValue(isDirectory ? `${relativePath}/` : relativePath, {
					isDirectory,
					isAtPrefix,
					isQuotedPrefix
				});
				suggestions.push({
					value,
					label: name$1 + (isDirectory ? "/" : "")
				});
			}
			suggestions.sort((a, b) => {
				const aIsDir = a.value.endsWith("/");
				const bIsDir = b.value.endsWith("/");
				if (aIsDir && !bIsDir) return -1;
				if (!aIsDir && bIsDir) return 1;
				return a.label.localeCompare(b.label);
			});
			return suggestions;
		} catch (_e) {
			return [];
		}
	}
	scoreEntry(filePath, query, isDirectory) {
		const lowerFileName = basename(filePath).toLowerCase();
		const lowerQuery = query.toLowerCase();
		let score = 0;
		if (lowerFileName === lowerQuery) score = 100;
		else if (lowerFileName.startsWith(lowerQuery)) score = 80;
		else if (lowerFileName.includes(lowerQuery)) score = 50;
		else if (filePath.toLowerCase().includes(lowerQuery)) score = 30;
		if (isDirectory && score > 0) score += 10;
		return score;
	}
	async getFuzzyFileSuggestions(query, options$1) {
		if (!this.fdPath || options$1.signal.aborted) return [];
		try {
			const scopedQuery = this.resolveScopedFuzzyQuery(query);
			const fdBaseDir = scopedQuery?.baseDir ?? this.basePath;
			const fdQuery = scopedQuery?.query ?? query;
			const entries = await walkDirectoryWithFd(fdBaseDir, this.fdPath, fdQuery, 100, options$1.signal);
			if (options$1.signal.aborted) return [];
			const scoredEntries = entries.map((entry) => ({
				...entry,
				score: fdQuery ? this.scoreEntry(entry.path, fdQuery, entry.isDirectory) : 1
			})).filter((entry) => entry.score > 0);
			scoredEntries.sort((a, b) => b.score - a.score);
			const topEntries = scoredEntries.slice(0, 20);
			const suggestions = [];
			for (const { path: entryPath, isDirectory } of topEntries) {
				const pathWithoutSlash = isDirectory ? entryPath.slice(0, -1) : entryPath;
				const displayPath = scopedQuery ? this.scopedPathForDisplay(scopedQuery.displayBase, pathWithoutSlash) : pathWithoutSlash;
				const entryName = basename(pathWithoutSlash);
				const value = buildCompletionValue(isDirectory ? `${displayPath}/` : displayPath, {
					isDirectory,
					isAtPrefix: true,
					isQuotedPrefix: options$1.isQuotedPrefix
				});
				suggestions.push({
					value,
					label: entryName + (isDirectory ? "/" : ""),
					description: displayPath
				});
			}
			return suggestions;
		} catch {
			return [];
		}
	}
	shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
		const textBeforeCursor = (lines[cursorLine] || "").slice(0, cursorCol);
		if (textBeforeCursor.trim().startsWith("/") && !textBeforeCursor.trim().includes(" ")) return false;
		return true;
	}
};

//#endregion
//#region node_modules/.pnpm/get-east-asian-width@1.6.0/node_modules/get-east-asian-width/lookup-data.js
const ambiguousMinimalCodePoint = 161;
const ambiguousMaximumCodePoint = 1114109;
const ambiguousRanges = [
	161,
	161,
	164,
	164,
	167,
	168,
	170,
	170,
	173,
	174,
	176,
	180,
	182,
	186,
	188,
	191,
	198,
	198,
	208,
	208,
	215,
	216,
	222,
	225,
	230,
	230,
	232,
	234,
	236,
	237,
	240,
	240,
	242,
	243,
	247,
	250,
	252,
	252,
	254,
	254,
	257,
	257,
	273,
	273,
	275,
	275,
	283,
	283,
	294,
	295,
	299,
	299,
	305,
	307,
	312,
	312,
	319,
	322,
	324,
	324,
	328,
	331,
	333,
	333,
	338,
	339,
	358,
	359,
	363,
	363,
	462,
	462,
	464,
	464,
	466,
	466,
	468,
	468,
	470,
	470,
	472,
	472,
	474,
	474,
	476,
	476,
	593,
	593,
	609,
	609,
	708,
	708,
	711,
	711,
	713,
	715,
	717,
	717,
	720,
	720,
	728,
	731,
	733,
	733,
	735,
	735,
	768,
	879,
	913,
	929,
	931,
	937,
	945,
	961,
	963,
	969,
	1025,
	1025,
	1040,
	1103,
	1105,
	1105,
	8208,
	8208,
	8211,
	8214,
	8216,
	8217,
	8220,
	8221,
	8224,
	8226,
	8228,
	8231,
	8240,
	8240,
	8242,
	8243,
	8245,
	8245,
	8251,
	8251,
	8254,
	8254,
	8308,
	8308,
	8319,
	8319,
	8321,
	8324,
	8364,
	8364,
	8451,
	8451,
	8453,
	8453,
	8457,
	8457,
	8467,
	8467,
	8470,
	8470,
	8481,
	8482,
	8486,
	8486,
	8491,
	8491,
	8531,
	8532,
	8539,
	8542,
	8544,
	8555,
	8560,
	8569,
	8585,
	8585,
	8592,
	8601,
	8632,
	8633,
	8658,
	8658,
	8660,
	8660,
	8679,
	8679,
	8704,
	8704,
	8706,
	8707,
	8711,
	8712,
	8715,
	8715,
	8719,
	8719,
	8721,
	8721,
	8725,
	8725,
	8730,
	8730,
	8733,
	8736,
	8739,
	8739,
	8741,
	8741,
	8743,
	8748,
	8750,
	8750,
	8756,
	8759,
	8764,
	8765,
	8776,
	8776,
	8780,
	8780,
	8786,
	8786,
	8800,
	8801,
	8804,
	8807,
	8810,
	8811,
	8814,
	8815,
	8834,
	8835,
	8838,
	8839,
	8853,
	8853,
	8857,
	8857,
	8869,
	8869,
	8895,
	8895,
	8978,
	8978,
	9312,
	9449,
	9451,
	9547,
	9552,
	9587,
	9600,
	9615,
	9618,
	9621,
	9632,
	9633,
	9635,
	9641,
	9650,
	9651,
	9654,
	9655,
	9660,
	9661,
	9664,
	9665,
	9670,
	9672,
	9675,
	9675,
	9678,
	9681,
	9698,
	9701,
	9711,
	9711,
	9733,
	9734,
	9737,
	9737,
	9742,
	9743,
	9756,
	9756,
	9758,
	9758,
	9792,
	9792,
	9794,
	9794,
	9824,
	9825,
	9827,
	9829,
	9831,
	9834,
	9836,
	9837,
	9839,
	9839,
	9886,
	9887,
	9919,
	9919,
	9926,
	9933,
	9935,
	9939,
	9941,
	9953,
	9955,
	9955,
	9960,
	9961,
	9963,
	9969,
	9972,
	9972,
	9974,
	9977,
	9979,
	9980,
	9982,
	9983,
	10045,
	10045,
	10102,
	10111,
	11094,
	11097,
	12872,
	12879,
	57344,
	63743,
	65024,
	65039,
	65533,
	65533,
	127232,
	127242,
	127248,
	127277,
	127280,
	127337,
	127344,
	127373,
	127375,
	127376,
	127387,
	127404,
	917760,
	917999,
	983040,
	1048573,
	1048576,
	1114109
];
const fullwidthMinimalCodePoint = 12288;
const fullwidthMaximumCodePoint = 65510;
const fullwidthRanges = [
	12288,
	12288,
	65281,
	65376,
	65504,
	65510
];
const wideMinimalCodePoint = 4352;
const wideMaximumCodePoint = 262141;
const wideRanges = [
	4352,
	4447,
	8986,
	8987,
	9001,
	9002,
	9193,
	9196,
	9200,
	9200,
	9203,
	9203,
	9725,
	9726,
	9748,
	9749,
	9776,
	9783,
	9800,
	9811,
	9855,
	9855,
	9866,
	9871,
	9875,
	9875,
	9889,
	9889,
	9898,
	9899,
	9917,
	9918,
	9924,
	9925,
	9934,
	9934,
	9940,
	9940,
	9962,
	9962,
	9970,
	9971,
	9973,
	9973,
	9978,
	9978,
	9981,
	9981,
	9989,
	9989,
	9994,
	9995,
	10024,
	10024,
	10060,
	10060,
	10062,
	10062,
	10067,
	10069,
	10071,
	10071,
	10133,
	10135,
	10160,
	10160,
	10175,
	10175,
	11035,
	11036,
	11088,
	11088,
	11093,
	11093,
	11904,
	11929,
	11931,
	12019,
	12032,
	12245,
	12272,
	12287,
	12289,
	12350,
	12353,
	12438,
	12441,
	12543,
	12549,
	12591,
	12593,
	12686,
	12688,
	12773,
	12783,
	12830,
	12832,
	12871,
	12880,
	42124,
	42128,
	42182,
	43360,
	43388,
	44032,
	55203,
	63744,
	64255,
	65040,
	65049,
	65072,
	65106,
	65108,
	65126,
	65128,
	65131,
	94176,
	94180,
	94192,
	94198,
	94208,
	101589,
	101631,
	101662,
	101760,
	101874,
	110576,
	110579,
	110581,
	110587,
	110589,
	110590,
	110592,
	110882,
	110898,
	110898,
	110928,
	110930,
	110933,
	110933,
	110948,
	110951,
	110960,
	111355,
	119552,
	119638,
	119648,
	119670,
	126980,
	126980,
	127183,
	127183,
	127374,
	127374,
	127377,
	127386,
	127488,
	127490,
	127504,
	127547,
	127552,
	127560,
	127568,
	127569,
	127584,
	127589,
	127744,
	127776,
	127789,
	127797,
	127799,
	127868,
	127870,
	127891,
	127904,
	127946,
	127951,
	127955,
	127968,
	127984,
	127988,
	127988,
	127992,
	128062,
	128064,
	128064,
	128066,
	128252,
	128255,
	128317,
	128331,
	128334,
	128336,
	128359,
	128378,
	128378,
	128405,
	128406,
	128420,
	128420,
	128507,
	128591,
	128640,
	128709,
	128716,
	128716,
	128720,
	128722,
	128725,
	128728,
	128732,
	128735,
	128747,
	128748,
	128756,
	128764,
	128992,
	129003,
	129008,
	129008,
	129292,
	129338,
	129340,
	129349,
	129351,
	129535,
	129648,
	129660,
	129664,
	129674,
	129678,
	129734,
	129736,
	129736,
	129741,
	129756,
	129759,
	129770,
	129775,
	129784,
	131072,
	196605,
	196608,
	262141
];

//#endregion
//#region node_modules/.pnpm/get-east-asian-width@1.6.0/node_modules/get-east-asian-width/utilities.js
/**
Binary search on a sorted flat array of [start, end] pairs.

@param {number[]} ranges - Flat array of inclusive [start, end] range pairs, e.g. [0, 5, 10, 20].
@param {number} codePoint - The value to search for.
@returns {boolean} Whether the value falls within any of the ranges.
*/
const isInRange = (ranges, codePoint) => {
	let low = 0;
	let high = Math.floor(ranges.length / 2) - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const i = mid * 2;
		if (codePoint < ranges[i]) high = mid - 1;
		else if (codePoint > ranges[i + 1]) low = mid + 1;
		else return true;
	}
	return false;
};

//#endregion
//#region node_modules/.pnpm/get-east-asian-width@1.6.0/node_modules/get-east-asian-width/lookup.js
const commonCjkCodePoint = 19968;
const [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
function findWideFastPathRange(ranges) {
	let fastPathStart = ranges[0];
	let fastPathEnd = ranges[1];
	for (let index = 0; index < ranges.length; index += 2) {
		const start = ranges[index];
		const end = ranges[index + 1];
		if (commonCjkCodePoint >= start && commonCjkCodePoint <= end) return [start, end];
		if (end - start > fastPathEnd - fastPathStart) {
			fastPathStart = start;
			fastPathEnd = end;
		}
	}
	return [fastPathStart, fastPathEnd];
}
const isAmbiguous = (codePoint) => {
	if (codePoint < ambiguousMinimalCodePoint || codePoint > ambiguousMaximumCodePoint) return false;
	return isInRange(ambiguousRanges, codePoint);
};
const isFullWidth = (codePoint) => {
	if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) return false;
	return isInRange(fullwidthRanges, codePoint);
};
const isWide = (codePoint) => {
	if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) return true;
	if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) return false;
	return isInRange(wideRanges, codePoint);
};

//#endregion
//#region node_modules/.pnpm/get-east-asian-width@1.6.0/node_modules/get-east-asian-width/index.js
function validate(codePoint) {
	if (!Number.isSafeInteger(codePoint)) throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
	validate(codePoint);
	if (isFullWidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) return 2;
	return 1;
}

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/utils.js
const segmenter$1 = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/**
* Get the shared grapheme segmenter instance.
*/
function getSegmenter() {
	return segmenter$1;
}
/**
* Check if a grapheme cluster (after segmentation) could possibly be an RGI emoji.
* This is a fast heuristic to avoid the expensive rgiEmojiRegex test.
* The tested Unicode blocks are deliberately broad to account for future
* Unicode additions.
*/
function couldBeEmoji(segment) {
	const cp = segment.codePointAt(0);
	return cp >= 126976 && cp <= 130047 || cp >= 8960 && cp <= 9215 || cp >= 9728 && cp <= 10175 || cp >= 11088 && cp <= 11093 || segment.includes("️") || segment.length > 2;
}
const zeroWidthRegex = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;
const leadingNonPrintingRegex = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
const rgiEmojiRegex = /^\p{RGI_Emoji}$/v;
const WIDTH_CACHE_SIZE = 512;
const widthCache = /* @__PURE__ */ new Map();
function isPrintableAscii(str) {
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		if (code < 32 || code > 126) return false;
	}
	return true;
}
function truncateFragmentToWidth(text, maxWidth) {
	if (maxWidth <= 0 || text.length === 0) return {
		text: "",
		width: 0
	};
	if (isPrintableAscii(text)) {
		const clipped = text.slice(0, maxWidth);
		return {
			text: clipped,
			width: clipped.length
		};
	}
	const hasAnsi = text.includes("\x1B");
	const hasTabs = text.includes("	");
	if (!hasAnsi && !hasTabs) {
		let result$1 = "";
		let width$1 = 0;
		for (const { segment } of segmenter$1.segment(text)) {
			const w = graphemeWidth(segment);
			if (width$1 + w > maxWidth) break;
			result$1 += segment;
			width$1 += w;
		}
		return {
			text: result$1,
			width: width$1
		};
	}
	let result = "";
	let width = 0;
	let i = 0;
	let pendingAnsi = "";
	while (i < text.length) {
		const ansi$1 = extractAnsiCode(text, i);
		if (ansi$1) {
			pendingAnsi += ansi$1.code;
			i += ansi$1.length;
			continue;
		}
		if (text[i] === "	") {
			if (width + 3 > maxWidth) break;
			if (pendingAnsi) {
				result += pendingAnsi;
				pendingAnsi = "";
			}
			result += "	";
			width += 3;
			i++;
			continue;
		}
		let end = i;
		while (end < text.length && text[end] !== "	") {
			if (extractAnsiCode(text, end)) break;
			end++;
		}
		for (const { segment } of segmenter$1.segment(text.slice(i, end))) {
			const w = graphemeWidth(segment);
			if (width + w > maxWidth) return {
				text: result,
				width
			};
			if (pendingAnsi) {
				result += pendingAnsi;
				pendingAnsi = "";
			}
			result += segment;
			width += w;
		}
		i = end;
	}
	return {
		text: result,
		width
	};
}
function finalizeTruncatedResult(prefix, prefixWidth, ellipsis, ellipsisWidth, maxWidth, pad) {
	const reset = "\x1B[0m";
	const visibleWidth$1 = prefixWidth + ellipsisWidth;
	let result;
	if (ellipsis.length > 0) result = `${prefix}${reset}${ellipsis}${reset}`;
	else result = `${prefix}${reset}`;
	return pad ? result + " ".repeat(Math.max(0, maxWidth - visibleWidth$1)) : result;
}
/**
* Calculate the terminal width of a single grapheme cluster.
* Based on code from the string-width library, but includes a possible-emoji
* check to avoid running the RGI_Emoji regex unnecessarily.
*/
function graphemeWidth(segment) {
	if (zeroWidthRegex.test(segment)) return 0;
	if (couldBeEmoji(segment) && rgiEmojiRegex.test(segment)) return 2;
	const cp = segment.replace(leadingNonPrintingRegex, "").codePointAt(0);
	if (cp === void 0) return 0;
	if (cp >= 127462 && cp <= 127487) return 2;
	let width = eastAsianWidth(cp);
	if (segment.length > 1) for (const char of segment.slice(1)) {
		const c = char.codePointAt(0);
		if (c >= 65280 && c <= 65519) width += eastAsianWidth(c);
		else if (c === 3635 || c === 3763) width += 1;
	}
	return width;
}
/**
* Calculate the visible width of a string in terminal columns.
*/
function visibleWidth(str) {
	if (str.length === 0) return 0;
	if (isPrintableAscii(str)) return str.length;
	const cached = widthCache.get(str);
	if (cached !== void 0) return cached;
	let clean = str;
	if (str.includes("	")) clean = clean.replace(/\t/g, "   ");
	if (clean.includes("\x1B")) {
		let stripped = "";
		let i = 0;
		while (i < clean.length) {
			const ansi$1 = extractAnsiCode(clean, i);
			if (ansi$1) {
				i += ansi$1.length;
				continue;
			}
			stripped += clean[i];
			i++;
		}
		clean = stripped;
	}
	let width = 0;
	for (const { segment } of segmenter$1.segment(clean)) width += graphemeWidth(segment);
	if (widthCache.size >= WIDTH_CACHE_SIZE) {
		const firstKey = widthCache.keys().next().value;
		if (firstKey !== void 0) widthCache.delete(firstKey);
	}
	widthCache.set(str, width);
	return width;
}
/**
* Normalize text for terminal output without changing logical editor content.
* Some terminals render precomposed Thai/Lao AM vowels inconsistently during
* differential repaint. Their compatibility decompositions have the same cell
* width but avoid stale-cell artifacts in terminal renderers.
*/
const THAI_LAO_AM_REGEX = /[\u0e33\u0eb3]/;
const THAI_LAO_AM_GLOBAL_REGEX = /[\u0e33\u0eb3]/g;
function normalizeTerminalOutput(str) {
	if (!THAI_LAO_AM_REGEX.test(str)) return str;
	return str.replace(THAI_LAO_AM_GLOBAL_REGEX, (char) => char === "ำ" ? "ํา" : "ໍາ");
}
/**
* Extract ANSI escape sequences from a string at the given position.
*/
function extractAnsiCode(str, pos) {
	if (pos >= str.length || str[pos] !== "\x1B") return null;
	const next = str[pos + 1];
	if (next === "[") {
		let j = pos + 2;
		while (j < str.length && !/[mGKHJ]/.test(str[j])) j++;
		if (j < str.length) return {
			code: str.substring(pos, j + 1),
			length: j + 1 - pos
		};
		return null;
	}
	if (next === "]") {
		let j = pos + 2;
		while (j < str.length) {
			if (str[j] === "\x07") return {
				code: str.substring(pos, j + 1),
				length: j + 1 - pos
			};
			if (str[j] === "\x1B" && str[j + 1] === "\\") return {
				code: str.substring(pos, j + 2),
				length: j + 2 - pos
			};
			j++;
		}
		return null;
	}
	if (next === "_") {
		let j = pos + 2;
		while (j < str.length) {
			if (str[j] === "\x07") return {
				code: str.substring(pos, j + 1),
				length: j + 1 - pos
			};
			if (str[j] === "\x1B" && str[j + 1] === "\\") return {
				code: str.substring(pos, j + 2),
				length: j + 2 - pos
			};
			j++;
		}
		return null;
	}
	return null;
}
function parseOsc8Hyperlink(ansiCode) {
	if (!ansiCode.startsWith("\x1B]8;")) return;
	const terminator = ansiCode.endsWith("\x07") ? "\x07" : "\x1B\\";
	const body = ansiCode.slice(4, terminator === "\x07" ? -1 : -2);
	const separatorIndex = body.indexOf(";");
	if (separatorIndex === -1) return;
	const params = body.slice(0, separatorIndex);
	const url = body.slice(separatorIndex + 1);
	if (!url) return null;
	return {
		params,
		url,
		terminator
	};
}
function formatOsc8Hyperlink(hyperlink$1) {
	return `\x1b]8;${hyperlink$1.params};${hyperlink$1.url}${hyperlink$1.terminator}`;
}
function formatOsc8Close(terminator) {
	return `\x1b]8;;${terminator}`;
}
/**
* Track active ANSI SGR codes to preserve styling across line breaks.
*/
var AnsiCodeTracker = class {
	bold = false;
	dim = false;
	italic = false;
	underline = false;
	blink = false;
	inverse = false;
	hidden = false;
	strikethrough = false;
	fgColor = null;
	bgColor = null;
	activeHyperlink = null;
	process(ansiCode) {
		const hyperlink$1 = parseOsc8Hyperlink(ansiCode);
		if (hyperlink$1 !== void 0) {
			this.activeHyperlink = hyperlink$1;
			return;
		}
		if (!ansiCode.endsWith("m")) return;
		const match = ansiCode.match(/\x1b\[([\d;]*)m/);
		if (!match) return;
		const params = match[1];
		if (params === "" || params === "0") {
			this.reset();
			return;
		}
		const parts = params.split(";");
		let i = 0;
		while (i < parts.length) {
			const code = Number.parseInt(parts[i], 10);
			if (code === 38 || code === 48) {
				if (parts[i + 1] === "5" && parts[i + 2] !== void 0) {
					const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]}`;
					if (code === 38) this.fgColor = colorCode;
					else this.bgColor = colorCode;
					i += 3;
					continue;
				} else if (parts[i + 1] === "2" && parts[i + 4] !== void 0) {
					const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]};${parts[i + 3]};${parts[i + 4]}`;
					if (code === 38) this.fgColor = colorCode;
					else this.bgColor = colorCode;
					i += 5;
					continue;
				}
			}
			switch (code) {
				case 0:
					this.reset();
					break;
				case 1:
					this.bold = true;
					break;
				case 2:
					this.dim = true;
					break;
				case 3:
					this.italic = true;
					break;
				case 4:
					this.underline = true;
					break;
				case 5:
					this.blink = true;
					break;
				case 7:
					this.inverse = true;
					break;
				case 8:
					this.hidden = true;
					break;
				case 9:
					this.strikethrough = true;
					break;
				case 21:
					this.bold = false;
					break;
				case 22:
					this.bold = false;
					this.dim = false;
					break;
				case 23:
					this.italic = false;
					break;
				case 24:
					this.underline = false;
					break;
				case 25:
					this.blink = false;
					break;
				case 27:
					this.inverse = false;
					break;
				case 28:
					this.hidden = false;
					break;
				case 29:
					this.strikethrough = false;
					break;
				case 39:
					this.fgColor = null;
					break;
				case 49:
					this.bgColor = null;
					break;
				default:
					if (code >= 30 && code <= 37 || code >= 90 && code <= 97) this.fgColor = String(code);
					else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) this.bgColor = String(code);
					break;
			}
			i++;
		}
	}
	reset() {
		this.bold = false;
		this.dim = false;
		this.italic = false;
		this.underline = false;
		this.blink = false;
		this.inverse = false;
		this.hidden = false;
		this.strikethrough = false;
		this.fgColor = null;
		this.bgColor = null;
	}
	/** Clear all state for reuse. */
	clear() {
		this.reset();
		this.activeHyperlink = null;
	}
	getActiveCodes() {
		const codes = [];
		if (this.bold) codes.push("1");
		if (this.dim) codes.push("2");
		if (this.italic) codes.push("3");
		if (this.underline) codes.push("4");
		if (this.blink) codes.push("5");
		if (this.inverse) codes.push("7");
		if (this.hidden) codes.push("8");
		if (this.strikethrough) codes.push("9");
		if (this.fgColor) codes.push(this.fgColor);
		if (this.bgColor) codes.push(this.bgColor);
		let result = codes.length > 0 ? `\x1b[${codes.join(";")}m` : "";
		if (this.activeHyperlink) result += formatOsc8Hyperlink(this.activeHyperlink);
		return result;
	}
	hasActiveCodes() {
		return this.bold || this.dim || this.italic || this.underline || this.blink || this.inverse || this.hidden || this.strikethrough || this.fgColor !== null || this.bgColor !== null || this.activeHyperlink !== null;
	}
	/**
	* Get reset codes for attributes that need to be turned off at line end.
	* Underline must be closed to prevent bleeding into padding.
	* Active OSC 8 hyperlinks must be closed and re-opened on the next line.
	* Returns empty string if no attributes need closing.
	*/
	getLineEndReset() {
		let result = "";
		if (this.underline) result += "\x1B[24m";
		if (this.activeHyperlink) result += formatOsc8Close(this.activeHyperlink.terminator);
		return result;
	}
};
function updateTrackerFromText(text, tracker) {
	let i = 0;
	while (i < text.length) {
		const ansiResult = extractAnsiCode(text, i);
		if (ansiResult) {
			tracker.process(ansiResult.code);
			i += ansiResult.length;
		} else i++;
	}
}
/**
* Split text into words while keeping ANSI codes attached.
*/
function splitIntoTokensWithAnsi(text) {
	const tokens = [];
	let current = "";
	let pendingAnsi = "";
	let inWhitespace = false;
	let i = 0;
	while (i < text.length) {
		const ansiResult = extractAnsiCode(text, i);
		if (ansiResult) {
			pendingAnsi += ansiResult.code;
			i += ansiResult.length;
			continue;
		}
		const char = text[i];
		const charIsSpace = char === " ";
		if (charIsSpace !== inWhitespace && current) {
			tokens.push(current);
			current = "";
		}
		if (pendingAnsi) {
			current += pendingAnsi;
			pendingAnsi = "";
		}
		inWhitespace = charIsSpace;
		current += char;
		i++;
	}
	if (pendingAnsi) current += pendingAnsi;
	if (current) tokens.push(current);
	return tokens;
}
/**
* Wrap text with ANSI codes preserved.
*
* ONLY does word wrapping - NO padding, NO background colors.
* Returns lines where each line is <= width visible chars.
* Active ANSI codes are preserved across line breaks.
*
* @param text - Text to wrap (may contain ANSI codes and newlines)
* @param width - Maximum visible width per line
* @returns Array of wrapped lines (NOT padded to width)
*/
function wrapTextWithAnsi(text, width) {
	if (!text) return [""];
	const inputLines = text.split("\n");
	const result = [];
	const tracker = new AnsiCodeTracker();
	for (const inputLine of inputLines) {
		const prefix = result.length > 0 ? tracker.getActiveCodes() : "";
		result.push(...wrapSingleLine(prefix + inputLine, width));
		updateTrackerFromText(inputLine, tracker);
	}
	return result.length > 0 ? result : [""];
}
function wrapSingleLine(line, width) {
	if (!line) return [""];
	if (visibleWidth(line) <= width) return [line];
	const wrapped = [];
	const tracker = new AnsiCodeTracker();
	const tokens = splitIntoTokensWithAnsi(line);
	let currentLine = "";
	let currentVisibleLength = 0;
	for (const token of tokens) {
		const tokenVisibleLength = visibleWidth(token);
		const isWhitespace = token.trim() === "";
		if (tokenVisibleLength > width && !isWhitespace) {
			if (currentLine) {
				const lineEndReset = tracker.getLineEndReset();
				if (lineEndReset) currentLine += lineEndReset;
				wrapped.push(currentLine);
				currentLine = "";
				currentVisibleLength = 0;
			}
			const broken = breakLongWord(token, width, tracker);
			wrapped.push(...broken.slice(0, -1));
			currentLine = broken[broken.length - 1];
			currentVisibleLength = visibleWidth(currentLine);
			continue;
		}
		if (currentVisibleLength + tokenVisibleLength > width && currentVisibleLength > 0) {
			let lineToWrap = currentLine.trimEnd();
			const lineEndReset = tracker.getLineEndReset();
			if (lineEndReset) lineToWrap += lineEndReset;
			wrapped.push(lineToWrap);
			if (isWhitespace) {
				currentLine = tracker.getActiveCodes();
				currentVisibleLength = 0;
			} else {
				currentLine = tracker.getActiveCodes() + token;
				currentVisibleLength = tokenVisibleLength;
			}
		} else {
			currentLine += token;
			currentVisibleLength += tokenVisibleLength;
		}
		updateTrackerFromText(token, tracker);
	}
	if (currentLine) wrapped.push(currentLine);
	return wrapped.length > 0 ? wrapped.map((line$1) => line$1.trimEnd()) : [""];
}
const PUNCTUATION_REGEX = /[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/;
/**
* Check if a character is whitespace.
*/
function isWhitespaceChar(char) {
	return /\s/.test(char);
}
/**
* Check if a character is punctuation.
*/
function isPunctuationChar(char) {
	return PUNCTUATION_REGEX.test(char);
}
function breakLongWord(word, width, tracker) {
	const lines = [];
	let currentLine = tracker.getActiveCodes();
	let currentWidth = 0;
	let i = 0;
	const segments = [];
	while (i < word.length) {
		const ansiResult = extractAnsiCode(word, i);
		if (ansiResult) {
			segments.push({
				type: "ansi",
				value: ansiResult.code
			});
			i += ansiResult.length;
		} else {
			let end = i;
			while (end < word.length) {
				if (extractAnsiCode(word, end)) break;
				end++;
			}
			const textPortion = word.slice(i, end);
			for (const seg of segmenter$1.segment(textPortion)) segments.push({
				type: "grapheme",
				value: seg.segment
			});
			i = end;
		}
	}
	for (const seg of segments) {
		if (seg.type === "ansi") {
			currentLine += seg.value;
			tracker.process(seg.value);
			continue;
		}
		const grapheme = seg.value;
		if (!grapheme) continue;
		const graphemeWidth$1 = visibleWidth(grapheme);
		if (currentWidth + graphemeWidth$1 > width) {
			const lineEndReset = tracker.getLineEndReset();
			if (lineEndReset) currentLine += lineEndReset;
			lines.push(currentLine);
			currentLine = tracker.getActiveCodes();
			currentWidth = 0;
		}
		currentLine += grapheme;
		currentWidth += graphemeWidth$1;
	}
	if (currentLine) lines.push(currentLine);
	return lines.length > 0 ? lines : [""];
}
/**
* Apply background color to a line, padding to full width.
*
* @param line - Line of text (may contain ANSI codes)
* @param width - Total width to pad to
* @param bgFn - Background color function
* @returns Line with background applied and padded to width
*/
function applyBackgroundToLine(line, width, bgFn) {
	const visibleLen = visibleWidth(line);
	const paddingNeeded = Math.max(0, width - visibleLen);
	return bgFn(line + " ".repeat(paddingNeeded));
}
/**
* Truncate text to fit within a maximum visible width, adding ellipsis if needed.
* Optionally pad with spaces to reach exactly maxWidth.
* Properly handles ANSI escape codes (they don't count toward width).
*
* @param text - Text to truncate (may contain ANSI codes)
* @param maxWidth - Maximum visible width
* @param ellipsis - Ellipsis string to append when truncating (default: "...")
* @param pad - If true, pad result with spaces to exactly maxWidth (default: false)
* @returns Truncated text, optionally padded to exactly maxWidth
*/
function truncateToWidth(text, maxWidth, ellipsis = "...", pad = false) {
	if (maxWidth <= 0) return "";
	if (text.length === 0) return pad ? " ".repeat(maxWidth) : "";
	const ellipsisWidth = visibleWidth(ellipsis);
	if (ellipsisWidth >= maxWidth) {
		const textWidth = visibleWidth(text);
		if (textWidth <= maxWidth) return pad ? text + " ".repeat(maxWidth - textWidth) : text;
		const clippedEllipsis = truncateFragmentToWidth(ellipsis, maxWidth);
		if (clippedEllipsis.width === 0) return pad ? " ".repeat(maxWidth) : "";
		return finalizeTruncatedResult("", 0, clippedEllipsis.text, clippedEllipsis.width, maxWidth, pad);
	}
	if (isPrintableAscii(text)) {
		if (text.length <= maxWidth) return pad ? text + " ".repeat(maxWidth - text.length) : text;
		const targetWidth$1 = maxWidth - ellipsisWidth;
		return finalizeTruncatedResult(text.slice(0, targetWidth$1), targetWidth$1, ellipsis, ellipsisWidth, maxWidth, pad);
	}
	const targetWidth = maxWidth - ellipsisWidth;
	let result = "";
	let pendingAnsi = "";
	let visibleSoFar = 0;
	let keptWidth = 0;
	let keepContiguousPrefix = true;
	let overflowed = false;
	let exhaustedInput = false;
	const hasAnsi = text.includes("\x1B");
	const hasTabs = text.includes("	");
	if (!hasAnsi && !hasTabs) {
		for (const { segment } of segmenter$1.segment(text)) {
			const width = graphemeWidth(segment);
			if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
				result += segment;
				keptWidth += width;
			} else keepContiguousPrefix = false;
			visibleSoFar += width;
			if (visibleSoFar > maxWidth) {
				overflowed = true;
				break;
			}
		}
		exhaustedInput = !overflowed;
	} else {
		let i = 0;
		while (i < text.length) {
			const ansi$1 = extractAnsiCode(text, i);
			if (ansi$1) {
				pendingAnsi += ansi$1.code;
				i += ansi$1.length;
				continue;
			}
			if (text[i] === "	") {
				if (keepContiguousPrefix && keptWidth + 3 <= targetWidth) {
					if (pendingAnsi) {
						result += pendingAnsi;
						pendingAnsi = "";
					}
					result += "	";
					keptWidth += 3;
				} else {
					keepContiguousPrefix = false;
					pendingAnsi = "";
				}
				visibleSoFar += 3;
				if (visibleSoFar > maxWidth) {
					overflowed = true;
					break;
				}
				i++;
				continue;
			}
			let end = i;
			while (end < text.length && text[end] !== "	") {
				if (extractAnsiCode(text, end)) break;
				end++;
			}
			for (const { segment } of segmenter$1.segment(text.slice(i, end))) {
				const width = graphemeWidth(segment);
				if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
					if (pendingAnsi) {
						result += pendingAnsi;
						pendingAnsi = "";
					}
					result += segment;
					keptWidth += width;
				} else {
					keepContiguousPrefix = false;
					pendingAnsi = "";
				}
				visibleSoFar += width;
				if (visibleSoFar > maxWidth) {
					overflowed = true;
					break;
				}
			}
			if (overflowed) break;
			i = end;
		}
		exhaustedInput = i >= text.length;
	}
	if (!overflowed && exhaustedInput) return pad ? text + " ".repeat(Math.max(0, maxWidth - visibleSoFar)) : text;
	return finalizeTruncatedResult(result, keptWidth, ellipsis, ellipsisWidth, maxWidth, pad);
}
/**
* Extract a range of visible columns from a line. Handles ANSI codes and wide chars.
* @param strict - If true, exclude wide chars at boundary that would extend past the range
*/
function sliceByColumn(line, startCol, length, strict = false) {
	return sliceWithWidth(line, startCol, length, strict).text;
}
/** Like sliceByColumn but also returns the actual visible width of the result. */
function sliceWithWidth(line, startCol, length, strict = false) {
	if (length <= 0) return {
		text: "",
		width: 0
	};
	const endCol = startCol + length;
	let result = "", resultWidth = 0, currentCol = 0, i = 0, pendingAnsi = "";
	while (i < line.length) {
		const ansi$1 = extractAnsiCode(line, i);
		if (ansi$1) {
			if (currentCol >= startCol && currentCol < endCol) result += ansi$1.code;
			else if (currentCol < startCol) pendingAnsi += ansi$1.code;
			i += ansi$1.length;
			continue;
		}
		let textEnd = i;
		while (textEnd < line.length && !extractAnsiCode(line, textEnd)) textEnd++;
		for (const { segment } of segmenter$1.segment(line.slice(i, textEnd))) {
			const w = graphemeWidth(segment);
			const inRange = currentCol >= startCol && currentCol < endCol;
			const fits = !strict || currentCol + w <= endCol;
			if (inRange && fits) {
				if (pendingAnsi) {
					result += pendingAnsi;
					pendingAnsi = "";
				}
				result += segment;
				resultWidth += w;
			}
			currentCol += w;
			if (currentCol >= endCol) break;
		}
		i = textEnd;
		if (currentCol >= endCol) break;
	}
	return {
		text: result,
		width: resultWidth
	};
}
const pooledStyleTracker = new AnsiCodeTracker();
/**
* Extract "before" and "after" segments from a line in a single pass.
* Used for overlay compositing where we need content before and after the overlay region.
* Preserves styling from before the overlay that should affect content after it.
*/
function extractSegments(line, beforeEnd, afterStart, afterLen, strictAfter = false) {
	let before = "", beforeWidth = 0, after = "", afterWidth = 0;
	let currentCol = 0, i = 0;
	let pendingAnsiBefore = "";
	let afterStarted = false;
	const afterEnd = afterStart + afterLen;
	pooledStyleTracker.clear();
	while (i < line.length) {
		const ansi$1 = extractAnsiCode(line, i);
		if (ansi$1) {
			pooledStyleTracker.process(ansi$1.code);
			if (currentCol < beforeEnd) pendingAnsiBefore += ansi$1.code;
			else if (currentCol >= afterStart && currentCol < afterEnd && afterStarted) after += ansi$1.code;
			i += ansi$1.length;
			continue;
		}
		let textEnd = i;
		while (textEnd < line.length && !extractAnsiCode(line, textEnd)) textEnd++;
		for (const { segment } of segmenter$1.segment(line.slice(i, textEnd))) {
			const w = graphemeWidth(segment);
			if (currentCol < beforeEnd) {
				if (pendingAnsiBefore) {
					before += pendingAnsiBefore;
					pendingAnsiBefore = "";
				}
				before += segment;
				beforeWidth += w;
			} else if (currentCol >= afterStart && currentCol < afterEnd) {
				if (!strictAfter || currentCol + w <= afterEnd) {
					if (!afterStarted) {
						after += pooledStyleTracker.getActiveCodes();
						afterStarted = true;
					}
					after += segment;
					afterWidth += w;
				}
			}
			currentCol += w;
			if (afterLen <= 0 ? currentCol >= beforeEnd : currentCol >= afterEnd) break;
		}
		i = textEnd;
		if (afterLen <= 0 ? currentCol >= beforeEnd : currentCol >= afterEnd) break;
	}
	return {
		before,
		beforeWidth,
		after,
		afterWidth
	};
}

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/box.js
/**
* Box component - a container that applies padding and background to all children
*/
var Box = class {
	children = [];
	paddingX;
	paddingY;
	bgFn;
	cache;
	constructor(paddingX = 1, paddingY = 1, bgFn) {
		this.paddingX = paddingX;
		this.paddingY = paddingY;
		this.bgFn = bgFn;
	}
	addChild(component) {
		this.children.push(component);
		this.invalidateCache();
	}
	removeChild(component) {
		const index = this.children.indexOf(component);
		if (index !== -1) {
			this.children.splice(index, 1);
			this.invalidateCache();
		}
	}
	clear() {
		this.children = [];
		this.invalidateCache();
	}
	setBgFn(bgFn) {
		this.bgFn = bgFn;
	}
	invalidateCache() {
		this.cache = void 0;
	}
	matchCache(width, childLines, bgSample) {
		const cache = this.cache;
		return !!cache && cache.width === width && cache.bgSample === bgSample && cache.childLines.length === childLines.length && cache.childLines.every((line, i) => line === childLines[i]);
	}
	invalidate() {
		this.invalidateCache();
		for (const child of this.children) child.invalidate?.();
	}
	render(width) {
		if (this.children.length === 0) return [];
		const contentWidth = Math.max(1, width - this.paddingX * 2);
		const leftPad = " ".repeat(this.paddingX);
		const childLines = [];
		for (const child of this.children) {
			const lines = child.render(contentWidth);
			for (const line of lines) childLines.push(leftPad + line);
		}
		if (childLines.length === 0) return [];
		const bgSample = this.bgFn ? this.bgFn("test") : void 0;
		if (this.matchCache(width, childLines, bgSample)) return this.cache.lines;
		const result = [];
		for (let i = 0; i < this.paddingY; i++) result.push(this.applyBg("", width));
		for (const line of childLines) result.push(this.applyBg(line, width));
		for (let i = 0; i < this.paddingY; i++) result.push(this.applyBg("", width));
		this.cache = {
			childLines,
			width,
			bgSample,
			lines: result
		};
		return result;
	}
	applyBg(line, width) {
		const visLen = visibleWidth(line);
		const padNeeded = Math.max(0, width - visLen);
		const padded$1 = line + " ".repeat(padNeeded);
		if (this.bgFn) return applyBackgroundToLine(padded$1, width, this.bgFn);
		return padded$1;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/keys.js
/**
* Keyboard input handling for terminal applications.
*
* Supports both legacy terminal sequences and Kitty keyboard protocol.
* See: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
* Reference: https://github.com/sst/opentui/blob/7da92b4088aebfe27b9f691c04163a48821e49fd/packages/core/src/lib/parse.keypress.ts
*
* Symbol keys are also supported, however some ctrl+symbol combos
* overlap with ASCII codes, e.g. ctrl+[ = ESC.
* See: https://sw.kovidgoyal.net/kitty/keyboard-protocol/#legacy-ctrl-mapping-of-ascii-keys
* Those can still be * used for ctrl+shift combos
*
* API:
* - matchesKey(data, keyId) - Check if input matches a key identifier
* - parseKey(data) - Parse input and return the key identifier
* - Key - Helper object for creating typed key identifiers
* - setKittyProtocolActive(active) - Set global Kitty protocol state
* - isKittyProtocolActive() - Query global Kitty protocol state
*/
let _kittyProtocolActive = false;
/**
* Set the global Kitty keyboard protocol state.
* Called by ProcessTerminal after detecting protocol support.
*/
function setKittyProtocolActive(active) {
	_kittyProtocolActive = active;
}
/**
* Helper object for creating typed key identifiers with autocomplete.
*
* Usage:
* - Key.escape, Key.enter, Key.tab, etc. for special keys
* - Key.backtick, Key.comma, Key.period, etc. for symbol keys
* - Key.ctrl("c"), Key.alt("x"), Key.super("k") for single modifiers
* - Key.ctrlShift("p"), Key.ctrlAlt("x"), Key.ctrlSuper("k") for combined modifiers
*/
const Key = {
	escape: "escape",
	esc: "esc",
	enter: "enter",
	return: "return",
	tab: "tab",
	space: "space",
	backspace: "backspace",
	delete: "delete",
	insert: "insert",
	clear: "clear",
	home: "home",
	end: "end",
	pageUp: "pageUp",
	pageDown: "pageDown",
	up: "up",
	down: "down",
	left: "left",
	right: "right",
	f1: "f1",
	f2: "f2",
	f3: "f3",
	f4: "f4",
	f5: "f5",
	f6: "f6",
	f7: "f7",
	f8: "f8",
	f9: "f9",
	f10: "f10",
	f11: "f11",
	f12: "f12",
	backtick: "`",
	hyphen: "-",
	equals: "=",
	leftbracket: "[",
	rightbracket: "]",
	backslash: "\\",
	semicolon: ";",
	quote: "'",
	comma: ",",
	period: ".",
	slash: "/",
	exclamation: "!",
	at: "@",
	hash: "#",
	dollar: "$",
	percent: "%",
	caret: "^",
	ampersand: "&",
	asterisk: "*",
	leftparen: "(",
	rightparen: ")",
	underscore: "_",
	plus: "+",
	pipe: "|",
	tilde: "~",
	leftbrace: "{",
	rightbrace: "}",
	colon: ":",
	lessthan: "<",
	greaterthan: ">",
	question: "?",
	ctrl: (key) => `ctrl+${key}`,
	shift: (key) => `shift+${key}`,
	alt: (key) => `alt+${key}`,
	super: (key) => `super+${key}`,
	ctrlShift: (key) => `ctrl+shift+${key}`,
	shiftCtrl: (key) => `shift+ctrl+${key}`,
	ctrlAlt: (key) => `ctrl+alt+${key}`,
	altCtrl: (key) => `alt+ctrl+${key}`,
	shiftAlt: (key) => `shift+alt+${key}`,
	altShift: (key) => `alt+shift+${key}`,
	ctrlSuper: (key) => `ctrl+super+${key}`,
	superCtrl: (key) => `super+ctrl+${key}`,
	shiftSuper: (key) => `shift+super+${key}`,
	superShift: (key) => `super+shift+${key}`,
	altSuper: (key) => `alt+super+${key}`,
	superAlt: (key) => `super+alt+${key}`,
	ctrlShiftAlt: (key) => `ctrl+shift+alt+${key}`,
	ctrlShiftSuper: (key) => `ctrl+shift+super+${key}`
};
const SYMBOL_KEYS = new Set([
	"`",
	"-",
	"=",
	"[",
	"]",
	"\\",
	";",
	"'",
	",",
	".",
	"/",
	"!",
	"@",
	"#",
	"$",
	"%",
	"^",
	"&",
	"*",
	"(",
	")",
	"_",
	"+",
	"|",
	"~",
	"{",
	"}",
	":",
	"<",
	">",
	"?"
]);
const MODIFIERS = {
	shift: 1,
	alt: 2,
	ctrl: 4,
	super: 8
};
const LOCK_MASK = 192;
const CODEPOINTS = {
	escape: 27,
	tab: 9,
	enter: 13,
	space: 32,
	backspace: 127,
	kpEnter: 57414
};
const ARROW_CODEPOINTS = {
	up: -1,
	down: -2,
	right: -3,
	left: -4
};
const FUNCTIONAL_CODEPOINTS = {
	delete: -10,
	insert: -11,
	pageUp: -12,
	pageDown: -13,
	home: -14,
	end: -15
};
const KITTY_FUNCTIONAL_KEY_EQUIVALENTS = new Map([
	[57399, 48],
	[57400, 49],
	[57401, 50],
	[57402, 51],
	[57403, 52],
	[57404, 53],
	[57405, 54],
	[57406, 55],
	[57407, 56],
	[57408, 57],
	[57409, 46],
	[57410, 47],
	[57411, 42],
	[57412, 45],
	[57413, 43],
	[57415, 61],
	[57416, 44],
	[57417, ARROW_CODEPOINTS.left],
	[57418, ARROW_CODEPOINTS.right],
	[57419, ARROW_CODEPOINTS.up],
	[57420, ARROW_CODEPOINTS.down],
	[57421, FUNCTIONAL_CODEPOINTS.pageUp],
	[57422, FUNCTIONAL_CODEPOINTS.pageDown],
	[57423, FUNCTIONAL_CODEPOINTS.home],
	[57424, FUNCTIONAL_CODEPOINTS.end],
	[57425, FUNCTIONAL_CODEPOINTS.insert],
	[57426, FUNCTIONAL_CODEPOINTS.delete]
]);
function normalizeKittyFunctionalCodepoint(codepoint) {
	return KITTY_FUNCTIONAL_KEY_EQUIVALENTS.get(codepoint) ?? codepoint;
}
function normalizeShiftedLetterIdentityCodepoint(codepoint, modifier) {
	if ((modifier & ~LOCK_MASK & MODIFIERS.shift) !== 0 && codepoint >= 65 && codepoint <= 90) return codepoint + 32;
	return codepoint;
}
const LEGACY_KEY_SEQUENCES = {
	up: ["\x1B[A", "\x1BOA"],
	down: ["\x1B[B", "\x1BOB"],
	right: ["\x1B[C", "\x1BOC"],
	left: ["\x1B[D", "\x1BOD"],
	home: [
		"\x1B[H",
		"\x1BOH",
		"\x1B[1~",
		"\x1B[7~"
	],
	end: [
		"\x1B[F",
		"\x1BOF",
		"\x1B[4~",
		"\x1B[8~"
	],
	insert: ["\x1B[2~"],
	delete: ["\x1B[3~"],
	pageUp: ["\x1B[5~", "\x1B[[5~"],
	pageDown: ["\x1B[6~", "\x1B[[6~"],
	clear: ["\x1B[E", "\x1BOE"],
	f1: [
		"\x1BOP",
		"\x1B[11~",
		"\x1B[[A"
	],
	f2: [
		"\x1BOQ",
		"\x1B[12~",
		"\x1B[[B"
	],
	f3: [
		"\x1BOR",
		"\x1B[13~",
		"\x1B[[C"
	],
	f4: [
		"\x1BOS",
		"\x1B[14~",
		"\x1B[[D"
	],
	f5: ["\x1B[15~", "\x1B[[E"],
	f6: ["\x1B[17~"],
	f7: ["\x1B[18~"],
	f8: ["\x1B[19~"],
	f9: ["\x1B[20~"],
	f10: ["\x1B[21~"],
	f11: ["\x1B[23~"],
	f12: ["\x1B[24~"]
};
const LEGACY_SHIFT_SEQUENCES = {
	up: ["\x1B[a"],
	down: ["\x1B[b"],
	right: ["\x1B[c"],
	left: ["\x1B[d"],
	clear: ["\x1B[e"],
	insert: ["\x1B[2$"],
	delete: ["\x1B[3$"],
	pageUp: ["\x1B[5$"],
	pageDown: ["\x1B[6$"],
	home: ["\x1B[7$"],
	end: ["\x1B[8$"]
};
const LEGACY_CTRL_SEQUENCES = {
	up: ["\x1BOa"],
	down: ["\x1BOb"],
	right: ["\x1BOc"],
	left: ["\x1BOd"],
	clear: ["\x1BOe"],
	insert: ["\x1B[2^"],
	delete: ["\x1B[3^"],
	pageUp: ["\x1B[5^"],
	pageDown: ["\x1B[6^"],
	home: ["\x1B[7^"],
	end: ["\x1B[8^"]
};
const matchesLegacySequence = (data, sequences) => sequences.includes(data);
const matchesLegacyModifierSequence = (data, key, modifier) => {
	if (modifier === MODIFIERS.shift) return matchesLegacySequence(data, LEGACY_SHIFT_SEQUENCES[key]);
	if (modifier === MODIFIERS.ctrl) return matchesLegacySequence(data, LEGACY_CTRL_SEQUENCES[key]);
	return false;
};
/**
* Check if the last parsed key event was a key release.
* Only meaningful when Kitty keyboard protocol with flag 2 is active.
*/
function isKeyRelease(data) {
	if (data.includes("\x1B[200~")) return false;
	if (data.includes(":3u") || data.includes(":3~") || data.includes(":3A") || data.includes(":3B") || data.includes(":3C") || data.includes(":3D") || data.includes(":3H") || data.includes(":3F")) return true;
	return false;
}
function parseEventType(eventTypeStr) {
	if (!eventTypeStr) return "press";
	const eventType = parseInt(eventTypeStr, 10);
	if (eventType === 2) return "repeat";
	if (eventType === 3) return "release";
	return "press";
}
function parseKittySequence(data) {
	const csiUMatch = data.match(/^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/);
	if (csiUMatch) {
		const codepoint = parseInt(csiUMatch[1], 10);
		const shiftedKey = csiUMatch[2] && csiUMatch[2].length > 0 ? parseInt(csiUMatch[2], 10) : void 0;
		const baseLayoutKey = csiUMatch[3] ? parseInt(csiUMatch[3], 10) : void 0;
		const modValue = csiUMatch[4] ? parseInt(csiUMatch[4], 10) : 1;
		const eventType = parseEventType(csiUMatch[5]);
		return {
			codepoint,
			shiftedKey,
			baseLayoutKey,
			modifier: modValue - 1,
			eventType
		};
	}
	const arrowMatch = data.match(/^\x1b\[1;(\d+)(?::(\d+))?([ABCD])$/);
	if (arrowMatch) {
		const modValue = parseInt(arrowMatch[1], 10);
		const eventType = parseEventType(arrowMatch[2]);
		return {
			codepoint: {
				A: -1,
				B: -2,
				C: -3,
				D: -4
			}[arrowMatch[3]],
			modifier: modValue - 1,
			eventType
		};
	}
	const funcMatch = data.match(/^\x1b\[(\d+)(?:;(\d+))?(?::(\d+))?~$/);
	if (funcMatch) {
		const keyNum = parseInt(funcMatch[1], 10);
		const modValue = funcMatch[2] ? parseInt(funcMatch[2], 10) : 1;
		const eventType = parseEventType(funcMatch[3]);
		const codepoint = {
			2: FUNCTIONAL_CODEPOINTS.insert,
			3: FUNCTIONAL_CODEPOINTS.delete,
			5: FUNCTIONAL_CODEPOINTS.pageUp,
			6: FUNCTIONAL_CODEPOINTS.pageDown,
			7: FUNCTIONAL_CODEPOINTS.home,
			8: FUNCTIONAL_CODEPOINTS.end
		}[keyNum];
		if (codepoint !== void 0) return {
			codepoint,
			modifier: modValue - 1,
			eventType
		};
	}
	const homeEndMatch = data.match(/^\x1b\[1;(\d+)(?::(\d+))?([HF])$/);
	if (homeEndMatch) {
		const modValue = parseInt(homeEndMatch[1], 10);
		const eventType = parseEventType(homeEndMatch[2]);
		return {
			codepoint: homeEndMatch[3] === "H" ? FUNCTIONAL_CODEPOINTS.home : FUNCTIONAL_CODEPOINTS.end,
			modifier: modValue - 1,
			eventType
		};
	}
	return null;
}
function matchesKittySequence(data, expectedCodepoint, expectedModifier) {
	const parsed = parseKittySequence(data);
	if (!parsed) return false;
	if ((parsed.modifier & ~LOCK_MASK) !== (expectedModifier & ~LOCK_MASK)) return false;
	const normalizedCodepoint = normalizeShiftedLetterIdentityCodepoint(normalizeKittyFunctionalCodepoint(parsed.codepoint), parsed.modifier);
	if (normalizedCodepoint === normalizeShiftedLetterIdentityCodepoint(normalizeKittyFunctionalCodepoint(expectedCodepoint), expectedModifier)) return true;
	if (parsed.baseLayoutKey !== void 0 && parsed.baseLayoutKey === expectedCodepoint) {
		const cp = normalizedCodepoint;
		const isLatinLetter = cp >= 97 && cp <= 122;
		const isKnownSymbol = SYMBOL_KEYS.has(String.fromCharCode(cp));
		if (!isLatinLetter && !isKnownSymbol) return true;
	}
	return false;
}
function parseModifyOtherKeysSequence(data) {
	const match = data.match(/^\x1b\[27;(\d+);(\d+)~$/);
	if (!match) return null;
	const modValue = parseInt(match[1], 10);
	return {
		codepoint: parseInt(match[2], 10),
		modifier: modValue - 1
	};
}
/**
* Match xterm modifyOtherKeys format: CSI 27 ; modifiers ; keycode ~
* This is used by terminals when Kitty protocol is not enabled.
* Modifier values are 1-indexed: 2=shift, 3=alt, 5=ctrl, etc.
*/
function matchesModifyOtherKeys(data, expectedKeycode, expectedModifier) {
	const parsed = parseModifyOtherKeysSequence(data);
	if (!parsed) return false;
	return parsed.codepoint === expectedKeycode && parsed.modifier === expectedModifier;
}
function isWindowsTerminalSession() {
	return Boolean(process.env.WT_SESSION) && !process.env.SSH_CONNECTION && !process.env.SSH_CLIENT && !process.env.SSH_TTY;
}
/**
* Raw 0x08 (BS) is ambiguous in legacy terminals.
*
* - Windows Terminal uses it for Ctrl+Backspace.
* - Some legacy terminals and tmux setups send it for plain Backspace.
*
* Prefer explicit Kitty / CSI-u / modifyOtherKeys sequences whenever they are
* available. Fall back to a Windows Terminal heuristic only for raw BS bytes.
*/
function matchesRawBackspace(data, expectedModifier) {
	if (data === "") return expectedModifier === 0;
	if (data !== "\b") return false;
	return isWindowsTerminalSession() ? expectedModifier === MODIFIERS.ctrl : expectedModifier === 0;
}
/**
* Get the control character for a key.
* Uses the universal formula: code & 0x1f (mask to lower 5 bits)
*
* Works for:
* - Letters a-z → 1-26
* - Symbols [\]_ → 27, 28, 29, 31
* - Also maps - to same as _ (same physical key on US keyboards)
*/
function rawCtrlChar(key) {
	const char = key.toLowerCase();
	const code = char.charCodeAt(0);
	if (code >= 97 && code <= 122 || char === "[" || char === "\\" || char === "]" || char === "_") return String.fromCharCode(code & 31);
	if (char === "-") return String.fromCharCode(31);
	return null;
}
function isDigitKey(key) {
	return key >= "0" && key <= "9";
}
function matchesPrintableModifyOtherKeys(data, expectedKeycode, expectedModifier) {
	if (expectedModifier === 0) return false;
	const parsed = parseModifyOtherKeysSequence(data);
	if (!parsed || parsed.modifier !== expectedModifier) return false;
	return normalizeShiftedLetterIdentityCodepoint(parsed.codepoint, parsed.modifier) === normalizeShiftedLetterIdentityCodepoint(expectedKeycode, expectedModifier);
}
function parseKeyId(keyId) {
	const parts = keyId.toLowerCase().split("+");
	const key = parts[parts.length - 1];
	if (!key) return null;
	return {
		key,
		ctrl: parts.includes("ctrl"),
		shift: parts.includes("shift"),
		alt: parts.includes("alt"),
		super: parts.includes("super")
	};
}
/**
* Match input data against a key identifier string.
*
* Supported key identifiers:
* - Single keys: "escape", "tab", "enter", "backspace", "delete", "home", "end", "space"
* - Arrow keys: "up", "down", "left", "right"
* - Ctrl combinations: "ctrl+c", "ctrl+z", etc.
* - Shift combinations: "shift+tab", "shift+enter"
* - Alt combinations: "alt+enter", "alt+backspace"
* - Super combinations: "super+k", "super+enter"
* - Combined modifiers: "shift+ctrl+p", "ctrl+alt+x", "ctrl+super+k"
*
* Use the Key helper for autocomplete: Key.ctrl("c"), Key.escape, Key.ctrlShift("p"), Key.super("k")
*
* @param data - Raw input data from terminal
* @param keyId - Key identifier (e.g., "ctrl+c", "escape", Key.ctrl("c"))
*/
function matchesKey(data, keyId) {
	const parsed = parseKeyId(keyId);
	if (!parsed) return false;
	const { key, ctrl, shift, alt, super: superModifier } = parsed;
	let modifier = 0;
	if (shift) modifier |= MODIFIERS.shift;
	if (alt) modifier |= MODIFIERS.alt;
	if (ctrl) modifier |= MODIFIERS.ctrl;
	if (superModifier) modifier |= MODIFIERS.super;
	switch (key) {
		case "escape":
		case "esc":
			if (modifier !== 0) return false;
			return data === "\x1B" || matchesKittySequence(data, CODEPOINTS.escape, 0) || matchesModifyOtherKeys(data, CODEPOINTS.escape, 0);
		case "space":
			if (!_kittyProtocolActive) {
				if (modifier === MODIFIERS.ctrl && data === "\0") return true;
				if (modifier === MODIFIERS.alt && data === "\x1B ") return true;
			}
			if (modifier === 0) return data === " " || matchesKittySequence(data, CODEPOINTS.space, 0) || matchesModifyOtherKeys(data, CODEPOINTS.space, 0);
			return matchesKittySequence(data, CODEPOINTS.space, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.space, modifier);
		case "tab":
			if (modifier === MODIFIERS.shift) return data === "\x1B[Z" || matchesKittySequence(data, CODEPOINTS.tab, MODIFIERS.shift) || matchesModifyOtherKeys(data, CODEPOINTS.tab, MODIFIERS.shift);
			if (modifier === 0) return data === "	" || matchesKittySequence(data, CODEPOINTS.tab, 0);
			return matchesKittySequence(data, CODEPOINTS.tab, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.tab, modifier);
		case "enter":
		case "return":
			if (modifier === MODIFIERS.shift) {
				if (matchesKittySequence(data, CODEPOINTS.enter, MODIFIERS.shift) || matchesKittySequence(data, CODEPOINTS.kpEnter, MODIFIERS.shift)) return true;
				if (matchesModifyOtherKeys(data, CODEPOINTS.enter, MODIFIERS.shift)) return true;
				if (_kittyProtocolActive) return data === "\x1B\r" || data === "\n";
				return false;
			}
			if (modifier === MODIFIERS.alt) {
				if (matchesKittySequence(data, CODEPOINTS.enter, MODIFIERS.alt) || matchesKittySequence(data, CODEPOINTS.kpEnter, MODIFIERS.alt)) return true;
				if (matchesModifyOtherKeys(data, CODEPOINTS.enter, MODIFIERS.alt)) return true;
				if (!_kittyProtocolActive) return data === "\x1B\r";
				return false;
			}
			if (modifier === 0) return data === "\r" || !_kittyProtocolActive && data === "\n" || data === "\x1BOM" || matchesKittySequence(data, CODEPOINTS.enter, 0) || matchesKittySequence(data, CODEPOINTS.kpEnter, 0);
			return matchesKittySequence(data, CODEPOINTS.enter, modifier) || matchesKittySequence(data, CODEPOINTS.kpEnter, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.enter, modifier);
		case "backspace":
			if (modifier === MODIFIERS.alt) {
				if (data === "\x1B" || data === "\x1B\b") return true;
				return matchesKittySequence(data, CODEPOINTS.backspace, MODIFIERS.alt) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, MODIFIERS.alt);
			}
			if (modifier === MODIFIERS.ctrl) {
				if (matchesRawBackspace(data, MODIFIERS.ctrl)) return true;
				return matchesKittySequence(data, CODEPOINTS.backspace, MODIFIERS.ctrl) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, MODIFIERS.ctrl);
			}
			if (modifier === 0) return matchesRawBackspace(data, 0) || matchesKittySequence(data, CODEPOINTS.backspace, 0) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, 0);
			return matchesKittySequence(data, CODEPOINTS.backspace, modifier) || matchesModifyOtherKeys(data, CODEPOINTS.backspace, modifier);
		case "insert":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.insert) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.insert, 0);
			if (matchesLegacyModifierSequence(data, "insert", modifier)) return true;
			return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.insert, modifier);
		case "delete":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.delete) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.delete, 0);
			if (matchesLegacyModifierSequence(data, "delete", modifier)) return true;
			return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.delete, modifier);
		case "clear":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.clear);
			return matchesLegacyModifierSequence(data, "clear", modifier);
		case "home":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.home) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.home, 0);
			if (matchesLegacyModifierSequence(data, "home", modifier)) return true;
			return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.home, modifier);
		case "end":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.end) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.end, 0);
			if (matchesLegacyModifierSequence(data, "end", modifier)) return true;
			return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.end, modifier);
		case "pageup":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.pageUp) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageUp, 0);
			if (matchesLegacyModifierSequence(data, "pageUp", modifier)) return true;
			return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageUp, modifier);
		case "pagedown":
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.pageDown) || matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageDown, 0);
			if (matchesLegacyModifierSequence(data, "pageDown", modifier)) return true;
			return matchesKittySequence(data, FUNCTIONAL_CODEPOINTS.pageDown, modifier);
		case "up":
			if (modifier === MODIFIERS.alt) return data === "\x1Bp" || matchesKittySequence(data, ARROW_CODEPOINTS.up, MODIFIERS.alt);
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.up) || matchesKittySequence(data, ARROW_CODEPOINTS.up, 0);
			if (matchesLegacyModifierSequence(data, "up", modifier)) return true;
			return matchesKittySequence(data, ARROW_CODEPOINTS.up, modifier);
		case "down":
			if (modifier === MODIFIERS.alt) return data === "\x1Bn" || matchesKittySequence(data, ARROW_CODEPOINTS.down, MODIFIERS.alt);
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.down) || matchesKittySequence(data, ARROW_CODEPOINTS.down, 0);
			if (matchesLegacyModifierSequence(data, "down", modifier)) return true;
			return matchesKittySequence(data, ARROW_CODEPOINTS.down, modifier);
		case "left":
			if (modifier === MODIFIERS.alt) return data === "\x1B[1;3D" || !_kittyProtocolActive && data === "\x1BB" || data === "\x1Bb" || matchesKittySequence(data, ARROW_CODEPOINTS.left, MODIFIERS.alt);
			if (modifier === MODIFIERS.ctrl) return data === "\x1B[1;5D" || matchesLegacyModifierSequence(data, "left", MODIFIERS.ctrl) || matchesKittySequence(data, ARROW_CODEPOINTS.left, MODIFIERS.ctrl);
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.left) || matchesKittySequence(data, ARROW_CODEPOINTS.left, 0);
			if (matchesLegacyModifierSequence(data, "left", modifier)) return true;
			return matchesKittySequence(data, ARROW_CODEPOINTS.left, modifier);
		case "right":
			if (modifier === MODIFIERS.alt) return data === "\x1B[1;3C" || !_kittyProtocolActive && data === "\x1BF" || data === "\x1Bf" || matchesKittySequence(data, ARROW_CODEPOINTS.right, MODIFIERS.alt);
			if (modifier === MODIFIERS.ctrl) return data === "\x1B[1;5C" || matchesLegacyModifierSequence(data, "right", MODIFIERS.ctrl) || matchesKittySequence(data, ARROW_CODEPOINTS.right, MODIFIERS.ctrl);
			if (modifier === 0) return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES.right) || matchesKittySequence(data, ARROW_CODEPOINTS.right, 0);
			if (matchesLegacyModifierSequence(data, "right", modifier)) return true;
			return matchesKittySequence(data, ARROW_CODEPOINTS.right, modifier);
		case "f1":
		case "f2":
		case "f3":
		case "f4":
		case "f5":
		case "f6":
		case "f7":
		case "f8":
		case "f9":
		case "f10":
		case "f11":
		case "f12":
			if (modifier !== 0) return false;
			return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES[key]);
	}
	if (key.length === 1 && (key >= "a" && key <= "z" || isDigitKey(key) || SYMBOL_KEYS.has(key))) {
		const codepoint = key.charCodeAt(0);
		const rawCtrl = rawCtrlChar(key);
		const isLetter = key >= "a" && key <= "z";
		const isDigit = isDigitKey(key);
		if (modifier === MODIFIERS.ctrl + MODIFIERS.alt && !_kittyProtocolActive && rawCtrl) {
			if (data === `\x1b${rawCtrl}`) return true;
		}
		if (modifier === MODIFIERS.alt && !_kittyProtocolActive && (isLetter || isDigit)) {
			if (data === `\x1b${key}`) return true;
		}
		if (modifier === MODIFIERS.ctrl) {
			if (rawCtrl && data === rawCtrl) return true;
			return matchesKittySequence(data, codepoint, MODIFIERS.ctrl) || matchesPrintableModifyOtherKeys(data, codepoint, MODIFIERS.ctrl);
		}
		if (modifier === MODIFIERS.shift + MODIFIERS.ctrl) return matchesKittySequence(data, codepoint, MODIFIERS.shift + MODIFIERS.ctrl) || matchesPrintableModifyOtherKeys(data, codepoint, MODIFIERS.shift + MODIFIERS.ctrl);
		if (modifier === MODIFIERS.shift) {
			if (isLetter && data === key.toUpperCase()) return true;
			return matchesKittySequence(data, codepoint, MODIFIERS.shift) || matchesPrintableModifyOtherKeys(data, codepoint, MODIFIERS.shift);
		}
		if (modifier !== 0) return matchesKittySequence(data, codepoint, modifier) || matchesPrintableModifyOtherKeys(data, codepoint, modifier);
		return data === key || matchesKittySequence(data, codepoint, 0);
	}
	return false;
}
const KITTY_CSI_U_REGEX = /^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/;
const KITTY_PRINTABLE_ALLOWED_MODIFIERS = MODIFIERS.shift | LOCK_MASK;
/**
* Decode a Kitty CSI-u sequence into a printable character, if applicable.
*
* When Kitty keyboard protocol flag 1 (disambiguate) is active, terminals send
* CSI-u sequences for all keys, including plain printable characters. This
* function extracts the printable character from such sequences.
*
* Only accepts plain or Shift-modified keys. Rejects Ctrl, Alt, and unsupported
* modifier combinations (those are handled by keybinding matching instead).
* Prefers the shifted keycode when Shift is held and a shifted key is reported.
*
* @param data - Raw input data from terminal
* @returns The printable character, or undefined if not a printable CSI-u sequence
*/
function decodeKittyPrintable(data) {
	const match = data.match(KITTY_CSI_U_REGEX);
	if (!match) return void 0;
	const codepoint = Number.parseInt(match[1] ?? "", 10);
	if (!Number.isFinite(codepoint)) return void 0;
	const shiftedKey = match[2] && match[2].length > 0 ? Number.parseInt(match[2], 10) : void 0;
	const modValue = match[4] ? Number.parseInt(match[4], 10) : 1;
	const modifier = Number.isFinite(modValue) ? modValue - 1 : 0;
	if ((modifier & ~KITTY_PRINTABLE_ALLOWED_MODIFIERS) !== 0) return void 0;
	if (modifier & (MODIFIERS.alt | MODIFIERS.ctrl)) return void 0;
	let effectiveCodepoint = codepoint;
	if (modifier & MODIFIERS.shift && typeof shiftedKey === "number") effectiveCodepoint = shiftedKey;
	effectiveCodepoint = normalizeKittyFunctionalCodepoint(effectiveCodepoint);
	if (!Number.isFinite(effectiveCodepoint) || effectiveCodepoint < 32) return void 0;
	try {
		return String.fromCodePoint(effectiveCodepoint);
	} catch {
		return;
	}
}
function decodeModifyOtherKeysPrintable(data) {
	const parsed = parseModifyOtherKeysSequence(data);
	if (!parsed) return void 0;
	if ((parsed.modifier & ~LOCK_MASK & ~MODIFIERS.shift) !== 0) return void 0;
	if (!Number.isFinite(parsed.codepoint) || parsed.codepoint < 32) return void 0;
	try {
		return String.fromCodePoint(parsed.codepoint);
	} catch {
		return;
	}
}
function decodePrintableKey(data) {
	return decodeKittyPrintable(data) ?? decodeModifyOtherKeysPrintable(data);
}

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/keybindings.js
const TUI_KEYBINDINGS = {
	"tui.editor.cursorUp": {
		defaultKeys: "up",
		description: "Move cursor up"
	},
	"tui.editor.cursorDown": {
		defaultKeys: "down",
		description: "Move cursor down"
	},
	"tui.editor.cursorLeft": {
		defaultKeys: ["left", "ctrl+b"],
		description: "Move cursor left"
	},
	"tui.editor.cursorRight": {
		defaultKeys: ["right", "ctrl+f"],
		description: "Move cursor right"
	},
	"tui.editor.cursorWordLeft": {
		defaultKeys: [
			"alt+left",
			"ctrl+left",
			"alt+b"
		],
		description: "Move cursor word left"
	},
	"tui.editor.cursorWordRight": {
		defaultKeys: [
			"alt+right",
			"ctrl+right",
			"alt+f"
		],
		description: "Move cursor word right"
	},
	"tui.editor.cursorLineStart": {
		defaultKeys: ["home", "ctrl+a"],
		description: "Move to line start"
	},
	"tui.editor.cursorLineEnd": {
		defaultKeys: ["end", "ctrl+e"],
		description: "Move to line end"
	},
	"tui.editor.jumpForward": {
		defaultKeys: "ctrl+]",
		description: "Jump forward to character"
	},
	"tui.editor.jumpBackward": {
		defaultKeys: "ctrl+alt+]",
		description: "Jump backward to character"
	},
	"tui.editor.pageUp": {
		defaultKeys: "pageUp",
		description: "Page up"
	},
	"tui.editor.pageDown": {
		defaultKeys: "pageDown",
		description: "Page down"
	},
	"tui.editor.deleteCharBackward": {
		defaultKeys: "backspace",
		description: "Delete character backward"
	},
	"tui.editor.deleteCharForward": {
		defaultKeys: ["delete", "ctrl+d"],
		description: "Delete character forward"
	},
	"tui.editor.deleteWordBackward": {
		defaultKeys: ["ctrl+w", "alt+backspace"],
		description: "Delete word backward"
	},
	"tui.editor.deleteWordForward": {
		defaultKeys: ["alt+d", "alt+delete"],
		description: "Delete word forward"
	},
	"tui.editor.deleteToLineStart": {
		defaultKeys: "ctrl+u",
		description: "Delete to line start"
	},
	"tui.editor.deleteToLineEnd": {
		defaultKeys: "ctrl+k",
		description: "Delete to line end"
	},
	"tui.editor.yank": {
		defaultKeys: "ctrl+y",
		description: "Yank"
	},
	"tui.editor.yankPop": {
		defaultKeys: "alt+y",
		description: "Yank pop"
	},
	"tui.editor.undo": {
		defaultKeys: "ctrl+-",
		description: "Undo"
	},
	"tui.input.newLine": {
		defaultKeys: "shift+enter",
		description: "Insert newline"
	},
	"tui.input.submit": {
		defaultKeys: "enter",
		description: "Submit input"
	},
	"tui.input.tab": {
		defaultKeys: "tab",
		description: "Tab / autocomplete"
	},
	"tui.input.copy": {
		defaultKeys: "ctrl+c",
		description: "Copy selection"
	},
	"tui.select.up": {
		defaultKeys: "up",
		description: "Move selection up"
	},
	"tui.select.down": {
		defaultKeys: "down",
		description: "Move selection down"
	},
	"tui.select.pageUp": {
		defaultKeys: "pageUp",
		description: "Selection page up"
	},
	"tui.select.pageDown": {
		defaultKeys: "pageDown",
		description: "Selection page down"
	},
	"tui.select.confirm": {
		defaultKeys: "enter",
		description: "Confirm selection"
	},
	"tui.select.cancel": {
		defaultKeys: ["escape", "ctrl+c"],
		description: "Cancel selection"
	}
};
function normalizeKeys(keys) {
	if (keys === void 0) return [];
	const keyList = Array.isArray(keys) ? keys : [keys];
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	for (const key of keyList) if (!seen.has(key)) {
		seen.add(key);
		result.push(key);
	}
	return result;
}
var KeybindingsManager = class {
	definitions;
	userBindings;
	keysById = /* @__PURE__ */ new Map();
	conflicts = [];
	constructor(definitions, userBindings = {}) {
		this.definitions = definitions;
		this.userBindings = userBindings;
		this.rebuild();
	}
	rebuild() {
		this.keysById.clear();
		this.conflicts = [];
		const userClaims = /* @__PURE__ */ new Map();
		for (const [keybinding, keys] of Object.entries(this.userBindings)) {
			if (!(keybinding in this.definitions)) continue;
			for (const key of normalizeKeys(keys)) {
				const claimants = userClaims.get(key) ?? /* @__PURE__ */ new Set();
				claimants.add(keybinding);
				userClaims.set(key, claimants);
			}
		}
		for (const [key, keybindings] of userClaims) if (keybindings.size > 1) this.conflicts.push({
			key,
			keybindings: [...keybindings]
		});
		for (const [id, definition] of Object.entries(this.definitions)) {
			const userKeys = this.userBindings[id];
			const keys = userKeys === void 0 ? normalizeKeys(definition.defaultKeys) : normalizeKeys(userKeys);
			this.keysById.set(id, keys);
		}
	}
	matches(data, keybinding) {
		const keys = this.keysById.get(keybinding) ?? [];
		for (const key of keys) if (matchesKey(data, key)) return true;
		return false;
	}
	getKeys(keybinding) {
		return [...this.keysById.get(keybinding) ?? []];
	}
	getDefinition(keybinding) {
		return this.definitions[keybinding];
	}
	getConflicts() {
		return this.conflicts.map((conflict) => ({
			...conflict,
			keybindings: [...conflict.keybindings]
		}));
	}
	setUserBindings(userBindings) {
		this.userBindings = userBindings;
		this.rebuild();
	}
	getUserBindings() {
		return { ...this.userBindings };
	}
	getResolvedBindings() {
		const resolved = {};
		for (const id of Object.keys(this.definitions)) {
			const keys = this.keysById.get(id) ?? [];
			resolved[id] = keys.length === 1 ? keys[0] : [...keys];
		}
		return resolved;
	}
};
let globalKeybindings = null;
function getKeybindings() {
	if (!globalKeybindings) globalKeybindings = new KeybindingsManager(TUI_KEYBINDINGS);
	return globalKeybindings;
}

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/text.js
/**
* Text component - displays multi-line text with word wrapping
*/
var Text = class {
	text;
	paddingX;
	paddingY;
	customBgFn;
	cachedText;
	cachedWidth;
	cachedLines;
	constructor(text = "", paddingX = 1, paddingY = 1, customBgFn) {
		this.text = text;
		this.paddingX = paddingX;
		this.paddingY = paddingY;
		this.customBgFn = customBgFn;
	}
	setText(text) {
		this.text = text;
		this.cachedText = void 0;
		this.cachedWidth = void 0;
		this.cachedLines = void 0;
	}
	setCustomBgFn(customBgFn) {
		this.customBgFn = customBgFn;
		this.cachedText = void 0;
		this.cachedWidth = void 0;
		this.cachedLines = void 0;
	}
	invalidate() {
		this.cachedText = void 0;
		this.cachedWidth = void 0;
		this.cachedLines = void 0;
	}
	render(width) {
		if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) return this.cachedLines;
		if (!this.text || this.text.trim() === "") {
			const result$1 = [];
			this.cachedText = this.text;
			this.cachedWidth = width;
			this.cachedLines = result$1;
			return result$1;
		}
		const wrappedLines = wrapTextWithAnsi(this.text.replace(/\t/g, "   "), Math.max(1, width - this.paddingX * 2));
		const leftMargin = " ".repeat(this.paddingX);
		const rightMargin = " ".repeat(this.paddingX);
		const contentLines$1 = [];
		for (const line of wrappedLines) {
			const lineWithMargins = leftMargin + line + rightMargin;
			if (this.customBgFn) contentLines$1.push(applyBackgroundToLine(lineWithMargins, width, this.customBgFn));
			else {
				const visibleLen = visibleWidth(lineWithMargins);
				const paddingNeeded = Math.max(0, width - visibleLen);
				contentLines$1.push(lineWithMargins + " ".repeat(paddingNeeded));
			}
		}
		const emptyLine = " ".repeat(width);
		const emptyLines = [];
		for (let i = 0; i < this.paddingY; i++) {
			const line = this.customBgFn ? applyBackgroundToLine(emptyLine, width, this.customBgFn) : emptyLine;
			emptyLines.push(line);
		}
		const result = [
			...emptyLines,
			...contentLines$1,
			...emptyLines
		];
		this.cachedText = this.text;
		this.cachedWidth = width;
		this.cachedLines = result;
		return result.length > 0 ? result : [""];
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/kill-ring.js
/**
* Ring buffer for Emacs-style kill/yank operations.
*
* Tracks killed (deleted) text entries. Consecutive kills can accumulate
* into a single entry. Supports yank (paste most recent) and yank-pop
* (cycle through older entries).
*/
var KillRing = class {
	ring = [];
	/**
	* Add text to the kill ring.
	*
	* @param text - The killed text to add
	* @param opts - Push options
	* @param opts.prepend - If accumulating, prepend (backward deletion) or append (forward deletion)
	* @param opts.accumulate - Merge with the most recent entry instead of creating a new one
	*/
	push(text, opts) {
		if (!text) return;
		if (opts.accumulate && this.ring.length > 0) {
			const last = this.ring.pop();
			this.ring.push(opts.prepend ? text + last : last + text);
		} else this.ring.push(text);
	}
	/** Get most recent entry without modifying the ring. */
	peek() {
		return this.ring.length > 0 ? this.ring[this.ring.length - 1] : void 0;
	}
	/** Move last entry to front (for yank-pop cycling). */
	rotate() {
		if (this.ring.length > 1) {
			const last = this.ring.pop();
			this.ring.unshift(last);
		}
	}
	get length() {
		return this.ring.length;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/terminal-image.js
let cachedCapabilities = null;
let cellDimensions = {
	widthPx: 9,
	heightPx: 18
};
function getCellDimensions() {
	return cellDimensions;
}
function setCellDimensions(dims) {
	cellDimensions = dims;
}
function detectCapabilities() {
	const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || "";
	const term = process.env.TERM?.toLowerCase() || "";
	const colorTerm = process.env.COLORTERM?.toLowerCase() || "";
	if (!!process.env.TMUX || term.startsWith("tmux") || term.startsWith("screen")) return {
		images: null,
		trueColor: colorTerm === "truecolor" || colorTerm === "24bit",
		hyperlinks: false
	};
	if (process.env.KITTY_WINDOW_ID || termProgram === "kitty") return {
		images: "kitty",
		trueColor: true,
		hyperlinks: true
	};
	if (termProgram === "ghostty" || term.includes("ghostty") || process.env.GHOSTTY_RESOURCES_DIR) return {
		images: "kitty",
		trueColor: true,
		hyperlinks: true
	};
	if (process.env.WEZTERM_PANE || termProgram === "wezterm") return {
		images: "kitty",
		trueColor: true,
		hyperlinks: true
	};
	if (process.env.ITERM_SESSION_ID || termProgram === "iterm.app") return {
		images: "iterm2",
		trueColor: true,
		hyperlinks: true
	};
	if (termProgram === "vscode") return {
		images: null,
		trueColor: true,
		hyperlinks: true
	};
	if (termProgram === "alacritty") return {
		images: null,
		trueColor: true,
		hyperlinks: true
	};
	return {
		images: null,
		trueColor: colorTerm === "truecolor" || colorTerm === "24bit",
		hyperlinks: false
	};
}
function getCapabilities() {
	if (!cachedCapabilities) cachedCapabilities = detectCapabilities();
	return cachedCapabilities;
}
const KITTY_PREFIX = "\x1B_G";
const ITERM2_PREFIX = "\x1B]1337;File=";
function isImageLine(line) {
	if (line.startsWith(KITTY_PREFIX) || line.startsWith(ITERM2_PREFIX)) return true;
	return line.includes(KITTY_PREFIX) || line.includes(ITERM2_PREFIX);
}
/**
* Generate a random image ID for Kitty graphics protocol.
* Uses random IDs to avoid collisions between different module instances
* (e.g., main app vs extensions).
*/
function allocateImageId() {
	return Math.floor(Math.random() * 4294967294) + 1;
}
function encodeKitty(base64Data, options$1 = {}) {
	const CHUNK_SIZE = 4096;
	const params = [
		"a=T",
		"f=100",
		"q=2"
	];
	if (options$1.moveCursor === false) params.push("C=1");
	if (options$1.columns) params.push(`c=${options$1.columns}`);
	if (options$1.rows) params.push(`r=${options$1.rows}`);
	if (options$1.imageId) params.push(`i=${options$1.imageId}`);
	if (base64Data.length <= CHUNK_SIZE) return `\x1b_G${params.join(",")};${base64Data}\x1b\\`;
	const chunks = [];
	let offset = 0;
	let isFirst = true;
	while (offset < base64Data.length) {
		const chunk = base64Data.slice(offset, offset + CHUNK_SIZE);
		const isLast = offset + CHUNK_SIZE >= base64Data.length;
		if (isFirst) {
			chunks.push(`\x1b_G${params.join(",")},m=1;${chunk}\x1b\\`);
			isFirst = false;
		} else if (isLast) chunks.push(`\x1b_Gm=0;${chunk}\x1b\\`);
		else chunks.push(`\x1b_Gm=1;${chunk}\x1b\\`);
		offset += CHUNK_SIZE;
	}
	return chunks.join("");
}
/**
* Delete a Kitty graphics image by ID.
* Uses uppercase 'I' to also free the image data.
*/
function deleteKittyImage(imageId) {
	return `\x1b_Ga=d,d=I,i=${imageId},q=2\x1b\\`;
}
function encodeITerm2(base64Data, options$1 = {}) {
	const params = [`inline=${options$1.inline !== false ? 1 : 0}`];
	if (options$1.width !== void 0) params.push(`width=${options$1.width}`);
	if (options$1.height !== void 0) params.push(`height=${options$1.height}`);
	if (options$1.name) {
		const nameBase64 = Buffer.from(options$1.name).toString("base64");
		params.push(`name=${nameBase64}`);
	}
	if (options$1.preserveAspectRatio === false) params.push("preserveAspectRatio=0");
	return `\x1b]1337;File=${params.join(";")}:${base64Data}\x07`;
}
function calculateImageRows(imageDimensions, targetWidthCells, cellDimensions$1 = {
	widthPx: 9,
	heightPx: 18
}) {
	const scale = targetWidthCells * cellDimensions$1.widthPx / imageDimensions.widthPx;
	const scaledHeightPx = imageDimensions.heightPx * scale;
	const rows = Math.ceil(scaledHeightPx / cellDimensions$1.heightPx);
	return Math.max(1, rows);
}
function getPngDimensions(base64Data) {
	try {
		const buffer = Buffer.from(base64Data, "base64");
		if (buffer.length < 24) return null;
		if (buffer[0] !== 137 || buffer[1] !== 80 || buffer[2] !== 78 || buffer[3] !== 71) return null;
		return {
			widthPx: buffer.readUInt32BE(16),
			heightPx: buffer.readUInt32BE(20)
		};
	} catch {
		return null;
	}
}
function getJpegDimensions(base64Data) {
	try {
		const buffer = Buffer.from(base64Data, "base64");
		if (buffer.length < 2) return null;
		if (buffer[0] !== 255 || buffer[1] !== 216) return null;
		let offset = 2;
		while (offset < buffer.length - 9) {
			if (buffer[offset] !== 255) {
				offset++;
				continue;
			}
			const marker = buffer[offset + 1];
			if (marker >= 192 && marker <= 194) {
				const height = buffer.readUInt16BE(offset + 5);
				return {
					widthPx: buffer.readUInt16BE(offset + 7),
					heightPx: height
				};
			}
			if (offset + 3 >= buffer.length) return null;
			const length = buffer.readUInt16BE(offset + 2);
			if (length < 2) return null;
			offset += 2 + length;
		}
		return null;
	} catch {
		return null;
	}
}
function getGifDimensions(base64Data) {
	try {
		const buffer = Buffer.from(base64Data, "base64");
		if (buffer.length < 10) return null;
		const sig = buffer.slice(0, 6).toString("ascii");
		if (sig !== "GIF87a" && sig !== "GIF89a") return null;
		return {
			widthPx: buffer.readUInt16LE(6),
			heightPx: buffer.readUInt16LE(8)
		};
	} catch {
		return null;
	}
}
function getWebpDimensions(base64Data) {
	try {
		const buffer = Buffer.from(base64Data, "base64");
		if (buffer.length < 30) return null;
		const riff = buffer.slice(0, 4).toString("ascii");
		const webp = buffer.slice(8, 12).toString("ascii");
		if (riff !== "RIFF" || webp !== "WEBP") return null;
		const chunk = buffer.slice(12, 16).toString("ascii");
		if (chunk === "VP8 ") {
			if (buffer.length < 30) return null;
			return {
				widthPx: buffer.readUInt16LE(26) & 16383,
				heightPx: buffer.readUInt16LE(28) & 16383
			};
		} else if (chunk === "VP8L") {
			if (buffer.length < 25) return null;
			const bits = buffer.readUInt32LE(21);
			return {
				widthPx: (bits & 16383) + 1,
				heightPx: (bits >> 14 & 16383) + 1
			};
		} else if (chunk === "VP8X") {
			if (buffer.length < 30) return null;
			return {
				widthPx: (buffer[24] | buffer[25] << 8 | buffer[26] << 16) + 1,
				heightPx: (buffer[27] | buffer[28] << 8 | buffer[29] << 16) + 1
			};
		}
		return null;
	} catch {
		return null;
	}
}
function getImageDimensions(base64Data, mimeType) {
	if (mimeType === "image/png") return getPngDimensions(base64Data);
	if (mimeType === "image/jpeg") return getJpegDimensions(base64Data);
	if (mimeType === "image/gif") return getGifDimensions(base64Data);
	if (mimeType === "image/webp") return getWebpDimensions(base64Data);
	return null;
}
function renderImage(base64Data, imageDimensions, options$1 = {}) {
	const caps = getCapabilities();
	if (!caps.images) return null;
	const maxWidth = options$1.maxWidthCells ?? 80;
	const rows = calculateImageRows(imageDimensions, maxWidth, getCellDimensions());
	if (caps.images === "kitty") return {
		sequence: encodeKitty(base64Data, {
			columns: maxWidth,
			rows,
			imageId: options$1.imageId,
			moveCursor: options$1.moveCursor
		}),
		rows,
		imageId: options$1.imageId
	};
	if (caps.images === "iterm2") return {
		sequence: encodeITerm2(base64Data, {
			width: maxWidth,
			height: "auto",
			preserveAspectRatio: options$1.preserveAspectRatio ?? true
		}),
		rows
	};
	return null;
}
/**
* Wrap text in an OSC 8 hyperlink sequence.
* The text is rendered as a clickable hyperlink in terminals that support OSC 8
* (Ghostty, Kitty, WezTerm, iTerm2, VSCode, and others).
* In terminals that do not support OSC 8, the escape sequences are ignored
* and only the plain text is displayed.
*
* @param text - The visible text to display
* @param url - The URL to link to
*/
function hyperlink(text, url) {
	return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
function imageFallback(mimeType, dimensions, filename) {
	const parts = [];
	if (filename) parts.push(filename);
	parts.push(`[${mimeType}]`);
	if (dimensions) parts.push(`${dimensions.widthPx}x${dimensions.heightPx}`);
	return `[Image: ${parts.join(" ")}]`;
}

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/tui.js
const KITTY_SEQUENCE_PREFIX = "\x1B_G";
function extractKittyImageIds(line) {
	const sequenceStart = line.indexOf(KITTY_SEQUENCE_PREFIX);
	if (sequenceStart === -1) return [];
	const paramsStart = sequenceStart + 3;
	const paramsEnd = line.indexOf(";", paramsStart);
	if (paramsEnd === -1) return [];
	const params = line.slice(paramsStart, paramsEnd);
	for (const param of params.split(",")) {
		const [key, value] = param.split("=", 2);
		if (key !== "i" || value === void 0) continue;
		const id = Number(value);
		if (Number.isInteger(id) && id > 0 && id <= 4294967295) return [id];
	}
	return [];
}
/** Type guard to check if a component implements Focusable */
function isFocusable(component) {
	return component !== null && "focused" in component;
}
/**
* Cursor position marker - APC (Application Program Command) sequence.
* This is a zero-width escape sequence that terminals ignore.
* Components emit this at the cursor position when focused.
* TUI finds and strips this marker, then positions the hardware cursor there.
*/
const CURSOR_MARKER = "\x1B_pi:c\x07";
/** Parse a SizeValue into absolute value given a reference size */
function parseSizeValue(value, referenceSize) {
	if (value === void 0) return void 0;
	if (typeof value === "number") return value;
	const match = value.match(/^(\d+(?:\.\d+)?)%$/);
	if (match) return Math.floor(referenceSize * parseFloat(match[1]) / 100);
}
function isTermuxSession() {
	return Boolean(process.env.TERMUX_VERSION);
}
/**
* Container - a component that contains other components
*/
var Container = class {
	children = [];
	addChild(component) {
		this.children.push(component);
	}
	removeChild(component) {
		const index = this.children.indexOf(component);
		if (index !== -1) this.children.splice(index, 1);
	}
	clear() {
		this.children = [];
	}
	invalidate() {
		for (const child of this.children) child.invalidate?.();
	}
	render(width) {
		const lines = [];
		for (const child of this.children) {
			const childLines = child.render(width);
			for (const line of childLines) lines.push(line);
		}
		return lines;
	}
};
/**
* TUI - Main class for managing terminal UI with differential rendering
*/
var TUI = class TUI extends Container {
	terminal;
	previousLines = [];
	previousKittyImageIds = /* @__PURE__ */ new Set();
	previousWidth = 0;
	previousHeight = 0;
	focusedComponent = null;
	inputListeners = /* @__PURE__ */ new Set();
	/** Global callback for debug key (Shift+Ctrl+D). Called before input is forwarded to focused component. */
	onDebug;
	renderRequested = false;
	renderTimer;
	lastRenderAt = 0;
	static MIN_RENDER_INTERVAL_MS = 16;
	cursorRow = 0;
	hardwareCursorRow = 0;
	showHardwareCursor = process.env.PI_HARDWARE_CURSOR === "1";
	clearOnShrink = process.env.PI_CLEAR_ON_SHRINK === "1";
	maxLinesRendered = 0;
	previousViewportTop = 0;
	fullRedrawCount = 0;
	stopped = false;
	focusOrderCounter = 0;
	overlayStack = [];
	constructor(terminal, showHardwareCursor) {
		super();
		this.terminal = terminal;
		if (showHardwareCursor !== void 0) this.showHardwareCursor = showHardwareCursor;
	}
	get fullRedraws() {
		return this.fullRedrawCount;
	}
	getShowHardwareCursor() {
		return this.showHardwareCursor;
	}
	setShowHardwareCursor(enabled) {
		if (this.showHardwareCursor === enabled) return;
		this.showHardwareCursor = enabled;
		if (!enabled) this.terminal.hideCursor();
		this.requestRender();
	}
	getClearOnShrink() {
		return this.clearOnShrink;
	}
	/**
	* Set whether to trigger full re-render when content shrinks.
	* When true (default), empty rows are cleared when content shrinks.
	* When false, empty rows remain (reduces redraws on slower terminals).
	*/
	setClearOnShrink(enabled) {
		this.clearOnShrink = enabled;
	}
	setFocus(component) {
		if (isFocusable(this.focusedComponent)) this.focusedComponent.focused = false;
		this.focusedComponent = component;
		if (isFocusable(component)) component.focused = true;
	}
	/**
	* Show an overlay component with configurable positioning and sizing.
	* Returns a handle to control the overlay's visibility.
	*/
	showOverlay(component, options$1) {
		const entry = {
			component,
			options: options$1,
			preFocus: this.focusedComponent,
			hidden: false,
			focusOrder: ++this.focusOrderCounter
		};
		this.overlayStack.push(entry);
		if (!options$1?.nonCapturing && this.isOverlayVisible(entry)) this.setFocus(component);
		this.terminal.hideCursor();
		this.requestRender();
		return {
			hide: () => {
				const index = this.overlayStack.indexOf(entry);
				if (index !== -1) {
					this.overlayStack.splice(index, 1);
					if (this.focusedComponent === component) {
						const topVisible = this.getTopmostVisibleOverlay();
						this.setFocus(topVisible?.component ?? entry.preFocus);
					}
					if (this.overlayStack.length === 0) this.terminal.hideCursor();
					this.requestRender();
				}
			},
			setHidden: (hidden) => {
				if (entry.hidden === hidden) return;
				entry.hidden = hidden;
				if (hidden) {
					if (this.focusedComponent === component) {
						const topVisible = this.getTopmostVisibleOverlay();
						this.setFocus(topVisible?.component ?? entry.preFocus);
					}
				} else if (!options$1?.nonCapturing && this.isOverlayVisible(entry)) {
					entry.focusOrder = ++this.focusOrderCounter;
					this.setFocus(component);
				}
				this.requestRender();
			},
			isHidden: () => entry.hidden,
			focus: () => {
				if (!this.overlayStack.includes(entry) || !this.isOverlayVisible(entry)) return;
				if (this.focusedComponent !== component) this.setFocus(component);
				entry.focusOrder = ++this.focusOrderCounter;
				this.requestRender();
			},
			unfocus: () => {
				if (this.focusedComponent !== component) return;
				const topVisible = this.getTopmostVisibleOverlay();
				this.setFocus(topVisible && topVisible !== entry ? topVisible.component : entry.preFocus);
				this.requestRender();
			},
			isFocused: () => this.focusedComponent === component
		};
	}
	/** Hide the topmost overlay and restore previous focus. */
	hideOverlay() {
		const overlay = this.overlayStack.pop();
		if (!overlay) return;
		if (this.focusedComponent === overlay.component) {
			const topVisible = this.getTopmostVisibleOverlay();
			this.setFocus(topVisible?.component ?? overlay.preFocus);
		}
		if (this.overlayStack.length === 0) this.terminal.hideCursor();
		this.requestRender();
	}
	/** Check if there are any visible overlays */
	hasOverlay() {
		return this.overlayStack.some((o) => this.isOverlayVisible(o));
	}
	/** Check if an overlay entry is currently visible */
	isOverlayVisible(entry) {
		if (entry.hidden) return false;
		if (entry.options?.visible) return entry.options.visible(this.terminal.columns, this.terminal.rows);
		return true;
	}
	/** Find the topmost visible capturing overlay, if any */
	getTopmostVisibleOverlay() {
		for (let i = this.overlayStack.length - 1; i >= 0; i--) {
			if (this.overlayStack[i].options?.nonCapturing) continue;
			if (this.isOverlayVisible(this.overlayStack[i])) return this.overlayStack[i];
		}
	}
	invalidate() {
		super.invalidate();
		for (const overlay of this.overlayStack) overlay.component.invalidate?.();
	}
	start() {
		this.stopped = false;
		this.terminal.start((data) => this.handleInput(data), () => this.requestRender());
		this.terminal.hideCursor();
		this.queryCellSize();
		this.requestRender();
	}
	addInputListener(listener) {
		this.inputListeners.add(listener);
		return () => {
			this.inputListeners.delete(listener);
		};
	}
	removeInputListener(listener) {
		this.inputListeners.delete(listener);
	}
	queryCellSize() {
		if (!getCapabilities().images) return;
		this.terminal.write("\x1B[16t");
	}
	stop() {
		this.stopped = true;
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = void 0;
		}
		if (this.previousLines.length > 0) {
			const lineDiff = this.previousLines.length - this.hardwareCursorRow;
			if (lineDiff > 0) this.terminal.write(`\x1b[${lineDiff}B`);
			else if (lineDiff < 0) this.terminal.write(`\x1b[${-lineDiff}A`);
			this.terminal.write("\r\n");
		}
		this.terminal.showCursor();
		this.terminal.stop();
	}
	requestRender(force = false) {
		if (force) {
			this.previousLines = [];
			this.previousWidth = -1;
			this.previousHeight = -1;
			this.cursorRow = 0;
			this.hardwareCursorRow = 0;
			this.maxLinesRendered = 0;
			this.previousViewportTop = 0;
			if (this.renderTimer) {
				clearTimeout(this.renderTimer);
				this.renderTimer = void 0;
			}
			this.renderRequested = true;
			process.nextTick(() => {
				if (this.stopped || !this.renderRequested) return;
				this.renderRequested = false;
				this.lastRenderAt = performance.now();
				this.doRender();
			});
			return;
		}
		if (this.renderRequested) return;
		this.renderRequested = true;
		process.nextTick(() => this.scheduleRender());
	}
	scheduleRender() {
		if (this.stopped || this.renderTimer || !this.renderRequested) return;
		const elapsed = performance.now() - this.lastRenderAt;
		const delay = Math.max(0, TUI.MIN_RENDER_INTERVAL_MS - elapsed);
		this.renderTimer = setTimeout(() => {
			this.renderTimer = void 0;
			if (this.stopped || !this.renderRequested) return;
			this.renderRequested = false;
			this.lastRenderAt = performance.now();
			this.doRender();
			if (this.renderRequested) this.scheduleRender();
		}, delay);
	}
	handleInput(data) {
		if (this.inputListeners.size > 0) {
			let current = data;
			for (const listener of this.inputListeners) {
				const result = listener(current);
				if (result?.consume) return;
				if (result?.data !== void 0) current = result.data;
			}
			if (current.length === 0) return;
			data = current;
		}
		if (this.consumeCellSizeResponse(data)) return;
		if (matchesKey(data, "shift+ctrl+d") && this.onDebug) {
			this.onDebug();
			return;
		}
		const focusedOverlay = this.overlayStack.find((o) => o.component === this.focusedComponent);
		if (focusedOverlay && !this.isOverlayVisible(focusedOverlay)) {
			const topVisible = this.getTopmostVisibleOverlay();
			if (topVisible) this.setFocus(topVisible.component);
			else this.setFocus(focusedOverlay.preFocus);
		}
		if (this.focusedComponent?.handleInput) {
			if (isKeyRelease(data) && !this.focusedComponent.wantsKeyRelease) return;
			this.focusedComponent.handleInput(data);
			this.requestRender();
		}
	}
	consumeCellSizeResponse(data) {
		const match = data.match(/^\x1b\[6;(\d+);(\d+)t$/);
		if (!match) return false;
		const heightPx = parseInt(match[1], 10);
		const widthPx = parseInt(match[2], 10);
		if (heightPx <= 0 || widthPx <= 0) return true;
		setCellDimensions({
			widthPx,
			heightPx
		});
		this.invalidate();
		this.requestRender();
		return true;
	}
	/**
	* Resolve overlay layout from options.
	* Returns { width, row, col, maxHeight } for rendering.
	*/
	resolveOverlayLayout(options$1, overlayHeight, termWidth, termHeight) {
		const opt = options$1 ?? {};
		const margin = typeof opt.margin === "number" ? {
			top: opt.margin,
			right: opt.margin,
			bottom: opt.margin,
			left: opt.margin
		} : opt.margin ?? {};
		const marginTop = Math.max(0, margin.top ?? 0);
		const marginRight = Math.max(0, margin.right ?? 0);
		const marginBottom = Math.max(0, margin.bottom ?? 0);
		const marginLeft = Math.max(0, margin.left ?? 0);
		const availWidth = Math.max(1, termWidth - marginLeft - marginRight);
		const availHeight = Math.max(1, termHeight - marginTop - marginBottom);
		let width = parseSizeValue(opt.width, termWidth) ?? Math.min(80, availWidth);
		if (opt.minWidth !== void 0) width = Math.max(width, opt.minWidth);
		width = Math.max(1, Math.min(width, availWidth));
		let maxHeight = parseSizeValue(opt.maxHeight, termHeight);
		if (maxHeight !== void 0) maxHeight = Math.max(1, Math.min(maxHeight, availHeight));
		const effectiveHeight = maxHeight !== void 0 ? Math.min(overlayHeight, maxHeight) : overlayHeight;
		let row;
		let col;
		if (opt.row !== void 0) if (typeof opt.row === "string") {
			const match = opt.row.match(/^(\d+(?:\.\d+)?)%$/);
			if (match) {
				const maxRow = Math.max(0, availHeight - effectiveHeight);
				const percent = parseFloat(match[1]) / 100;
				row = marginTop + Math.floor(maxRow * percent);
			} else row = this.resolveAnchorRow("center", effectiveHeight, availHeight, marginTop);
		} else row = opt.row;
		else {
			const anchor = opt.anchor ?? "center";
			row = this.resolveAnchorRow(anchor, effectiveHeight, availHeight, marginTop);
		}
		if (opt.col !== void 0) if (typeof opt.col === "string") {
			const match = opt.col.match(/^(\d+(?:\.\d+)?)%$/);
			if (match) {
				const maxCol = Math.max(0, availWidth - width);
				const percent = parseFloat(match[1]) / 100;
				col = marginLeft + Math.floor(maxCol * percent);
			} else col = this.resolveAnchorCol("center", width, availWidth, marginLeft);
		} else col = opt.col;
		else {
			const anchor = opt.anchor ?? "center";
			col = this.resolveAnchorCol(anchor, width, availWidth, marginLeft);
		}
		if (opt.offsetY !== void 0) row += opt.offsetY;
		if (opt.offsetX !== void 0) col += opt.offsetX;
		row = Math.max(marginTop, Math.min(row, termHeight - marginBottom - effectiveHeight));
		col = Math.max(marginLeft, Math.min(col, termWidth - marginRight - width));
		return {
			width,
			row,
			col,
			maxHeight
		};
	}
	resolveAnchorRow(anchor, height, availHeight, marginTop) {
		switch (anchor) {
			case "top-left":
			case "top-center":
			case "top-right": return marginTop;
			case "bottom-left":
			case "bottom-center":
			case "bottom-right": return marginTop + availHeight - height;
			case "left-center":
			case "center":
			case "right-center": return marginTop + Math.floor((availHeight - height) / 2);
		}
	}
	resolveAnchorCol(anchor, width, availWidth, marginLeft) {
		switch (anchor) {
			case "top-left":
			case "left-center":
			case "bottom-left": return marginLeft;
			case "top-right":
			case "right-center":
			case "bottom-right": return marginLeft + availWidth - width;
			case "top-center":
			case "center":
			case "bottom-center": return marginLeft + Math.floor((availWidth - width) / 2);
		}
	}
	/** Composite all overlays into content lines (sorted by focusOrder, higher = on top). */
	compositeOverlays(lines, termWidth, termHeight) {
		if (this.overlayStack.length === 0) return lines;
		const result = [...lines];
		const rendered = [];
		let minLinesNeeded = result.length;
		const visibleEntries = this.overlayStack.filter((e) => this.isOverlayVisible(e));
		visibleEntries.sort((a, b) => a.focusOrder - b.focusOrder);
		for (const entry of visibleEntries) {
			const { component, options: options$1 } = entry;
			const { width, maxHeight } = this.resolveOverlayLayout(options$1, 0, termWidth, termHeight);
			let overlayLines = component.render(width);
			if (maxHeight !== void 0 && overlayLines.length > maxHeight) overlayLines = overlayLines.slice(0, maxHeight);
			const { row, col } = this.resolveOverlayLayout(options$1, overlayLines.length, termWidth, termHeight);
			rendered.push({
				overlayLines,
				row,
				col,
				w: width
			});
			minLinesNeeded = Math.max(minLinesNeeded, row + overlayLines.length);
		}
		const workingHeight = Math.max(result.length, termHeight, minLinesNeeded);
		while (result.length < workingHeight) result.push("");
		const viewportStart = Math.max(0, workingHeight - termHeight);
		for (const { overlayLines, row, col, w } of rendered) for (let i = 0; i < overlayLines.length; i++) {
			const idx = viewportStart + row + i;
			if (idx >= 0 && idx < result.length) {
				const truncatedOverlayLine = visibleWidth(overlayLines[i]) > w ? sliceByColumn(overlayLines[i], 0, w, true) : overlayLines[i];
				result[idx] = this.compositeLineAt(result[idx], truncatedOverlayLine, col, w, termWidth);
			}
		}
		return result;
	}
	static SEGMENT_RESET = "\x1B[0m\x1B]8;;\x07";
	applyLineResets(lines) {
		const reset = TUI.SEGMENT_RESET;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!isImageLine(line)) lines[i] = normalizeTerminalOutput(line) + reset;
		}
		return lines;
	}
	collectKittyImageIds(lines) {
		const ids = /* @__PURE__ */ new Set();
		for (const line of lines) for (const id of extractKittyImageIds(line)) ids.add(id);
		return ids;
	}
	deleteKittyImages(ids) {
		let buffer = "";
		for (const id of ids) buffer += deleteKittyImage(id);
		return buffer;
	}
	expandLastChangedForKittyImages(firstChanged, lastChanged) {
		let expandedLastChanged = lastChanged;
		for (let i = firstChanged; i < this.previousLines.length; i++) if (extractKittyImageIds(this.previousLines[i]).length > 0) expandedLastChanged = Math.max(expandedLastChanged, i);
		return expandedLastChanged;
	}
	deleteChangedKittyImages(firstChanged, lastChanged) {
		if (firstChanged < 0 || lastChanged < firstChanged) return "";
		const ids = /* @__PURE__ */ new Set();
		const maxLine = Math.min(lastChanged, this.previousLines.length - 1);
		for (let i = firstChanged; i <= maxLine; i++) for (const id of extractKittyImageIds(this.previousLines[i] ?? "")) ids.add(id);
		return this.deleteKittyImages(ids);
	}
	/** Splice overlay content into a base line at a specific column. Single-pass optimized. */
	compositeLineAt(baseLine, overlayLine, startCol, overlayWidth, totalWidth) {
		if (isImageLine(baseLine)) return baseLine;
		const afterStart = startCol + overlayWidth;
		const base = extractSegments(baseLine, startCol, afterStart, totalWidth - afterStart, true);
		const overlay = sliceWithWidth(overlayLine, 0, overlayWidth, true);
		const beforePad = Math.max(0, startCol - base.beforeWidth);
		const overlayPad = Math.max(0, overlayWidth - overlay.width);
		const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
		const actualOverlayWidth = Math.max(overlayWidth, overlay.width);
		const afterTarget = Math.max(0, totalWidth - actualBeforeWidth - actualOverlayWidth);
		const afterPad = Math.max(0, afterTarget - base.afterWidth);
		const r = TUI.SEGMENT_RESET;
		const result = base.before + " ".repeat(beforePad) + r + overlay.text + " ".repeat(overlayPad) + r + base.after + " ".repeat(afterPad);
		if (visibleWidth(result) <= totalWidth) return result;
		return sliceByColumn(result, 0, totalWidth, true);
	}
	/**
	* Find and extract cursor position from rendered lines.
	* Searches for CURSOR_MARKER, calculates its position, and strips it from the output.
	* Only scans the bottom terminal height lines (visible viewport).
	* @param lines - Rendered lines to search
	* @param height - Terminal height (visible viewport size)
	* @returns Cursor position { row, col } or null if no marker found
	*/
	extractCursorPosition(lines, height) {
		const viewportTop = Math.max(0, lines.length - height);
		for (let row = lines.length - 1; row >= viewportTop; row--) {
			const line = lines[row];
			const markerIndex = line.indexOf(CURSOR_MARKER);
			if (markerIndex !== -1) {
				const col = visibleWidth(line.slice(0, markerIndex));
				lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + 7);
				return {
					row,
					col
				};
			}
		}
		return null;
	}
	doRender() {
		if (this.stopped) return;
		const width = this.terminal.columns;
		const height = this.terminal.rows;
		const widthChanged = this.previousWidth !== 0 && this.previousWidth !== width;
		const heightChanged = this.previousHeight !== 0 && this.previousHeight !== height;
		const previousBufferLength = this.previousHeight > 0 ? this.previousViewportTop + this.previousHeight : height;
		let prevViewportTop = heightChanged ? Math.max(0, previousBufferLength - height) : this.previousViewportTop;
		let viewportTop = prevViewportTop;
		let hardwareCursorRow = this.hardwareCursorRow;
		const computeLineDiff = (targetRow) => {
			const currentScreenRow = hardwareCursorRow - prevViewportTop;
			return targetRow - viewportTop - currentScreenRow;
		};
		let newLines = this.render(width);
		if (this.overlayStack.length > 0) newLines = this.compositeOverlays(newLines, width, height);
		const cursorPos = this.extractCursorPosition(newLines, height);
		newLines = this.applyLineResets(newLines);
		const fullRender = (clear) => {
			this.fullRedrawCount += 1;
			let buffer$1 = "\x1B[?2026h";
			if (clear) {
				buffer$1 += this.deleteKittyImages(this.previousKittyImageIds);
				buffer$1 += "\x1B[2J\x1B[H\x1B[3J";
			}
			for (let i = 0; i < newLines.length; i++) {
				if (i > 0) buffer$1 += "\r\n";
				buffer$1 += newLines[i];
			}
			buffer$1 += "\x1B[?2026l";
			this.terminal.write(buffer$1);
			this.cursorRow = Math.max(0, newLines.length - 1);
			this.hardwareCursorRow = this.cursorRow;
			if (clear) this.maxLinesRendered = newLines.length;
			else this.maxLinesRendered = Math.max(this.maxLinesRendered, newLines.length);
			const bufferLength = Math.max(height, newLines.length);
			this.previousViewportTop = Math.max(0, bufferLength - height);
			this.positionHardwareCursor(cursorPos, newLines.length);
			this.previousLines = newLines;
			this.previousKittyImageIds = this.collectKittyImageIds(newLines);
			this.previousWidth = width;
			this.previousHeight = height;
		};
		const debugRedraw = process.env.PI_DEBUG_REDRAW === "1";
		const logRedraw = (reason) => {
			if (!debugRedraw) return;
			const logPath = path.join(os.homedir(), ".pi", "agent", "pi-debug.log");
			const msg = `[${(/* @__PURE__ */ new Date()).toISOString()}] fullRender: ${reason} (prev=${this.previousLines.length}, new=${newLines.length}, height=${height})\n`;
			fs.appendFileSync(logPath, msg);
		};
		if (this.previousLines.length === 0 && !widthChanged && !heightChanged) {
			logRedraw("first render");
			fullRender(false);
			return;
		}
		if (widthChanged) {
			logRedraw(`terminal width changed (${this.previousWidth} -> ${width})`);
			fullRender(true);
			return;
		}
		if (heightChanged && !isTermuxSession()) {
			logRedraw(`terminal height changed (${this.previousHeight} -> ${height})`);
			fullRender(true);
			return;
		}
		if (this.clearOnShrink && newLines.length < this.maxLinesRendered && this.overlayStack.length === 0) {
			logRedraw(`clearOnShrink (maxLinesRendered=${this.maxLinesRendered})`);
			fullRender(true);
			return;
		}
		let firstChanged = -1;
		let lastChanged = -1;
		const maxLines = Math.max(newLines.length, this.previousLines.length);
		for (let i = 0; i < maxLines; i++) if ((i < this.previousLines.length ? this.previousLines[i] : "") !== (i < newLines.length ? newLines[i] : "")) {
			if (firstChanged === -1) firstChanged = i;
			lastChanged = i;
		}
		const appendedLines = newLines.length > this.previousLines.length;
		if (appendedLines) {
			if (firstChanged === -1) firstChanged = this.previousLines.length;
			lastChanged = newLines.length - 1;
		}
		if (firstChanged !== -1) lastChanged = this.expandLastChangedForKittyImages(firstChanged, lastChanged);
		const appendStart = appendedLines && firstChanged === this.previousLines.length && firstChanged > 0;
		if (firstChanged === -1) {
			this.positionHardwareCursor(cursorPos, newLines.length);
			this.previousViewportTop = prevViewportTop;
			this.previousHeight = height;
			return;
		}
		if (firstChanged >= newLines.length) {
			if (this.previousLines.length > newLines.length) {
				let buffer$1 = "\x1B[?2026h";
				buffer$1 += this.deleteChangedKittyImages(firstChanged, lastChanged);
				const targetRow = Math.max(0, newLines.length - 1);
				if (targetRow < prevViewportTop) {
					logRedraw(`deleted lines moved viewport up (${targetRow} < ${prevViewportTop})`);
					fullRender(true);
					return;
				}
				const lineDiff$1 = computeLineDiff(targetRow);
				if (lineDiff$1 > 0) buffer$1 += `\x1b[${lineDiff$1}B`;
				else if (lineDiff$1 < 0) buffer$1 += `\x1b[${-lineDiff$1}A`;
				buffer$1 += "\r";
				const extraLines = this.previousLines.length - newLines.length;
				if (extraLines > height) {
					logRedraw(`extraLines > height (${extraLines} > ${height})`);
					fullRender(true);
					return;
				}
				if (extraLines > 0) buffer$1 += "\x1B[1B";
				for (let i = 0; i < extraLines; i++) {
					buffer$1 += "\r\x1B[2K";
					if (i < extraLines - 1) buffer$1 += "\x1B[1B";
				}
				if (extraLines > 0) buffer$1 += `\x1b[${extraLines}A`;
				buffer$1 += "\x1B[?2026l";
				this.terminal.write(buffer$1);
				this.cursorRow = targetRow;
				this.hardwareCursorRow = targetRow;
			}
			this.positionHardwareCursor(cursorPos, newLines.length);
			this.previousLines = newLines;
			this.previousKittyImageIds = this.collectKittyImageIds(newLines);
			this.previousWidth = width;
			this.previousHeight = height;
			this.previousViewportTop = prevViewportTop;
			return;
		}
		if (firstChanged < prevViewportTop) {
			logRedraw(`firstChanged < viewportTop (${firstChanged} < ${prevViewportTop})`);
			fullRender(true);
			return;
		}
		let buffer = "\x1B[?2026h";
		buffer += this.deleteChangedKittyImages(firstChanged, lastChanged);
		const prevViewportBottom = prevViewportTop + height - 1;
		const moveTargetRow = appendStart ? firstChanged - 1 : firstChanged;
		if (moveTargetRow > prevViewportBottom) {
			const currentScreenRow = Math.max(0, Math.min(height - 1, hardwareCursorRow - prevViewportTop));
			const moveToBottom = height - 1 - currentScreenRow;
			if (moveToBottom > 0) buffer += `\x1b[${moveToBottom}B`;
			const scroll = moveTargetRow - prevViewportBottom;
			buffer += "\r\n".repeat(scroll);
			prevViewportTop += scroll;
			viewportTop += scroll;
			hardwareCursorRow = moveTargetRow;
		}
		const lineDiff = computeLineDiff(moveTargetRow);
		if (lineDiff > 0) buffer += `\x1b[${lineDiff}B`;
		else if (lineDiff < 0) buffer += `\x1b[${-lineDiff}A`;
		buffer += appendStart ? "\r\n" : "\r";
		const renderEnd = Math.min(lastChanged, newLines.length - 1);
		for (let i = firstChanged; i <= renderEnd; i++) {
			if (i > firstChanged) buffer += "\r\n";
			buffer += "\x1B[2K";
			const line = newLines[i];
			if (!isImageLine(line) && visibleWidth(line) > width) {
				const crashLogPath = path.join(os.homedir(), ".pi", "agent", "pi-crash.log");
				const crashData = [
					`Crash at ${(/* @__PURE__ */ new Date()).toISOString()}`,
					`Terminal width: ${width}`,
					`Line ${i} visible width: ${visibleWidth(line)}`,
					"",
					"=== All rendered lines ===",
					...newLines.map((l, idx) => `[${idx}] (w=${visibleWidth(l)}) ${l}`),
					""
				].join("\n");
				fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
				fs.writeFileSync(crashLogPath, crashData);
				this.stop();
				const errorMsg = [
					`Rendered line ${i} exceeds terminal width (${visibleWidth(line)} > ${width}).`,
					"",
					"This is likely caused by a custom TUI component not truncating its output.",
					"Use visibleWidth() to measure and truncateToWidth() to truncate lines.",
					"",
					`Debug log written to: ${crashLogPath}`
				].join("\n");
				throw new Error(errorMsg);
			}
			buffer += line;
		}
		let finalCursorRow = renderEnd;
		if (this.previousLines.length > newLines.length) {
			if (renderEnd < newLines.length - 1) {
				const moveDown = newLines.length - 1 - renderEnd;
				buffer += `\x1b[${moveDown}B`;
				finalCursorRow = newLines.length - 1;
			}
			const extraLines = this.previousLines.length - newLines.length;
			for (let i = newLines.length; i < this.previousLines.length; i++) buffer += "\r\n\x1B[2K";
			buffer += `\x1b[${extraLines}A`;
		}
		buffer += "\x1B[?2026l";
		if (process.env.PI_TUI_DEBUG === "1") {
			const debugDir = "/tmp/tui";
			fs.mkdirSync(debugDir, { recursive: true });
			const debugPath = path.join(debugDir, `render-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
			const debugData = [
				`firstChanged: ${firstChanged}`,
				`viewportTop: ${viewportTop}`,
				`cursorRow: ${this.cursorRow}`,
				`height: ${height}`,
				`lineDiff: ${lineDiff}`,
				`hardwareCursorRow: ${hardwareCursorRow}`,
				`renderEnd: ${renderEnd}`,
				`finalCursorRow: ${finalCursorRow}`,
				`cursorPos: ${JSON.stringify(cursorPos)}`,
				`newLines.length: ${newLines.length}`,
				`previousLines.length: ${this.previousLines.length}`,
				"",
				"=== newLines ===",
				JSON.stringify(newLines, null, 2),
				"",
				"=== previousLines ===",
				JSON.stringify(this.previousLines, null, 2),
				"",
				"=== buffer ===",
				JSON.stringify(buffer)
			].join("\n");
			fs.writeFileSync(debugPath, debugData);
		}
		this.terminal.write(buffer);
		this.cursorRow = Math.max(0, newLines.length - 1);
		this.hardwareCursorRow = finalCursorRow;
		this.maxLinesRendered = Math.max(this.maxLinesRendered, newLines.length);
		this.previousViewportTop = Math.max(prevViewportTop, finalCursorRow - height + 1);
		this.positionHardwareCursor(cursorPos, newLines.length);
		this.previousLines = newLines;
		this.previousKittyImageIds = this.collectKittyImageIds(newLines);
		this.previousWidth = width;
		this.previousHeight = height;
	}
	/**
	* Position the hardware cursor for IME candidate window.
	* @param cursorPos The cursor position extracted from rendered output, or null
	* @param totalLines Total number of rendered lines
	*/
	positionHardwareCursor(cursorPos, totalLines) {
		if (!cursorPos || totalLines <= 0) {
			this.terminal.hideCursor();
			return;
		}
		const targetRow = Math.max(0, Math.min(cursorPos.row, totalLines - 1));
		const targetCol = Math.max(0, cursorPos.col);
		const rowDelta = targetRow - this.hardwareCursorRow;
		let buffer = "";
		if (rowDelta > 0) buffer += `\x1b[${rowDelta}B`;
		else if (rowDelta < 0) buffer += `\x1b[${-rowDelta}A`;
		buffer += `\x1b[${targetCol + 1}G`;
		if (buffer) this.terminal.write(buffer);
		this.hardwareCursorRow = targetRow;
		if (this.showHardwareCursor) this.terminal.showCursor();
		else this.terminal.hideCursor();
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/undo-stack.js
/**
* Generic undo stack with clone-on-push semantics.
*
* Stores deep clones of state snapshots. Popped snapshots are returned
* directly (no re-cloning) since they are already detached.
*/
var UndoStack = class {
	stack = [];
	/** Push a deep clone of the given state onto the stack. */
	push(state) {
		this.stack.push(structuredClone(state));
	}
	/** Pop and return the most recent snapshot, or undefined if empty. */
	pop() {
		return this.stack.pop();
	}
	/** Remove all snapshots. */
	clear() {
		this.stack.length = 0;
	}
	get length() {
		return this.stack.length;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/select-list.js
const DEFAULT_PRIMARY_COLUMN_WIDTH = 32;
const PRIMARY_COLUMN_GAP = 2;
const MIN_DESCRIPTION_WIDTH = 10;
const normalizeToSingleLine = (text) => text.replace(/[\r\n]+/g, " ").trim();
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
var SelectList = class {
	items = [];
	filteredItems = [];
	selectedIndex = 0;
	maxVisible = 5;
	theme;
	layout;
	onSelect;
	onCancel;
	onSelectionChange;
	constructor(items, maxVisible, theme, layout = {}) {
		this.items = items;
		this.filteredItems = items;
		this.maxVisible = maxVisible;
		this.theme = theme;
		this.layout = layout;
	}
	setFilter(filter) {
		this.filteredItems = this.items.filter((item) => item.value.toLowerCase().startsWith(filter.toLowerCase()));
		this.selectedIndex = 0;
	}
	setSelectedIndex(index) {
		this.selectedIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
	}
	invalidate() {}
	render(width) {
		const lines = [];
		if (this.filteredItems.length === 0) {
			lines.push(this.theme.noMatch("  No matching commands"));
			return lines;
		}
		const primaryColumnWidth = this.getPrimaryColumnWidth();
		const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible));
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);
		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i];
			if (!item) continue;
			const isSelected = i === this.selectedIndex;
			const descriptionSingleLine = item.description ? normalizeToSingleLine(item.description) : void 0;
			lines.push(this.renderItem(item, isSelected, width, descriptionSingleLine, primaryColumnWidth));
		}
		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			const scrollText = `  (${this.selectedIndex + 1}/${this.filteredItems.length})`;
			lines.push(this.theme.scrollInfo(truncateToWidth(scrollText, width - 2, "")));
		}
		return lines;
	}
	handleInput(keyData) {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up")) {
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
			this.notifySelectionChange();
		} else if (kb.matches(keyData, "tui.select.down")) {
			this.selectedIndex = this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1;
			this.notifySelectionChange();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const selectedItem = this.filteredItems[this.selectedIndex];
			if (selectedItem && this.onSelect) this.onSelect(selectedItem);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			if (this.onCancel) this.onCancel();
		}
	}
	renderItem(item, isSelected, width, descriptionSingleLine, primaryColumnWidth) {
		const prefix = isSelected ? "→ " : "  ";
		const prefixWidth = visibleWidth(prefix);
		if (descriptionSingleLine && width > 40) {
			const effectivePrimaryColumnWidth = Math.max(1, Math.min(primaryColumnWidth, width - prefixWidth - 4));
			const maxPrimaryWidth = Math.max(1, effectivePrimaryColumnWidth - PRIMARY_COLUMN_GAP);
			const truncatedValue$1 = this.truncatePrimary(item, isSelected, maxPrimaryWidth, effectivePrimaryColumnWidth);
			const truncatedValueWidth = visibleWidth(truncatedValue$1);
			const spacing = " ".repeat(Math.max(1, effectivePrimaryColumnWidth - truncatedValueWidth));
			const remainingWidth = width - (prefixWidth + truncatedValueWidth + spacing.length) - 2;
			if (remainingWidth > MIN_DESCRIPTION_WIDTH) {
				const truncatedDesc = truncateToWidth(descriptionSingleLine, remainingWidth, "");
				if (isSelected) return this.theme.selectedText(`${prefix}${truncatedValue$1}${spacing}${truncatedDesc}`);
				const descText = this.theme.description(spacing + truncatedDesc);
				return prefix + truncatedValue$1 + descText;
			}
		}
		const maxWidth = width - prefixWidth - 2;
		const truncatedValue = this.truncatePrimary(item, isSelected, maxWidth, maxWidth);
		if (isSelected) return this.theme.selectedText(`${prefix}${truncatedValue}`);
		return prefix + truncatedValue;
	}
	getPrimaryColumnWidth() {
		const { min, max } = this.getPrimaryColumnBounds();
		return clamp(this.filteredItems.reduce((widest, item) => {
			return Math.max(widest, visibleWidth(this.getDisplayValue(item)) + PRIMARY_COLUMN_GAP);
		}, 0), min, max);
	}
	getPrimaryColumnBounds() {
		const rawMin = this.layout.minPrimaryColumnWidth ?? this.layout.maxPrimaryColumnWidth ?? DEFAULT_PRIMARY_COLUMN_WIDTH;
		const rawMax = this.layout.maxPrimaryColumnWidth ?? this.layout.minPrimaryColumnWidth ?? DEFAULT_PRIMARY_COLUMN_WIDTH;
		return {
			min: Math.max(1, Math.min(rawMin, rawMax)),
			max: Math.max(1, Math.max(rawMin, rawMax))
		};
	}
	truncatePrimary(item, isSelected, maxWidth, columnWidth) {
		const displayValue = this.getDisplayValue(item);
		return truncateToWidth(this.layout.truncatePrimary ? this.layout.truncatePrimary({
			text: displayValue,
			maxWidth,
			columnWidth,
			item,
			isSelected
		}) : truncateToWidth(displayValue, maxWidth, ""), maxWidth, "");
	}
	getDisplayValue(item) {
		return item.label || item.value;
	}
	notifySelectionChange() {
		const selectedItem = this.filteredItems[this.selectedIndex];
		if (selectedItem && this.onSelectionChange) this.onSelectionChange(selectedItem);
	}
	getSelectedItem() {
		return this.filteredItems[this.selectedIndex] || null;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/editor.js
const baseSegmenter = getSegmenter();
/** Regex matching paste markers like `[paste #1 +123 lines]` or `[paste #2 1234 chars]`. */
const PASTE_MARKER_REGEX = /\[paste #(\d+)( (\+\d+ lines|\d+ chars))?\]/g;
/** Non-global version for single-segment testing. */
const PASTE_MARKER_SINGLE = /^\[paste #(\d+)( (\+\d+ lines|\d+ chars))?\]$/;
/** Check if a segment is a paste marker (i.e. was merged by segmentWithMarkers). */
function isPasteMarker(segment) {
	return segment.length >= 10 && PASTE_MARKER_SINGLE.test(segment);
}
/**
* A segmenter that wraps Intl.Segmenter and merges graphemes that fall
* within paste markers into single atomic segments.  This makes cursor
* movement, deletion, word-wrap, etc. treat paste markers as single units.
*
* Only markers whose numeric ID exists in `validIds` are merged.
*/
function segmentWithMarkers(text, validIds) {
	if (validIds.size === 0 || !text.includes("[paste #")) return baseSegmenter.segment(text);
	const markers = [];
	for (const m of text.matchAll(PASTE_MARKER_REGEX)) {
		const id = Number.parseInt(m[1], 10);
		if (!validIds.has(id)) continue;
		markers.push({
			start: m.index,
			end: m.index + m[0].length
		});
	}
	if (markers.length === 0) return baseSegmenter.segment(text);
	const baseSegments = baseSegmenter.segment(text);
	const result = [];
	let markerIdx = 0;
	for (const seg of baseSegments) {
		while (markerIdx < markers.length && markers[markerIdx].end <= seg.index) markerIdx++;
		const marker = markerIdx < markers.length ? markers[markerIdx] : null;
		if (marker && seg.index >= marker.start && seg.index < marker.end) {
			if (seg.index === marker.start) {
				const markerText = text.slice(marker.start, marker.end);
				result.push({
					segment: markerText,
					index: marker.start,
					input: text
				});
			}
		} else result.push(seg);
	}
	return result;
}
/**
* Split a line into word-wrapped chunks.
* Wraps at word boundaries when possible, falling back to character-level
* wrapping for words longer than the available width.
*
* @param line - The text line to wrap
* @param maxWidth - Maximum visible width per chunk
* @param preSegmented - Optional pre-segmented graphemes (e.g. with paste-marker awareness).
*                       When omitted the default Intl.Segmenter is used.
* @returns Array of chunks with text and position information
*/
function wordWrapLine(line, maxWidth, preSegmented) {
	if (!line || maxWidth <= 0) return [{
		text: "",
		startIndex: 0,
		endIndex: 0
	}];
	if (visibleWidth(line) <= maxWidth) return [{
		text: line,
		startIndex: 0,
		endIndex: line.length
	}];
	const chunks = [];
	const segments = preSegmented ?? [...baseSegmenter.segment(line)];
	let currentWidth = 0;
	let chunkStart = 0;
	let wrapOppIndex = -1;
	let wrapOppWidth = 0;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const grapheme = seg.segment;
		const gWidth = visibleWidth(grapheme);
		const charIndex = seg.index;
		const isWs = !isPasteMarker(grapheme) && isWhitespaceChar(grapheme);
		if (currentWidth + gWidth > maxWidth) {
			if (wrapOppIndex >= 0 && currentWidth - wrapOppWidth + gWidth <= maxWidth) {
				chunks.push({
					text: line.slice(chunkStart, wrapOppIndex),
					startIndex: chunkStart,
					endIndex: wrapOppIndex
				});
				chunkStart = wrapOppIndex;
				currentWidth -= wrapOppWidth;
			} else if (chunkStart < charIndex) {
				chunks.push({
					text: line.slice(chunkStart, charIndex),
					startIndex: chunkStart,
					endIndex: charIndex
				});
				chunkStart = charIndex;
				currentWidth = 0;
			}
			wrapOppIndex = -1;
		}
		if (gWidth > maxWidth) {
			const subChunks = wordWrapLine(grapheme, maxWidth);
			for (let j = 0; j < subChunks.length - 1; j++) {
				const sc = subChunks[j];
				chunks.push({
					text: sc.text,
					startIndex: charIndex + sc.startIndex,
					endIndex: charIndex + sc.endIndex
				});
			}
			const last = subChunks[subChunks.length - 1];
			chunkStart = charIndex + last.startIndex;
			currentWidth = visibleWidth(last.text);
			wrapOppIndex = -1;
			continue;
		}
		currentWidth += gWidth;
		const next = segments[i + 1];
		if (isWs && next && (isPasteMarker(next.segment) || !isWhitespaceChar(next.segment))) {
			wrapOppIndex = next.index;
			wrapOppWidth = currentWidth;
		}
	}
	chunks.push({
		text: line.slice(chunkStart),
		startIndex: chunkStart,
		endIndex: line.length
	});
	return chunks;
}
const SLASH_COMMAND_SELECT_LIST_LAYOUT = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32
};
const ATTACHMENT_AUTOCOMPLETE_DEBOUNCE_MS = 20;
var Editor = class {
	state = {
		lines: [""],
		cursorLine: 0,
		cursorCol: 0
	};
	/** Focusable interface - set by TUI when focus changes */
	focused = false;
	tui;
	theme;
	paddingX = 0;
	lastWidth = 80;
	scrollOffset = 0;
	borderColor;
	autocompleteProvider;
	autocompleteList;
	autocompleteState = null;
	autocompletePrefix = "";
	autocompleteMaxVisible = 5;
	autocompleteAbort;
	autocompleteDebounceTimer;
	autocompleteRequestTask = Promise.resolve();
	autocompleteStartToken = 0;
	autocompleteRequestId = 0;
	pastes = /* @__PURE__ */ new Map();
	pasteCounter = 0;
	pasteBuffer = "";
	isInPaste = false;
	history = [];
	historyIndex = -1;
	killRing = new KillRing();
	lastAction = null;
	jumpMode = null;
	preferredVisualCol = null;
	snappedFromCursorCol = null;
	undoStack = new UndoStack();
	onSubmit;
	onChange;
	disableSubmit = false;
	constructor(tui, theme, options$1 = {}) {
		this.tui = tui;
		this.theme = theme;
		this.borderColor = theme.borderColor;
		const paddingX = options$1.paddingX ?? 0;
		this.paddingX = Number.isFinite(paddingX) ? Math.max(0, Math.floor(paddingX)) : 0;
		const maxVisible = options$1.autocompleteMaxVisible ?? 5;
		this.autocompleteMaxVisible = Number.isFinite(maxVisible) ? Math.max(3, Math.min(20, Math.floor(maxVisible))) : 5;
	}
	/** Set of currently valid paste IDs, for marker-aware segmentation. */
	validPasteIds() {
		return new Set(this.pastes.keys());
	}
	/** Segment text with paste-marker awareness, only merging markers with valid IDs. */
	segment(text) {
		return segmentWithMarkers(text, this.validPasteIds());
	}
	getPaddingX() {
		return this.paddingX;
	}
	setPaddingX(padding) {
		const newPadding = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0;
		if (this.paddingX !== newPadding) {
			this.paddingX = newPadding;
			this.tui.requestRender();
		}
	}
	getAutocompleteMaxVisible() {
		return this.autocompleteMaxVisible;
	}
	setAutocompleteMaxVisible(maxVisible) {
		const newMaxVisible = Number.isFinite(maxVisible) ? Math.max(3, Math.min(20, Math.floor(maxVisible))) : 5;
		if (this.autocompleteMaxVisible !== newMaxVisible) {
			this.autocompleteMaxVisible = newMaxVisible;
			this.tui.requestRender();
		}
	}
	setAutocompleteProvider(provider) {
		this.cancelAutocomplete();
		this.autocompleteProvider = provider;
	}
	/**
	* Add a prompt to history for up/down arrow navigation.
	* Called after successful submission.
	*/
	addToHistory(text) {
		const trimmed = text.trim();
		if (!trimmed) return;
		if (this.history.length > 0 && this.history[0] === trimmed) return;
		this.history.unshift(trimmed);
		if (this.history.length > 100) this.history.pop();
	}
	isEditorEmpty() {
		return this.state.lines.length === 1 && this.state.lines[0] === "";
	}
	isOnFirstVisualLine() {
		const visualLines = this.buildVisualLineMap(this.lastWidth);
		return this.findCurrentVisualLine(visualLines) === 0;
	}
	isOnLastVisualLine() {
		const visualLines = this.buildVisualLineMap(this.lastWidth);
		return this.findCurrentVisualLine(visualLines) === visualLines.length - 1;
	}
	navigateHistory(direction) {
		this.lastAction = null;
		if (this.history.length === 0) return;
		const newIndex = this.historyIndex - direction;
		if (newIndex < -1 || newIndex >= this.history.length) return;
		if (this.historyIndex === -1 && newIndex >= 0) this.pushUndoSnapshot();
		this.historyIndex = newIndex;
		if (this.historyIndex === -1) this.setTextInternal("");
		else this.setTextInternal(this.history[this.historyIndex] || "");
	}
	/** Internal setText that doesn't reset history state - used by navigateHistory */
	setTextInternal(text) {
		const lines = text.split("\n");
		this.state.lines = lines.length === 0 ? [""] : lines;
		this.state.cursorLine = this.state.lines.length - 1;
		this.setCursorCol(this.state.lines[this.state.cursorLine]?.length || 0);
		this.scrollOffset = 0;
		if (this.onChange) this.onChange(this.getText());
	}
	invalidate() {}
	render(width) {
		const maxPadding = Math.max(0, Math.floor((width - 1) / 2));
		const paddingX = Math.min(this.paddingX, maxPadding);
		const contentWidth = Math.max(1, width - paddingX * 2);
		const layoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1));
		this.lastWidth = layoutWidth;
		const horizontal = this.borderColor("─");
		const layoutLines = this.layoutText(layoutWidth);
		const terminalRows = this.tui.terminal.rows;
		const maxVisibleLines = Math.max(5, Math.floor(terminalRows * .3));
		let cursorLineIndex = layoutLines.findIndex((line) => line.hasCursor);
		if (cursorLineIndex === -1) cursorLineIndex = 0;
		if (cursorLineIndex < this.scrollOffset) this.scrollOffset = cursorLineIndex;
		else if (cursorLineIndex >= this.scrollOffset + maxVisibleLines) this.scrollOffset = cursorLineIndex - maxVisibleLines + 1;
		const maxScrollOffset = Math.max(0, layoutLines.length - maxVisibleLines);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScrollOffset));
		const visibleLines = layoutLines.slice(this.scrollOffset, this.scrollOffset + maxVisibleLines);
		const result = [];
		const leftPadding = " ".repeat(paddingX);
		const rightPadding = leftPadding;
		if (this.scrollOffset > 0) {
			const indicator = `─── ↑ ${this.scrollOffset} more `;
			const remaining = width - visibleWidth(indicator);
			if (remaining >= 0) result.push(this.borderColor(indicator + "─".repeat(remaining)));
			else result.push(this.borderColor(truncateToWidth(indicator, width)));
		} else result.push(horizontal.repeat(width));
		const emitCursorMarker = this.focused && !this.autocompleteState;
		for (const layoutLine of visibleLines) {
			let displayText = layoutLine.text;
			let lineVisibleWidth = visibleWidth(layoutLine.text);
			let cursorInPadding = false;
			if (layoutLine.hasCursor && layoutLine.cursorPos !== void 0) {
				const before = displayText.slice(0, layoutLine.cursorPos);
				const after = displayText.slice(layoutLine.cursorPos);
				const marker = emitCursorMarker ? CURSOR_MARKER : "";
				if (after.length > 0) {
					const firstGrapheme = [...this.segment(after)][0]?.segment || "";
					const restAfter = after.slice(firstGrapheme.length);
					const cursor = `\x1b[7m${firstGrapheme}\x1b[0m`;
					displayText = before + marker + cursor + restAfter;
				} else {
					displayText = before + marker + "\x1B[7m \x1B[0m";
					lineVisibleWidth = lineVisibleWidth + 1;
					if (lineVisibleWidth > contentWidth && paddingX > 0) cursorInPadding = true;
				}
			}
			const padding = " ".repeat(Math.max(0, contentWidth - lineVisibleWidth));
			const lineRightPadding = cursorInPadding ? rightPadding.slice(1) : rightPadding;
			result.push(`${leftPadding}${displayText}${padding}${lineRightPadding}`);
		}
		const linesBelow = layoutLines.length - (this.scrollOffset + visibleLines.length);
		if (linesBelow > 0) {
			const indicator = `─── ↓ ${linesBelow} more `;
			const remaining = width - visibleWidth(indicator);
			result.push(this.borderColor(indicator + "─".repeat(Math.max(0, remaining))));
		} else result.push(horizontal.repeat(width));
		if (this.autocompleteState && this.autocompleteList) {
			const autocompleteResult = this.autocompleteList.render(contentWidth);
			for (const line of autocompleteResult) {
				const lineWidth = visibleWidth(line);
				const linePadding = " ".repeat(Math.max(0, contentWidth - lineWidth));
				result.push(`${leftPadding}${line}${linePadding}${rightPadding}`);
			}
		}
		return result;
	}
	handleInput(data) {
		const kb = getKeybindings();
		if (this.jumpMode !== null) {
			if (kb.matches(data, "tui.editor.jumpForward") || kb.matches(data, "tui.editor.jumpBackward")) {
				this.jumpMode = null;
				return;
			}
			const printable$1 = decodePrintableKey(data) ?? (data.charCodeAt(0) >= 32 ? data : void 0);
			if (printable$1 !== void 0) {
				const direction = this.jumpMode;
				this.jumpMode = null;
				this.jumpToChar(printable$1, direction);
				return;
			}
			this.jumpMode = null;
		}
		if (data.includes("\x1B[200~")) {
			this.isInPaste = true;
			this.pasteBuffer = "";
			data = data.replace("\x1B[200~", "");
		}
		if (this.isInPaste) {
			this.pasteBuffer += data;
			const endIndex = this.pasteBuffer.indexOf("\x1B[201~");
			if (endIndex !== -1) {
				const pasteContent = this.pasteBuffer.substring(0, endIndex);
				if (pasteContent.length > 0) this.handlePaste(pasteContent);
				this.isInPaste = false;
				const remaining = this.pasteBuffer.substring(endIndex + 6);
				this.pasteBuffer = "";
				if (remaining.length > 0) this.handleInput(remaining);
				return;
			}
			return;
		}
		if (kb.matches(data, "tui.input.copy")) return;
		if (kb.matches(data, "tui.editor.undo")) {
			this.undo();
			return;
		}
		if (this.autocompleteState && this.autocompleteList) {
			if (kb.matches(data, "tui.select.cancel")) {
				this.cancelAutocomplete();
				return;
			}
			if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down")) {
				this.autocompleteList.handleInput(data);
				return;
			}
			if (kb.matches(data, "tui.input.tab")) {
				const selected = this.autocompleteList.getSelectedItem();
				if (selected && this.autocompleteProvider) {
					this.pushUndoSnapshot();
					this.lastAction = null;
					const result = this.autocompleteProvider.applyCompletion(this.state.lines, this.state.cursorLine, this.state.cursorCol, selected, this.autocompletePrefix);
					this.state.lines = result.lines;
					this.state.cursorLine = result.cursorLine;
					this.setCursorCol(result.cursorCol);
					this.cancelAutocomplete();
					if (this.onChange) this.onChange(this.getText());
				}
				return;
			}
			if (kb.matches(data, "tui.select.confirm")) {
				const selected = this.autocompleteList.getSelectedItem();
				if (selected && this.autocompleteProvider) {
					this.pushUndoSnapshot();
					this.lastAction = null;
					const result = this.autocompleteProvider.applyCompletion(this.state.lines, this.state.cursorLine, this.state.cursorCol, selected, this.autocompletePrefix);
					this.state.lines = result.lines;
					this.state.cursorLine = result.cursorLine;
					this.setCursorCol(result.cursorCol);
					if (this.autocompletePrefix.startsWith("/")) this.cancelAutocomplete();
					else {
						this.cancelAutocomplete();
						if (this.onChange) this.onChange(this.getText());
						return;
					}
				}
			}
		}
		if (kb.matches(data, "tui.input.tab") && !this.autocompleteState) {
			this.handleTabCompletion();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteToLineEnd")) {
			this.deleteToEndOfLine();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteToLineStart")) {
			this.deleteToStartOfLine();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteWordBackward")) {
			this.deleteWordBackwards();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteWordForward")) {
			this.deleteWordForward();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteCharBackward") || matchesKey(data, "shift+backspace")) {
			this.handleBackspace();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteCharForward") || matchesKey(data, "shift+delete")) {
			this.handleForwardDelete();
			return;
		}
		if (kb.matches(data, "tui.editor.yank")) {
			this.yank();
			return;
		}
		if (kb.matches(data, "tui.editor.yankPop")) {
			this.yankPop();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorLineStart")) {
			this.moveToLineStart();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorLineEnd")) {
			this.moveToLineEnd();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorWordLeft")) {
			this.moveWordBackwards();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorWordRight")) {
			this.moveWordForwards();
			return;
		}
		if (kb.matches(data, "tui.input.newLine") || data.charCodeAt(0) === 10 && data.length > 1 || data === "\x1B\r" || data === "\x1B[13;2~" || data.length > 1 && data.includes("\x1B") && data.includes("\r") || data === "\n" && data.length === 1) {
			if (this.shouldSubmitOnBackslashEnter(data, kb)) {
				this.handleBackspace();
				this.submitValue();
				return;
			}
			this.addNewLine();
			return;
		}
		if (kb.matches(data, "tui.input.submit")) {
			if (this.disableSubmit) return;
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			if (this.state.cursorCol > 0 && currentLine[this.state.cursorCol - 1] === "\\") {
				this.handleBackspace();
				this.addNewLine();
				return;
			}
			this.submitValue();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorUp")) {
			if (this.isEditorEmpty()) this.navigateHistory(-1);
			else if (this.historyIndex > -1 && this.isOnFirstVisualLine()) this.navigateHistory(-1);
			else if (this.isOnFirstVisualLine()) this.moveToLineStart();
			else this.moveCursor(-1, 0);
			return;
		}
		if (kb.matches(data, "tui.editor.cursorDown")) {
			if (this.historyIndex > -1 && this.isOnLastVisualLine()) this.navigateHistory(1);
			else if (this.isOnLastVisualLine()) this.moveToLineEnd();
			else this.moveCursor(1, 0);
			return;
		}
		if (kb.matches(data, "tui.editor.cursorRight")) {
			this.moveCursor(0, 1);
			return;
		}
		if (kb.matches(data, "tui.editor.cursorLeft")) {
			this.moveCursor(0, -1);
			return;
		}
		if (kb.matches(data, "tui.editor.pageUp")) {
			this.pageScroll(-1);
			return;
		}
		if (kb.matches(data, "tui.editor.pageDown")) {
			this.pageScroll(1);
			return;
		}
		if (kb.matches(data, "tui.editor.jumpForward")) {
			this.jumpMode = "forward";
			return;
		}
		if (kb.matches(data, "tui.editor.jumpBackward")) {
			this.jumpMode = "backward";
			return;
		}
		if (matchesKey(data, "shift+space")) {
			this.insertCharacter(" ");
			return;
		}
		const printable = decodePrintableKey(data);
		if (printable !== void 0) {
			this.insertCharacter(printable);
			return;
		}
		if (data.charCodeAt(0) >= 32) this.insertCharacter(data);
	}
	layoutText(contentWidth) {
		const layoutLines = [];
		if (this.state.lines.length === 0 || this.state.lines.length === 1 && this.state.lines[0] === "") {
			layoutLines.push({
				text: "",
				hasCursor: true,
				cursorPos: 0
			});
			return layoutLines;
		}
		for (let i = 0; i < this.state.lines.length; i++) {
			const line = this.state.lines[i] || "";
			const isCurrentLine = i === this.state.cursorLine;
			if (visibleWidth(line) <= contentWidth) if (isCurrentLine) layoutLines.push({
				text: line,
				hasCursor: true,
				cursorPos: this.state.cursorCol
			});
			else layoutLines.push({
				text: line,
				hasCursor: false
			});
			else {
				const chunks = wordWrapLine(line, contentWidth, [...this.segment(line)]);
				for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
					const chunk = chunks[chunkIndex];
					if (!chunk) continue;
					const cursorPos = this.state.cursorCol;
					const isLastChunk = chunkIndex === chunks.length - 1;
					let hasCursorInChunk = false;
					let adjustedCursorPos = 0;
					if (isCurrentLine) if (isLastChunk) {
						hasCursorInChunk = cursorPos >= chunk.startIndex;
						adjustedCursorPos = cursorPos - chunk.startIndex;
					} else {
						hasCursorInChunk = cursorPos >= chunk.startIndex && cursorPos < chunk.endIndex;
						if (hasCursorInChunk) {
							adjustedCursorPos = cursorPos - chunk.startIndex;
							if (adjustedCursorPos > chunk.text.length) adjustedCursorPos = chunk.text.length;
						}
					}
					if (hasCursorInChunk) layoutLines.push({
						text: chunk.text,
						hasCursor: true,
						cursorPos: adjustedCursorPos
					});
					else layoutLines.push({
						text: chunk.text,
						hasCursor: false
					});
				}
			}
		}
		return layoutLines;
	}
	getText() {
		return this.state.lines.join("\n");
	}
	expandPasteMarkers(text) {
		let result = text;
		for (const [pasteId, pasteContent] of this.pastes) {
			const markerRegex = new RegExp(`\\[paste #${pasteId}( (\\+\\d+ lines|\\d+ chars))?\\]`, "g");
			result = result.replace(markerRegex, () => pasteContent);
		}
		return result;
	}
	/**
	* Get text with paste markers expanded to their actual content.
	* Use this when you need the full content (e.g., for external editor).
	*/
	getExpandedText() {
		return this.expandPasteMarkers(this.state.lines.join("\n"));
	}
	getLines() {
		return [...this.state.lines];
	}
	getCursor() {
		return {
			line: this.state.cursorLine,
			col: this.state.cursorCol
		};
	}
	setText(text) {
		this.cancelAutocomplete();
		this.lastAction = null;
		this.historyIndex = -1;
		const normalized = this.normalizeText(text);
		if (this.getText() !== normalized) this.pushUndoSnapshot();
		this.setTextInternal(normalized);
	}
	/**
	* Insert text at the current cursor position.
	* Used for programmatic insertion (e.g., clipboard image markers).
	* This is atomic for undo - single undo restores entire pre-insert state.
	*/
	insertTextAtCursor(text) {
		if (!text) return;
		this.cancelAutocomplete();
		this.pushUndoSnapshot();
		this.lastAction = null;
		this.historyIndex = -1;
		this.insertTextAtCursorInternal(text);
	}
	/**
	* Normalize text for editor storage:
	* - Normalize line endings (\r\n and \r -> \n)
	* - Expand tabs to 4 spaces
	*/
	normalizeText(text) {
		return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ");
	}
	/**
	* Internal text insertion at cursor. Handles single and multi-line text.
	* Does not push undo snapshots or trigger autocomplete - caller is responsible.
	* Normalizes line endings and calls onChange once at the end.
	*/
	insertTextAtCursorInternal(text) {
		if (!text) return;
		const normalized = this.normalizeText(text);
		const insertedLines = normalized.split("\n");
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		const beforeCursor = currentLine.slice(0, this.state.cursorCol);
		const afterCursor = currentLine.slice(this.state.cursorCol);
		if (insertedLines.length === 1) {
			this.state.lines[this.state.cursorLine] = beforeCursor + normalized + afterCursor;
			this.setCursorCol(this.state.cursorCol + normalized.length);
		} else {
			this.state.lines = [
				...this.state.lines.slice(0, this.state.cursorLine),
				beforeCursor + insertedLines[0],
				...insertedLines.slice(1, -1),
				insertedLines[insertedLines.length - 1] + afterCursor,
				...this.state.lines.slice(this.state.cursorLine + 1)
			];
			this.state.cursorLine += insertedLines.length - 1;
			this.setCursorCol((insertedLines[insertedLines.length - 1] || "").length);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	insertCharacter(char, skipUndoCoalescing) {
		this.historyIndex = -1;
		if (!skipUndoCoalescing) {
			if (isWhitespaceChar(char) || this.lastAction !== "type-word") this.pushUndoSnapshot();
			this.lastAction = "type-word";
		}
		const line = this.state.lines[this.state.cursorLine] || "";
		const before = line.slice(0, this.state.cursorCol);
		const after = line.slice(this.state.cursorCol);
		this.state.lines[this.state.cursorLine] = before + char + after;
		this.setCursorCol(this.state.cursorCol + char.length);
		if (this.onChange) this.onChange(this.getText());
		if (!this.autocompleteState) {
			if (char === "/" && this.isAtStartOfMessage()) this.tryTriggerAutocomplete();
			else if (char === "@" || char === "#") {
				const textBeforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
				const charBeforeSymbol = textBeforeCursor[textBeforeCursor.length - 2];
				if (textBeforeCursor.length === 1 || charBeforeSymbol === " " || charBeforeSymbol === "	") this.tryTriggerAutocomplete();
			} else if (/[a-zA-Z0-9.\-_]/.test(char)) {
				const textBeforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
				if (this.isInSlashCommandContext(textBeforeCursor)) this.tryTriggerAutocomplete();
				else if (textBeforeCursor.match(/(?:^|[\s])[@#][^\s]*$/)) this.tryTriggerAutocomplete();
			}
		} else this.updateAutocomplete();
	}
	handlePaste(pastedText) {
		this.cancelAutocomplete();
		this.historyIndex = -1;
		this.lastAction = null;
		this.pushUndoSnapshot();
		const decodedText = pastedText.replace(/\x1b\[(\d+);5u/g, (match, code) => {
			const cp = Number(code);
			if (cp >= 97 && cp <= 122) return String.fromCharCode(cp - 96);
			if (cp >= 65 && cp <= 90) return String.fromCharCode(cp - 64);
			return match;
		});
		let filteredText = this.normalizeText(decodedText).split("").filter((char) => char === "\n" || char.charCodeAt(0) >= 32).join("");
		if (/^[/~.]/.test(filteredText)) {
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const charBeforeCursor = this.state.cursorCol > 0 ? currentLine[this.state.cursorCol - 1] : "";
			if (charBeforeCursor && /\w/.test(charBeforeCursor)) filteredText = ` ${filteredText}`;
		}
		const pastedLines = filteredText.split("\n");
		const totalChars = filteredText.length;
		if (pastedLines.length > 10 || totalChars > 1e3) {
			this.pasteCounter++;
			const pasteId = this.pasteCounter;
			this.pastes.set(pasteId, filteredText);
			const marker = pastedLines.length > 10 ? `[paste #${pasteId} +${pastedLines.length} lines]` : `[paste #${pasteId} ${totalChars} chars]`;
			this.insertTextAtCursorInternal(marker);
			return;
		}
		if (pastedLines.length === 1) {
			this.insertTextAtCursorInternal(filteredText);
			return;
		}
		this.insertTextAtCursorInternal(filteredText);
	}
	addNewLine() {
		this.cancelAutocomplete();
		this.historyIndex = -1;
		this.lastAction = null;
		this.pushUndoSnapshot();
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		const before = currentLine.slice(0, this.state.cursorCol);
		const after = currentLine.slice(this.state.cursorCol);
		this.state.lines[this.state.cursorLine] = before;
		this.state.lines.splice(this.state.cursorLine + 1, 0, after);
		this.state.cursorLine++;
		this.setCursorCol(0);
		if (this.onChange) this.onChange(this.getText());
	}
	shouldSubmitOnBackslashEnter(data, kb) {
		if (this.disableSubmit) return false;
		if (!matchesKey(data, "enter")) return false;
		const submitKeys = kb.getKeys("tui.input.submit");
		if (!(submitKeys.includes("shift+enter") || submitKeys.includes("shift+return"))) return false;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		return this.state.cursorCol > 0 && currentLine[this.state.cursorCol - 1] === "\\";
	}
	submitValue() {
		this.cancelAutocomplete();
		const result = this.expandPasteMarkers(this.state.lines.join("\n")).trim();
		this.state = {
			lines: [""],
			cursorLine: 0,
			cursorCol: 0
		};
		this.pastes.clear();
		this.pasteCounter = 0;
		this.historyIndex = -1;
		this.scrollOffset = 0;
		this.undoStack.clear();
		this.lastAction = null;
		if (this.onChange) this.onChange("");
		if (this.onSubmit) this.onSubmit(result);
	}
	handleBackspace() {
		this.historyIndex = -1;
		this.lastAction = null;
		if (this.state.cursorCol > 0) {
			this.pushUndoSnapshot();
			const line = this.state.lines[this.state.cursorLine] || "";
			const beforeCursor = line.slice(0, this.state.cursorCol);
			const graphemes = [...this.segment(beforeCursor)];
			const lastGrapheme = graphemes[graphemes.length - 1];
			const graphemeLength = lastGrapheme ? lastGrapheme.segment.length : 1;
			const before = line.slice(0, this.state.cursorCol - graphemeLength);
			const after = line.slice(this.state.cursorCol);
			this.state.lines[this.state.cursorLine] = before + after;
			this.setCursorCol(this.state.cursorCol - graphemeLength);
		} else if (this.state.cursorLine > 0) {
			this.pushUndoSnapshot();
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const previousLine = this.state.lines[this.state.cursorLine - 1] || "";
			this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine;
			this.state.lines.splice(this.state.cursorLine, 1);
			this.state.cursorLine--;
			this.setCursorCol(previousLine.length);
		}
		if (this.onChange) this.onChange(this.getText());
		if (this.autocompleteState) this.updateAutocomplete();
		else {
			const textBeforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
			if (this.isInSlashCommandContext(textBeforeCursor)) this.tryTriggerAutocomplete();
			else if (textBeforeCursor.match(/(?:^|[\s])[@#][^\s]*$/)) this.tryTriggerAutocomplete();
		}
	}
	/**
	* Set cursor column and clear preferredVisualCol.
	* Use this for all non-vertical cursor movements to reset sticky column behavior.
	*/
	setCursorCol(col) {
		this.state.cursorCol = col;
		this.preferredVisualCol = null;
		this.snappedFromCursorCol = null;
	}
	/**
	* Move cursor to a target visual line, applying sticky column logic.
	* Shared by moveCursor() and pageScroll().
	*/
	moveToVisualLine(visualLines, currentVisualLine, targetVisualLine) {
		const currentVL = visualLines[currentVisualLine];
		const targetVL = visualLines[targetVisualLine];
		if (!(currentVL && targetVL)) return;
		let currentVisualCol;
		if (this.snappedFromCursorCol !== null) {
			const vlIndex = this.findVisualLineAt(visualLines, currentVL.logicalLine, this.snappedFromCursorCol);
			currentVisualCol = this.snappedFromCursorCol - visualLines[vlIndex].startCol;
		} else currentVisualCol = this.state.cursorCol - currentVL.startCol;
		const sourceMaxVisualCol = currentVisualLine === visualLines.length - 1 || visualLines[currentVisualLine + 1]?.logicalLine !== currentVL.logicalLine ? currentVL.length : Math.max(0, currentVL.length - 1);
		const targetMaxVisualCol = targetVisualLine === visualLines.length - 1 || visualLines[targetVisualLine + 1]?.logicalLine !== targetVL.logicalLine ? targetVL.length : Math.max(0, targetVL.length - 1);
		const moveToVisualCol = this.computeVerticalMoveColumn(currentVisualCol, sourceMaxVisualCol, targetMaxVisualCol);
		this.state.cursorLine = targetVL.logicalLine;
		const targetCol = targetVL.startCol + moveToVisualCol;
		const logicalLine = this.state.lines[targetVL.logicalLine] || "";
		this.state.cursorCol = Math.min(targetCol, logicalLine.length);
		const segments = [...this.segment(logicalLine)];
		for (const seg of segments) {
			if (seg.index > this.state.cursorCol) break;
			if (seg.segment.length <= 1) continue;
			if (this.state.cursorCol < seg.index + seg.segment.length) {
				if (seg.index < targetVL.startCol && targetVisualLine > currentVisualLine) {
					const segEnd = seg.index + seg.segment.length;
					let next = targetVisualLine + 1;
					while (next < visualLines.length && visualLines[next].logicalLine === targetVL.logicalLine && visualLines[next].startCol < segEnd) next++;
					if (next < visualLines.length) {
						this.moveToVisualLine(visualLines, currentVisualLine, next);
						return;
					}
				}
				this.snappedFromCursorCol = this.state.cursorCol;
				this.state.cursorCol = seg.index;
				return;
			}
		}
		this.snappedFromCursorCol = null;
	}
	/**
	* Compute the target visual column for vertical cursor movement.
	* Implements the sticky column decision table:
	*
	* | P | S | T | U | Scenario                                             | Set Preferred | Move To     |
	* |---|---|---|---| ---------------------------------------------------- |---------------|-------------|
	* | 0 | * | 0 | - | Start nav, target fits                               | null          | current     |
	* | 0 | * | 1 | - | Start nav, target shorter                            | current       | target end  |
	* | 1 | 0 | 0 | 0 | Clamped, target fits preferred                       | null          | preferred   |
	* | 1 | 0 | 0 | 1 | Clamped, target longer but still can't fit preferred | keep          | target end  |
	* | 1 | 0 | 1 | - | Clamped, target even shorter                         | keep          | target end  |
	* | 1 | 1 | 0 | - | Rewrapped, target fits current                       | null          | current     |
	* | 1 | 1 | 1 | - | Rewrapped, target shorter than current               | current       | target end  |
	*
	* Where:
	* - P = preferred col is set
	* - S = cursor in middle of source line (not clamped to end)
	* - T = target line shorter than current visual col
	* - U = target line shorter than preferred col
	*/
	computeVerticalMoveColumn(currentVisualCol, sourceMaxVisualCol, targetMaxVisualCol) {
		const hasPreferred = this.preferredVisualCol !== null;
		const cursorInMiddle = currentVisualCol < sourceMaxVisualCol;
		const targetTooShort = targetMaxVisualCol < currentVisualCol;
		if (!hasPreferred || cursorInMiddle) {
			if (targetTooShort) {
				this.preferredVisualCol = currentVisualCol;
				return targetMaxVisualCol;
			}
			this.preferredVisualCol = null;
			return currentVisualCol;
		}
		const targetCantFitPreferred = targetMaxVisualCol < this.preferredVisualCol;
		if (targetTooShort || targetCantFitPreferred) return targetMaxVisualCol;
		const result = this.preferredVisualCol;
		this.preferredVisualCol = null;
		return result;
	}
	moveToLineStart() {
		this.lastAction = null;
		this.setCursorCol(0);
	}
	moveToLineEnd() {
		this.lastAction = null;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		this.setCursorCol(currentLine.length);
	}
	deleteToStartOfLine() {
		this.cancelAutocomplete();
		this.historyIndex = -1;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol > 0) {
			this.pushUndoSnapshot();
			const deletedText = currentLine.slice(0, this.state.cursorCol);
			this.killRing.push(deletedText, {
				prepend: true,
				accumulate: this.lastAction === "kill"
			});
			this.lastAction = "kill";
			this.state.lines[this.state.cursorLine] = currentLine.slice(this.state.cursorCol);
			this.setCursorCol(0);
		} else if (this.state.cursorLine > 0) {
			this.pushUndoSnapshot();
			this.killRing.push("\n", {
				prepend: true,
				accumulate: this.lastAction === "kill"
			});
			this.lastAction = "kill";
			const previousLine = this.state.lines[this.state.cursorLine - 1] || "";
			this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine;
			this.state.lines.splice(this.state.cursorLine, 1);
			this.state.cursorLine--;
			this.setCursorCol(previousLine.length);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	deleteToEndOfLine() {
		this.historyIndex = -1;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol < currentLine.length) {
			this.pushUndoSnapshot();
			const deletedText = currentLine.slice(this.state.cursorCol);
			this.killRing.push(deletedText, {
				prepend: false,
				accumulate: this.lastAction === "kill"
			});
			this.lastAction = "kill";
			this.state.lines[this.state.cursorLine] = currentLine.slice(0, this.state.cursorCol);
		} else if (this.state.cursorLine < this.state.lines.length - 1) {
			this.pushUndoSnapshot();
			this.killRing.push("\n", {
				prepend: false,
				accumulate: this.lastAction === "kill"
			});
			this.lastAction = "kill";
			const nextLine = this.state.lines[this.state.cursorLine + 1] || "";
			this.state.lines[this.state.cursorLine] = currentLine + nextLine;
			this.state.lines.splice(this.state.cursorLine + 1, 1);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	deleteWordBackwards() {
		this.historyIndex = -1;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol === 0) {
			if (this.state.cursorLine > 0) {
				this.pushUndoSnapshot();
				this.killRing.push("\n", {
					prepend: true,
					accumulate: this.lastAction === "kill"
				});
				this.lastAction = "kill";
				const previousLine = this.state.lines[this.state.cursorLine - 1] || "";
				this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine;
				this.state.lines.splice(this.state.cursorLine, 1);
				this.state.cursorLine--;
				this.setCursorCol(previousLine.length);
			}
		} else {
			this.pushUndoSnapshot();
			const wasKill = this.lastAction === "kill";
			const oldCursorCol = this.state.cursorCol;
			this.moveWordBackwards();
			const deleteFrom = this.state.cursorCol;
			this.setCursorCol(oldCursorCol);
			const deletedText = currentLine.slice(deleteFrom, this.state.cursorCol);
			this.killRing.push(deletedText, {
				prepend: true,
				accumulate: wasKill
			});
			this.lastAction = "kill";
			this.state.lines[this.state.cursorLine] = currentLine.slice(0, deleteFrom) + currentLine.slice(this.state.cursorCol);
			this.setCursorCol(deleteFrom);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	deleteWordForward() {
		this.historyIndex = -1;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol >= currentLine.length) {
			if (this.state.cursorLine < this.state.lines.length - 1) {
				this.pushUndoSnapshot();
				this.killRing.push("\n", {
					prepend: false,
					accumulate: this.lastAction === "kill"
				});
				this.lastAction = "kill";
				const nextLine = this.state.lines[this.state.cursorLine + 1] || "";
				this.state.lines[this.state.cursorLine] = currentLine + nextLine;
				this.state.lines.splice(this.state.cursorLine + 1, 1);
			}
		} else {
			this.pushUndoSnapshot();
			const wasKill = this.lastAction === "kill";
			const oldCursorCol = this.state.cursorCol;
			this.moveWordForwards();
			const deleteTo = this.state.cursorCol;
			this.setCursorCol(oldCursorCol);
			const deletedText = currentLine.slice(this.state.cursorCol, deleteTo);
			this.killRing.push(deletedText, {
				prepend: false,
				accumulate: wasKill
			});
			this.lastAction = "kill";
			this.state.lines[this.state.cursorLine] = currentLine.slice(0, this.state.cursorCol) + currentLine.slice(deleteTo);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	handleForwardDelete() {
		this.historyIndex = -1;
		this.lastAction = null;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol < currentLine.length) {
			this.pushUndoSnapshot();
			const afterCursor = currentLine.slice(this.state.cursorCol);
			const firstGrapheme = [...this.segment(afterCursor)][0];
			const graphemeLength = firstGrapheme ? firstGrapheme.segment.length : 1;
			const before = currentLine.slice(0, this.state.cursorCol);
			const after = currentLine.slice(this.state.cursorCol + graphemeLength);
			this.state.lines[this.state.cursorLine] = before + after;
		} else if (this.state.cursorLine < this.state.lines.length - 1) {
			this.pushUndoSnapshot();
			const nextLine = this.state.lines[this.state.cursorLine + 1] || "";
			this.state.lines[this.state.cursorLine] = currentLine + nextLine;
			this.state.lines.splice(this.state.cursorLine + 1, 1);
		}
		if (this.onChange) this.onChange(this.getText());
		if (this.autocompleteState) this.updateAutocomplete();
		else {
			const textBeforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
			if (this.isInSlashCommandContext(textBeforeCursor)) this.tryTriggerAutocomplete();
			else if (textBeforeCursor.match(/(?:^|[\s])[@#][^\s]*$/)) this.tryTriggerAutocomplete();
		}
	}
	/**
	* Build a mapping from visual lines to logical positions.
	* Returns an array where each element represents a visual line with:
	* - logicalLine: index into this.state.lines
	* - startCol: starting column in the logical line
	* - length: length of this visual line segment
	*/
	buildVisualLineMap(width) {
		const visualLines = [];
		for (let i = 0; i < this.state.lines.length; i++) {
			const line = this.state.lines[i] || "";
			const lineVisWidth = visibleWidth(line);
			if (line.length === 0) visualLines.push({
				logicalLine: i,
				startCol: 0,
				length: 0
			});
			else if (lineVisWidth <= width) visualLines.push({
				logicalLine: i,
				startCol: 0,
				length: line.length
			});
			else {
				const chunks = wordWrapLine(line, width, [...this.segment(line)]);
				for (const chunk of chunks) visualLines.push({
					logicalLine: i,
					startCol: chunk.startIndex,
					length: chunk.endIndex - chunk.startIndex
				});
			}
		}
		return visualLines;
	}
	/**
	* Find the visual line index that contains the given logical position.
	*/
	findVisualLineAt(visualLines, line, col) {
		for (let i = 0; i < visualLines.length; i++) {
			const vl = visualLines[i];
			if (!vl || vl.logicalLine !== line) continue;
			const offset = col - vl.startCol;
			const isLastSegmentOfLine = i === visualLines.length - 1 || visualLines[i + 1]?.logicalLine !== vl.logicalLine;
			if (offset >= 0 && (offset < vl.length || isLastSegmentOfLine && offset === vl.length)) return i;
		}
		return visualLines.length - 1;
	}
	/**
	* Find the visual line index for the current cursor position.
	*/
	findCurrentVisualLine(visualLines) {
		return this.findVisualLineAt(visualLines, this.state.cursorLine, this.state.cursorCol);
	}
	moveCursor(deltaLine, deltaCol) {
		this.lastAction = null;
		const visualLines = this.buildVisualLineMap(this.lastWidth);
		const currentVisualLine = this.findCurrentVisualLine(visualLines);
		if (deltaLine !== 0) {
			const targetVisualLine = currentVisualLine + deltaLine;
			if (targetVisualLine >= 0 && targetVisualLine < visualLines.length) this.moveToVisualLine(visualLines, currentVisualLine, targetVisualLine);
		}
		if (deltaCol !== 0) {
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			if (deltaCol > 0) if (this.state.cursorCol < currentLine.length) {
				const afterCursor = currentLine.slice(this.state.cursorCol);
				const firstGrapheme = [...this.segment(afterCursor)][0];
				this.setCursorCol(this.state.cursorCol + (firstGrapheme ? firstGrapheme.segment.length : 1));
			} else if (this.state.cursorLine < this.state.lines.length - 1) {
				this.state.cursorLine++;
				this.setCursorCol(0);
			} else {
				const currentVL = visualLines[currentVisualLine];
				if (currentVL) this.preferredVisualCol = this.state.cursorCol - currentVL.startCol;
			}
			else if (this.state.cursorCol > 0) {
				const beforeCursor = currentLine.slice(0, this.state.cursorCol);
				const graphemes = [...this.segment(beforeCursor)];
				const lastGrapheme = graphemes[graphemes.length - 1];
				this.setCursorCol(this.state.cursorCol - (lastGrapheme ? lastGrapheme.segment.length : 1));
			} else if (this.state.cursorLine > 0) {
				this.state.cursorLine--;
				const prevLine = this.state.lines[this.state.cursorLine] || "";
				this.setCursorCol(prevLine.length);
			}
		}
	}
	/**
	* Scroll by a page (direction: -1 for up, 1 for down).
	* Moves cursor by the page size while keeping it in bounds.
	*/
	pageScroll(direction) {
		this.lastAction = null;
		const terminalRows = this.tui.terminal.rows;
		const pageSize = Math.max(5, Math.floor(terminalRows * .3));
		const visualLines = this.buildVisualLineMap(this.lastWidth);
		const currentVisualLine = this.findCurrentVisualLine(visualLines);
		const targetVisualLine = Math.max(0, Math.min(visualLines.length - 1, currentVisualLine + direction * pageSize));
		this.moveToVisualLine(visualLines, currentVisualLine, targetVisualLine);
	}
	moveWordBackwards() {
		this.lastAction = null;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol === 0) {
			if (this.state.cursorLine > 0) {
				this.state.cursorLine--;
				const prevLine = this.state.lines[this.state.cursorLine] || "";
				this.setCursorCol(prevLine.length);
			}
			return;
		}
		const textBeforeCursor = currentLine.slice(0, this.state.cursorCol);
		const graphemes = [...this.segment(textBeforeCursor)];
		let newCol = this.state.cursorCol;
		while (graphemes.length > 0 && !isPasteMarker(graphemes[graphemes.length - 1]?.segment || "") && isWhitespaceChar(graphemes[graphemes.length - 1]?.segment || "")) newCol -= graphemes.pop()?.segment.length || 0;
		if (graphemes.length > 0) {
			const lastGrapheme = graphemes[graphemes.length - 1]?.segment || "";
			if (isPasteMarker(lastGrapheme)) newCol -= graphemes.pop()?.segment.length || 0;
			else if (isPunctuationChar(lastGrapheme)) while (graphemes.length > 0 && isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "") && !isPasteMarker(graphemes[graphemes.length - 1]?.segment || "")) newCol -= graphemes.pop()?.segment.length || 0;
			else while (graphemes.length > 0 && !isWhitespaceChar(graphemes[graphemes.length - 1]?.segment || "") && !isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "") && !isPasteMarker(graphemes[graphemes.length - 1]?.segment || "")) newCol -= graphemes.pop()?.segment.length || 0;
		}
		this.setCursorCol(newCol);
	}
	/**
	* Yank (paste) the most recent kill ring entry at cursor position.
	*/
	yank() {
		if (this.killRing.length === 0) return;
		this.pushUndoSnapshot();
		const text = this.killRing.peek();
		this.insertYankedText(text);
		this.lastAction = "yank";
	}
	/**
	* Cycle through kill ring (only works immediately after yank or yank-pop).
	* Replaces the last yanked text with the previous entry in the ring.
	*/
	yankPop() {
		if (this.lastAction !== "yank" || this.killRing.length <= 1) return;
		this.pushUndoSnapshot();
		this.deleteYankedText();
		this.killRing.rotate();
		const text = this.killRing.peek();
		this.insertYankedText(text);
		this.lastAction = "yank";
	}
	/**
	* Insert text at cursor position (used by yank operations).
	*/
	insertYankedText(text) {
		this.historyIndex = -1;
		const lines = text.split("\n");
		if (lines.length === 1) {
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const before = currentLine.slice(0, this.state.cursorCol);
			const after = currentLine.slice(this.state.cursorCol);
			this.state.lines[this.state.cursorLine] = before + text + after;
			this.setCursorCol(this.state.cursorCol + text.length);
		} else {
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const before = currentLine.slice(0, this.state.cursorCol);
			const after = currentLine.slice(this.state.cursorCol);
			this.state.lines[this.state.cursorLine] = before + (lines[0] || "");
			for (let i = 1; i < lines.length - 1; i++) this.state.lines.splice(this.state.cursorLine + i, 0, lines[i] || "");
			const lastLineIndex = this.state.cursorLine + lines.length - 1;
			this.state.lines.splice(lastLineIndex, 0, (lines[lines.length - 1] || "") + after);
			this.state.cursorLine = lastLineIndex;
			this.setCursorCol((lines[lines.length - 1] || "").length);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	/**
	* Delete the previously yanked text (used by yank-pop).
	* The yanked text is derived from killRing[end] since it hasn't been rotated yet.
	*/
	deleteYankedText() {
		const yankedText = this.killRing.peek();
		if (!yankedText) return;
		const yankLines = yankedText.split("\n");
		if (yankLines.length === 1) {
			const currentLine = this.state.lines[this.state.cursorLine] || "";
			const deleteLen = yankedText.length;
			const before = currentLine.slice(0, this.state.cursorCol - deleteLen);
			const after = currentLine.slice(this.state.cursorCol);
			this.state.lines[this.state.cursorLine] = before + after;
			this.setCursorCol(this.state.cursorCol - deleteLen);
		} else {
			const startLine = this.state.cursorLine - (yankLines.length - 1);
			const startCol = (this.state.lines[startLine] || "").length - (yankLines[0] || "").length;
			const afterCursor = (this.state.lines[this.state.cursorLine] || "").slice(this.state.cursorCol);
			const beforeYank = (this.state.lines[startLine] || "").slice(0, startCol);
			this.state.lines.splice(startLine, yankLines.length, beforeYank + afterCursor);
			this.state.cursorLine = startLine;
			this.setCursorCol(startCol);
		}
		if (this.onChange) this.onChange(this.getText());
	}
	pushUndoSnapshot() {
		this.undoStack.push(this.state);
	}
	undo() {
		this.historyIndex = -1;
		const snapshot = this.undoStack.pop();
		if (!snapshot) return;
		Object.assign(this.state, snapshot);
		this.lastAction = null;
		this.preferredVisualCol = null;
		if (this.onChange) this.onChange(this.getText());
	}
	/**
	* Jump to the first occurrence of a character in the specified direction.
	* Multi-line search. Case-sensitive. Skips the current cursor position.
	*/
	jumpToChar(char, direction) {
		this.lastAction = null;
		const isForward = direction === "forward";
		const lines = this.state.lines;
		const end = isForward ? lines.length : -1;
		const step = isForward ? 1 : -1;
		for (let lineIdx = this.state.cursorLine; lineIdx !== end; lineIdx += step) {
			const line = lines[lineIdx] || "";
			const searchFrom = lineIdx === this.state.cursorLine ? isForward ? this.state.cursorCol + 1 : this.state.cursorCol - 1 : void 0;
			const idx = isForward ? line.indexOf(char, searchFrom) : line.lastIndexOf(char, searchFrom);
			if (idx !== -1) {
				this.state.cursorLine = lineIdx;
				this.setCursorCol(idx);
				return;
			}
		}
	}
	moveWordForwards() {
		this.lastAction = null;
		const currentLine = this.state.lines[this.state.cursorLine] || "";
		if (this.state.cursorCol >= currentLine.length) {
			if (this.state.cursorLine < this.state.lines.length - 1) {
				this.state.cursorLine++;
				this.setCursorCol(0);
			}
			return;
		}
		const textAfterCursor = currentLine.slice(this.state.cursorCol);
		const iterator = this.segment(textAfterCursor)[Symbol.iterator]();
		let next = iterator.next();
		let newCol = this.state.cursorCol;
		while (!next.done && !isPasteMarker(next.value.segment) && isWhitespaceChar(next.value.segment)) {
			newCol += next.value.segment.length;
			next = iterator.next();
		}
		if (!next.done) {
			const firstGrapheme = next.value.segment;
			if (isPasteMarker(firstGrapheme)) newCol += firstGrapheme.length;
			else if (isPunctuationChar(firstGrapheme)) while (!next.done && isPunctuationChar(next.value.segment) && !isPasteMarker(next.value.segment)) {
				newCol += next.value.segment.length;
				next = iterator.next();
			}
			else while (!next.done && !isWhitespaceChar(next.value.segment) && !isPunctuationChar(next.value.segment) && !isPasteMarker(next.value.segment)) {
				newCol += next.value.segment.length;
				next = iterator.next();
			}
		}
		this.setCursorCol(newCol);
	}
	isSlashMenuAllowed() {
		return this.state.cursorLine === 0;
	}
	isAtStartOfMessage() {
		if (!this.isSlashMenuAllowed()) return false;
		const beforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
		return beforeCursor.trim() === "" || beforeCursor.trim() === "/";
	}
	isInSlashCommandContext(textBeforeCursor) {
		return this.isSlashMenuAllowed() && textBeforeCursor.trimStart().startsWith("/");
	}
	/**
	* Find the best autocomplete item index for the given prefix.
	* Returns -1 if no match is found.
	*
	* Match priority:
	* 1. Exact match (prefix === item.value) -> always selected
	* 2. Prefix match -> first item whose value starts with prefix
	* 3. No match -> -1 (keep default highlight)
	*
	* Matching is case-sensitive and checks item.value only.
	*/
	getBestAutocompleteMatchIndex(items, prefix) {
		if (!prefix) return -1;
		let firstPrefixIndex = -1;
		for (let i = 0; i < items.length; i++) {
			const value = items[i].value;
			if (value === prefix) return i;
			if (firstPrefixIndex === -1 && value.startsWith(prefix)) firstPrefixIndex = i;
		}
		return firstPrefixIndex;
	}
	createAutocompleteList(prefix, items) {
		const layout = prefix.startsWith("/") ? SLASH_COMMAND_SELECT_LIST_LAYOUT : void 0;
		return new SelectList(items, this.autocompleteMaxVisible, this.theme.selectList, layout);
	}
	tryTriggerAutocomplete(explicitTab = false) {
		this.requestAutocomplete({
			force: false,
			explicitTab
		});
	}
	handleTabCompletion() {
		if (!this.autocompleteProvider) return;
		const beforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
		if (this.isInSlashCommandContext(beforeCursor) && !beforeCursor.trimStart().includes(" ")) this.handleSlashCommandCompletion();
		else this.forceFileAutocomplete(true);
	}
	handleSlashCommandCompletion() {
		this.requestAutocomplete({
			force: false,
			explicitTab: true
		});
	}
	forceFileAutocomplete(explicitTab = false) {
		this.requestAutocomplete({
			force: true,
			explicitTab
		});
	}
	requestAutocomplete(options$1) {
		if (!this.autocompleteProvider) return;
		if (options$1.force) {
			if (!(!this.autocompleteProvider.shouldTriggerFileCompletion || this.autocompleteProvider.shouldTriggerFileCompletion(this.state.lines, this.state.cursorLine, this.state.cursorCol))) return;
		}
		this.cancelAutocompleteRequest();
		const startToken = ++this.autocompleteStartToken;
		const debounceMs = this.getAutocompleteDebounceMs(options$1);
		if (debounceMs > 0) {
			this.autocompleteDebounceTimer = setTimeout(() => {
				this.autocompleteDebounceTimer = void 0;
				this.startAutocompleteRequest(startToken, options$1);
			}, debounceMs);
			return;
		}
		this.startAutocompleteRequest(startToken, options$1);
	}
	async startAutocompleteRequest(startToken, options$1) {
		const previousTask = this.autocompleteRequestTask;
		this.autocompleteRequestTask = (async () => {
			await previousTask;
			if (startToken !== this.autocompleteStartToken || !this.autocompleteProvider) return;
			const controller = new AbortController();
			this.autocompleteAbort = controller;
			const requestId = ++this.autocompleteRequestId;
			const snapshotText = this.getText();
			const snapshotLine = this.state.cursorLine;
			const snapshotCol = this.state.cursorCol;
			await this.runAutocompleteRequest(requestId, controller, snapshotText, snapshotLine, snapshotCol, options$1);
		})();
		await this.autocompleteRequestTask;
	}
	getAutocompleteDebounceMs(options$1) {
		if (options$1.explicitTab || options$1.force) return 0;
		const textBeforeCursor = (this.state.lines[this.state.cursorLine] || "").slice(0, this.state.cursorCol);
		return /(?:^|[ \t])(?:@(?:"[^"]*|[^\s]*)|#[^\s]*)$/.test(textBeforeCursor) ? ATTACHMENT_AUTOCOMPLETE_DEBOUNCE_MS : 0;
	}
	async runAutocompleteRequest(requestId, controller, snapshotText, snapshotLine, snapshotCol, options$1) {
		if (!this.autocompleteProvider) return;
		const suggestions = await this.autocompleteProvider.getSuggestions(this.state.lines, this.state.cursorLine, this.state.cursorCol, {
			signal: controller.signal,
			force: options$1.force
		});
		if (!this.isAutocompleteRequestCurrent(requestId, controller, snapshotText, snapshotLine, snapshotCol)) return;
		this.autocompleteAbort = void 0;
		if (!suggestions || !Array.isArray(suggestions.items) || suggestions.items.length === 0) {
			this.cancelAutocomplete();
			this.tui.requestRender();
			return;
		}
		if (options$1.force && options$1.explicitTab && suggestions.items.length === 1) {
			const item = suggestions.items[0];
			this.pushUndoSnapshot();
			this.lastAction = null;
			const result = this.autocompleteProvider.applyCompletion(this.state.lines, this.state.cursorLine, this.state.cursorCol, item, suggestions.prefix);
			this.state.lines = result.lines;
			this.state.cursorLine = result.cursorLine;
			this.setCursorCol(result.cursorCol);
			if (this.onChange) this.onChange(this.getText());
			this.tui.requestRender();
			return;
		}
		this.applyAutocompleteSuggestions(suggestions, options$1.force ? "force" : "regular");
		this.tui.requestRender();
	}
	isAutocompleteRequestCurrent(requestId, controller, snapshotText, snapshotLine, snapshotCol) {
		return !controller.signal.aborted && requestId === this.autocompleteRequestId && this.getText() === snapshotText && this.state.cursorLine === snapshotLine && this.state.cursorCol === snapshotCol;
	}
	applyAutocompleteSuggestions(suggestions, state) {
		this.autocompletePrefix = suggestions.prefix;
		this.autocompleteList = this.createAutocompleteList(suggestions.prefix, suggestions.items);
		const bestMatchIndex = this.getBestAutocompleteMatchIndex(suggestions.items, suggestions.prefix);
		if (bestMatchIndex >= 0) this.autocompleteList.setSelectedIndex(bestMatchIndex);
		this.autocompleteState = state;
	}
	cancelAutocompleteRequest() {
		this.autocompleteStartToken += 1;
		if (this.autocompleteDebounceTimer) {
			clearTimeout(this.autocompleteDebounceTimer);
			this.autocompleteDebounceTimer = void 0;
		}
		this.autocompleteAbort?.abort();
		this.autocompleteAbort = void 0;
	}
	clearAutocompleteUi() {
		this.autocompleteState = null;
		this.autocompleteList = void 0;
		this.autocompletePrefix = "";
	}
	cancelAutocomplete() {
		this.cancelAutocompleteRequest();
		this.clearAutocompleteUi();
	}
	isShowingAutocomplete() {
		return this.autocompleteState !== null;
	}
	updateAutocomplete() {
		if (!this.autocompleteState || !this.autocompleteProvider) return;
		this.requestAutocomplete({
			force: this.autocompleteState === "force",
			explicitTab: false
		});
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/image.js
var Image = class {
	base64Data;
	mimeType;
	dimensions;
	theme;
	options;
	imageId;
	cachedLines;
	cachedWidth;
	constructor(base64Data, mimeType, theme, options$1 = {}, dimensions) {
		this.base64Data = base64Data;
		this.mimeType = mimeType;
		this.theme = theme;
		this.options = options$1;
		this.dimensions = dimensions || getImageDimensions(base64Data, mimeType) || {
			widthPx: 800,
			heightPx: 600
		};
		this.imageId = options$1.imageId;
	}
	/** Get the Kitty image ID used by this image (if any). */
	getImageId() {
		return this.imageId;
	}
	invalidate() {
		this.cachedLines = void 0;
		this.cachedWidth = void 0;
	}
	render(width) {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const maxWidth = Math.min(width - 2, this.options.maxWidthCells ?? 60);
		const caps = getCapabilities();
		let lines;
		if (caps.images) {
			if (caps.images === "kitty" && this.imageId === void 0) this.imageId = allocateImageId();
			const result = renderImage(this.base64Data, this.dimensions, {
				maxWidthCells: maxWidth,
				imageId: this.imageId,
				moveCursor: false
			});
			if (result) {
				if (result.imageId) this.imageId = result.imageId;
				lines = [];
				for (let i = 0; i < result.rows - 1; i++) lines.push("");
				const rowOffset = result.rows - 1;
				const moveUp = rowOffset > 0 ? `\x1b[${rowOffset}A` : "";
				const moveDown = caps.images === "kitty" && rowOffset > 0 ? `\x1b[${rowOffset}B` : "";
				lines.push(moveUp + result.sequence + moveDown);
			} else {
				const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
				lines = [this.theme.fallbackColor(fallback)];
			}
		} else {
			const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
			lines = [this.theme.fallbackColor(fallback)];
		}
		this.cachedLines = lines;
		this.cachedWidth = width;
		return lines;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/input.js
const segmenter = getSegmenter();
/**
* Input component - single-line text input with horizontal scrolling
*/
var Input = class {
	value = "";
	cursor = 0;
	onSubmit;
	onEscape;
	/** Focusable interface - set by TUI when focus changes */
	focused = false;
	pasteBuffer = "";
	isInPaste = false;
	killRing = new KillRing();
	lastAction = null;
	undoStack = new UndoStack();
	getValue() {
		return this.value;
	}
	setValue(value) {
		this.value = value;
		this.cursor = Math.min(this.cursor, value.length);
	}
	handleInput(data) {
		if (data.includes("\x1B[200~")) {
			this.isInPaste = true;
			this.pasteBuffer = "";
			data = data.replace("\x1B[200~", "");
		}
		if (this.isInPaste) {
			this.pasteBuffer += data;
			const endIndex = this.pasteBuffer.indexOf("\x1B[201~");
			if (endIndex !== -1) {
				const pasteContent = this.pasteBuffer.substring(0, endIndex);
				this.handlePaste(pasteContent);
				this.isInPaste = false;
				const remaining = this.pasteBuffer.substring(endIndex + 6);
				this.pasteBuffer = "";
				if (remaining) this.handleInput(remaining);
			}
			return;
		}
		const kb = getKeybindings();
		if (kb.matches(data, "tui.select.cancel")) {
			if (this.onEscape) this.onEscape();
			return;
		}
		if (kb.matches(data, "tui.editor.undo")) {
			this.undo();
			return;
		}
		if (kb.matches(data, "tui.input.submit") || data === "\n") {
			if (this.onSubmit) this.onSubmit(this.value);
			return;
		}
		if (kb.matches(data, "tui.editor.deleteCharBackward")) {
			this.handleBackspace();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteCharForward")) {
			this.handleForwardDelete();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteWordBackward")) {
			this.deleteWordBackwards();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteWordForward")) {
			this.deleteWordForward();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteToLineStart")) {
			this.deleteToLineStart();
			return;
		}
		if (kb.matches(data, "tui.editor.deleteToLineEnd")) {
			this.deleteToLineEnd();
			return;
		}
		if (kb.matches(data, "tui.editor.yank")) {
			this.yank();
			return;
		}
		if (kb.matches(data, "tui.editor.yankPop")) {
			this.yankPop();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorLeft")) {
			this.lastAction = null;
			if (this.cursor > 0) {
				const beforeCursor = this.value.slice(0, this.cursor);
				const graphemes = [...segmenter.segment(beforeCursor)];
				const lastGrapheme = graphemes[graphemes.length - 1];
				this.cursor -= lastGrapheme ? lastGrapheme.segment.length : 1;
			}
			return;
		}
		if (kb.matches(data, "tui.editor.cursorRight")) {
			this.lastAction = null;
			if (this.cursor < this.value.length) {
				const afterCursor = this.value.slice(this.cursor);
				const firstGrapheme = [...segmenter.segment(afterCursor)][0];
				this.cursor += firstGrapheme ? firstGrapheme.segment.length : 1;
			}
			return;
		}
		if (kb.matches(data, "tui.editor.cursorLineStart")) {
			this.lastAction = null;
			this.cursor = 0;
			return;
		}
		if (kb.matches(data, "tui.editor.cursorLineEnd")) {
			this.lastAction = null;
			this.cursor = this.value.length;
			return;
		}
		if (kb.matches(data, "tui.editor.cursorWordLeft")) {
			this.moveWordBackwards();
			return;
		}
		if (kb.matches(data, "tui.editor.cursorWordRight")) {
			this.moveWordForwards();
			return;
		}
		const kittyPrintable = decodeKittyPrintable(data);
		if (kittyPrintable !== void 0) {
			this.insertCharacter(kittyPrintable);
			return;
		}
		if (![...data].some((ch) => {
			const code = ch.charCodeAt(0);
			return code < 32 || code === 127 || code >= 128 && code <= 159;
		})) this.insertCharacter(data);
	}
	insertCharacter(char) {
		if (isWhitespaceChar(char) || this.lastAction !== "type-word") this.pushUndo();
		this.lastAction = "type-word";
		this.value = this.value.slice(0, this.cursor) + char + this.value.slice(this.cursor);
		this.cursor += char.length;
	}
	handleBackspace() {
		this.lastAction = null;
		if (this.cursor > 0) {
			this.pushUndo();
			const beforeCursor = this.value.slice(0, this.cursor);
			const graphemes = [...segmenter.segment(beforeCursor)];
			const lastGrapheme = graphemes[graphemes.length - 1];
			const graphemeLength = lastGrapheme ? lastGrapheme.segment.length : 1;
			this.value = this.value.slice(0, this.cursor - graphemeLength) + this.value.slice(this.cursor);
			this.cursor -= graphemeLength;
		}
	}
	handleForwardDelete() {
		this.lastAction = null;
		if (this.cursor < this.value.length) {
			this.pushUndo();
			const afterCursor = this.value.slice(this.cursor);
			const firstGrapheme = [...segmenter.segment(afterCursor)][0];
			const graphemeLength = firstGrapheme ? firstGrapheme.segment.length : 1;
			this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + graphemeLength);
		}
	}
	deleteToLineStart() {
		if (this.cursor === 0) return;
		this.pushUndo();
		const deletedText = this.value.slice(0, this.cursor);
		this.killRing.push(deletedText, {
			prepend: true,
			accumulate: this.lastAction === "kill"
		});
		this.lastAction = "kill";
		this.value = this.value.slice(this.cursor);
		this.cursor = 0;
	}
	deleteToLineEnd() {
		if (this.cursor >= this.value.length) return;
		this.pushUndo();
		const deletedText = this.value.slice(this.cursor);
		this.killRing.push(deletedText, {
			prepend: false,
			accumulate: this.lastAction === "kill"
		});
		this.lastAction = "kill";
		this.value = this.value.slice(0, this.cursor);
	}
	deleteWordBackwards() {
		if (this.cursor === 0) return;
		const wasKill = this.lastAction === "kill";
		this.pushUndo();
		const oldCursor = this.cursor;
		this.moveWordBackwards();
		const deleteFrom = this.cursor;
		this.cursor = oldCursor;
		const deletedText = this.value.slice(deleteFrom, this.cursor);
		this.killRing.push(deletedText, {
			prepend: true,
			accumulate: wasKill
		});
		this.lastAction = "kill";
		this.value = this.value.slice(0, deleteFrom) + this.value.slice(this.cursor);
		this.cursor = deleteFrom;
	}
	deleteWordForward() {
		if (this.cursor >= this.value.length) return;
		const wasKill = this.lastAction === "kill";
		this.pushUndo();
		const oldCursor = this.cursor;
		this.moveWordForwards();
		const deleteTo = this.cursor;
		this.cursor = oldCursor;
		const deletedText = this.value.slice(this.cursor, deleteTo);
		this.killRing.push(deletedText, {
			prepend: false,
			accumulate: wasKill
		});
		this.lastAction = "kill";
		this.value = this.value.slice(0, this.cursor) + this.value.slice(deleteTo);
	}
	yank() {
		const text = this.killRing.peek();
		if (!text) return;
		this.pushUndo();
		this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
		this.cursor += text.length;
		this.lastAction = "yank";
	}
	yankPop() {
		if (this.lastAction !== "yank" || this.killRing.length <= 1) return;
		this.pushUndo();
		const prevText = this.killRing.peek() || "";
		this.value = this.value.slice(0, this.cursor - prevText.length) + this.value.slice(this.cursor);
		this.cursor -= prevText.length;
		this.killRing.rotate();
		const text = this.killRing.peek() || "";
		this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
		this.cursor += text.length;
		this.lastAction = "yank";
	}
	pushUndo() {
		this.undoStack.push({
			value: this.value,
			cursor: this.cursor
		});
	}
	undo() {
		const snapshot = this.undoStack.pop();
		if (!snapshot) return;
		this.value = snapshot.value;
		this.cursor = snapshot.cursor;
		this.lastAction = null;
	}
	moveWordBackwards() {
		if (this.cursor === 0) return;
		this.lastAction = null;
		const textBeforeCursor = this.value.slice(0, this.cursor);
		const graphemes = [...segmenter.segment(textBeforeCursor)];
		while (graphemes.length > 0 && isWhitespaceChar(graphemes[graphemes.length - 1]?.segment || "")) this.cursor -= graphemes.pop()?.segment.length || 0;
		if (graphemes.length > 0) if (isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "")) while (graphemes.length > 0 && isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "")) this.cursor -= graphemes.pop()?.segment.length || 0;
		else while (graphemes.length > 0 && !isWhitespaceChar(graphemes[graphemes.length - 1]?.segment || "") && !isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "")) this.cursor -= graphemes.pop()?.segment.length || 0;
	}
	moveWordForwards() {
		if (this.cursor >= this.value.length) return;
		this.lastAction = null;
		const textAfterCursor = this.value.slice(this.cursor);
		const iterator = segmenter.segment(textAfterCursor)[Symbol.iterator]();
		let next = iterator.next();
		while (!next.done && isWhitespaceChar(next.value.segment)) {
			this.cursor += next.value.segment.length;
			next = iterator.next();
		}
		if (!next.done) {
			const firstGrapheme = next.value.segment;
			if (isPunctuationChar(firstGrapheme)) while (!next.done && isPunctuationChar(next.value.segment)) {
				this.cursor += next.value.segment.length;
				next = iterator.next();
			}
			else while (!next.done && !isWhitespaceChar(next.value.segment) && !isPunctuationChar(next.value.segment)) {
				this.cursor += next.value.segment.length;
				next = iterator.next();
			}
		}
	}
	handlePaste(pastedText) {
		this.lastAction = null;
		this.pushUndo();
		const cleanText = pastedText.replace(/\r\n/g, "").replace(/\r/g, "").replace(/\n/g, "").replace(/\t/g, "    ");
		this.value = this.value.slice(0, this.cursor) + cleanText + this.value.slice(this.cursor);
		this.cursor += cleanText.length;
	}
	invalidate() {}
	render(width) {
		const prompt = "> ";
		const availableWidth = width - 2;
		if (availableWidth <= 0) return [prompt];
		let visibleText = "";
		let cursorDisplay = this.cursor;
		const totalWidth = visibleWidth(this.value);
		if (totalWidth < availableWidth) visibleText = this.value;
		else {
			const scrollWidth = this.cursor === this.value.length ? availableWidth - 1 : availableWidth;
			const cursorCol = visibleWidth(this.value.slice(0, this.cursor));
			if (scrollWidth > 0) {
				const halfWidth = Math.floor(scrollWidth / 2);
				let startCol = 0;
				if (cursorCol < halfWidth) startCol = 0;
				else if (cursorCol > totalWidth - halfWidth) startCol = Math.max(0, totalWidth - scrollWidth);
				else startCol = Math.max(0, cursorCol - halfWidth);
				visibleText = sliceByColumn(this.value, startCol, scrollWidth, true);
				cursorDisplay = sliceByColumn(this.value, startCol, Math.max(0, cursorCol - startCol), true).length;
			} else {
				visibleText = "";
				cursorDisplay = 0;
			}
		}
		const cursorGrapheme = [...segmenter.segment(visibleText.slice(cursorDisplay))][0];
		const beforeCursor = visibleText.slice(0, cursorDisplay);
		const atCursor = cursorGrapheme?.segment ?? " ";
		const afterCursor = visibleText.slice(cursorDisplay + atCursor.length);
		const marker = this.focused ? CURSOR_MARKER : "";
		const cursorChar = `\x1b[7m${atCursor}\x1b[27m`;
		const textWithCursor = beforeCursor + marker + cursorChar + afterCursor;
		const visualLength = visibleWidth(textWithCursor);
		const padding = " ".repeat(Math.max(0, availableWidth - visualLength));
		return [prompt + textWithCursor + padding];
	}
};

//#endregion
//#region node_modules/.pnpm/marked@15.0.12/node_modules/marked/lib/marked.esm.js
/**
* marked v15.0.12 - a markdown parser
* Copyright (c) 2011-2025, Christopher Jeffrey. (MIT Licensed)
* https://github.com/markedjs/marked
*/
/**
* DO NOT EDIT THIS FILE
* The code in this file is generated from files in ./src/
*/
function _getDefaults() {
	return {
		async: false,
		breaks: false,
		extensions: null,
		gfm: true,
		hooks: null,
		pedantic: false,
		renderer: null,
		silent: false,
		tokenizer: null,
		walkTokens: null
	};
}
var _defaults = _getDefaults();
function changeDefaults(newDefaults) {
	_defaults = newDefaults;
}
var noopTest = { exec: () => null };
function edit(regex, opt = "") {
	let source = typeof regex === "string" ? regex : regex.source;
	const obj = {
		replace: (name$1, val) => {
			let valSource = typeof val === "string" ? val : val.source;
			valSource = valSource.replace(other.caret, "$1");
			source = source.replace(name$1, valSource);
			return obj;
		},
		getRegex: () => {
			return new RegExp(source, opt);
		}
	};
	return obj;
}
var other = {
	codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
	outputLinkReplace: /\\([\[\]])/g,
	indentCodeCompensation: /^(\s+)(?:```)/,
	beginningSpace: /^\s+/,
	endingHash: /#$/,
	startingSpaceChar: /^ /,
	endingSpaceChar: / $/,
	nonSpaceChar: /[^ ]/,
	newLineCharGlobal: /\n/g,
	tabCharGlobal: /\t/g,
	multipleSpaceGlobal: /\s+/g,
	blankLine: /^[ \t]*$/,
	doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
	blockquoteStart: /^ {0,3}>/,
	blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
	blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
	listReplaceTabs: /^\t+/,
	listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
	listIsTask: /^\[[ xX]\] /,
	listReplaceTask: /^\[[ xX]\] +/,
	anyLine: /\n.*\n/,
	hrefBrackets: /^<(.*)>$/,
	tableDelimiter: /[:|]/,
	tableAlignChars: /^\||\| *$/g,
	tableRowBlankLine: /\n[ \t]*$/,
	tableAlignRight: /^ *-+: *$/,
	tableAlignCenter: /^ *:-+: *$/,
	tableAlignLeft: /^ *:-+ *$/,
	startATag: /^<a /i,
	endATag: /^<\/a>/i,
	startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
	endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
	startAngleBracket: /^</,
	endAngleBracket: />$/,
	pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
	unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
	escapeTest: /[&<>"']/,
	escapeReplace: /[&<>"']/g,
	escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
	escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
	unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi,
	caret: /(^|[^\[])\^/g,
	percentDecode: /%25/g,
	findPipe: /\|/g,
	splitPipe: / \|/,
	slashPipe: /\\\|/g,
	carriageReturn: /\r\n|\r/g,
	spaceLine: /^ +$/gm,
	notSpaceStart: /^\S*/,
	endingNewline: /\n$/,
	listItemRegex: (bull) => /* @__PURE__ */ new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`),
	nextBulletRegex: (indent) => /* @__PURE__ */ new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),
	hrRegex: (indent) => /* @__PURE__ */ new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),
	fencesBeginRegex: (indent) => /* @__PURE__ */ new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`),
	headingBeginRegex: (indent) => /* @__PURE__ */ new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`),
	htmlBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}<(?:[a-z].*>|!--)`, "i")
};
var newline = /^(?:[ \t]*(?:\n|$))+/;
var blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var bullet = /(?:[*+-]|\d{1,9}[.)])/;
var lheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var lheading = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var lheadingGfm = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var blockText = /^[^\n]+/;
var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
var def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var html = edit("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockNormal = {
	blockquote: edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex(),
	code: blockCode,
	def,
	fences,
	heading,
	hr,
	html,
	lheading,
	list,
	newline,
	paragraph,
	table: noopTest,
	text: blockText
};
var gfmTable = edit("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
var blockGfm = {
	...blockNormal,
	lheading: lheadingGfm,
	table: gfmTable,
	paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
};
var blockPedantic = {
	...blockNormal,
	html: edit(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
	def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
	heading: /^(#{1,6})(.*)(?:\n+|$)/,
	fences: noopTest,
	lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
	paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
};
var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var br = /^( {2,}|\\)\n(?!\s*$)/;
var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var _punctuation = /[\p{P}\p{S}]/u;
var _punctuationOrSpace = /[\s\p{P}\p{S}]/u;
var _notPunctuationOrSpace = /[^\s\p{P}\p{S}]/u;
var punctuation = edit(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, _punctuationOrSpace).getRegex();
var _punctuationGfmStrongEm = /(?!~)[\p{P}\p{S}]/u;
var _punctuationOrSpaceGfmStrongEm = /(?!~)[\s\p{P}\p{S}]/u;
var _notPunctuationOrSpaceGfmStrongEm = /(?:[^\s\p{P}\p{S}]|~)/u;
var blockSkip = /\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g;
var emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var emStrongLDelim = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuation).getRegex();
var emStrongLDelimGfm = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuationGfmStrongEm).getRegex();
var emStrongRDelimAstCore = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var emStrongRDelimAst = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
var emStrongRDelimAstGfm = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm).replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm).replace(/punct/g, _punctuationGfmStrongEm).getRegex();
var emStrongRDelimUnd = edit("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
var anyPunctuation = edit(/\\(punct)/, "gu").replace(/punct/g, _punctuation).getRegex();
var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
var tag = edit("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
var link = edit(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
var inlineNormal = {
	_backpedal: noopTest,
	anyPunctuation,
	autolink,
	blockSkip,
	br,
	code: inlineCode,
	del: noopTest,
	emStrongLDelim,
	emStrongRDelimAst,
	emStrongRDelimUnd,
	escape,
	link,
	nolink,
	punctuation,
	reflink,
	reflinkSearch: edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex(),
	tag,
	text: inlineText,
	url: noopTest
};
var inlinePedantic = {
	...inlineNormal,
	link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
	reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
};
var inlineGfm = {
	...inlineNormal,
	emStrongRDelimAst: emStrongRDelimAstGfm,
	emStrongLDelim: emStrongLDelimGfm,
	url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
	_backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
	del: /^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,
	text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
};
var inlineBreaks = {
	...inlineGfm,
	br: edit(br).replace("{2,}", "*").getRegex(),
	text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
};
var block = {
	normal: blockNormal,
	gfm: blockGfm,
	pedantic: blockPedantic
};
var inline = {
	normal: inlineNormal,
	gfm: inlineGfm,
	breaks: inlineBreaks,
	pedantic: inlinePedantic
};
var escapeReplacements = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
};
var getEscapeReplacement = (ch) => escapeReplacements[ch];
function escape2(html2, encode) {
	if (encode) {
		if (other.escapeTest.test(html2)) return html2.replace(other.escapeReplace, getEscapeReplacement);
	} else if (other.escapeTestNoEncode.test(html2)) return html2.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
	return html2;
}
function cleanUrl(href) {
	try {
		href = encodeURI(href).replace(other.percentDecode, "%");
	} catch {
		return null;
	}
	return href;
}
function splitCells(tableRow, count) {
	const cells = tableRow.replace(other.findPipe, (match, offset, str) => {
		let escaped = false;
		let curr = offset;
		while (--curr >= 0 && str[curr] === "\\") escaped = !escaped;
		if (escaped) return "|";
		else return " |";
	}).split(other.splitPipe);
	let i = 0;
	if (!cells[0].trim()) cells.shift();
	if (cells.length > 0 && !cells.at(-1)?.trim()) cells.pop();
	if (count) if (cells.length > count) cells.splice(count);
	else while (cells.length < count) cells.push("");
	for (; i < cells.length; i++) cells[i] = cells[i].trim().replace(other.slashPipe, "|");
	return cells;
}
function rtrim(str, c, invert) {
	const l = str.length;
	if (l === 0) return "";
	let suffLen = 0;
	while (suffLen < l) {
		const currChar = str.charAt(l - suffLen - 1);
		if (currChar === c && !invert) suffLen++;
		else if (currChar !== c && invert) suffLen++;
		else break;
	}
	return str.slice(0, l - suffLen);
}
function findClosingBracket(str, b) {
	if (str.indexOf(b[1]) === -1) return -1;
	let level = 0;
	for (let i = 0; i < str.length; i++) if (str[i] === "\\") i++;
	else if (str[i] === b[0]) level++;
	else if (str[i] === b[1]) {
		level--;
		if (level < 0) return i;
	}
	if (level > 0) return -2;
	return -1;
}
function outputLink(cap, link2, raw, lexer2, rules) {
	const href = link2.href;
	const title = link2.title || null;
	const text = cap[1].replace(rules.other.outputLinkReplace, "$1");
	lexer2.state.inLink = true;
	const token = {
		type: cap[0].charAt(0) === "!" ? "image" : "link",
		raw,
		href,
		title,
		text,
		tokens: lexer2.inlineTokens(text)
	};
	lexer2.state.inLink = false;
	return token;
}
function indentCodeCompensation(raw, text, rules) {
	const matchIndentToCode = raw.match(rules.other.indentCodeCompensation);
	if (matchIndentToCode === null) return text;
	const indentToCode = matchIndentToCode[1];
	return text.split("\n").map((node) => {
		const matchIndentInNode = node.match(rules.other.beginningSpace);
		if (matchIndentInNode === null) return node;
		const [indentInNode] = matchIndentInNode;
		if (indentInNode.length >= indentToCode.length) return node.slice(indentToCode.length);
		return node;
	}).join("\n");
}
var _Tokenizer = class {
	options;
	rules;
	lexer;
	constructor(options2) {
		this.options = options2 || _defaults;
	}
	space(src) {
		const cap = this.rules.block.newline.exec(src);
		if (cap && cap[0].length > 0) return {
			type: "space",
			raw: cap[0]
		};
	}
	code(src) {
		const cap = this.rules.block.code.exec(src);
		if (cap) {
			const text = cap[0].replace(this.rules.other.codeRemoveIndent, "");
			return {
				type: "code",
				raw: cap[0],
				codeBlockStyle: "indented",
				text: !this.options.pedantic ? rtrim(text, "\n") : text
			};
		}
	}
	fences(src) {
		const cap = this.rules.block.fences.exec(src);
		if (cap) {
			const raw = cap[0];
			const text = indentCodeCompensation(raw, cap[3] || "", this.rules);
			return {
				type: "code",
				raw,
				lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
				text
			};
		}
	}
	heading(src) {
		const cap = this.rules.block.heading.exec(src);
		if (cap) {
			let text = cap[2].trim();
			if (this.rules.other.endingHash.test(text)) {
				const trimmed = rtrim(text, "#");
				if (this.options.pedantic) text = trimmed.trim();
				else if (!trimmed || this.rules.other.endingSpaceChar.test(trimmed)) text = trimmed.trim();
			}
			return {
				type: "heading",
				raw: cap[0],
				depth: cap[1].length,
				text,
				tokens: this.lexer.inline(text)
			};
		}
	}
	hr(src) {
		const cap = this.rules.block.hr.exec(src);
		if (cap) return {
			type: "hr",
			raw: rtrim(cap[0], "\n")
		};
	}
	blockquote(src) {
		const cap = this.rules.block.blockquote.exec(src);
		if (cap) {
			let lines = rtrim(cap[0], "\n").split("\n");
			let raw = "";
			let text = "";
			const tokens = [];
			while (lines.length > 0) {
				let inBlockquote = false;
				const currentLines = [];
				let i;
				for (i = 0; i < lines.length; i++) if (this.rules.other.blockquoteStart.test(lines[i])) {
					currentLines.push(lines[i]);
					inBlockquote = true;
				} else if (!inBlockquote) currentLines.push(lines[i]);
				else break;
				lines = lines.slice(i);
				const currentRaw = currentLines.join("\n");
				const currentText = currentRaw.replace(this.rules.other.blockquoteSetextReplace, "\n    $1").replace(this.rules.other.blockquoteSetextReplace2, "");
				raw = raw ? `${raw}
${currentRaw}` : currentRaw;
				text = text ? `${text}
${currentText}` : currentText;
				const top = this.lexer.state.top;
				this.lexer.state.top = true;
				this.lexer.blockTokens(currentText, tokens, true);
				this.lexer.state.top = top;
				if (lines.length === 0) break;
				const lastToken = tokens.at(-1);
				if (lastToken?.type === "code") break;
				else if (lastToken?.type === "blockquote") {
					const oldToken = lastToken;
					const newText = oldToken.raw + "\n" + lines.join("\n");
					const newToken = this.blockquote(newText);
					tokens[tokens.length - 1] = newToken;
					raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
					text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
					break;
				} else if (lastToken?.type === "list") {
					const oldToken = lastToken;
					const newText = oldToken.raw + "\n" + lines.join("\n");
					const newToken = this.list(newText);
					tokens[tokens.length - 1] = newToken;
					raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
					text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
					lines = newText.substring(tokens.at(-1).raw.length).split("\n");
					continue;
				}
			}
			return {
				type: "blockquote",
				raw,
				tokens,
				text
			};
		}
	}
	list(src) {
		let cap = this.rules.block.list.exec(src);
		if (cap) {
			let bull = cap[1].trim();
			const isordered = bull.length > 1;
			const list2 = {
				type: "list",
				raw: "",
				ordered: isordered,
				start: isordered ? +bull.slice(0, -1) : "",
				loose: false,
				items: []
			};
			bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
			if (this.options.pedantic) bull = isordered ? bull : "[*+-]";
			const itemRegex = this.rules.other.listItemRegex(bull);
			let endsWithBlankLine = false;
			while (src) {
				let endEarly = false;
				let raw = "";
				let itemContents = "";
				if (!(cap = itemRegex.exec(src))) break;
				if (this.rules.block.hr.test(src)) break;
				raw = cap[0];
				src = src.substring(raw.length);
				let line = cap[2].split("\n", 1)[0].replace(this.rules.other.listReplaceTabs, (t) => " ".repeat(3 * t.length));
				let nextLine = src.split("\n", 1)[0];
				let blankLine = !line.trim();
				let indent = 0;
				if (this.options.pedantic) {
					indent = 2;
					itemContents = line.trimStart();
				} else if (blankLine) indent = cap[1].length + 1;
				else {
					indent = cap[2].search(this.rules.other.nonSpaceChar);
					indent = indent > 4 ? 1 : indent;
					itemContents = line.slice(indent);
					indent += cap[1].length;
				}
				if (blankLine && this.rules.other.blankLine.test(nextLine)) {
					raw += nextLine + "\n";
					src = src.substring(nextLine.length + 1);
					endEarly = true;
				}
				if (!endEarly) {
					const nextBulletRegex = this.rules.other.nextBulletRegex(indent);
					const hrRegex = this.rules.other.hrRegex(indent);
					const fencesBeginRegex = this.rules.other.fencesBeginRegex(indent);
					const headingBeginRegex = this.rules.other.headingBeginRegex(indent);
					const htmlBeginRegex = this.rules.other.htmlBeginRegex(indent);
					while (src) {
						const rawLine = src.split("\n", 1)[0];
						let nextLineWithoutTabs;
						nextLine = rawLine;
						if (this.options.pedantic) {
							nextLine = nextLine.replace(this.rules.other.listReplaceNesting, "  ");
							nextLineWithoutTabs = nextLine;
						} else nextLineWithoutTabs = nextLine.replace(this.rules.other.tabCharGlobal, "    ");
						if (fencesBeginRegex.test(nextLine)) break;
						if (headingBeginRegex.test(nextLine)) break;
						if (htmlBeginRegex.test(nextLine)) break;
						if (nextBulletRegex.test(nextLine)) break;
						if (hrRegex.test(nextLine)) break;
						if (nextLineWithoutTabs.search(this.rules.other.nonSpaceChar) >= indent || !nextLine.trim()) itemContents += "\n" + nextLineWithoutTabs.slice(indent);
						else {
							if (blankLine) break;
							if (line.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4) break;
							if (fencesBeginRegex.test(line)) break;
							if (headingBeginRegex.test(line)) break;
							if (hrRegex.test(line)) break;
							itemContents += "\n" + nextLine;
						}
						if (!blankLine && !nextLine.trim()) blankLine = true;
						raw += rawLine + "\n";
						src = src.substring(rawLine.length + 1);
						line = nextLineWithoutTabs.slice(indent);
					}
				}
				if (!list2.loose) {
					if (endsWithBlankLine) list2.loose = true;
					else if (this.rules.other.doubleBlankLine.test(raw)) endsWithBlankLine = true;
				}
				let istask = null;
				let ischecked;
				if (this.options.gfm) {
					istask = this.rules.other.listIsTask.exec(itemContents);
					if (istask) {
						ischecked = istask[0] !== "[ ] ";
						itemContents = itemContents.replace(this.rules.other.listReplaceTask, "");
					}
				}
				list2.items.push({
					type: "list_item",
					raw,
					task: !!istask,
					checked: ischecked,
					loose: false,
					text: itemContents,
					tokens: []
				});
				list2.raw += raw;
			}
			const lastItem = list2.items.at(-1);
			if (lastItem) {
				lastItem.raw = lastItem.raw.trimEnd();
				lastItem.text = lastItem.text.trimEnd();
			} else return;
			list2.raw = list2.raw.trimEnd();
			for (let i = 0; i < list2.items.length; i++) {
				this.lexer.state.top = false;
				list2.items[i].tokens = this.lexer.blockTokens(list2.items[i].text, []);
				if (!list2.loose) {
					const spacers = list2.items[i].tokens.filter((t) => t.type === "space");
					list2.loose = spacers.length > 0 && spacers.some((t) => this.rules.other.anyLine.test(t.raw));
				}
			}
			if (list2.loose) for (let i = 0; i < list2.items.length; i++) list2.items[i].loose = true;
			return list2;
		}
	}
	html(src) {
		const cap = this.rules.block.html.exec(src);
		if (cap) return {
			type: "html",
			block: true,
			raw: cap[0],
			pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
			text: cap[0]
		};
	}
	def(src) {
		const cap = this.rules.block.def.exec(src);
		if (cap) {
			const tag2 = cap[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " ");
			const href = cap[2] ? cap[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
			const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
			return {
				type: "def",
				tag: tag2,
				raw: cap[0],
				href,
				title
			};
		}
	}
	table(src) {
		const cap = this.rules.block.table.exec(src);
		if (!cap) return;
		if (!this.rules.other.tableDelimiter.test(cap[2])) return;
		const headers = splitCells(cap[1]);
		const aligns = cap[2].replace(this.rules.other.tableAlignChars, "").split("|");
		const rows = cap[3]?.trim() ? cap[3].replace(this.rules.other.tableRowBlankLine, "").split("\n") : [];
		const item = {
			type: "table",
			raw: cap[0],
			header: [],
			align: [],
			rows: []
		};
		if (headers.length !== aligns.length) return;
		for (const align of aligns) if (this.rules.other.tableAlignRight.test(align)) item.align.push("right");
		else if (this.rules.other.tableAlignCenter.test(align)) item.align.push("center");
		else if (this.rules.other.tableAlignLeft.test(align)) item.align.push("left");
		else item.align.push(null);
		for (let i = 0; i < headers.length; i++) item.header.push({
			text: headers[i],
			tokens: this.lexer.inline(headers[i]),
			header: true,
			align: item.align[i]
		});
		for (const row of rows) item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
			return {
				text: cell,
				tokens: this.lexer.inline(cell),
				header: false,
				align: item.align[i]
			};
		}));
		return item;
	}
	lheading(src) {
		const cap = this.rules.block.lheading.exec(src);
		if (cap) return {
			type: "heading",
			raw: cap[0],
			depth: cap[2].charAt(0) === "=" ? 1 : 2,
			text: cap[1],
			tokens: this.lexer.inline(cap[1])
		};
	}
	paragraph(src) {
		const cap = this.rules.block.paragraph.exec(src);
		if (cap) {
			const text = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
			return {
				type: "paragraph",
				raw: cap[0],
				text,
				tokens: this.lexer.inline(text)
			};
		}
	}
	text(src) {
		const cap = this.rules.block.text.exec(src);
		if (cap) return {
			type: "text",
			raw: cap[0],
			text: cap[0],
			tokens: this.lexer.inline(cap[0])
		};
	}
	escape(src) {
		const cap = this.rules.inline.escape.exec(src);
		if (cap) return {
			type: "escape",
			raw: cap[0],
			text: cap[1]
		};
	}
	tag(src) {
		const cap = this.rules.inline.tag.exec(src);
		if (cap) {
			if (!this.lexer.state.inLink && this.rules.other.startATag.test(cap[0])) this.lexer.state.inLink = true;
			else if (this.lexer.state.inLink && this.rules.other.endATag.test(cap[0])) this.lexer.state.inLink = false;
			if (!this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(cap[0])) this.lexer.state.inRawBlock = true;
			else if (this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(cap[0])) this.lexer.state.inRawBlock = false;
			return {
				type: "html",
				raw: cap[0],
				inLink: this.lexer.state.inLink,
				inRawBlock: this.lexer.state.inRawBlock,
				block: false,
				text: cap[0]
			};
		}
	}
	link(src) {
		const cap = this.rules.inline.link.exec(src);
		if (cap) {
			const trimmedUrl = cap[2].trim();
			if (!this.options.pedantic && this.rules.other.startAngleBracket.test(trimmedUrl)) {
				if (!this.rules.other.endAngleBracket.test(trimmedUrl)) return;
				const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
				if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) return;
			} else {
				const lastParenIndex = findClosingBracket(cap[2], "()");
				if (lastParenIndex === -2) return;
				if (lastParenIndex > -1) {
					const linkLen = (cap[0].indexOf("!") === 0 ? 5 : 4) + cap[1].length + lastParenIndex;
					cap[2] = cap[2].substring(0, lastParenIndex);
					cap[0] = cap[0].substring(0, linkLen).trim();
					cap[3] = "";
				}
			}
			let href = cap[2];
			let title = "";
			if (this.options.pedantic) {
				const link2 = this.rules.other.pedanticHrefTitle.exec(href);
				if (link2) {
					href = link2[1];
					title = link2[3];
				}
			} else title = cap[3] ? cap[3].slice(1, -1) : "";
			href = href.trim();
			if (this.rules.other.startAngleBracket.test(href)) if (this.options.pedantic && !this.rules.other.endAngleBracket.test(trimmedUrl)) href = href.slice(1);
			else href = href.slice(1, -1);
			return outputLink(cap, {
				href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
				title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
			}, cap[0], this.lexer, this.rules);
		}
	}
	reflink(src, links) {
		let cap;
		if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
			const link2 = links[(cap[2] || cap[1]).replace(this.rules.other.multipleSpaceGlobal, " ").toLowerCase()];
			if (!link2) {
				const text = cap[0].charAt(0);
				return {
					type: "text",
					raw: text,
					text
				};
			}
			return outputLink(cap, link2, cap[0], this.lexer, this.rules);
		}
	}
	emStrong(src, maskedSrc, prevChar = "") {
		let match = this.rules.inline.emStrongLDelim.exec(src);
		if (!match) return;
		if (match[3] && prevChar.match(this.rules.other.unicodeAlphaNumeric)) return;
		if (!(match[1] || match[2] || "") || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
			const lLength = [...match[0]].length - 1;
			let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
			const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
			endReg.lastIndex = 0;
			maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
			while ((match = endReg.exec(maskedSrc)) != null) {
				rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
				if (!rDelim) continue;
				rLength = [...rDelim].length;
				if (match[3] || match[4]) {
					delimTotal += rLength;
					continue;
				} else if (match[5] || match[6]) {
					if (lLength % 3 && !((lLength + rLength) % 3)) {
						midDelimTotal += rLength;
						continue;
					}
				}
				delimTotal -= rLength;
				if (delimTotal > 0) continue;
				rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
				const lastCharLength = [...match[0]][0].length;
				const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
				if (Math.min(lLength, rLength) % 2) {
					const text2 = raw.slice(1, -1);
					return {
						type: "em",
						raw,
						text: text2,
						tokens: this.lexer.inlineTokens(text2)
					};
				}
				const text = raw.slice(2, -2);
				return {
					type: "strong",
					raw,
					text,
					tokens: this.lexer.inlineTokens(text)
				};
			}
		}
	}
	codespan(src) {
		const cap = this.rules.inline.code.exec(src);
		if (cap) {
			let text = cap[2].replace(this.rules.other.newLineCharGlobal, " ");
			const hasNonSpaceChars = this.rules.other.nonSpaceChar.test(text);
			const hasSpaceCharsOnBothEnds = this.rules.other.startingSpaceChar.test(text) && this.rules.other.endingSpaceChar.test(text);
			if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) text = text.substring(1, text.length - 1);
			return {
				type: "codespan",
				raw: cap[0],
				text
			};
		}
	}
	br(src) {
		const cap = this.rules.inline.br.exec(src);
		if (cap) return {
			type: "br",
			raw: cap[0]
		};
	}
	del(src) {
		const cap = this.rules.inline.del.exec(src);
		if (cap) return {
			type: "del",
			raw: cap[0],
			text: cap[2],
			tokens: this.lexer.inlineTokens(cap[2])
		};
	}
	autolink(src) {
		const cap = this.rules.inline.autolink.exec(src);
		if (cap) {
			let text, href;
			if (cap[2] === "@") {
				text = cap[1];
				href = "mailto:" + text;
			} else {
				text = cap[1];
				href = text;
			}
			return {
				type: "link",
				raw: cap[0],
				text,
				href,
				tokens: [{
					type: "text",
					raw: text,
					text
				}]
			};
		}
	}
	url(src) {
		let cap;
		if (cap = this.rules.inline.url.exec(src)) {
			let text, href;
			if (cap[2] === "@") {
				text = cap[0];
				href = "mailto:" + text;
			} else {
				let prevCapZero;
				do {
					prevCapZero = cap[0];
					cap[0] = this.rules.inline._backpedal.exec(cap[0])?.[0] ?? "";
				} while (prevCapZero !== cap[0]);
				text = cap[0];
				if (cap[1] === "www.") href = "http://" + cap[0];
				else href = cap[0];
			}
			return {
				type: "link",
				raw: cap[0],
				text,
				href,
				tokens: [{
					type: "text",
					raw: text,
					text
				}]
			};
		}
	}
	inlineText(src) {
		const cap = this.rules.inline.text.exec(src);
		if (cap) {
			const escaped = this.lexer.state.inRawBlock;
			return {
				type: "text",
				raw: cap[0],
				text: cap[0],
				escaped
			};
		}
	}
};
var _Lexer = class __Lexer {
	tokens;
	options;
	state;
	tokenizer;
	inlineQueue;
	constructor(options2) {
		this.tokens = [];
		this.tokens.links = /* @__PURE__ */ Object.create(null);
		this.options = options2 || _defaults;
		this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
		this.tokenizer = this.options.tokenizer;
		this.tokenizer.options = this.options;
		this.tokenizer.lexer = this;
		this.inlineQueue = [];
		this.state = {
			inLink: false,
			inRawBlock: false,
			top: true
		};
		const rules = {
			other,
			block: block.normal,
			inline: inline.normal
		};
		if (this.options.pedantic) {
			rules.block = block.pedantic;
			rules.inline = inline.pedantic;
		} else if (this.options.gfm) {
			rules.block = block.gfm;
			if (this.options.breaks) rules.inline = inline.breaks;
			else rules.inline = inline.gfm;
		}
		this.tokenizer.rules = rules;
	}
	/**
	* Expose Rules
	*/
	static get rules() {
		return {
			block,
			inline
		};
	}
	/**
	* Static Lex Method
	*/
	static lex(src, options2) {
		return new __Lexer(options2).lex(src);
	}
	/**
	* Static Lex Inline Method
	*/
	static lexInline(src, options2) {
		return new __Lexer(options2).inlineTokens(src);
	}
	/**
	* Preprocessing
	*/
	lex(src) {
		src = src.replace(other.carriageReturn, "\n");
		this.blockTokens(src, this.tokens);
		for (let i = 0; i < this.inlineQueue.length; i++) {
			const next = this.inlineQueue[i];
			this.inlineTokens(next.src, next.tokens);
		}
		this.inlineQueue = [];
		return this.tokens;
	}
	blockTokens(src, tokens = [], lastParagraphClipped = false) {
		if (this.options.pedantic) src = src.replace(other.tabCharGlobal, "    ").replace(other.spaceLine, "");
		while (src) {
			let token;
			if (this.options.extensions?.block?.some((extTokenizer) => {
				if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
					src = src.substring(token.raw.length);
					tokens.push(token);
					return true;
				}
				return false;
			})) continue;
			if (token = this.tokenizer.space(src)) {
				src = src.substring(token.raw.length);
				const lastToken = tokens.at(-1);
				if (token.raw.length === 1 && lastToken !== void 0) lastToken.raw += "\n";
				else tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.code(src)) {
				src = src.substring(token.raw.length);
				const lastToken = tokens.at(-1);
				if (lastToken?.type === "paragraph" || lastToken?.type === "text") {
					lastToken.raw += "\n" + token.raw;
					lastToken.text += "\n" + token.text;
					this.inlineQueue.at(-1).src = lastToken.text;
				} else tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.fences(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.heading(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.hr(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.blockquote(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.list(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.html(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.def(src)) {
				src = src.substring(token.raw.length);
				const lastToken = tokens.at(-1);
				if (lastToken?.type === "paragraph" || lastToken?.type === "text") {
					lastToken.raw += "\n" + token.raw;
					lastToken.text += "\n" + token.raw;
					this.inlineQueue.at(-1).src = lastToken.text;
				} else if (!this.tokens.links[token.tag]) this.tokens.links[token.tag] = {
					href: token.href,
					title: token.title
				};
				continue;
			}
			if (token = this.tokenizer.table(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.lheading(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			let cutSrc = src;
			if (this.options.extensions?.startBlock) {
				let startIndex = Infinity;
				const tempSrc = src.slice(1);
				let tempStart;
				this.options.extensions.startBlock.forEach((getStartIndex) => {
					tempStart = getStartIndex.call({ lexer: this }, tempSrc);
					if (typeof tempStart === "number" && tempStart >= 0) startIndex = Math.min(startIndex, tempStart);
				});
				if (startIndex < Infinity && startIndex >= 0) cutSrc = src.substring(0, startIndex + 1);
			}
			if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
				const lastToken = tokens.at(-1);
				if (lastParagraphClipped && lastToken?.type === "paragraph") {
					lastToken.raw += "\n" + token.raw;
					lastToken.text += "\n" + token.text;
					this.inlineQueue.pop();
					this.inlineQueue.at(-1).src = lastToken.text;
				} else tokens.push(token);
				lastParagraphClipped = cutSrc.length !== src.length;
				src = src.substring(token.raw.length);
				continue;
			}
			if (token = this.tokenizer.text(src)) {
				src = src.substring(token.raw.length);
				const lastToken = tokens.at(-1);
				if (lastToken?.type === "text") {
					lastToken.raw += "\n" + token.raw;
					lastToken.text += "\n" + token.text;
					this.inlineQueue.pop();
					this.inlineQueue.at(-1).src = lastToken.text;
				} else tokens.push(token);
				continue;
			}
			if (src) {
				const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
				if (this.options.silent) {
					console.error(errMsg);
					break;
				} else throw new Error(errMsg);
			}
		}
		this.state.top = true;
		return tokens;
	}
	inline(src, tokens = []) {
		this.inlineQueue.push({
			src,
			tokens
		});
		return tokens;
	}
	/**
	* Lexing/Compiling
	*/
	inlineTokens(src, tokens = []) {
		let maskedSrc = src;
		let match = null;
		if (this.tokens.links) {
			const links = Object.keys(this.tokens.links);
			if (links.length > 0) {
				while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
			}
		}
		while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
		while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
		let keepPrevChar = false;
		let prevChar = "";
		while (src) {
			if (!keepPrevChar) prevChar = "";
			keepPrevChar = false;
			let token;
			if (this.options.extensions?.inline?.some((extTokenizer) => {
				if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
					src = src.substring(token.raw.length);
					tokens.push(token);
					return true;
				}
				return false;
			})) continue;
			if (token = this.tokenizer.escape(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.tag(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.link(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.reflink(src, this.tokens.links)) {
				src = src.substring(token.raw.length);
				const lastToken = tokens.at(-1);
				if (token.type === "text" && lastToken?.type === "text") {
					lastToken.raw += token.raw;
					lastToken.text += token.text;
				} else tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.codespan(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.br(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.del(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (token = this.tokenizer.autolink(src)) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			if (!this.state.inLink && (token = this.tokenizer.url(src))) {
				src = src.substring(token.raw.length);
				tokens.push(token);
				continue;
			}
			let cutSrc = src;
			if (this.options.extensions?.startInline) {
				let startIndex = Infinity;
				const tempSrc = src.slice(1);
				let tempStart;
				this.options.extensions.startInline.forEach((getStartIndex) => {
					tempStart = getStartIndex.call({ lexer: this }, tempSrc);
					if (typeof tempStart === "number" && tempStart >= 0) startIndex = Math.min(startIndex, tempStart);
				});
				if (startIndex < Infinity && startIndex >= 0) cutSrc = src.substring(0, startIndex + 1);
			}
			if (token = this.tokenizer.inlineText(cutSrc)) {
				src = src.substring(token.raw.length);
				if (token.raw.slice(-1) !== "_") prevChar = token.raw.slice(-1);
				keepPrevChar = true;
				const lastToken = tokens.at(-1);
				if (lastToken?.type === "text") {
					lastToken.raw += token.raw;
					lastToken.text += token.text;
				} else tokens.push(token);
				continue;
			}
			if (src) {
				const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
				if (this.options.silent) {
					console.error(errMsg);
					break;
				} else throw new Error(errMsg);
			}
		}
		return tokens;
	}
};
var _Renderer = class {
	options;
	parser;
	constructor(options2) {
		this.options = options2 || _defaults;
	}
	space(token) {
		return "";
	}
	code({ text, lang, escaped }) {
		const langString = (lang || "").match(other.notSpaceStart)?.[0];
		const code = text.replace(other.endingNewline, "") + "\n";
		if (!langString) return "<pre><code>" + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
		return "<pre><code class=\"language-" + escape2(langString) + "\">" + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
	}
	blockquote({ tokens }) {
		return `<blockquote>
${this.parser.parse(tokens)}</blockquote>
`;
	}
	html({ text }) {
		return text;
	}
	heading({ tokens, depth }) {
		return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>
`;
	}
	hr(token) {
		return "<hr>\n";
	}
	list(token) {
		const ordered = token.ordered;
		const start = token.start;
		let body = "";
		for (let j = 0; j < token.items.length; j++) {
			const item = token.items[j];
			body += this.listitem(item);
		}
		const type = ordered ? "ol" : "ul";
		const startAttr = ordered && start !== 1 ? " start=\"" + start + "\"" : "";
		return "<" + type + startAttr + ">\n" + body + "</" + type + ">\n";
	}
	listitem(item) {
		let itemBody = "";
		if (item.task) {
			const checkbox = this.checkbox({ checked: !!item.checked });
			if (item.loose) if (item.tokens[0]?.type === "paragraph") {
				item.tokens[0].text = checkbox + " " + item.tokens[0].text;
				if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
					item.tokens[0].tokens[0].text = checkbox + " " + escape2(item.tokens[0].tokens[0].text);
					item.tokens[0].tokens[0].escaped = true;
				}
			} else item.tokens.unshift({
				type: "text",
				raw: checkbox + " ",
				text: checkbox + " ",
				escaped: true
			});
			else itemBody += checkbox + " ";
		}
		itemBody += this.parser.parse(item.tokens, !!item.loose);
		return `<li>${itemBody}</li>
`;
	}
	checkbox({ checked }) {
		return "<input " + (checked ? "checked=\"\" " : "") + "disabled=\"\" type=\"checkbox\">";
	}
	paragraph({ tokens }) {
		return `<p>${this.parser.parseInline(tokens)}</p>
`;
	}
	table(token) {
		let header = "";
		let cell = "";
		for (let j = 0; j < token.header.length; j++) cell += this.tablecell(token.header[j]);
		header += this.tablerow({ text: cell });
		let body = "";
		for (let j = 0; j < token.rows.length; j++) {
			const row = token.rows[j];
			cell = "";
			for (let k = 0; k < row.length; k++) cell += this.tablecell(row[k]);
			body += this.tablerow({ text: cell });
		}
		if (body) body = `<tbody>${body}</tbody>`;
		return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
	}
	tablerow({ text }) {
		return `<tr>
${text}</tr>
`;
	}
	tablecell(token) {
		const content = this.parser.parseInline(token.tokens);
		const type = token.header ? "th" : "td";
		return (token.align ? `<${type} align="${token.align}">` : `<${type}>`) + content + `</${type}>
`;
	}
	/**
	* span level renderer
	*/
	strong({ tokens }) {
		return `<strong>${this.parser.parseInline(tokens)}</strong>`;
	}
	em({ tokens }) {
		return `<em>${this.parser.parseInline(tokens)}</em>`;
	}
	codespan({ text }) {
		return `<code>${escape2(text, true)}</code>`;
	}
	br(token) {
		return "<br>";
	}
	del({ tokens }) {
		return `<del>${this.parser.parseInline(tokens)}</del>`;
	}
	link({ href, title, tokens }) {
		const text = this.parser.parseInline(tokens);
		const cleanHref = cleanUrl(href);
		if (cleanHref === null) return text;
		href = cleanHref;
		let out = "<a href=\"" + href + "\"";
		if (title) out += " title=\"" + escape2(title) + "\"";
		out += ">" + text + "</a>";
		return out;
	}
	image({ href, title, text, tokens }) {
		if (tokens) text = this.parser.parseInline(tokens, this.parser.textRenderer);
		const cleanHref = cleanUrl(href);
		if (cleanHref === null) return escape2(text);
		href = cleanHref;
		let out = `<img src="${href}" alt="${text}"`;
		if (title) out += ` title="${escape2(title)}"`;
		out += ">";
		return out;
	}
	text(token) {
		return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : "escaped" in token && token.escaped ? token.text : escape2(token.text);
	}
};
var _TextRenderer = class {
	strong({ text }) {
		return text;
	}
	em({ text }) {
		return text;
	}
	codespan({ text }) {
		return text;
	}
	del({ text }) {
		return text;
	}
	html({ text }) {
		return text;
	}
	text({ text }) {
		return text;
	}
	link({ text }) {
		return "" + text;
	}
	image({ text }) {
		return "" + text;
	}
	br() {
		return "";
	}
};
var _Parser = class __Parser {
	options;
	renderer;
	textRenderer;
	constructor(options2) {
		this.options = options2 || _defaults;
		this.options.renderer = this.options.renderer || new _Renderer();
		this.renderer = this.options.renderer;
		this.renderer.options = this.options;
		this.renderer.parser = this;
		this.textRenderer = new _TextRenderer();
	}
	/**
	* Static Parse Method
	*/
	static parse(tokens, options2) {
		return new __Parser(options2).parse(tokens);
	}
	/**
	* Static Parse Inline Method
	*/
	static parseInline(tokens, options2) {
		return new __Parser(options2).parseInline(tokens);
	}
	/**
	* Parse Loop
	*/
	parse(tokens, top = true) {
		let out = "";
		for (let i = 0; i < tokens.length; i++) {
			const anyToken = tokens[i];
			if (this.options.extensions?.renderers?.[anyToken.type]) {
				const genericToken = anyToken;
				const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
				if (ret !== false || ![
					"space",
					"hr",
					"heading",
					"code",
					"table",
					"blockquote",
					"list",
					"html",
					"paragraph",
					"text"
				].includes(genericToken.type)) {
					out += ret || "";
					continue;
				}
			}
			const token = anyToken;
			switch (token.type) {
				case "space":
					out += this.renderer.space(token);
					continue;
				case "hr":
					out += this.renderer.hr(token);
					continue;
				case "heading":
					out += this.renderer.heading(token);
					continue;
				case "code":
					out += this.renderer.code(token);
					continue;
				case "table":
					out += this.renderer.table(token);
					continue;
				case "blockquote":
					out += this.renderer.blockquote(token);
					continue;
				case "list":
					out += this.renderer.list(token);
					continue;
				case "html":
					out += this.renderer.html(token);
					continue;
				case "paragraph":
					out += this.renderer.paragraph(token);
					continue;
				case "text": {
					let textToken = token;
					let body = this.renderer.text(textToken);
					while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
						textToken = tokens[++i];
						body += "\n" + this.renderer.text(textToken);
					}
					if (top) out += this.renderer.paragraph({
						type: "paragraph",
						raw: body,
						text: body,
						tokens: [{
							type: "text",
							raw: body,
							text: body,
							escaped: true
						}]
					});
					else out += body;
					continue;
				}
				default: {
					const errMsg = "Token with \"" + token.type + "\" type was not found.";
					if (this.options.silent) {
						console.error(errMsg);
						return "";
					} else throw new Error(errMsg);
				}
			}
		}
		return out;
	}
	/**
	* Parse Inline Tokens
	*/
	parseInline(tokens, renderer = this.renderer) {
		let out = "";
		for (let i = 0; i < tokens.length; i++) {
			const anyToken = tokens[i];
			if (this.options.extensions?.renderers?.[anyToken.type]) {
				const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
				if (ret !== false || ![
					"escape",
					"html",
					"link",
					"image",
					"strong",
					"em",
					"codespan",
					"br",
					"del",
					"text"
				].includes(anyToken.type)) {
					out += ret || "";
					continue;
				}
			}
			const token = anyToken;
			switch (token.type) {
				case "escape":
					out += renderer.text(token);
					break;
				case "html":
					out += renderer.html(token);
					break;
				case "link":
					out += renderer.link(token);
					break;
				case "image":
					out += renderer.image(token);
					break;
				case "strong":
					out += renderer.strong(token);
					break;
				case "em":
					out += renderer.em(token);
					break;
				case "codespan":
					out += renderer.codespan(token);
					break;
				case "br":
					out += renderer.br(token);
					break;
				case "del":
					out += renderer.del(token);
					break;
				case "text":
					out += renderer.text(token);
					break;
				default: {
					const errMsg = "Token with \"" + token.type + "\" type was not found.";
					if (this.options.silent) {
						console.error(errMsg);
						return "";
					} else throw new Error(errMsg);
				}
			}
		}
		return out;
	}
};
var _Hooks = class {
	options;
	block;
	constructor(options2) {
		this.options = options2 || _defaults;
	}
	static passThroughHooks = /* @__PURE__ */ new Set([
		"preprocess",
		"postprocess",
		"processAllTokens"
	]);
	/**
	* Process markdown before marked
	*/
	preprocess(markdown) {
		return markdown;
	}
	/**
	* Process HTML after marked is finished
	*/
	postprocess(html2) {
		return html2;
	}
	/**
	* Process all tokens before walk tokens
	*/
	processAllTokens(tokens) {
		return tokens;
	}
	/**
	* Provide function to tokenize markdown
	*/
	provideLexer() {
		return this.block ? _Lexer.lex : _Lexer.lexInline;
	}
	/**
	* Provide function to parse tokens
	*/
	provideParser() {
		return this.block ? _Parser.parse : _Parser.parseInline;
	}
};
var Marked = class {
	defaults = _getDefaults();
	options = this.setOptions;
	parse = this.parseMarkdown(true);
	parseInline = this.parseMarkdown(false);
	Parser = _Parser;
	Renderer = _Renderer;
	TextRenderer = _TextRenderer;
	Lexer = _Lexer;
	Tokenizer = _Tokenizer;
	Hooks = _Hooks;
	constructor(...args) {
		this.use(...args);
	}
	/**
	* Run callback for every token
	*/
	walkTokens(tokens, callback) {
		let values = [];
		for (const token of tokens) {
			values = values.concat(callback.call(this, token));
			switch (token.type) {
				case "table": {
					const tableToken = token;
					for (const cell of tableToken.header) values = values.concat(this.walkTokens(cell.tokens, callback));
					for (const row of tableToken.rows) for (const cell of row) values = values.concat(this.walkTokens(cell.tokens, callback));
					break;
				}
				case "list": {
					const listToken = token;
					values = values.concat(this.walkTokens(listToken.items, callback));
					break;
				}
				default: {
					const genericToken = token;
					if (this.defaults.extensions?.childTokens?.[genericToken.type]) this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
						const tokens2 = genericToken[childTokens].flat(Infinity);
						values = values.concat(this.walkTokens(tokens2, callback));
					});
					else if (genericToken.tokens) values = values.concat(this.walkTokens(genericToken.tokens, callback));
				}
			}
		}
		return values;
	}
	use(...args) {
		const extensions = this.defaults.extensions || {
			renderers: {},
			childTokens: {}
		};
		args.forEach((pack) => {
			const opts = { ...pack };
			opts.async = this.defaults.async || opts.async || false;
			if (pack.extensions) {
				pack.extensions.forEach((ext) => {
					if (!ext.name) throw new Error("extension name required");
					if ("renderer" in ext) {
						const prevRenderer = extensions.renderers[ext.name];
						if (prevRenderer) extensions.renderers[ext.name] = function(...args2) {
							let ret = ext.renderer.apply(this, args2);
							if (ret === false) ret = prevRenderer.apply(this, args2);
							return ret;
						};
						else extensions.renderers[ext.name] = ext.renderer;
					}
					if ("tokenizer" in ext) {
						if (!ext.level || ext.level !== "block" && ext.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
						const extLevel = extensions[ext.level];
						if (extLevel) extLevel.unshift(ext.tokenizer);
						else extensions[ext.level] = [ext.tokenizer];
						if (ext.start) {
							if (ext.level === "block") if (extensions.startBlock) extensions.startBlock.push(ext.start);
							else extensions.startBlock = [ext.start];
							else if (ext.level === "inline") if (extensions.startInline) extensions.startInline.push(ext.start);
							else extensions.startInline = [ext.start];
						}
					}
					if ("childTokens" in ext && ext.childTokens) extensions.childTokens[ext.name] = ext.childTokens;
				});
				opts.extensions = extensions;
			}
			if (pack.renderer) {
				const renderer = this.defaults.renderer || new _Renderer(this.defaults);
				for (const prop in pack.renderer) {
					if (!(prop in renderer)) throw new Error(`renderer '${prop}' does not exist`);
					if (["options", "parser"].includes(prop)) continue;
					const rendererProp = prop;
					const rendererFunc = pack.renderer[rendererProp];
					const prevRenderer = renderer[rendererProp];
					renderer[rendererProp] = (...args2) => {
						let ret = rendererFunc.apply(renderer, args2);
						if (ret === false) ret = prevRenderer.apply(renderer, args2);
						return ret || "";
					};
				}
				opts.renderer = renderer;
			}
			if (pack.tokenizer) {
				const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
				for (const prop in pack.tokenizer) {
					if (!(prop in tokenizer)) throw new Error(`tokenizer '${prop}' does not exist`);
					if ([
						"options",
						"rules",
						"lexer"
					].includes(prop)) continue;
					const tokenizerProp = prop;
					const tokenizerFunc = pack.tokenizer[tokenizerProp];
					const prevTokenizer = tokenizer[tokenizerProp];
					tokenizer[tokenizerProp] = (...args2) => {
						let ret = tokenizerFunc.apply(tokenizer, args2);
						if (ret === false) ret = prevTokenizer.apply(tokenizer, args2);
						return ret;
					};
				}
				opts.tokenizer = tokenizer;
			}
			if (pack.hooks) {
				const hooks = this.defaults.hooks || new _Hooks();
				for (const prop in pack.hooks) {
					if (!(prop in hooks)) throw new Error(`hook '${prop}' does not exist`);
					if (["options", "block"].includes(prop)) continue;
					const hooksProp = prop;
					const hooksFunc = pack.hooks[hooksProp];
					const prevHook = hooks[hooksProp];
					if (_Hooks.passThroughHooks.has(prop)) hooks[hooksProp] = (arg) => {
						if (this.defaults.async) return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
							return prevHook.call(hooks, ret2);
						});
						const ret = hooksFunc.call(hooks, arg);
						return prevHook.call(hooks, ret);
					};
					else hooks[hooksProp] = (...args2) => {
						let ret = hooksFunc.apply(hooks, args2);
						if (ret === false) ret = prevHook.apply(hooks, args2);
						return ret;
					};
				}
				opts.hooks = hooks;
			}
			if (pack.walkTokens) {
				const walkTokens2 = this.defaults.walkTokens;
				const packWalktokens = pack.walkTokens;
				opts.walkTokens = function(token) {
					let values = [];
					values.push(packWalktokens.call(this, token));
					if (walkTokens2) values = values.concat(walkTokens2.call(this, token));
					return values;
				};
			}
			this.defaults = {
				...this.defaults,
				...opts
			};
		});
		return this;
	}
	setOptions(opt) {
		this.defaults = {
			...this.defaults,
			...opt
		};
		return this;
	}
	lexer(src, options2) {
		return _Lexer.lex(src, options2 ?? this.defaults);
	}
	parser(tokens, options2) {
		return _Parser.parse(tokens, options2 ?? this.defaults);
	}
	parseMarkdown(blockType) {
		const parse2 = (src, options2) => {
			const origOpt = { ...options2 };
			const opt = {
				...this.defaults,
				...origOpt
			};
			const throwError = this.onError(!!opt.silent, !!opt.async);
			if (this.defaults.async === true && origOpt.async === false) return throwError(/* @__PURE__ */ new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
			if (typeof src === "undefined" || src === null) return throwError(/* @__PURE__ */ new Error("marked(): input parameter is undefined or null"));
			if (typeof src !== "string") return throwError(/* @__PURE__ */ new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
			if (opt.hooks) {
				opt.hooks.options = opt;
				opt.hooks.block = blockType;
			}
			const lexer2 = opt.hooks ? opt.hooks.provideLexer() : blockType ? _Lexer.lex : _Lexer.lexInline;
			const parser2 = opt.hooks ? opt.hooks.provideParser() : blockType ? _Parser.parse : _Parser.parseInline;
			if (opt.async) return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
			try {
				if (opt.hooks) src = opt.hooks.preprocess(src);
				let tokens = lexer2(src, opt);
				if (opt.hooks) tokens = opt.hooks.processAllTokens(tokens);
				if (opt.walkTokens) this.walkTokens(tokens, opt.walkTokens);
				let html2 = parser2(tokens, opt);
				if (opt.hooks) html2 = opt.hooks.postprocess(html2);
				return html2;
			} catch (e) {
				return throwError(e);
			}
		};
		return parse2;
	}
	onError(silent, async) {
		return (e) => {
			e.message += "\nPlease report this to https://github.com/markedjs/marked.";
			if (silent) {
				const msg = "<p>An error occurred:</p><pre>" + escape2(e.message + "", true) + "</pre>";
				if (async) return Promise.resolve(msg);
				return msg;
			}
			if (async) return Promise.reject(e);
			throw e;
		};
	}
};
var markedInstance = new Marked();
function marked(src, opt) {
	return markedInstance.parse(src, opt);
}
marked.options = marked.setOptions = function(options2) {
	markedInstance.setOptions(options2);
	marked.defaults = markedInstance.defaults;
	changeDefaults(marked.defaults);
	return marked;
};
marked.getDefaults = _getDefaults;
marked.defaults = _defaults;
marked.use = function(...args) {
	markedInstance.use(...args);
	marked.defaults = markedInstance.defaults;
	changeDefaults(marked.defaults);
	return marked;
};
marked.walkTokens = function(tokens, callback) {
	return markedInstance.walkTokens(tokens, callback);
};
marked.parseInline = markedInstance.parseInline;
marked.Parser = _Parser;
marked.parser = _Parser.parse;
marked.Renderer = _Renderer;
marked.TextRenderer = _TextRenderer;
marked.Lexer = _Lexer;
marked.lexer = _Lexer.lex;
marked.Tokenizer = _Tokenizer;
marked.Hooks = _Hooks;
marked.parse = marked;
var options = marked.options;
var setOptions = marked.setOptions;
var use = marked.use;
var walkTokens = marked.walkTokens;
var parseInline = marked.parseInline;
var parser = _Parser.parse;
var lexer = _Lexer.lex;

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/markdown.js
const STRICT_STRIKETHROUGH_REGEX = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;
var StrictStrikethroughTokenizer = class extends _Tokenizer {
	del(src) {
		const match = STRICT_STRIKETHROUGH_REGEX.exec(src);
		if (!match) return;
		const text = match[2];
		return {
			type: "del",
			raw: match[0],
			text,
			tokens: this.lexer.inlineTokens(text)
		};
	}
};
const markdownParser = new Marked();
markdownParser.setOptions({ tokenizer: new StrictStrikethroughTokenizer() });
var Markdown = class {
	text;
	paddingX;
	paddingY;
	defaultTextStyle;
	theme;
	defaultStylePrefix;
	cachedText;
	cachedWidth;
	cachedLines;
	constructor(text, paddingX, paddingY, theme, defaultTextStyle) {
		this.text = text;
		this.paddingX = paddingX;
		this.paddingY = paddingY;
		this.theme = theme;
		this.defaultTextStyle = defaultTextStyle;
	}
	setText(text) {
		this.text = text;
		this.invalidate();
	}
	invalidate() {
		this.cachedText = void 0;
		this.cachedWidth = void 0;
		this.cachedLines = void 0;
	}
	render(width) {
		if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) return this.cachedLines;
		const contentWidth = Math.max(1, width - this.paddingX * 2);
		if (!this.text || this.text.trim() === "") {
			const result$1 = [];
			this.cachedText = this.text;
			this.cachedWidth = width;
			this.cachedLines = result$1;
			return result$1;
		}
		const normalizedText = this.text.replace(/\t/g, "   ");
		const tokens = markdownParser.lexer(normalizedText);
		const renderedLines = [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const nextToken = tokens[i + 1];
			const tokenLines = this.renderToken(token, contentWidth, nextToken?.type);
			renderedLines.push(...tokenLines);
		}
		const wrappedLines = [];
		for (const line of renderedLines) if (isImageLine(line)) wrappedLines.push(line);
		else wrappedLines.push(...wrapTextWithAnsi(line, contentWidth));
		const leftMargin = " ".repeat(this.paddingX);
		const rightMargin = " ".repeat(this.paddingX);
		const bgFn = this.defaultTextStyle?.bgColor;
		const contentLines$1 = [];
		for (const line of wrappedLines) {
			if (isImageLine(line)) {
				contentLines$1.push(line);
				continue;
			}
			const lineWithMargins = leftMargin + line + rightMargin;
			if (bgFn) contentLines$1.push(applyBackgroundToLine(lineWithMargins, width, bgFn));
			else {
				const visibleLen = visibleWidth(lineWithMargins);
				const paddingNeeded = Math.max(0, width - visibleLen);
				contentLines$1.push(lineWithMargins + " ".repeat(paddingNeeded));
			}
		}
		const emptyLine = " ".repeat(width);
		const emptyLines = [];
		for (let i = 0; i < this.paddingY; i++) {
			const line = bgFn ? applyBackgroundToLine(emptyLine, width, bgFn) : emptyLine;
			emptyLines.push(line);
		}
		const result = [
			...emptyLines,
			...contentLines$1,
			...emptyLines
		];
		this.cachedText = this.text;
		this.cachedWidth = width;
		this.cachedLines = result;
		return result.length > 0 ? result : [""];
	}
	/**
	* Apply default text style to a string.
	* This is the base styling applied to all text content.
	* NOTE: Background color is NOT applied here - it's applied at the padding stage
	* to ensure it extends to the full line width.
	*/
	applyDefaultStyle(text) {
		if (!this.defaultTextStyle) return text;
		let styled = text;
		if (this.defaultTextStyle.color) styled = this.defaultTextStyle.color(styled);
		if (this.defaultTextStyle.bold) styled = this.theme.bold(styled);
		if (this.defaultTextStyle.italic) styled = this.theme.italic(styled);
		if (this.defaultTextStyle.strikethrough) styled = this.theme.strikethrough(styled);
		if (this.defaultTextStyle.underline) styled = this.theme.underline(styled);
		return styled;
	}
	getDefaultStylePrefix() {
		if (!this.defaultTextStyle) return "";
		if (this.defaultStylePrefix !== void 0) return this.defaultStylePrefix;
		const sentinel = "\0";
		let styled = sentinel;
		if (this.defaultTextStyle.color) styled = this.defaultTextStyle.color(styled);
		if (this.defaultTextStyle.bold) styled = this.theme.bold(styled);
		if (this.defaultTextStyle.italic) styled = this.theme.italic(styled);
		if (this.defaultTextStyle.strikethrough) styled = this.theme.strikethrough(styled);
		if (this.defaultTextStyle.underline) styled = this.theme.underline(styled);
		const sentinelIndex = styled.indexOf(sentinel);
		this.defaultStylePrefix = sentinelIndex >= 0 ? styled.slice(0, sentinelIndex) : "";
		return this.defaultStylePrefix;
	}
	getStylePrefix(styleFn) {
		const sentinel = "\0";
		const styled = styleFn(sentinel);
		const sentinelIndex = styled.indexOf(sentinel);
		return sentinelIndex >= 0 ? styled.slice(0, sentinelIndex) : "";
	}
	getDefaultInlineStyleContext() {
		return {
			applyText: (text) => this.applyDefaultStyle(text),
			stylePrefix: this.getDefaultStylePrefix()
		};
	}
	renderToken(token, width, nextTokenType, styleContext) {
		const lines = [];
		switch (token.type) {
			case "heading": {
				const headingLevel = token.depth;
				const headingPrefix = `${"#".repeat(headingLevel)} `;
				let headingStyleFn;
				if (headingLevel === 1) headingStyleFn = (text) => this.theme.heading(this.theme.bold(this.theme.underline(text)));
				else headingStyleFn = (text) => this.theme.heading(this.theme.bold(text));
				const headingStyleContext = {
					applyText: headingStyleFn,
					stylePrefix: this.getStylePrefix(headingStyleFn)
				};
				const headingText = this.renderInlineTokens(token.tokens || [], headingStyleContext);
				const styledHeading = headingLevel >= 3 ? headingStyleFn(headingPrefix) + headingText : headingText;
				lines.push(styledHeading);
				if (nextTokenType && nextTokenType !== "space") lines.push("");
				break;
			}
			case "paragraph": {
				const paragraphText = this.renderInlineTokens(token.tokens || [], styleContext);
				lines.push(paragraphText);
				if (nextTokenType && nextTokenType !== "list" && nextTokenType !== "space") lines.push("");
				break;
			}
			case "code": {
				const indent = this.theme.codeBlockIndent ?? "  ";
				lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
				if (this.theme.highlightCode) {
					const highlightedLines = this.theme.highlightCode(token.text, token.lang);
					for (const hlLine of highlightedLines) lines.push(`${indent}${hlLine}`);
				} else {
					const codeLines = token.text.split("\n");
					for (const codeLine of codeLines) lines.push(`${indent}${this.theme.codeBlock(codeLine)}`);
				}
				lines.push(this.theme.codeBlockBorder("```"));
				if (nextTokenType && nextTokenType !== "space") lines.push("");
				break;
			}
			case "list": {
				const listLines = this.renderList(token, 0, styleContext);
				lines.push(...listLines);
				break;
			}
			case "table": {
				const tableLines = this.renderTable(token, width, nextTokenType, styleContext);
				lines.push(...tableLines);
				break;
			}
			case "blockquote": {
				const quoteStyle = (text) => this.theme.quote(this.theme.italic(text));
				const quoteStylePrefix = this.getStylePrefix(quoteStyle);
				const applyQuoteStyle = (line) => {
					if (!quoteStylePrefix) return quoteStyle(line);
					return quoteStyle(line.replace(/\x1b\[0m/g, `\x1b[0m${quoteStylePrefix}`));
				};
				const quoteContentWidth = Math.max(1, width - 2);
				const quoteInlineStyleContext = {
					applyText: (text) => text,
					stylePrefix: quoteStylePrefix
				};
				const quoteTokens = token.tokens || [];
				const renderedQuoteLines = [];
				for (let i = 0; i < quoteTokens.length; i++) {
					const quoteToken = quoteTokens[i];
					const nextQuoteToken = quoteTokens[i + 1];
					renderedQuoteLines.push(...this.renderToken(quoteToken, quoteContentWidth, nextQuoteToken?.type, quoteInlineStyleContext));
				}
				while (renderedQuoteLines.length > 0 && renderedQuoteLines[renderedQuoteLines.length - 1] === "") renderedQuoteLines.pop();
				for (const quoteLine of renderedQuoteLines) {
					const wrappedLines = wrapTextWithAnsi(applyQuoteStyle(quoteLine), quoteContentWidth);
					for (const wrappedLine of wrappedLines) lines.push(this.theme.quoteBorder("│ ") + wrappedLine);
				}
				if (nextTokenType && nextTokenType !== "space") lines.push("");
				break;
			}
			case "hr":
				lines.push(this.theme.hr("─".repeat(Math.min(width, 80))));
				if (nextTokenType && nextTokenType !== "space") lines.push("");
				break;
			case "html":
				if ("raw" in token && typeof token.raw === "string") lines.push(this.applyDefaultStyle(token.raw.trim()));
				break;
			case "space":
				lines.push("");
				break;
			default: if ("text" in token && typeof token.text === "string") lines.push(token.text);
		}
		return lines;
	}
	renderInlineTokens(tokens, styleContext) {
		let result = "";
		const resolvedStyleContext = styleContext ?? this.getDefaultInlineStyleContext();
		const { applyText, stylePrefix } = resolvedStyleContext;
		const applyTextWithNewlines = (text) => {
			return text.split("\n").map((segment) => applyText(segment)).join("\n");
		};
		for (const token of tokens) switch (token.type) {
			case "text":
				if (token.tokens && token.tokens.length > 0) result += this.renderInlineTokens(token.tokens, resolvedStyleContext);
				else result += applyTextWithNewlines(token.text);
				break;
			case "paragraph":
				result += this.renderInlineTokens(token.tokens || [], resolvedStyleContext);
				break;
			case "strong": {
				const boldContent = this.renderInlineTokens(token.tokens || [], resolvedStyleContext);
				result += this.theme.bold(boldContent) + stylePrefix;
				break;
			}
			case "em": {
				const italicContent = this.renderInlineTokens(token.tokens || [], resolvedStyleContext);
				result += this.theme.italic(italicContent) + stylePrefix;
				break;
			}
			case "codespan":
				result += this.theme.code(token.text) + stylePrefix;
				break;
			case "link": {
				const linkText = this.renderInlineTokens(token.tokens || [], resolvedStyleContext);
				const styledLink = this.theme.link(this.theme.underline(linkText));
				if (getCapabilities().hyperlinks) result += hyperlink(styledLink, token.href) + stylePrefix;
				else {
					const hrefForComparison = token.href.startsWith("mailto:") ? token.href.slice(7) : token.href;
					if (token.text === token.href || token.text === hrefForComparison) result += styledLink + stylePrefix;
					else result += styledLink + this.theme.linkUrl(` (${token.href})`) + stylePrefix;
				}
				break;
			}
			case "br":
				result += "\n";
				break;
			case "del": {
				const delContent = this.renderInlineTokens(token.tokens || [], resolvedStyleContext);
				result += this.theme.strikethrough(delContent) + stylePrefix;
				break;
			}
			case "html":
				if ("raw" in token && typeof token.raw === "string") result += applyTextWithNewlines(token.raw);
				break;
			default: if ("text" in token && typeof token.text === "string") result += applyTextWithNewlines(token.text);
		}
		while (stylePrefix && result.endsWith(stylePrefix)) result = result.slice(0, -stylePrefix.length);
		return result;
	}
	/**
	* Render a list with proper nesting support
	*/
	renderList(token, depth, styleContext) {
		const lines = [];
		const indent = "  ".repeat(depth);
		const startNumber = token.start ?? 1;
		for (let i = 0; i < token.items.length; i++) {
			const item = token.items[i];
			const bullet$1 = token.ordered ? `${startNumber + i}. ` : "- ";
			const itemLines = this.renderListItem(item.tokens || [], depth, styleContext);
			if (itemLines.length > 0) {
				const firstLine = itemLines[0];
				if (/^\s+\x1b\[36m[-\d]/.test(firstLine)) lines.push(firstLine);
				else lines.push(indent + this.theme.listBullet(bullet$1) + firstLine);
				for (let j = 1; j < itemLines.length; j++) {
					const line = itemLines[j];
					if (/^\s+\x1b\[36m[-\d]/.test(line)) lines.push(line);
					else lines.push(`${indent}  ${line}`);
				}
			} else lines.push(indent + this.theme.listBullet(bullet$1));
		}
		return lines;
	}
	/**
	* Render list item tokens, handling nested lists
	* Returns lines WITHOUT the parent indent (renderList will add it)
	*/
	renderListItem(tokens, parentDepth, styleContext) {
		const lines = [];
		for (const token of tokens) if (token.type === "list") {
			const nestedLines = this.renderList(token, parentDepth + 1, styleContext);
			lines.push(...nestedLines);
		} else if (token.type === "text") {
			const text = token.tokens && token.tokens.length > 0 ? this.renderInlineTokens(token.tokens, styleContext) : token.text || "";
			lines.push(text);
		} else if (token.type === "paragraph") {
			const text = this.renderInlineTokens(token.tokens || [], styleContext);
			lines.push(text);
		} else if (token.type === "code") {
			const indent = this.theme.codeBlockIndent ?? "  ";
			lines.push(this.theme.codeBlockBorder(`\`\`\`${token.lang || ""}`));
			if (this.theme.highlightCode) {
				const highlightedLines = this.theme.highlightCode(token.text, token.lang);
				for (const hlLine of highlightedLines) lines.push(`${indent}${hlLine}`);
			} else {
				const codeLines = token.text.split("\n");
				for (const codeLine of codeLines) lines.push(`${indent}${this.theme.codeBlock(codeLine)}`);
			}
			lines.push(this.theme.codeBlockBorder("```"));
		} else {
			const text = this.renderInlineTokens([token], styleContext);
			if (text) lines.push(text);
		}
		return lines;
	}
	/**
	* Get the visible width of the longest word in a string.
	*/
	getLongestWordWidth(text, maxWidth) {
		const words = text.split(/\s+/).filter((word) => word.length > 0);
		let longest = 0;
		for (const word of words) longest = Math.max(longest, visibleWidth(word));
		if (maxWidth === void 0) return longest;
		return Math.min(longest, maxWidth);
	}
	/**
	* Wrap a table cell to fit into a column.
	*
	* Delegates to wrapTextWithAnsi() so ANSI codes + long tokens are handled
	* consistently with the rest of the renderer.
	*/
	wrapCellText(text, maxWidth) {
		return wrapTextWithAnsi(text, Math.max(1, maxWidth));
	}
	/**
	* Render a table with width-aware cell wrapping.
	* Cells that don't fit are wrapped to multiple lines.
	*/
	renderTable(token, availableWidth, nextTokenType, styleContext) {
		const lines = [];
		const numCols = token.header.length;
		if (numCols === 0) return lines;
		const borderOverhead = 3 * numCols + 1;
		const availableForCells = availableWidth - borderOverhead;
		if (availableForCells < numCols) {
			const fallbackLines = token.raw ? wrapTextWithAnsi(token.raw, availableWidth) : [];
			if (nextTokenType && nextTokenType !== "space") fallbackLines.push("");
			return fallbackLines;
		}
		const maxUnbrokenWordWidth = 30;
		const naturalWidths = [];
		const minWordWidths = [];
		for (let i = 0; i < numCols; i++) {
			const headerText = this.renderInlineTokens(token.header[i].tokens || [], styleContext);
			naturalWidths[i] = visibleWidth(headerText);
			minWordWidths[i] = Math.max(1, this.getLongestWordWidth(headerText, maxUnbrokenWordWidth));
		}
		for (const row of token.rows) for (let i = 0; i < row.length; i++) {
			const cellText = this.renderInlineTokens(row[i].tokens || [], styleContext);
			naturalWidths[i] = Math.max(naturalWidths[i] || 0, visibleWidth(cellText));
			minWordWidths[i] = Math.max(minWordWidths[i] || 1, this.getLongestWordWidth(cellText, maxUnbrokenWordWidth));
		}
		let minColumnWidths = minWordWidths;
		let minCellsWidth = minColumnWidths.reduce((a, b) => a + b, 0);
		if (minCellsWidth > availableForCells) {
			minColumnWidths = new Array(numCols).fill(1);
			const remaining = availableForCells - numCols;
			if (remaining > 0) {
				const totalWeight = minWordWidths.reduce((total, width) => total + Math.max(0, width - 1), 0);
				const growth = minWordWidths.map((width) => {
					const weight = Math.max(0, width - 1);
					return totalWeight > 0 ? Math.floor(weight / totalWeight * remaining) : 0;
				});
				for (let i = 0; i < numCols; i++) minColumnWidths[i] += growth[i] ?? 0;
				let leftover = remaining - growth.reduce((total, width) => total + width, 0);
				for (let i = 0; leftover > 0 && i < numCols; i++) {
					minColumnWidths[i]++;
					leftover--;
				}
			}
			minCellsWidth = minColumnWidths.reduce((a, b) => a + b, 0);
		}
		const totalNaturalWidth = naturalWidths.reduce((a, b) => a + b, 0) + borderOverhead;
		let columnWidths;
		if (totalNaturalWidth <= availableWidth) columnWidths = naturalWidths.map((width, index) => Math.max(width, minColumnWidths[index]));
		else {
			const totalGrowPotential = naturalWidths.reduce((total, width, index) => {
				return total + Math.max(0, width - minColumnWidths[index]);
			}, 0);
			const extraWidth = Math.max(0, availableForCells - minCellsWidth);
			columnWidths = minColumnWidths.map((minWidth, index) => {
				const naturalWidth = naturalWidths[index];
				const minWidthDelta = Math.max(0, naturalWidth - minWidth);
				let grow = 0;
				if (totalGrowPotential > 0) grow = Math.floor(minWidthDelta / totalGrowPotential * extraWidth);
				return minWidth + grow;
			});
			let remaining = availableForCells - columnWidths.reduce((a, b) => a + b, 0);
			while (remaining > 0) {
				let grew = false;
				for (let i = 0; i < numCols && remaining > 0; i++) if (columnWidths[i] < naturalWidths[i]) {
					columnWidths[i]++;
					remaining--;
					grew = true;
				}
				if (!grew) break;
			}
		}
		const topBorderCells = columnWidths.map((w) => "─".repeat(w));
		lines.push(`┌─${topBorderCells.join("─┬─")}─┐`);
		const headerCellLines = token.header.map((cell, i) => {
			const text = this.renderInlineTokens(cell.tokens || [], styleContext);
			return this.wrapCellText(text, columnWidths[i]);
		});
		const headerLineCount = Math.max(...headerCellLines.map((c) => c.length));
		for (let lineIdx = 0; lineIdx < headerLineCount; lineIdx++) {
			const rowParts = headerCellLines.map((cellLines, colIdx) => {
				const text = cellLines[lineIdx] || "";
				const padded$1 = text + " ".repeat(Math.max(0, columnWidths[colIdx] - visibleWidth(text)));
				return this.theme.bold(padded$1);
			});
			lines.push(`│ ${rowParts.join(" │ ")} │`);
		}
		const separatorLine = `├─${columnWidths.map((w) => "─".repeat(w)).join("─┼─")}─┤`;
		lines.push(separatorLine);
		for (let rowIndex = 0; rowIndex < token.rows.length; rowIndex++) {
			const rowCellLines = token.rows[rowIndex].map((cell, i) => {
				const text = this.renderInlineTokens(cell.tokens || [], styleContext);
				return this.wrapCellText(text, columnWidths[i]);
			});
			const rowLineCount = Math.max(...rowCellLines.map((c) => c.length));
			for (let lineIdx = 0; lineIdx < rowLineCount; lineIdx++) {
				const rowParts = rowCellLines.map((cellLines, colIdx) => {
					const text = cellLines[lineIdx] || "";
					return text + " ".repeat(Math.max(0, columnWidths[colIdx] - visibleWidth(text)));
				});
				lines.push(`│ ${rowParts.join(" │ ")} │`);
			}
			if (rowIndex < token.rows.length - 1) lines.push(separatorLine);
		}
		const bottomBorderCells = columnWidths.map((w) => "─".repeat(w));
		lines.push(`└─${bottomBorderCells.join("─┴─")}─┘`);
		if (nextTokenType && nextTokenType !== "space") lines.push("");
		return lines;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/components/spacer.js
/**
* Spacer component that renders empty lines
*/
var Spacer = class {
	lines;
	constructor(lines = 1) {
		this.lines = lines;
	}
	setLines(lines) {
		this.lines = lines;
	}
	invalidate() {}
	render(_width) {
		const result = [];
		for (let i = 0; i < this.lines; i++) result.push("");
		return result;
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/stdin-buffer.js
const ESC$1 = "\x1B";
const BRACKETED_PASTE_START = "\x1B[200~";
const BRACKETED_PASTE_END = "\x1B[201~";
/**
* Check if a string is a complete escape sequence or needs more data
*/
function isCompleteSequence(data) {
	if (!data.startsWith(ESC$1)) return "not-escape";
	if (data.length === 1) return "incomplete";
	const afterEsc = data.slice(1);
	if (afterEsc.startsWith("[")) {
		if (afterEsc.startsWith("[M")) return data.length >= 6 ? "complete" : "incomplete";
		return isCompleteCsiSequence(data);
	}
	if (afterEsc.startsWith("]")) return isCompleteOscSequence(data);
	if (afterEsc.startsWith("P")) return isCompleteDcsSequence(data);
	if (afterEsc.startsWith("_")) return isCompleteApcSequence(data);
	if (afterEsc.startsWith("O")) return afterEsc.length >= 2 ? "complete" : "incomplete";
	if (afterEsc.length === 1) return "complete";
	return "complete";
}
/**
* Check if CSI sequence is complete
* CSI sequences: ESC [ ... followed by a final byte (0x40-0x7E)
*/
function isCompleteCsiSequence(data) {
	if (!data.startsWith(`${ESC$1}[`)) return "complete";
	if (data.length < 3) return "incomplete";
	const payload = data.slice(2);
	const lastChar = payload[payload.length - 1];
	const lastCharCode = lastChar.charCodeAt(0);
	if (lastCharCode >= 64 && lastCharCode <= 126) {
		if (payload.startsWith("<")) {
			if (/^<\d+;\d+;\d+[Mm]$/.test(payload)) return "complete";
			if (lastChar === "M" || lastChar === "m") {
				const parts = payload.slice(1, -1).split(";");
				if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) return "complete";
			}
			return "incomplete";
		}
		return "complete";
	}
	return "incomplete";
}
/**
* Check if OSC sequence is complete
* OSC sequences: ESC ] ... ST (where ST is ESC \ or BEL)
*/
function isCompleteOscSequence(data) {
	if (!data.startsWith(`${ESC$1}]`)) return "complete";
	if (data.endsWith(`${ESC$1}\\`) || data.endsWith("\x07")) return "complete";
	return "incomplete";
}
/**
* Check if DCS (Device Control String) sequence is complete
* DCS sequences: ESC P ... ST (where ST is ESC \)
* Used for XTVersion responses like ESC P >| ... ESC \
*/
function isCompleteDcsSequence(data) {
	if (!data.startsWith(`${ESC$1}P`)) return "complete";
	if (data.endsWith(`${ESC$1}\\`)) return "complete";
	return "incomplete";
}
/**
* Check if APC (Application Program Command) sequence is complete
* APC sequences: ESC _ ... ST (where ST is ESC \)
* Used for Kitty graphics responses like ESC _ G ... ESC \
*/
function isCompleteApcSequence(data) {
	if (!data.startsWith(`${ESC$1}_`)) return "complete";
	if (data.endsWith(`${ESC$1}\\`)) return "complete";
	return "incomplete";
}
/**
* Split accumulated buffer into complete sequences
*/
function parseUnmodifiedKittyPrintableCodepoint(sequence) {
	const match = sequence.match(/^\x1b\[(\d+)(?::\d*)?(?::\d+)?u$/);
	if (!match) return void 0;
	const codepoint = parseInt(match[1], 10);
	return codepoint >= 32 ? codepoint : void 0;
}
function extractCompleteSequences(buffer) {
	const sequences = [];
	let pos = 0;
	while (pos < buffer.length) {
		const remaining = buffer.slice(pos);
		if (remaining.startsWith(ESC$1)) {
			let seqEnd = 1;
			while (seqEnd <= remaining.length) {
				const candidate = remaining.slice(0, seqEnd);
				const status = isCompleteSequence(candidate);
				if (status === "complete") {
					sequences.push(candidate);
					pos += seqEnd;
					break;
				} else if (status === "incomplete") seqEnd++;
				else {
					sequences.push(candidate);
					pos += seqEnd;
					break;
				}
			}
			if (seqEnd > remaining.length) return {
				sequences,
				remainder: remaining
			};
		} else {
			sequences.push(remaining[0]);
			pos++;
		}
	}
	return {
		sequences,
		remainder: ""
	};
}
/**
* Buffers stdin input and emits complete sequences via the 'data' event.
* Handles partial escape sequences that arrive across multiple chunks.
*/
var StdinBuffer = class extends EventEmitter {
	buffer = "";
	timeout = null;
	timeoutMs;
	pasteMode = false;
	pasteBuffer = "";
	pendingKittyPrintableCodepoint;
	constructor(options$1 = {}) {
		super();
		this.timeoutMs = options$1.timeout ?? 10;
	}
	process(data) {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		let str;
		if (Buffer.isBuffer(data)) if (data.length === 1 && data[0] > 127) {
			const byte = data[0] - 128;
			str = `\x1b${String.fromCharCode(byte)}`;
		} else str = data.toString();
		else str = data;
		if (str.length === 0 && this.buffer.length === 0) {
			this.emitDataSequence("");
			return;
		}
		this.buffer += str;
		if (this.pasteMode) {
			this.pasteBuffer += this.buffer;
			this.buffer = "";
			const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
			if (endIndex !== -1) {
				const pastedContent = this.pasteBuffer.slice(0, endIndex);
				const remaining = this.pasteBuffer.slice(endIndex + 6);
				this.pasteMode = false;
				this.pasteBuffer = "";
				this.pendingKittyPrintableCodepoint = void 0;
				this.emit("paste", pastedContent);
				if (remaining.length > 0) this.process(remaining);
			}
			return;
		}
		const startIndex = this.buffer.indexOf(BRACKETED_PASTE_START);
		if (startIndex !== -1) {
			if (startIndex > 0) {
				const result$1 = extractCompleteSequences(this.buffer.slice(0, startIndex));
				for (const sequence of result$1.sequences) this.emitDataSequence(sequence);
			}
			this.pendingKittyPrintableCodepoint = void 0;
			this.buffer = this.buffer.slice(startIndex + 6);
			this.pasteMode = true;
			this.pasteBuffer = this.buffer;
			this.buffer = "";
			const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
			if (endIndex !== -1) {
				const pastedContent = this.pasteBuffer.slice(0, endIndex);
				const remaining = this.pasteBuffer.slice(endIndex + 6);
				this.pasteMode = false;
				this.pasteBuffer = "";
				this.pendingKittyPrintableCodepoint = void 0;
				this.emit("paste", pastedContent);
				if (remaining.length > 0) this.process(remaining);
			}
			return;
		}
		const result = extractCompleteSequences(this.buffer);
		this.buffer = result.remainder;
		for (const sequence of result.sequences) this.emitDataSequence(sequence);
		if (this.buffer.length > 0) this.timeout = setTimeout(() => {
			const flushed = this.flush();
			for (const sequence of flushed) this.emitDataSequence(sequence);
		}, this.timeoutMs);
	}
	emitDataSequence(sequence) {
		const rawCodepoint = sequence.length === 1 ? sequence.codePointAt(0) : void 0;
		if (rawCodepoint !== void 0 && rawCodepoint === this.pendingKittyPrintableCodepoint) {
			this.pendingKittyPrintableCodepoint = void 0;
			return;
		}
		this.pendingKittyPrintableCodepoint = parseUnmodifiedKittyPrintableCodepoint(sequence);
		this.emit("data", sequence);
	}
	flush() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		if (this.buffer.length === 0) return [];
		const sequences = [this.buffer];
		this.buffer = "";
		this.pendingKittyPrintableCodepoint = void 0;
		return sequences;
	}
	clear() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
		this.buffer = "";
		this.pasteMode = false;
		this.pasteBuffer = "";
		this.pendingKittyPrintableCodepoint = void 0;
	}
	getBuffer() {
		return this.buffer;
	}
	destroy() {
		this.clear();
	}
};

//#endregion
//#region node_modules/.pnpm/@mariozechner+pi-tui@0.73.1_patch_hash=9db834928e0bcc7c2257ed2462eb306a4f5e55ae5904d69e8c34e721f03306f2/node_modules/@mariozechner/pi-tui/dist/terminal.js
const cjsRequire = createRequire(import.meta.url);
const TERMINAL_PROGRESS_KEEPALIVE_MS = 1e3;
const TERMINAL_PROGRESS_ACTIVE_SEQUENCE = "\x1B]9;4;3\x07";
const TERMINAL_PROGRESS_CLEAR_SEQUENCE = "\x1B]9;4;0;\x07";
/**
* Real terminal using process.stdin/stdout
*/
var ProcessTerminal = class {
	wasRaw = false;
	inputHandler;
	resizeHandler;
	_kittyProtocolActive = false;
	_modifyOtherKeysActive = false;
	stdinBuffer;
	stdinDataHandler;
	progressInterval;
	writeLogPath = (() => {
		const env = process.env.PI_TUI_WRITE_LOG || "";
		if (!env) return "";
		try {
			if (fs.statSync(env).isDirectory()) {
				const now = /* @__PURE__ */ new Date();
				const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
				return path.join(env, `tui-${ts}-${process.pid}.log`);
			}
		} catch {}
		return env;
	})();
	get kittyProtocolActive() {
		return this._kittyProtocolActive;
	}
	start(onInput, onResize) {
		this.inputHandler = onInput;
		this.resizeHandler = onResize;
		this.wasRaw = process.stdin.isRaw || false;
		if (process.stdin.setRawMode) process.stdin.setRawMode(true);
		process.stdin.setEncoding("utf8");
		process.stdin.resume();
		process.stdout.write("\x1B[?2004h");
		process.stdout.on("resize", this.resizeHandler);
		if (process.platform !== "win32") process.kill(process.pid, "SIGWINCH");
		this.enableWindowsVTInput();
		this.queryAndEnableKittyProtocol();
	}
	/**
	* Set up StdinBuffer to split batched input into individual sequences.
	* This ensures components receive single events, making matchesKey/isKeyRelease work correctly.
	*
	* Also watches for Kitty protocol response and enables it when detected.
	* This is done here (after stdinBuffer parsing) rather than on raw stdin
	* to handle the case where the response arrives split across multiple events.
	*/
	setupStdinBuffer() {
		this.stdinBuffer = new StdinBuffer({ timeout: 10 });
		const kittyResponsePattern = /^\x1b\[\?(\d+)u$/;
		this.stdinBuffer.on("data", (sequence) => {
			if (!this._kittyProtocolActive) {
				if (sequence.match(kittyResponsePattern)) {
					this._kittyProtocolActive = true;
					setKittyProtocolActive(true);
					process.stdout.write("\x1B[>7u");
					return;
				}
			}
			if (this.inputHandler) this.inputHandler(sequence);
		});
		this.stdinBuffer.on("paste", (content) => {
			if (this.inputHandler) this.inputHandler(`\x1b[200~${content}\x1b[201~`);
		});
		this.stdinDataHandler = (data) => {
			this.stdinBuffer.process(data);
		};
	}
	/**
	* Query terminal for Kitty keyboard protocol support and enable if available.
	*
	* Sends CSI ? u to query current flags. If terminal responds with CSI ? <flags> u,
	* it supports the protocol and we enable it with CSI > 1 u.
	*
	* If no Kitty response arrives shortly after startup, fall back to enabling
	* xterm modifyOtherKeys mode 2. This is needed for tmux, which can forward
	* modified enter keys as CSI-u when extended-keys is enabled, but may not
	* answer the Kitty protocol query.
	*
	* The response is detected in setupStdinBuffer's data handler, which properly
	* handles the case where the response arrives split across multiple stdin events.
	*/
	queryAndEnableKittyProtocol() {
		this.setupStdinBuffer();
		process.stdin.on("data", this.stdinDataHandler);
		process.stdout.write("\x1B[?u");
		setTimeout(() => {
			if (this.inputHandler && !this._kittyProtocolActive && !this._modifyOtherKeysActive) {
				process.stdout.write("\x1B[>4;2m");
				this._modifyOtherKeysActive = true;
			}
		}, 150);
	}
	/**
	* On Windows, add ENABLE_VIRTUAL_TERMINAL_INPUT (0x0200) to the stdin
	* console handle so the terminal sends VT sequences for modified keys
	* (e.g. \x1b[Z for Shift+Tab). Without this, libuv's ReadConsoleInputW
	* discards modifier state and Shift+Tab arrives as plain \t.
	*/
	enableWindowsVTInput() {
		if (process.platform !== "win32") return;
		try {
			const k32 = cjsRequire("koffi").load("kernel32.dll");
			const GetStdHandle = k32.func("void* __stdcall GetStdHandle(int)");
			const GetConsoleMode = k32.func("bool __stdcall GetConsoleMode(void*, _Out_ uint32_t*)");
			const SetConsoleMode = k32.func("bool __stdcall SetConsoleMode(void*, uint32_t)");
			const STD_INPUT_HANDLE = -10;
			const ENABLE_VIRTUAL_TERMINAL_INPUT = 512;
			const handle = GetStdHandle(STD_INPUT_HANDLE);
			const mode = new Uint32Array(1);
			GetConsoleMode(handle, mode);
			SetConsoleMode(handle, mode[0] | ENABLE_VIRTUAL_TERMINAL_INPUT);
		} catch {}
	}
	async drainInput(maxMs = 1e3, idleMs = 50) {
		if (this._kittyProtocolActive) {
			process.stdout.write("\x1B[<u");
			this._kittyProtocolActive = false;
			setKittyProtocolActive(false);
		}
		if (this._modifyOtherKeysActive) {
			process.stdout.write("\x1B[>4;0m");
			this._modifyOtherKeysActive = false;
		}
		const previousHandler = this.inputHandler;
		this.inputHandler = void 0;
		let lastDataTime = Date.now();
		const onData = () => {
			lastDataTime = Date.now();
		};
		process.stdin.on("data", onData);
		const endTime = Date.now() + maxMs;
		try {
			while (true) {
				const now = Date.now();
				const timeLeft = endTime - now;
				if (timeLeft <= 0) break;
				if (now - lastDataTime >= idleMs) break;
				await new Promise((resolve$1) => setTimeout(resolve$1, Math.min(idleMs, timeLeft)));
			}
		} finally {
			process.stdin.removeListener("data", onData);
			this.inputHandler = previousHandler;
		}
	}
	stop() {
		if (this.clearProgressInterval()) process.stdout.write(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
		process.stdout.write("\x1B[?2004l");
		if (this._kittyProtocolActive) {
			process.stdout.write("\x1B[<u");
			this._kittyProtocolActive = false;
			setKittyProtocolActive(false);
		}
		if (this._modifyOtherKeysActive) {
			process.stdout.write("\x1B[>4;0m");
			this._modifyOtherKeysActive = false;
		}
		if (this.stdinBuffer) {
			this.stdinBuffer.destroy();
			this.stdinBuffer = void 0;
		}
		if (this.stdinDataHandler) {
			process.stdin.removeListener("data", this.stdinDataHandler);
			this.stdinDataHandler = void 0;
		}
		this.inputHandler = void 0;
		if (this.resizeHandler) {
			process.stdout.removeListener("resize", this.resizeHandler);
			this.resizeHandler = void 0;
		}
		process.stdin.pause();
		if (process.stdin.setRawMode) process.stdin.setRawMode(this.wasRaw);
	}
	write(data) {
		process.stdout.write(data);
		if (this.writeLogPath) try {
			fs.appendFileSync(this.writeLogPath, data, { encoding: "utf8" });
		} catch {}
	}
	get columns() {
		return process.stdout.columns || Number(process.env.COLUMNS) || 80;
	}
	get rows() {
		return process.stdout.rows || Number(process.env.LINES) || 24;
	}
	moveBy(lines) {
		if (lines > 0) process.stdout.write(`\x1b[${lines}B`);
		else if (lines < 0) process.stdout.write(`\x1b[${-lines}A`);
	}
	hideCursor() {
		process.stdout.write("\x1B[?25l");
	}
	showCursor() {
		process.stdout.write("\x1B[?25h");
	}
	clearLine() {
		process.stdout.write("\x1B[K");
	}
	clearFromCursor() {
		process.stdout.write("\x1B[J");
	}
	clearScreen() {
		process.stdout.write("\x1B[2J\x1B[H");
	}
	setTitle(title) {
		process.stdout.write(`\x1b]0;${title}\x07`);
	}
	setProgress(active) {
		if (active) {
			process.stdout.write(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
			if (!this.progressInterval) this.progressInterval = setInterval(() => {
				process.stdout.write(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
			}, TERMINAL_PROGRESS_KEEPALIVE_MS);
		} else {
			this.clearProgressInterval();
			process.stdout.write(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
		}
	}
	clearProgressInterval() {
		if (!this.progressInterval) return false;
		clearInterval(this.progressInterval);
		this.progressInterval = void 0;
		return true;
	}
};

//#endregion
//#region vendor/api-gateway/client/index.js
var client_exports = /* @__PURE__ */ __export({
	apply: () => apply$4,
	inject: () => inject$4
});
/** Required Client services: the Typert registry and the existing Connection carrier. */
const inject$4 = ["typert", "connection"];
/**
* Install the typed Client Remote service.
* @param ctx - Client Cordis root.
*/
function apply$4(ctx) {
	new ClientRemoteService(ctx);
}
var ClientRemoteService = class extends Service {
	ownerCtx;
	namespaces = /* @__PURE__ */ new Map();
	subscriptions = /* @__PURE__ */ new Map();
	mutations = Promise.resolve();
	constructor(ctx) {
		super(ctx, "remote");
		this.ownerCtx = ctx;
		ctx.effect(() => () => {
			this.subscriptions.clear();
		}, "api-gateway.client.subscriptions");
	}
	async $mount(contribution) {
		const callerCtx = this.ctx;
		const owned = callerCtx.effect(async () => {
			const dispose = await this.enqueue(() => this.mountContribution(callerCtx, contribution));
			return () => this.enqueue(dispose);
		}, `api-gateway.client.$mount(${JSON.stringify(contribution.package)})`);
		await owned;
		return async () => {
			await owned();
		};
	}
	$on(event, listener) {
		const subscription = { listener };
		const owned = this.ctx.effect(() => {
			const listeners = this.listeners(event);
			listeners.push(subscription);
			return () => {
				const at = listeners.indexOf(subscription);
				/* v8 ignore next -- listener */
				if (at >= 0) listeners.splice(at, 1);
			};
		}, `api-gateway.client.$on(${JSON.stringify(event)})`);
		return () => {
			owned();
		};
	}
	/**
	* Deliver one forwarded event in registration order, isolating a listener
	* that fails either synchronously or by rejecting a returned promise; see
	* {@link TypertClientRemote.$dispatch} for the caller contract.
	*/
	$dispatch(event, args) {
		const listeners = this.subscriptions.get(event);
		if (listeners === void 0) return;
		for (const { listener } of [...listeners]) {
			const report = (error) => {
				console.error(`client api: Remote event ${JSON.stringify(event)} listener threw:`, error);
			};
			try {
				const settled = listener(...args);
				if (settled instanceof Promise) settled.catch(report);
			} catch (error) {
				report(error);
			}
		}
	}
	/** Subscriptions for one event name; empty arrays are retained, bounded by the Host's selection. */
	listeners(event) {
		let listeners = this.subscriptions.get(event);
		if (listeners === void 0) {
			listeners = [];
			this.subscriptions.set(event, listeners);
		}
		return listeners;
	}
	enqueue(operation) {
		const result = this.mutations.then(operation, operation);
		this.mutations = result.then(() => void 0, () => void 0);
		return result;
	}
	async mountContribution(callerCtx, contribution) {
		this.validateContribution(contribution);
		const disposeRemote = callerCtx.typert.remotes.register(contribution);
		const installed = [];
		try {
			for (const descriptor of contribution.descriptors) installed.push(await this.install(descriptor));
		} catch (error) {
			for (const dispose of installed.reverse()) await dispose();
			await disposeRemote();
			throw error;
		}
		return async () => {
			for (const dispose of installed.reverse()) await dispose();
			await disposeRemote();
		};
	}
	validateContribution(contribution) {
		const direct = /* @__PURE__ */ new Map();
		const scoped = /* @__PURE__ */ new Map();
		const add = (table, descriptor, kind) => {
			const methods = table.get(descriptor.namespace) ?? /* @__PURE__ */ new Set();
			if (methods.has(descriptor.method)) throw new Error(`client api: contribution repeats ${kind} method ${endpointOf(descriptor)}`);
			methods.add(descriptor.method);
			table.set(descriptor.namespace, methods);
			if ((this.namespaces.get(descriptor.namespace)?.service)?.has(kind, descriptor.method) === true) throw new Error(`client api: ${kind} method ${endpointOf(descriptor)} is already mounted`);
		};
		for (const descriptor of contribution.descriptors) {
			requireStrictDescriptor(descriptor);
			if (descriptor.invocation.kind === "direct") add(direct, descriptor, "direct");
			if (scopedProjection(descriptor) !== void 0) add(scoped, descriptor, "scoped");
		}
		const namespaces = new Set([...direct.keys(), ...scoped.keys()]);
		for (const namespace of namespaces) {
			const service = this.namespaces.get(namespace)?.service;
			if (service === void 0) {
				if (namespace in this) throw new Error(`client api: namespace ${JSON.stringify(namespace)} conflicts with the Remote service`);
				const serviceKey = remoteServiceKey(namespace);
				if (this.ownerCtx.reflect.props[serviceKey]?.type === "accessor" || this.ownerCtx.get(serviceKey) !== void 0) throw new Error(`client api: namespace ${JSON.stringify(namespace)} conflicts with an existing Remote namespace`);
			}
			for (const method of new Set([...direct.get(namespace) ?? [], ...scoped.get(namespace) ?? []])) if (service === void 0) RemoteNamespaceService.assertMethodAvailable(namespace, method);
			else service.assertMethodAvailable(method);
		}
	}
	async install(descriptor) {
		const token = {
			active: true,
			abort: new AbortController()
		};
		const installed = [];
		try {
			if (descriptor.invocation.kind === "direct") installed.push(await this.installDirect(descriptor, token));
			const projection = scopedProjection(descriptor);
			if (projection !== void 0) installed.push(await this.installScoped(descriptor, projection, token));
		} catch (error) {
			token.active = false;
			token.abort.abort();
			for (const dispose of installed.reverse()) await dispose();
			throw error;
		}
		return async () => {
			/* v8 ignore next -- Cordis effect disposers are idempotent and invoke this cleanup at most once. */
			if (!token.active) return;
			token.active = false;
			token.abort.abort();
			for (const dispose of installed.reverse()) await dispose();
		};
	}
	async installDirect(descriptor, token) {
		const namespace = await this.namespace(descriptor.namespace);
		try {
			namespace.service.installDirect(descriptor, token);
		} catch (error) {
			await this.disposeNamespace(descriptor.namespace, namespace);
			throw error;
		}
		return async () => {
			namespace.service.remove("direct", descriptor.method, token);
			await this.disposeNamespace(descriptor.namespace, namespace);
		};
	}
	async installScoped(descriptor, projection, token) {
		const namespace = await this.namespace(descriptor.namespace);
		try {
			namespace.service.installScoped(descriptor, projection, token);
		} catch (error) {
			await this.disposeNamespace(descriptor.namespace, namespace);
			throw error;
		}
		return async () => {
			namespace.service.remove("scoped", descriptor.method, token);
			await this.disposeNamespace(descriptor.namespace, namespace);
		};
	}
	async namespace(name$1) {
		let namespace = this.namespaces.get(name$1);
		if (namespace !== void 0) return namespace;
		let service;
		const fiber = this.ownerCtx.plugin({
			name: remoteServiceKey(name$1),
			apply: (ctx) => {
				service = new RemoteNamespaceService(ctx, name$1, (direct, scoped, caller, args) => this.invokeMethod(direct, scoped, caller, args));
			}
		});
		try {
			await fiber;
		} catch (error) {
			await fiber.dispose();
			throw error;
		}
		/* v8 ignore next -- a settled namespace fiber synchronously constructs its Service. */
		if (service === void 0) throw new Error(`client api: namespace ${JSON.stringify(name$1)} did not start`);
		namespace = {
			service,
			dispose: fiber.dispose
		};
		this.namespaces.set(name$1, namespace);
		return namespace;
	}
	async disposeNamespace(name$1, namespace) {
		if (!namespace.service.empty || this.namespaces.get(name$1) !== namespace) return;
		this.namespaces.delete(name$1);
		await namespace.dispose();
	}
	invokeMethod(direct, scoped, callerCtx, values) {
		if (scoped !== void 0) {
			const identity = this.ownerCtx.typert.contexts.getClient(scoped.projection.context)?.identity(callerCtx);
			if (identity !== void 0) return this.invoke(scoped.descriptor, scoped.projection, scoped.token, callerCtx, values, { value: identity });
		}
		if (direct !== void 0) return this.invoke(direct.descriptor, void 0, direct.token, callerCtx, values);
		if (scoped !== void 0) return this.invoke(scoped.descriptor, scoped.projection, scoped.token, callerCtx, values);
		throw new Error("client api: Remote method is no longer mounted");
	}
	async invoke(descriptor, projection, token, callerCtx, values, boundIdentity) {
		const endpoint = endpointOf(descriptor);
		if (!token.active) return withdrawn(endpoint);
		const expected = descriptor.parameters.length - (projection?.parameterIndex === void 0 ? 0 : 1);
		const hasCallerSignal = descriptor.cancellation !== void 0 && values.length === expected + 1;
		if (values.length !== expected && !hasCallerSignal) {
			const contract = descriptor.cancellation === void 0 ? `${String(expected)} argument(s)` : `${String(expected)} business argument(s) plus an optional AbortSignal`;
			throw new Error(`client api: ${endpoint} expected ${contract}, got ${String(values.length)}`);
		}
		const args = Object.create(null);
		if (projection !== void 0) {
			const binder = boundIdentity === void 0 ? this.ownerCtx.typert.contexts.getClient(projection.context) : void 0;
			if (boundIdentity === void 0 && binder === void 0) throw new Error(`client api: ${endpoint} has no Client Context binder for ${JSON.stringify(projection.context)}`);
			const identity = boundIdentity === void 0 ? binder?.identity(callerCtx) : boundIdentity.value;
			if (identity === void 0) throw new Error(`client api: ${endpoint} requires a ${JSON.stringify(projection.context)} Context`);
			args[projection.wire] = parse(projection.codec, identity, endpoint, projection.wire);
		}
		let valueIndex = 0;
		descriptor.parameters.forEach((parameter, parameterIndex) => {
			if (parameterIndex === projection?.parameterIndex) return;
			const value = parse(parameter.codec, values[valueIndex], endpoint, parameter.wire);
			if (value !== void 0) args[parameter.wire] = value;
			valueIndex += 1;
		});
		const connection = this.ownerCtx.get("connection");
		if (connection === void 0) throw new Error(`client api: ${endpoint} has no active Connection`);
		const callerSignal = hasCallerSignal ? values[expected] : void 0;
		const signal = callerSignal === void 0 ? token.abort.signal : AbortSignal.any([token.abort.signal, callerSignal]);
		try {
			const result = await connection.rpc.call("/api", endpoint, { args }, signal);
			if (!mountActive(token)) return withdrawn(endpoint);
			if (!result.ok) return {
				ok: false,
				error: result.error
			};
			return {
				ok: true,
				value: parse(descriptor.result, result.value, endpoint, "result")
			};
		} catch (error) {
			return carrierFailure(endpoint, error);
		}
	}
};
var RemoteNamespaceService = class RemoteNamespaceService extends Service {
	invokeRemote;
	methods = /* @__PURE__ */ new Map();
	namespace;
	static assertMethodAvailable(namespace, method) {
		if (REMOTE_NAMESPACE_FIELDS.has(method) || method in RemoteNamespaceService.prototype) throw new Error(`client api: method ${JSON.stringify(`${namespace}/${method}`)} conflicts with its namespace service`);
	}
	constructor(ctx, name$1, invokeRemote) {
		super(ctx, remoteServiceKey(name$1));
		this.invokeRemote = invokeRemote;
		this.namespace = name$1;
	}
	assertMethodAvailable(method) {
		RemoteNamespaceService.assertMethodAvailable(this.namespace, method);
		if (method in this && !this.methods.has(method)) throw new Error(`client api: method ${JSON.stringify(`${this.namespace}/${method}`)} conflicts with its namespace service`);
	}
	get empty() {
		return this.methods.size === 0;
	}
	has(kind, method) {
		return this.methods.get(method)?.[kind] !== void 0;
	}
	installDirect(descriptor, token) {
		this.install(descriptor.method, "direct", {
			descriptor,
			token
		});
	}
	installScoped(descriptor, projection, token) {
		this.install(descriptor.method, "scoped", {
			descriptor,
			projection,
			token
		});
	}
	install(method, kind, value) {
		this.assertMethodAvailable(method);
		let record = this.methods.get(method);
		const fresh = record === void 0;
		record ??= {};
		if (fresh) {
			Object.defineProperty(this, method, {
				configurable: true,
				enumerable: true,
				get: function() {
					const callerCtx = this.ctx;
					const current = this.methods.get(method);
					const direct = current?.direct;
					const scoped = current?.scoped;
					return (...args) => {
						return this.invokeRemote(direct, scoped, callerCtx, args);
					};
				}
			});
			this.methods.set(method, record);
		}
		if (kind === "direct") record.direct = value;
		else record.scoped = value;
	}
	remove(kind, method, token) {
		const record = this.methods.get(method);
		const current = record?.[kind];
		/* v8 ignore next -- duplicate live variants are rejected before installation, so no newer token can replace this one. */
		if (record === void 0 || current?.token !== token) return;
		if (kind === "direct") delete record.direct;
		else delete record.scoped;
		if (record.direct !== void 0 || record.scoped !== void 0) return;
		this.methods.delete(method);
		Reflect.deleteProperty(this, method);
	}
};
const REMOTE_NAMESPACE_FIELDS = new Set([
	"ctx",
	"empty",
	"invokeRemote",
	"methods",
	"name",
	"namespace"
]);
function remoteServiceKey(namespace) {
	return `remote.${namespace}`;
}
function endpointOf(descriptor) {
	return `${descriptor.namespace}/${descriptor.method}`;
}
function mountActive(token) {
	return token.active;
}
function scopedProjection(descriptor) {
	if (descriptor.invocation.kind === "context") return {
		context: descriptor.invocation.context,
		wire: descriptor.invocation.wire,
		codec: descriptor.invocation.codec
	};
	if (descriptor.scope === void 0) return void 0;
	const lookupParameters = descriptor.parameters.map((parameter, index) => ({
		parameter,
		index
	})).filter((candidate) => candidate.parameter.source === "lookup");
	const selected = lookupParameters.length === 1 ? lookupParameters[0] : void 0;
	if (selected === void 0 || selected.parameter.wire !== descriptor.scope.wire || selected.parameter.lookup !== descriptor.scope.context) throw new Error(`client api: generated Remote ${endpointOf(descriptor)} scope must select its only lookup parameter`);
	return {
		context: descriptor.scope.context,
		wire: descriptor.scope.wire,
		codec: selected.parameter.codec,
		parameterIndex: selected.index
	};
}
function requireStrictDescriptor(descriptor) {
	const endpoint = endpointOf(descriptor);
	requireStrictCodec(descriptor.result, endpoint, "result");
	for (const parameter of descriptor.parameters) requireStrictCodec(parameter.codec, endpoint, parameter.wire);
	if (descriptor.invocation.kind === "context") requireStrictCodec(descriptor.invocation.codec, endpoint, descriptor.invocation.wire);
}
function requireStrictCodec(codec, endpoint, field) {
	if (codec.mode !== "strict") throw new Error(`client api: generated Remote ${endpoint} field ${JSON.stringify(field)} has no strict codec`);
}
function parse(codec, value, endpoint, field) {
	if (codec.mode !== "strict") throw new Error(`client api: generated Remote ${endpoint} field ${JSON.stringify(field)} has no strict codec`);
	try {
		return codec.schema.parse(value);
	} catch (cause) {
		throw new Error(`client api: ${endpoint} rejected ${JSON.stringify(field)}`, { cause });
	}
}
/** The namespace retired before or during the call, so no request outcome exists. */
function withdrawn(endpoint) {
	return internalFailure(`client api: Remote method ${endpoint} is no longer mounted`);
}
function carrierFailure(endpoint, error) {
	return internalFailure(`client api: ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
}
function internalFailure(message) {
	return {
		ok: false,
		error: {
			code: "internal",
			message,
			details: {}
		}
	};
}

//#endregion
//#region vendor/api-remotes/client/index.js
var client_exports$1 = /* @__PURE__ */ __export({
	apply: () => apply$3,
	inject: () => inject$3
});
/** Required service: the typed Client Remote contribution mount. */
const inject$3 = ["remote"];
/**
* Mount the Host capabilities explicitly selected for this Client assembly.
* @param ctx - Client Cordis root carrying the typed API service.
* @returns disposer after every selected Remote namespace is ready.
*/
async function apply$3(ctx) {
	const disposers = [];
	try {
		for (const contribution of [
			commandsRemote,
			goalsRemote,
			dynamicRemote,
			pluginInventoryRemote,
			messageFeedbackRemote
		]) disposers.push(await ctx.remote.$mount(contribution));
	} catch (error) {
		for (const dispose of disposers.reverse()) await dispose();
		throw error;
	}
	return async () => {
		for (const dispose of disposers.reverse()) await dispose();
	};
}

//#endregion
//#region vendor/client-connection/client/connection.js
const CONNECTION_DEFAULTS = {
	backoffBaseMs: 500,
	backoffFactor: 2,
	backoffMaxMs: 1e4,
	streamOpenTimeoutMs: 3e3
};
function sleep(ms, signal) {
	return new Promise((resolve$1) => {
		const t = setTimeout(done, ms);
		signal.addEventListener("abort", done, { once: true });
		function done() {
			clearTimeout(t);
			signal.removeEventListener("abort", done);
			resolve$1();
		}
	});
}
/**
* Opens both streams and keeps iterating (pull mode: nothing reads the socket and the tap
* never fires unless someone for-awaits), reconnecting with exponential backoff on loss.
* State (generation/attempt) is instance-private, never in the store.
* The pump body feeds each frame to a sink (sink exceptions must
* not kill the pump — a broken business layer must not drag down the connection layer).
*/
var ConnectionController = class {
	api;
	sinks;
	generation = 0;
	attempt = 0;
	current = null;
	running = false;
	lastState = null;
	config;
	constructor(api, sinks = {}, config = {}) {
		this.api = api;
		this.sinks = sinks;
		this.config = {
			...CONNECTION_DEFAULTS,
			...config
		};
	}
	/** Idempotent: begin the connect/pump/reconnect loop. */
	start() {
		if (this.running) return;
		this.running = true;
		this.loop();
	}
	/** Stop the loop and abort the current generation's streams. */
	stop() {
		this.running = false;
		this.current?.abort();
		this.current = null;
	}
	backoffDelay(attempt) {
		const { backoffBaseMs, backoffFactor, backoffMaxMs } = this.config;
		const cap = Math.min(backoffMaxMs, backoffBaseMs * backoffFactor ** Math.max(0, attempt - 1));
		return cap / 2 + Math.random() * (cap / 2);
	}
	/** Read through a method: stop() flips the flag across awaits, so narrowing from the loop condition must not stick. */
	isRunning() {
		return this.running;
	}
	/** Re-read both mutable liveness guards after a potentially reentrant sink. */
	isGenerationActive(controller) {
		return this.isRunning() && !controller.signal.aborted;
	}
	async loop() {
		while (this.running) {
			const gen = ++this.generation;
			const ac = new AbortController();
			this.current = ac;
			/* v8 ignore next -- initializer placeholder: the Promise executor
			* below runs synchronously and replaces it before anyone can call it. */
			let muxOpened = () => {};
			/* v8 ignore next -- same placeholder pattern as muxOpened. */
			let hostOpened = () => {};
			const streamsOpen = Promise.all([new Promise((resolve$1) => {
				muxOpened = resolve$1;
			}), new Promise((resolve$1) => {
				hostOpened = resolve$1;
			})]);
			const failed = new Promise((resolve$1) => {
				const settle = () => {
					if (gen === this.generation && !ac.signal.aborted) ac.abort();
					resolve$1();
				};
				this.pumpStream(this.api.events.mux({}, ac.signal, muxOpened), this.sinks.onMuxEnvelope, settle);
				this.pumpStream(this.api.events.host({}, ac.signal, hostOpened), this.sinks.onHostEnvelope, settle);
			});
			try {
				const timeout = new AbortController();
				const [description] = await Promise.all([this.api.host.describe({}), Promise.race([streamsOpen, sleep(this.config.streamOpenTimeoutMs, timeout.signal)])]);
				timeout.abort();
				const descriptionResult = description.result;
				if (!descriptionResult.ok) throw new Error(`host.describe failed: ${descriptionResult.error.code}: ${descriptionResult.error.message}`);
				if (ac.signal.aborted) throw new Error("generation aborted during readiness handshake");
				this.attempt = 0;
				this.emitState("connected");
				if (this.isGenerationActive(ac)) this.callSink(() => {
					this.sinks.onConnected?.(descriptionResult.value);
				});
			} catch {
				if (!ac.signal.aborted) ac.abort();
			}
			await failed;
			if (!this.isRunning()) return;
			this.emitState("reconnecting");
			this.attempt += 1;
			console.warn(`[client-connection] connection lost, retry #${this.attempt}`);
			const idle = new AbortController();
			await sleep(this.backoffDelay(this.attempt), idle.signal);
		}
	}
	/** Deduplicated state emission (sink isolation applies). */
	emitState(state) {
		if (this.lastState === state) return;
		this.lastState = state;
		this.callSink(() => this.sinks.onStateChange?.(state));
	}
	async pumpStream(stream, sink, onEnd) {
		try {
			for await (const envelope of stream) {
				if (envelope.payload.type === "stream/error") break;
				if (sink !== void 0) this.callSink(() => {
					sink(envelope);
				});
			}
		} catch {}
		onEnd();
	}
	/** Sink exception isolation: a business-layer throw is logged only, never affecting pump or reconnect semantics. */
	callSink(fn) {
		try {
			fn();
		} catch (error) {
			console.error("[client-connection] connection sink threw:", error);
		}
	}
};

//#endregion
//#region vendor/client-connection/client/fixture.js
const MARKDOWN_FIXTURE = [
	"# Markdown fixture",
	"",
	"Assistant output renders **strong text**, *emphasis*, and `inline code`.",
	"",
	"- first item",
	"  - nested item",
	"",
	"| Area | State |",
	"| --- | --- |",
	"| history | rendered |",
	"| streaming | stable |",
	"",
	"[DeepSeek](https://www.deepseek.com)",
	"",
	"```ts",
	"const markdown = true",
	"```"
].join("\n");
/**
* SGR wrapper for the terminal output sample below: authoring the escapes as
* `\u001b` keeps literal control bytes out of this source file.
* @param code - the SGR parameter (an ANSI color or attribute number).
* @param body - the text the attribute applies to.
* @returns the body wrapped in the attribute and a reset.
*/
function sgr(code, body) {
	return `\u001b[${code}m${body}\u001b[0m`;
}
/**
* Terminal output sample for fixture turn 66, authored to carry every feature
* the terminal card draws that turn 60's two prompt rows cannot reach:
* basic-16 SGR foreground runs (green, red, bright-black) that must resolve to
* `--dsw-*` tokens, a bold run, column-aligned table rows that must scroll
* rather than fold, more than DEFAULT_TERMINAL_MAX_LINES (16) lines so the
* height cap collapses the middle. The exit status is authored separately in
* TERMINAL_EXIT_STATUS and deliberately absent from this text: the real bash
* presenter CONSUMES its `[exit code: N]` marker out of the body, because a
* terminal card shows the exit as its own pill and leaving the marker in would
* render it twice (packages/shell/tool-bash/src/render.ts).
*/
const TERMINAL_OUTPUT_FIXTURE = [
	sgr(1, "Running 4 checks"),
	`${sgr(32, "✓")} typecheck                                          1.82s`,
	`${sgr(32, "✓")} lint                                               0.94s`,
	`${sgr(32, "✓")} duplication                                        2.10s`,
	`${sgr(31, "✗")} unit                                               8.41s`,
	"",
	sgr(90, "packages/client/ui-primitives/tests/terminal-block.client.spec.tsx"),
	`  ${sgr(31, "FAIL")} caps output at the configured line budget`,
	"    expected 16 lines, received 24",
	"",
	"NAME                        LINES    BRANCHES    FUNCTIONS    UNCOVERED",
	"TerminalBlock.tsx           100%     100%        100%         -",
	"ansi.ts                     100%     100%        100%         -",
	"clipboard.ts                100%     100%        100%         -",
	"CodeBlock.tsx               98.4%    96.2%       100%         41-43",
	"highlight.ts                100%     100%        100%         -",
	"Pill.tsx                    100%     100%        100%         -",
	"StateDot.tsx                100%     100%        100%         -",
	"markdown/Markdown.tsx       100%     100%        100%         -",
	"",
	sgr(31, "1 of 4 checks failed")
].join("\n");
/**
* Exit status for each terminal sample, keyed by its output text. Authored
* alongside the sample rather than parsed back out of its trailing marker,
* which is the bash tool's own job and not something to reimplement here.
*/
const TERMINAL_EXIT_STATUS = { [TERMINAL_OUTPUT_FIXTURE]: { exitCode: 1 } };
/**
* Structured grep result for the search sample (turn 67): matches grouped by
* file, authored inline because the client-side fixture cannot import the tool
* that produces the canonical value. `truncated` with a larger `total` than the
* retained match count exercises the search card's capped indicator; the file
* with more than CHAT_SEARCH_MAX_LINES rows exercises its head/tail height cap.
*/
const SEARCH_MATCHES_FIXTURE = [
	{
		path: "packages/client/ui-primitives/src/SearchBlock.tsx",
		matches: [
			{
				lineNumber: 16,
				line: "export const DEFAULT_SEARCH_MAX_LINES = 16"
			},
			{
				lineNumber: 138,
				line: "export function SearchBlock(props: SearchBlockProps) {"
			},
			{
				lineNumber: 141,
				line: "  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set())"
			}
		]
	},
	{
		path: "packages/client/ui-tool/src/client/tool/models/search-card-model.ts",
		matches: [{
			lineNumber: 45,
			line: "export const CHAT_SEARCH_MAX_LINES = 8"
		}, {
			lineNumber: 130,
			line: "export function searchCardModel(block: ToolCallBlock): SearchCardModel | null {"
		}]
	},
	{
		path: "packages/client/ui-tool/src/client/tool/toolviews/search-row.tsx",
		matches: [
			{
				lineNumber: 34,
				line: "export function SearchRow({ toolName, block, inspect, t }: SearchRowProps) {"
			},
			{
				lineNumber: 36,
				line: "  const search = searchCardModel(block)"
			},
			{
				lineNumber: 56,
				line: "      search={search}"
			},
			{
				lineNumber: 78,
				line: "      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'grep', locale: NS }, SearchRow)"
			}
		]
	}
];
/**
* The model-facing grep render text for the sample — what a UI without a search
* card shows, attached as the view's `content`. Mirrors the real grep
* presenter's shape (see formatGrepOutput in dsh-tool-fs-search): a
* `Found X of Y matches` header, the matches grouped under file headers with
* `Line N:` rows, then a spill-recovery footer.
*/
const SEARCH_MATCHES_TEXT = [
	"Found 9 of 42 matches",
	"",
	...SEARCH_MATCHES_FIXTURE.map((file) => [file.path, ...file.matches.map((m) => `Line ${m.lineNumber}: ${m.line}`)].join("\n")),
	"",
	"(Full grep result stored at: fixture://spill/grep-66. Read it to see every match.)"
].join("\n");
/**
* Structured glob result for the search sample (turn 68): a flat path list,
* truncated with a larger `total` so the path card shows its capped indicator.
*/
const SEARCH_PATHS_FIXTURE = [
	"packages/client/ui-primitives/src/SearchBlock.tsx",
	"packages/client/ui-primitives/src/SearchBlock.module.css",
	"packages/client/ui-tool/src/client/tool/models/search-card-model.ts",
	"packages/client/ui-tool/src/client/tool/toolviews/search-row.tsx",
	"packages/client/ui-tool/tests/search-card.client.spec.tsx"
];
/**
* The model-facing glob render text — the newline-joined path list plus a
* spill-recovery footer, mirroring the real glob presenter's shape (see
* formatGlobOutput in dsh-tool-fs-search).
*/
const SEARCH_PATHS_TEXT = [
	...SEARCH_PATHS_FIXTURE,
	"",
	"(Showing 5 of 23 paths. Full sorted result stored at: fixture://spill/glob-67. Read it to see every path.)"
].join("\n");
/**
* Read-card sample for the read turn: a WINDOW past an offset, so the line
* numbers start above 1 (the card's gutter keeps the file's own numbering) and
* `totalLines` exceeds the window (the card shows a "showing N of M" note). The
* fixture is client-side and cannot import the read tool, so the structured
* window is authored inline exactly as the tool would project it through
* `presentationMeta`. `lang` is a `ts` hint so the shiki path highlights it.
*/
const READ_SAMPLE_FIRST_LINE = 41;
const READ_SAMPLE_SOURCE = [
	"export interface ReadBlockProps {",
	"  label?: string | undefined",
	"  lines: readonly ReadBlockLine[]",
	"  totalLines: number",
	"  lang?: string | undefined",
	"  maxLines?: number | undefined",
	"  className?: string | undefined",
	"}",
	"",
	"// A windowed read keeps the file line numbers in the gutter.",
	"const marker = \"fixture read sample\""
];
const READ_SAMPLE_LINES = READ_SAMPLE_SOURCE.map((text, index) => ({
	number: READ_SAMPLE_FIRST_LINE + index,
	text
}));
const READ_SAMPLE_TEXT = READ_SAMPLE_SOURCE.map((text, index) => `${READ_SAMPLE_FIRST_LINE + index}: ${text}`).join("\n");

//#endregion
//#region vendor/client-connection/api-path.js
/**
* The /api URL prefix — single source for both halves of the web transport.
* The node half registers this prefix on the web server; both halves share the
* event paths below for the browser WebSocket downlinks.
*/
/** Route prefix owning every api request (`/api` and `/api/<anything>`). */
const API_PATH = "/api";
/** Browser mux-frame WebSocket pathname. */
const MUX_EVENTS_PATH = `${API_PATH}/events.mux`;
/** Browser host-frame WebSocket pathname. */
const HOST_EVENTS_PATH = `${API_PATH}/events.host`;

//#endregion
//#region vendor/client-connection/client/index.js
/**
* Build the shared Client Connection lifecycle over a selected carrier.
* Browser and in-process surfaces use this same single-owner stream loop,
* Host-description publication, reconnect lifecycle, and sink isolation.
* @param options - API and logical-RPC carrier pair.
* @returns consumer-agnostic Connection handle.
*/
function createConnectionHandle(options$1) {
	const { api, rpc, isLoopback = true } = options$1;
	let started = false;
	let description;
	const descriptionListeners = /* @__PURE__ */ new Set();
	const publishDescription = (next) => {
		if (Object.is(description, next)) return;
		description = next;
		for (const listener of [...descriptionListeners]) try {
			listener();
		} catch (error) {
			console.error("[client-connection] host-description listener threw:", error);
		}
	};
	return {
		api,
		isLoopback,
		hostDescription: {
			getSnapshot: () => description,
			subscribe: (listener) => {
				descriptionListeners.add(listener);
				return () => {
					descriptionListeners.delete(listener);
				};
			}
		},
		rpc,
		start(sinks, config) {
			if (started) throw new Error("connection: the stream loop is already owned by another consumer");
			started = true;
			const controller = new ConnectionController(api, {
				...sinks,
				onConnected: (next) => {
					publishDescription(next);
					if (!Object.is(description, next)) return;
					sinks.onConnected?.(next);
				},
				onStateChange: (state) => {
					if (state === "reconnecting") publishDescription(void 0);
					sinks.onStateChange?.(state);
				}
			}, config ?? {});
			controller.start();
			return { stop: () => {
				controller.stop();
				publishDescription(void 0);
			} };
		}
	};
}

//#endregion
//#region vendor/ui-slots/index.js
const NO_ENTRIES = Object.freeze([]);
/**
* Pure slot registry (no cordis; event emission and the renderer installation contract
* live in the runtime Service wrapper).
*
* The 'root' slot is the one a-priori declaration, seeded at construction
* (single/root, declared by the framework) — the render tree's root hole.
*
* Change propagation contract: versions bump and {@link SlotCore.onMutate}
* fires synchronously per mutation (registry state is consistent when they
* fire); {@link SlotCore.subscribeDeclaration} fires synchronously for each
* declaration lifetime boundary; {@link SlotCore.subscribe} notifications
* batch per microtask, so N same-tick mutations produce one notification per
* touched key. Entry crash reports ({@link SlotCore.reportEntryError}) ride
* the same mutation channel when they abdicate, then notify
* {@link SlotCore.onEntryError} synchronously.
*/
var SlotCore = class {
	records = /* @__PURE__ */ new Map();
	mutateListeners = /* @__PURE__ */ new Set();
	/** Shared-handle scope ledger: handle → the scope it first mounted under + live mount count. */
	handleScopes = /* @__PURE__ */ new Map();
	dirty = /* @__PURE__ */ new Set();
	flushScheduled = false;
	/**
	* Entries retired by an abdicating crash report
	* ({@link SlotCore.reportEntryError}): excluded from
	* {@link SlotCore.entriesOfSlot} projections for the rest of their
	* registration's life, while the registration itself stays on the ledger
	* (disposal authority remains with the registrant).
	*/
	abdicated = /* @__PURE__ */ new WeakSet();
	entryErrorListeners = /* @__PURE__ */ new Set();
	constructor() {
		const root = this.record("root");
		root.spec = {
			kind: "single",
			scope: "root"
		};
		root.declaredBy = "(built-in)";
		root.declarationEpoch = 1;
	}
	register(options$1, component) {
		const rec = this.records.get(options$1.name);
		if (!rec?.spec) throw new Error(`slot "${options$1.name}" is not declared (a parent entry's children table must declare it)`);
		const spec = rec.spec;
		const priority = options$1.priority ?? 0;
		const occupantHint = (occupant) => `at priority ${priority}${occupant.registrant !== void 0 ? ` (registered by ${occupant.registrant})` : ""} — register at a different priority to shadow it (lowest renders)`;
		switch (spec.kind) {
			case "single": {
				const occupant = rec.entries.find((e) => (e.options.priority ?? 0) === priority);
				if (occupant) throw new Error(`single slot "${options$1.name}" already has a registration ${occupantHint(occupant)}`);
				break;
			}
			case "keyed": {
				if (options$1.key === void 0) throw new Error(`keyed slot "${options$1.name}" requires options.key`);
				const occupant = rec.entries.find((e) => e.options.key === options$1.key && (e.options.priority ?? 0) === priority);
				if (occupant) throw new Error(`keyed slot "${options$1.name}" already has an entry for key "${options$1.key}" ${occupantHint(occupant)}`);
				break;
			}
			case "list": {
				if (options$1.id === void 0) throw new Error(`list slot "${options$1.name}" requires options.id`);
				const occupant = rec.entries.find((e) => e.options.id === options$1.id && (e.options.priority ?? 0) === priority);
				if (occupant) throw new Error(`list slot "${options$1.name}" already has an entry with id "${options$1.id}" ${occupantHint(occupant)}`);
				break;
			}
			case "chain":
				if (options$1.select === void 0) throw new Error(`chain slot "${options$1.name}" requires options.select`);
				break;
		}
		if (options$1.children) for (const childKey of Object.keys(options$1.children)) {
			const childRec = this.records.get(childKey);
			if (childRec?.spec) throw new Error(`slot "${childKey}" is already declared (by ${childRec.declaredBy ?? "an unknown entry"})`);
		}
		if (options$1.store !== void 0 && typeof options$1.store !== "function") {
			const pinned = this.handleScopes.get(options$1.store);
			if (pinned && pinned.scope !== spec.scope) throw new Error(`store handle mounted under "${options$1.name}" (scope "${spec.scope}") is already mounted under scope "${pinned.scope}" — one handle, one scope`);
			if (pinned) pinned.count += 1;
			else this.handleScopes.set(options$1.store, {
				scope: spec.scope,
				count: 1
			});
		}
		const entry = {
			component,
			options: {
				...options$1.key !== void 0 ? { key: options$1.key } : {},
				...options$1.id !== void 0 ? { id: options$1.id } : {},
				...options$1.order !== void 0 ? { order: options$1.order } : {},
				...options$1.label !== void 0 ? { label: options$1.label } : {},
				...options$1.priority !== void 0 ? { priority: options$1.priority } : {}
			},
			...options$1.select !== void 0 ? { select: options$1.select } : {},
			...options$1.inject !== void 0 ? { inject: options$1.inject } : {},
			...options$1.children !== void 0 ? { children: options$1.children } : {},
			...options$1.store !== void 0 ? { store: options$1.store } : {},
			...options$1.locale !== void 0 ? { locale: options$1.locale } : {},
			...options$1.registrant !== void 0 ? { registrant: options$1.registrant } : {}
		};
		const next = [...rec.entries, entry];
		next.sort(spec.kind === "list" ? (a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0) || (a.options.order ?? 0) - (b.options.order ?? 0) : (a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0));
		rec.entries = next;
		this.markDirty(options$1.name, rec);
		if (options$1.children) {
			const declarations = [];
			for (const [childKey, childSpec] of Object.entries(options$1.children)) {
				const childRec = this.record(childKey);
				childRec.spec = childSpec;
				childRec.declaredBy = `an entry in "${options$1.name}"${options$1.registrant ? ` (${options$1.registrant})` : ""}`;
				childRec.parent = options$1.name;
				childRec.declarationEpoch += 1;
				declarations.push([childKey, childRec]);
			}
			for (const [childKey, childRec] of declarations) this.markDirty(childKey, childRec);
			for (const [, childRec] of declarations) this.notifyDeclaration(childRec);
		}
		return () => {
			if (!rec.entries.includes(entry)) return;
			rec.entries = rec.entries.filter((e) => e !== entry);
			this.markDirty(options$1.name, rec);
			this.releaseEntry(entry);
		};
	}
	/**
	* Whether a previously obtained entry is still registered (the render
	* machinery's stale-authorization probe: a retained renderSlot binding
	* whose entry left the ledger must not render).
	* @param entry - a previously read entry.
	* @returns false once the entry's registration was disposed.
	*/
	isLive(entry) {
		for (const rec of this.records.values()) if (rec.entries.includes(entry)) return true;
		return false;
	}
	/**
	* Snapshot the registered entries for a key. Returns the cached array
	* reference (stable between mutations — safe as a uSES getSnapshot source);
	* empty for keys not (or no longer) declared, so renderers may probe ahead
	* of plugin load order.
	* @param key - slot key (dynamic: the render machinery holds keys as strings).
	* @returns entries in registration (list: order) sequence.
	*/
	entries(key) {
		return this.records.get(key)?.entries ?? NO_ENTRIES;
	}
	/**
	* Project a key's entries to its shadowing winners: the first live
	* (non-abdicated) entry of each cell in priority order — single: the slot
	* is one cell; keyed: one cell per `key`; list: one cell per `id` (winners
	* keep ledger sequence; list renderers still refine display by `order`).
	* Chain keys return the raw entries unchanged: election consumes every
	* entry, shadowing does not apply. The raw {@link SlotCore.entries} view
	* stays the inspection surface. Builds a fresh array per call — a render
	* body read, not a uSES getSnapshot source.
	* @param key - slot key (dynamic: the render machinery holds keys as strings).
	* @returns the winning entry per occupied cell (empty while undeclared).
	*/
	entriesOfSlot(key) {
		const rec = this.records.get(key);
		if (!rec?.spec) return NO_ENTRIES;
		const kind = rec.spec.kind;
		if (kind === "chain") return rec.entries;
		const heads = [];
		const seenCells = /* @__PURE__ */ new Set();
		for (const entry of rec.entries) {
			if (this.abdicated.has(entry)) continue;
			const cell = kind === "keyed" ? entry.options.key : kind === "list" ? entry.options.id : void 0;
			if (seenCells.has(cell)) continue;
			seenCells.add(cell);
			heads.push(entry);
		}
		return heads;
	}
	/**
	* Look up a slot's declared spec, narrowed by the SlotMap key.
	* @param key - SlotMap key.
	* @returns the spec, or undefined while undeclared.
	*/
	spec(key) {
		return this.records.get(key)?.spec;
	}
	/**
	* Dynamic-key escape hatch for spec lookup — renderers resolving keys they
	* only hold as strings (generic dispatch) use this wide form; statically
	* keyed callers use {@link SlotCore.spec}.
	* @param key - candidate slot key.
	* @returns the wide-typed spec, or undefined while undeclared.
	*/
	specDynamic(key) {
		return this.records.get(key)?.spec;
	}
	/**
	* Export the current declaration topology without components or executable hooks.
	* @param root - exact Slot key to select; omitted returns every live root.
	* @returns selected live Slot trees, or an empty array when `root` is unavailable.
	*/
	snapshot(root) {
		const build = (name$1, seen) => {
			const record = this.records.get(name$1);
			if (record?.spec === void 0 || seen.has(name$1)) return void 0;
			const branch = new Set(seen);
			branch.add(name$1);
			const active = new Set(this.entriesOfSlot(name$1));
			const children = [...this.records.entries()].filter(([, candidate]) => candidate.spec !== void 0 && candidate.parent === name$1).flatMap(([child]) => {
				const node = build(child, branch);
				return node === void 0 ? [] : [node];
			});
			return {
				name: name$1,
				kind: record.spec.kind,
				scope: record.spec.scope,
				...record.declaredBy === void 0 ? {} : { declaredBy: record.declaredBy },
				occupants: record.entries.map((entry) => ({
					...entry.registrant === void 0 ? {} : { registrant: entry.registrant },
					...entry.options.key === void 0 ? {} : { key: entry.options.key },
					...entry.options.id === void 0 ? {} : { id: entry.options.id },
					...entry.options.order === void 0 ? {} : { order: entry.options.order },
					priority: entry.options.priority ?? 0,
					active: active.has(entry)
				})),
				children
			};
		};
		if (root !== void 0) {
			const node = build(root, /* @__PURE__ */ new Set());
			return node === void 0 ? [] : [node];
		}
		return [...this.records.entries()].filter(([, record]) => record.spec !== void 0 && (record.parent === void 0 || this.records.get(record.parent)?.spec === void 0)).flatMap(([name$1]) => {
			const node = build(name$1, /* @__PURE__ */ new Set());
			return node === void 0 ? [] : [node];
		});
	}
	/**
	* Read the declaration lifetime of a key. Entry additions and removals do
	* not change it; declaration creation and collapse each advance it.
	* @param key - slot key.
	* @returns monotonic epoch (0 before the first declaration).
	*/
	declarationEpoch(key) {
		return this.records.get(key)?.declarationEpoch ?? 0;
	}
	/**
	* Subscribe to registration changes for a key (microtask-batched).
	* Subscribing ahead of declaration is allowed; the declaration notifies.
	* @param key - slot key.
	* @param fn - change callback.
	* @returns unsubscribe.
	*/
	subscribe(key, fn) {
		const rec = this.record(key);
		rec.listeners.add(fn);
		return () => {
			rec.listeners.delete(fn);
		};
	}
	/**
	* Subscribe to declaration lifetime boundaries for a key. Notifications
	* are synchronous so declaration teardown finishes before a subsequent
	* same-tick registration can observe stale resources. Ordinary entry
	* mutations do not notify this surface. A children table commits every
	* sibling declaration before its first notification.
	* @param key - slot key.
	* @param fn - declaration or collapse callback.
	* @returns unsubscribe.
	*/
	subscribeDeclaration(key, fn) {
		const rec = this.record(key);
		rec.declarationListeners.add(fn);
		return () => {
			rec.declarationListeners.delete(fn);
		};
	}
	/**
	* Monotonic version for a key, bumped synchronously per mutation so a
	* uSES getSnapshot read is never stale when its batched notification lands.
	* @param key - slot key.
	* @returns current version (0 for untouched keys).
	*/
	getVersion(key) {
		return this.records.get(key)?.version ?? 0;
	}
	/**
	* Hook every mutation (the runtime Service wrapper bridges this to ctx.emit).
	* Fires synchronously per mutation, unbatched — event semantics need one
	* emission per change.
	* @param fn - called with the mutated key.
	* @returns unsubscribe.
	*/
	onMutate(fn) {
		this.mutateListeners.add(fn);
		return () => {
			this.mutateListeners.delete(fn);
		};
	}
	/**
	* Renderer crash report from an entry boundary. Always notifies
	* {@link SlotCore.onEntryError} listeners; with `info.abdicate` set (the
	* shadowing kinds — single/keyed/list) it first retires the entry from its
	* cell, one-shot: the record's version bumps through the ordinary mutation
	* channel so outlets re-project onto the cell's next survivor, and a
	* repeat abdicating report no-ops entirely. Chain crashes report with
	* `abdicate: false` — election alternatives resolve at select time, so the
	* entry keeps its cell and only the notification fires. The registration
	* itself stays on the ledger either way — raw {@link SlotCore.entries}
	* still lists the entry and its disposer keeps working.
	* @param key - slot key the entry rendered under.
	* @param entry - the crashed entry.
	* @param error - the crash cause, forwarded to listeners verbatim.
	* @param info - `abdicate`: whether the crash retires the entry from its cell.
	*/
	reportEntryError(key, entry, error, info) {
		if (info.abdicate) {
			if (this.abdicated.has(entry)) return;
			this.abdicated.add(entry);
			const rec = this.records.get(key);
			if (rec !== void 0) this.markDirty(key, rec);
		}
		for (const fn of [...this.entryErrorListeners]) fn(key, entry, error, { abdicated: info.abdicate });
	}
	/**
	* Observe entry boundary crashes (every render-time entry failure the
	* boundaries contain, abdicating or not) — the supervision seam for hosts
	* mirroring contribution health. Fires synchronously per report, after the
	* registry mutated for abdicating crashes (same listener discipline as
	* {@link SlotCore.onMutate}).
	* @param fn - called with the slot key, the crashed entry, the crash
	* cause, and `abdicated`: whether the crash retired the entry from its cell.
	* @returns unsubscribe.
	*/
	onEntryError(fn) {
		this.entryErrorListeners.add(fn);
		return () => {
			this.entryErrorListeners.delete(fn);
		};
	}
	/**
	* Cascade for a removed entry: release its store mount and collapse every
	* child slot it declared — specs clear, contributions empty (their stale
	* disposers no-op), recursively down the declaration tree. One lifecycle
	* axis: ledger rows, slots, contributions, and store mounts die together.
	*/
	releaseEntry(entry) {
		if (entry.store !== void 0 && typeof entry.store !== "function") {
			const pinned = this.handleScopes.get(entry.store);
			if (pinned && --pinned.count === 0) this.handleScopes.delete(entry.store);
		}
		if (!entry.children) return;
		for (const childKey of Object.keys(entry.children)) {
			const childRec = this.records.get(childKey);
			/* v8 ignore next -- defensive: declaring always creates the record */
			if (!childRec) continue;
			const doomed = childRec.entries;
			childRec.spec = void 0;
			childRec.declaredBy = void 0;
			childRec.parent = void 0;
			childRec.declarationEpoch += 1;
			childRec.entries = NO_ENTRIES;
			this.markDirty(childKey, childRec);
			this.notifyDeclaration(childRec);
			for (const dead of doomed) this.releaseEntry(dead);
		}
	}
	record(key) {
		let rec = this.records.get(key);
		if (!rec) {
			rec = {
				spec: void 0,
				declaredBy: void 0,
				parent: void 0,
				declarationEpoch: 0,
				entries: NO_ENTRIES,
				version: 0,
				listeners: /* @__PURE__ */ new Set(),
				declarationListeners: /* @__PURE__ */ new Set()
			};
			this.records.set(key, rec);
		}
		return rec;
	}
	markDirty(key, rec) {
		rec.version += 1;
		for (const fn of [...this.mutateListeners]) fn(key);
		this.dirty.add(rec);
		if (!this.flushScheduled) {
			this.flushScheduled = true;
			queueMicrotask(() => {
				this.flush();
			});
		}
	}
	notifyDeclaration(rec) {
		for (const fn of [...rec.declarationListeners]) fn();
	}
	flush() {
		this.flushScheduled = false;
		const dirty = [...this.dirty];
		this.dirty.clear();
		for (const rec of dirty) for (const fn of [...rec.listeners]) fn();
	}
};

//#endregion
//#region vendor/client-runtime/client/slots.js
/** Instance key for root-scoped store records (session records key by session id, so the literal cannot collide). */
const ROOT_INSTANCE_KEY = "root";
/** cordis Service layer of the slot system; see the module doc for the split with SlotCore. */
var SlotRegistry = class extends Service {
	_core = new SlotCore();
	/** Store-instance axis: handle -> mounted scope, refcount, resolved instances. */
	_stores = /* @__PURE__ */ new Map();
	_renderer;
	_locale;
	_host;
	/**
	* @param ctx - owning root context.
	*/
	constructor(ctx) {
		super(ctx, "slots");
		this._core.onMutate((key) => {
			ctx.emit("slots/changed", key);
		});
	}
	/**
	* Install an effect for each declaration lifetime of a slot. The callback
	* runs synchronously when the declaration already exists; otherwise it runs
	* inside the declaring `register()` call after the declaration is committed.
	* Collapse disposes the effect and a later declaration runs it again.
	* Callback effects are synchronous disposers; iterable effects install
	* transactionally and dispose in reverse order. The controller belongs to
	* the caller's fiber, so plugin unload cancels a pending wait and removes any
	* active contribution.
	*
	* @param key - declared SlotMap key to depend on.
	* @param callback - creates one disposer or an iterable of disposers.
	* @returns idempotent disposer for the wait and active effect.
	* @throws callback setup failures synchronously when the slot is already declared.
	*/
	inject(key, callback) {
		const ctx = this.ctx;
		const disposeController = ctx.effect(() => {
			let active;
			let activeEpoch;
			let stopped = false;
			let unsubscribe = () => {};
			const stop = () => {
				if (stopped) return;
				stopped = true;
				unsubscribe();
				const dispose = active;
				active = void 0;
				activeEpoch = void 0;
				dispose?.();
			};
			const reconcile = () => {
				if (stopped) return;
				const spec = this._core.specDynamic(key);
				const epoch = this._core.declarationEpoch(key);
				if (active !== void 0 && activeEpoch === epoch) return;
				const dispose = active;
				active = void 0;
				activeEpoch = void 0;
				dispose?.();
				if (spec === void 0) return;
				const disposeEffect = ctx.effect(callback, `slots.inject(${JSON.stringify(key)}): declaration`);
				active = () => {
					disposeEffect();
				};
				activeEpoch = epoch;
			};
			const changed = () => {
				try {
					reconcile();
				} catch (error) {
					if (error?.code === "INACTIVE_EFFECT") {
						stop();
						return;
					}
					stop();
					const failure = error instanceof Error ? error : new Error(String(error));
					queueMicrotask(() => {
						throw failure;
					});
				}
			};
			unsubscribe = this._core.subscribeDeclaration(key, changed);
			try {
				reconcile();
			} catch (error) {
				stop();
				throw error;
			}
			return stop;
		}, `slots.inject(${JSON.stringify(key)})`);
		return () => {
			disposeController();
		};
	}
	/**
	* Install the shell's renderer (web-react's createSlotRenderer product).
	* Boot-once: a second install throws. Runs through the caller's ctx.effect,
	* so shell fiber unload uninstalls the renderer.
	* @param renderer - the outlet machinery implementing SlotRenderer.
	*/
	install(renderer) {
		if (this._renderer !== void 0) throw new Error("slot renderer already installed (install() is boot-once)");
		this.ctx.effect(() => {
			this._renderer = renderer;
			return () => {
				if (this._renderer === renderer) this._renderer = void 0;
			};
		}, "slots.install()");
	}
	/**
	* Install the locale face backing the `t` standard seat (the locale
	* plugin's product; same boot-once discipline as the renderer install).
	* Runs through the caller's ctx.effect, so the installing fiber's unload
	* uninstalls the face.
	* @param face - namespace binder + revision observable.
	*/
	installLocale(face) {
		if (this._locale !== void 0) throw new Error("locale face already installed (installLocale() is boot-once)");
		this.ctx.effect(() => {
			this._locale = face;
			return () => {
				if (this._locale === face) this._locale = void 0;
			};
		}, "slots.installLocale()");
	}
	/**
	* The single ctx-level render entry: the shell renders 'root'; every other
	* key renders inside components through the props renderSlot face. All
	* three guards are fail-loud boot-order checks, no fallback.
	* @param key - must be 'root' (runtime-enforced for dynamically composed callers).
	* @param owner - owner share for the root entry (the shell supplies {}).
	* @returns the rendered root tree.
	*/
	renderSlot(key, owner) {
		if (key !== "root") throw new Error(`ctx-level renderSlot only renders 'root' (got "${key}"); child slots render through the component props face`);
		if (this._renderer === void 0) throw new Error("slot renderer not installed — boot must call ctx.slots.install(createSlotRenderer()) before rendering 'root'");
		if (this._core.entries("root").length === 0) throw new Error("'root' has no registration — a layout entry must register into 'root' before the shell renders it");
		return this._renderer.renderRoot(this.hostFace(), owner);
	}
	/**
	* Drop the per-session store instances of a dead session (the sessions
	* service calls this on scope teardown; root-scoped records are untouched).
	* Persisted state goes with the session — a never-rendered dead session can
	* still own keys from an earlier page load, so the instance is materialized
	* transiently just to clear storage (no-op for unpersisted stores).
	* @param sessionId - the torn-down session.
	*/
	pruneStoreScope(sessionId) {
		for (const [handle, record] of this._stores) {
			if (record.scope !== "session") continue;
			(record.instances.get(sessionId) ?? handle.create(sessionId)).clearPersisted();
			record.instances.delete(sessionId);
		}
	}
	/**
	* Snapshot entries for a key (render-erased view; stable reference between mutations).
	* @param key - SlotMap key.
	* @returns registered entries.
	*/
	entries(key) {
		return this._core.entries(key);
	}
	/**
	* Shadowing winners per cell for a key: the first live (non-abdicated)
	* entry of each cell in priority order — what outlets render; chain keys
	* pass through unchanged (election consumes every entry). The raw
	* {@link SlotsService.entries} view stays the inspection surface. Fresh
	* array per call, not a uSES getSnapshot source.
	* @param key - SlotMap key.
	* @returns the winning entry per occupied cell.
	*/
	entriesOfSlot(key) {
		return this._core.entriesOfSlot(key);
	}
	/**
	* Export the current JSON-safe Slot declaration tree for read-only inspection.
	* @param root - exact live Slot root; omitted returns all roots.
	* @returns selected Slot trees.
	*/
	snapshot(root) {
		return this._core.snapshot(root);
	}
	/**
	* Observe entry boundary crashes (every render-time entry failure the
	* boundaries contain, abdicating or not) — the supervision seam for
	* plugins mirroring contribution health. Fires synchronously per report,
	* after the registry mutated for abdicating crashes. Callers own the
	* disposer (wire it through ctx.effect for fiber-lifetime cleanup, as with
	* {@link SlotsService.subscribe}).
	* @param fn - called with the slot key, the crashed entry, the crash
	* cause, and `abdicated`: whether the crash retired the entry from its cell.
	* @returns unsubscribe.
	*/
	onEntryError(fn) {
		return this._core.onEntryError(fn);
	}
	/**
	* Look up a declared spec (register-declared or the built-in 'root').
	* @param key - SlotMap key.
	* @returns spec or undefined.
	*/
	spec(key) {
		return this._core.spec(key);
	}
	/**
	* Subscribe to a key's registration changes (microtask-batched).
	* @param key - SlotMap key.
	* @param fn - change callback.
	* @returns unsubscribe.
	*/
	subscribe(key, fn) {
		return this._core.subscribe(key, fn);
	}
	/**
	* Version counter for uSES pairing.
	* @param key - SlotMap key.
	* @returns current version.
	*/
	getVersion(key) {
		return this._core.getVersion(key);
	}
	/** Delegating registration path: factory minting + registrant stamp + core write + instance-axis bookkeeping. */
	_register(options$1, component) {
		const store = typeof options$1.store === "function" ? options$1.store() : options$1.store;
		const registrant = options$1.registrant ?? this.ctx.fiber?.name;
		const erased = {
			...options$1,
			...store !== void 0 ? { store } : {},
			...registrant !== void 0 ? { registrant } : {}
		};
		const dispose = this._core.register(erased, component);
		if (store !== void 0) {
			const scope = this._core.specDynamic(options$1.name).scope;
			this._acquire(store, scope);
		}
		let disposed = false;
		return () => {
			if (disposed) return;
			disposed = true;
			dispose();
			if (store !== void 0) this._release(store);
		};
	}
	/** Build once after both object-layer services mount; per-session provide bundles still resolve lazily. */
	hostFace() {
		if (this._host !== void 0) return this._host;
		const sessions = this.ctx.get("sessions");
		if (sessions === void 0) throw new Error("renderSlot('root') before the sessions service mounted — boot order puts runtime apply first");
		const workspaces = this.ctx.get("workspaces");
		if (workspaces === void 0) throw new Error("renderSlot('root') before the workspaces service mounted — boot order puts runtime apply first");
		const service = this;
		this._host = {
			subscribe: (key, fn) => this._core.subscribe(key, fn),
			getVersion: (key) => this._core.getVersion(key),
			entriesOf: (key) => this._core.entries(key),
			entriesOfSlot: (key) => this._core.entriesOfSlot(key),
			reportEntryError: (key, entry, error, info) => {
				this._core.reportEntryError(key, entry, error, info);
			},
			specOf: (key) => this._core.specDynamic(key),
			isLive: (entry) => this._core.isLive(entry),
			storeOf: (entry, scopeKey) => entry.store === void 0 ? void 0 : this.resolveStore(entry.store, scopeKey),
			sessions: {
				list: sessions.list,
				provideInfo: sessions.currentProvideInfo
			},
			workspaces: { list: workspaces.list },
			get locale() {
				return service._locale;
			}
		};
		return this._host;
	}
	/** Resolve (create or reuse) the store instance for a registered handle under a scope key. */
	resolveStore(handle, sessionId) {
		const record = this._stores.get(handle);
		if (record === void 0) throw new Error("store handle is not registered (entry unloaded, or the handle never went through register)");
		const key = record.scope === "root" ? ROOT_INSTANCE_KEY : sessionId;
		if (key === void 0) throw new Error(`${record.scope} store resolution requires a session id`);
		let instance = record.instances.get(key);
		if (instance === void 0) {
			instance = record.scope === "root" ? handle.create() : handle.create(key);
			record.instances.set(key, instance);
		}
		return instance;
	}
	/** Bind (or re-reference) a handle on the axis; cross-scope conflicts already threw in the core. */
	_acquire(handle, scope) {
		const record = this._stores.get(handle);
		if (record === void 0) {
			this._stores.set(handle, {
				scope,
				refs: 1,
				instances: /* @__PURE__ */ new Map()
			});
			return;
		}
		record.refs += 1;
	}
	/** Drop one reference; the last holder's unload drops the record (instances go with it — engine stores need no explicit dispose). */
	_release(handle) {
		const record = this._stores.get(handle);
		/* v8 ignore next -- defensive: release only runs from a disposer whose
		* register acquired the same handle, so the record must exist; kept so a
		* future call site cannot underflow the axis. */
		if (record === void 0) return;
		record.refs -= 1;
		if (record.refs === 0) this._stores.delete(handle);
	}
};
SlotRegistry.prototype.register = function register(rawOptions, component) {
	const options$1 = rawOptions;
	return this.ctx.effect(() => this["_register"](options$1, component), "slots.register()");
};

//#endregion
//#region vendor/client-runtime/client/contract/store.js
/**
* Shallow equality for selector slices (zustand/shallow semantics; travels
* with the engine so hook consumers need no zustand dependency).
* @param a - left value.
* @param b - right value.
* @returns whether the values are shallowly equal.
*/
function shallowEqual(a, b) {
	return shallow(a, b);
}
/** Batches subscriber notification into one flush per animation frame. */
function rafBatch(notify) {
	const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
		requestAnimationFrame(() => {
			fn();
		});
	} : (fn) => {
		queueMicrotask(fn);
	};
	let scheduled = false;
	return () => {
		if (scheduled) return;
		scheduled = true;
		schedule(() => {
			scheduled = false;
			notify();
		});
	};
}
/**
* Create a snapshot store.
*
* Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
* stores opt into 'raf', where a frame's worth of updates coalesces into one
* notification. Known raf-mode tradeoff: a component mounting mid-frame reads
* fresh state while existing subscribers hear it next flush — transient
* frame-level skew, same nature as the object layer's microtask batching.
*
* @param init - initial state.
* @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
* @returns the store.
*/
function createSnapshotStore(init, opts) {
	const withSelector = subscribeWithSelector(() => init);
	const api = createStore()(withSelector);
	if (opts?.persist) attachPersistence(api, opts.persist.name);
	let subscribe = (fn) => api.subscribe(fn);
	if (opts?.flush === "raf") {
		const listeners = /* @__PURE__ */ new Set();
		const flush = rafBatch(() => {
			for (const fn of [...listeners]) fn();
		});
		api.subscribe(flush);
		subscribe = (fn) => {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		};
	}
	return {
		getSnapshot: () => api.getState(),
		subscribe: (fn) => subscribe(fn),
		update: (mutator) => {
			api.setState(produce(api.getState(), (draft) => {
				mutator(draft);
			}), true);
		},
		set: (next) => {
			api.setState(devFreeze(next), true);
		}
	};
}
/**
* Whole-value JSON persistence to localStorage. Hand-rolled instead of the
* zustand persist middleware: its write path spreads state into an object
* (`partialize({ ...get() })`), exploding primitive state (a persisted string
* draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
* because the corruption happens before serialization. Storage failures
* (quota, private mode) only disable persistence, never break the store.
*/
function attachPersistence(api, name$1) {
	if (typeof localStorage === "undefined") return;
	try {
		const raw = localStorage.getItem(name$1);
		if (raw !== null) api.setState(devFreeze(JSON.parse(raw)), true);
	} catch (error) {
		console.error(`snapshot store '${name$1}' rehydration failed:`, error);
	}
	api.subscribe((state) => {
		try {
			localStorage.setItem(name$1, JSON.stringify(state));
		} catch (error) {
			console.error(`snapshot store '${name$1}' persistence failed:`, error);
		}
	});
}
/** Deep-freeze wholesale-set state outside production: set() bypasses immer's freeze. */
function devFreeze(value) {
	if (process.env.NODE_ENV === "production") return value;
	deepFreeze(value);
	return value;
}
function deepFreeze(value) {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
	Object.freeze(value);
	for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
}
/**
* Declare a store: initial state, optional persistence, and the full write
* set as pure draft mutators. The returned handle is the registration
* currency of the store seat — its identity keys instance sharing. Satisfies
* ui-slots' DefineStore contract (the handle/instance are the engine-extended
* subtypes).
*
* The `A & ActionsDecl<T>` actions position is load-bearing: T resolves from
* `init` in the first inference round, and the intersection then contextually
* types each mutator's draft parameter (context-sensitive functions defer),
* so call sites write `(d, x: X) => { ... }` with no draft annotation. If a
* future TS version breaks this single-literal inference, the design's
* documented fallback is currying (`defineStore(init).actions({...})`).
* @param decl - init lambda (fresh state per instance), optional persist key, actions table.
* @returns the store handle.
*/
function defineStore(decl) {
	return {
		spec: decl,
		create(scopeKey) {
			const persistKey = decl.persist === void 0 ? void 0 : scopeKey === void 0 ? decl.persist : `${decl.persist}.${scopeKey}`;
			const store = createSnapshotStore(decl.init(), persistKey !== void 0 ? { persist: { name: persistKey } } : void 0);
			const actions = {};
			for (const key of Object.keys(decl.actions)) {
				const mutate = decl.actions[key];
				actions[key] = (...params) => {
					store.update((draft) => {
						mutate(draft, ...params);
					});
				};
			}
			return {
				actions,
				getSnapshot: () => store.getSnapshot(),
				subscribe: (fn) => store.subscribe(fn),
				store,
				clearPersisted: () => {
					if (persistKey === void 0 || typeof localStorage === "undefined") return;
					try {
						localStorage.removeItem(persistKey);
					} catch {}
				}
			};
		}
	};
}

//#endregion
//#region vendor/client-runtime/client/agents/scope.js
/** Context tag written by {@link createScope}. */
const kScope = Symbol("dsh.client.scope");
/** Shared no-op plugin backing each Agent scope fiber. */
function agentScope() {}
/**
* Mint an Agent scope under `ctx`: a no-op plugin fiber whose context
* carries the agent tag and the dispatch filter — untagged listeners are
* admitted globally, tagged listeners only for a matching agent.
* Registrations through the returned ctx dispose with the fiber.
* @param ctx - client root context the scope fiber mounts under.
* @param key - owning agent identity (the routing tag; agent id === session id).
* @returns the tagged context and its backing fiber.
*/
function createScope(ctx, key) {
	const fiber = ctx.plugin(agentScope);
	return {
		fiber,
		ctx: fiber.ctx.extend({
			[kScope]: key,
			[Context.filter](listenerCtx) {
				const tag$1 = scopeOf(listenerCtx);
				return tag$1 === void 0 || tag$1 === key;
			}
		})
	};
}
/**
* Read the nearest agent tag inherited by a context.
* @param ctx - any client context.
* @returns its agent identity (the session id), or undefined for root contexts.
*/
function scopeOf(ctx) {
	return ctx[kScope];
}

//#endregion
//#region vendor/client-runtime/client/ordered-baseline.js
/**
* Merge an authoritative baseline without moving identities already visible to
* the client. Baseline-only identities are inserted relative to the nearest
* following known identity; identities absent from the baseline are removed.
*
* @param current - the established client order.
* @param baseline - the latest authoritative rows.
* @param keyOf - stable identity selector.
* @returns baseline-valued rows with the established relative order retained.
*/
function mergeOrderedBaseline(current, baseline, keyOf) {
	const baselineByKey = /* @__PURE__ */ new Map();
	for (const value of baseline) baselineByKey.set(keyOf(value), value);
	const merged = current.map((value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);
	const mergedKeys = new Set(merged.map(keyOf));
	for (let index = 0; index < baseline.length; index++) {
		const value = baseline[index];
		/* v8 ignore next -- dense-array guard: index is bounded by baseline.length. */
		if (value === void 0 || mergedKeys.has(keyOf(value))) continue;
		let insertion = merged.length;
		for (let following = index + 1; following < baseline.length; following++) {
			const candidate = baseline[following];
			/* v8 ignore next -- dense-array guard: following is bounded by baseline.length. */
			if (candidate === void 0) continue;
			const known = merged.findIndex((item) => keyOf(item) === keyOf(candidate));
			if (known !== -1) {
				insertion = known;
				break;
			}
		}
		merged.splice(insertion, 0, value);
		mergedKeys.add(keyOf(value));
	}
	return merged;
}

//#endregion
//#region vendor/client-runtime/client/sessions/lineage.js
/**
* Summaries -> flat list with lineage indentation. Root and sibling order
* follows the established input order; this projection never re-sorts a
* hydrated list from mutable timestamps.
* @param summaries - the host's session.list items.
* @param pendingInteractions - current manager-owned interaction status by session.
* @param completed - sessions with a pending completion reminder (manager-owned live fact; absent = false).
* @returns display rows in render order.
*/
function flattenLineage(summaries, pendingInteractions, completed) {
	const byId = /* @__PURE__ */ new Map();
	for (const s of summaries) byId.set(s.sessionId, s);
	const children = /* @__PURE__ */ new Map();
	const roots = [];
	for (const s of summaries) if (s.parentSessionId !== void 0 && byId.has(s.parentSessionId)) {
		const list$1 = children.get(s.parentSessionId) ?? [];
		list$1.push(s);
		children.set(s.parentSessionId, list$1);
	} else roots.push(s);
	const out = [];
	const visited = /* @__PURE__ */ new Set();
	const walk$1 = (s, depth) => {
		if (visited.has(s.sessionId)) {
			console.warn(`[web-runtime] lineage cycle at ${s.sessionId}; emitting as root`);
			return;
		}
		visited.add(s.sessionId);
		const pendingInteraction = pendingInteractions?.get(s.sessionId);
		out.push({
			...s,
			...pendingInteraction === void 0 ? {} : { pendingInteraction },
			completed: completed?.has(s.sessionId) ?? false,
			depth
		});
		const kids = children.get(s.sessionId);
		if (kids === void 0) return;
		for (const kid of kids) walk$1(kid, depth + 1);
	};
	for (const root of roots) walk$1(root, 0);
	for (const s of summaries) if (!visited.has(s.sessionId)) walk$1(s, 0);
	return out;
}

//#endregion
//#region vendor/client-runtime/client/sessions/notifier.js
/** Subscription + batched notification primitive (shared by Session and SessionManager). */
var Notifier = class {
	rebuild;
	listeners = /* @__PURE__ */ new Set();
	dirty = false;
	notifyPending = false;
	scheduled = "none";
	scheduleGeneration = 0;
	/** @param rebuild - snapshot rebuild function injected by the owner (writes the owner's snapshotCache). */
	constructor(rebuild) {
		this.rebuild = rebuild;
	}
	/**
	* uSES subscription entry.
	* @param listener - change callback.
	* @returns the unsubscribe function.
	*/
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	/** State-change entry: mark dirty and schedule the batched flush. */
	markDirty() {
		this.dirty = true;
		this.notifyPending = true;
		if (this.scheduled === "microtask") return;
		this.schedule("microtask");
	}
	/** Stream-change entry: mark dirty and publish the cumulative state at most once per frame. */
	markFrameDirty() {
		this.dirty = true;
		this.notifyPending = true;
		if (this.scheduled !== "none") return;
		this.schedule(typeof globalThis.requestAnimationFrame === "function" ? "frame" : "microtask");
	}
	/**
	* Synchronous flush: controlled-input writes must notify in the same tick as
	* onChange, or React rolls the DOM back to the stale value and the caret jumps to the end.
	*/
	notifyNow() {
		this.dirty = true;
		this.notifyPending = true;
		this.invalidateSchedule();
		this.flush();
	}
	/**
	* Pre-getSnapshot check: rebuild synchronously when dirty (read path
	* before first subscribe / while unobserved). Notification stays pending.
	*/
	ensureFresh() {
		if (!this.dirty) return;
		this.dirty = false;
		this.rebuild();
	}
	schedule(kind) {
		const generation = ++this.scheduleGeneration;
		this.scheduled = kind;
		const publish = () => {
			if (generation !== this.scheduleGeneration) return;
			this.scheduled = "none";
			this.flush();
		};
		if (kind === "frame") globalThis.requestAnimationFrame(publish);
		else queueMicrotask(publish);
	}
	invalidateSchedule() {
		this.scheduleGeneration++;
		this.scheduled = "none";
	}
	flush() {
		if (!this.notifyPending) return;
		if (this.listeners.size === 0) return;
		this.notifyPending = false;
		if (this.dirty) {
			this.dirty = false;
			this.rebuild();
		}
		for (const listener of this.listeners) listener();
	}
};

//#endregion
//#region vendor/client-runtime/client/sessions/projection-store.js
/**
* One session's projection values. Framework semantics, uniform across every
* key: a baseline seeds rows at its cut, a push frame updates one row, and in
* both paths a lower-or-equal seq loses — a replayed frame cannot regress a
* value, a stale baseline cannot overwrite a newer frame. A key the store has
* never seen reads `undefined` (capability absent). Faces are identity-stable
* per key (create-on-demand, cached) so the React side binds each exactly
* once; the store-level channel (`subscribeAny`) serves coarse consumers (the
* manager's list projection reads the `title` key).
*/
var ProjectionValueStore = class {
	rows = /* @__PURE__ */ new Map();
	channels = /* @__PURE__ */ new Map();
	valuesCache;
	/** Coarse any-key channel (no snapshot cache to rebuild: reads hit rows directly). */
	anyNotifier = new Notifier(() => {});
	/**
	* Key-addressed bare observable face (the useProjection resolution path).
	* Always defined — absence is an `undefined` snapshot, never a missing
	* face, so a component may subscribe before the key ever carries a value.
	* @param key - projection key.
	* @returns the identity-stable face for this key.
	*/
	faceOf(key) {
		return this.channel(key).face;
	}
	/**
	* Current whole value for a key (erased framework read; typed reads go
	* through `useProjection`'s map lookup).
	* @param key - projection key.
	* @returns the value, or undefined while the key is absent.
	*/
	get(key) {
		return this.rows.get(key)?.value;
	}
	/**
	* Read every current projection value as one reference-stable snapshot.
	* @returns The same frozen value map until a row changes.
	*/
	values() {
		if (this.valuesCache === void 0) this.valuesCache = Object.freeze(Object.fromEntries([...this.rows].map(([key, row]) => [key, row.value])));
		return this.valuesCache;
	}
	/**
	* Subscribe to any-key changes (microtask-batched) — the manager's list
	* rebuild channel.
	* @param listener - change callback.
	* @returns the unsubscribe function.
	*/
	subscribeAny(listener) {
		return this.anyNotifier.subscribe(listener);
	}
	/**
	* Apply one finished value (the `session/projection` push-frame path).
	* @param key - projection key.
	* @param value - whole value computed by the host unit.
	* @param seq - the unit's watermark at emission.
	*/
	apply(key, value, seq) {
		const row = this.rows.get(key);
		if (row !== void 0 && seq <= row.seq) return;
		this.rows.set(key, {
			value,
			seq
		});
		this.changed(key);
	}
	/**
	* Seed from a history tail page's projections block: every carried key
	* lands under the same seq rule as frames; a key the block omits is
	* capability-absent as of the cut — its row clears unless a newer frame
	* already superseded the cut (a stale baseline can neither overwrite nor
	* clear newer values).
	* @param baseline - the response's projections block.
	*/
	seed(baseline) {
		const values = baseline.values;
		for (const key of Object.keys(values)) this.apply(key, values[key], baseline.asOfSeq);
		for (const [key, row] of this.rows) {
			if (Object.hasOwn(values, key)) continue;
			if (row.seq > baseline.asOfSeq) continue;
			this.rows.delete(key);
			this.changed(key);
		}
	}
	/**
	* Drop rows past a mux-generation baseline (`session/subscribed.lastSeq`):
	* a row claiming knowledge beyond the host's own durable baseline rode
	* state a restart lost — under last-wins it would wrongly outrank the
	* host's recomputed (lower-seq) values forever. Durable replay and the next
	* baseline re-seed whatever truly survived (the title-snapshot precedent,
	* generalized).
	* @param lastSeq - the subscribed frame's durable baseline seq.
	*/
	truncate(lastSeq) {
		for (const [key, row] of this.rows) {
			if (row.seq <= lastSeq) continue;
			this.rows.delete(key);
			this.changed(key);
		}
	}
	changed(key) {
		this.valuesCache = void 0;
		this.channels.get(key)?.notifier.markDirty();
		this.anyNotifier.markDirty();
	}
	channel(key) {
		let channel = this.channels.get(key);
		if (channel === void 0) {
			const notifier = new Notifier(() => {});
			channel = {
				notifier,
				face: {
					getSnapshot: () => this.rows.get(key)?.value,
					subscribe: (listener) => notifier.subscribe(listener)
				}
			};
			this.channels.set(key, channel);
		}
		return channel;
	}
};

//#endregion
//#region vendor/client-runtime/client/contract/conversation.js
/**
* Build a stable collision-free key for one Definition-local business identity.
* @param kind - Definition kind.
* @param id - Definition-local business identity.
* @returns engine-owned Context key.
*/
function conversationContextKey(kind, id) {
	return `${kind.length}:${kind}${id}`;
}

//#endregion
//#region vendor/client-runtime/client/sessions/conversation-location-index.js
var MutableLocationDataStore = class {
	entries = /* @__PURE__ */ new Map();
	get(key) {
		return this.entries.get(key)?.value;
	}
	remove(owner, key) {
		if (this.entries.get(key)?.owner !== owner) return false;
		this.entries.delete(key);
		return true;
	}
	set(owner, key, value) {
		const current = this.entries.get(key);
		if (current !== void 0 && current.owner !== owner) throw new Error(`conversation Location data "${key}" is already owned by ${current.owner}`);
		if (current?.value === value) return false;
		this.entries.set(key, {
			owner,
			value
		});
		return true;
	}
	replace(entries) {
		let changed = this.entries.size !== entries.size;
		if (!changed) for (const [key, value] of entries) {
			const current = this.entries.get(key);
			if (current?.owner !== value.owner || current.value !== value.value) {
				changed = true;
				break;
			}
		}
		if (changed) this.entries = new Map(entries);
		return changed;
	}
};
const SESSION_LOCATION = { kind: "session" };
const UNRESOLVED_LOCATION = { kind: "unresolved" };
function payloadCoordinates(event) {
	const data = event.data;
	if (data.turn === null) return { session: true };
	const turn = Number.isSafeInteger(data.turn) && data.turn >= 0 ? data.turn : void 0;
	const step = Number.isSafeInteger(data.step) && data.step >= 0 ? data.step : void 0;
	return {
		...turn === void 0 ? {} : { turn },
		...step === void 0 ? {} : { step }
	};
}
function sameReferences$2(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sameStep(left, right) {
	return left !== void 0 && left.start === right.start && left.end === right.end && left.status === right.status && left.data === right.data;
}
function sameTurn(left, right) {
	return left !== void 0 && left.start === right.start && left.end === right.end && left.status === right.status && left.data === right.data && sameReferences$2(left.steps, right.steps);
}
function sameLocation(left, right) {
	if (left === void 0 || right === void 0 || left.kind !== right.kind) return left === right;
	if (left.kind === "session" || left.kind === "unresolved") return true;
	if (right.kind === "session" || right.kind === "unresolved") return false;
	if (left.kind === "turn" || right.kind === "turn") return left.kind === "turn" && right.kind === "turn" && left.turn === right.turn;
	return left.turn === right.turn && left.step === right.step;
}
/** Session-owned Turn/Step timeline and event-to-Location index. */
var ConversationLocationIndex = class {
	coordinates = /* @__PURE__ */ new Map();
	locations = /* @__PURE__ */ new Map();
	seqsByTurn = /* @__PURE__ */ new Map();
	timeline = {
		turnOrder: [],
		turns: /* @__PURE__ */ new Map()
	};
	turnDataStores = /* @__PURE__ */ new Map();
	stepDataStores = /* @__PURE__ */ new Map();
	currentTurn;
	currentStep;
	/**
	* Return the current reference-stable timeline.
	* @returns current timeline snapshot.
	*/
	snapshot() {
		return this.timeline;
	}
	/**
	* Replace all Definition-owned Location values while preserving reader identities.
	* @param entries - complete current set of Definition-owned Location values.
	* @returns whether any published Location data changed.
	*/
	replaceData(entries) {
		const turns = /* @__PURE__ */ new Map();
		const steps = /* @__PURE__ */ new Map();
		for (const { owner, data } of entries) {
			const values = data.kind === "turn" ? turns.get(data.turn) ?? /* @__PURE__ */ new Map() : steps.get(stepDataKey(data.turn, requireStep(data))) ?? /* @__PURE__ */ new Map();
			const current = values.get(data.key);
			if (current !== void 0 && current.owner !== owner) throw new Error(`conversation Location data "${data.key}" is already owned by ${current.owner}`);
			values.set(data.key, {
				owner,
				value: data.value
			});
			if (data.kind === "turn") turns.set(data.turn, values);
			else steps.set(stepDataKey(data.turn, requireStep(data)), values);
		}
		let changed = false;
		for (const turn of new Set([...this.turnDataStores.keys(), ...turns.keys()])) changed = this.mutableTurnData(turn).replace(turns.get(turn) ?? /* @__PURE__ */ new Map()) || changed;
		for (const step of new Set([...this.stepDataStores.keys(), ...steps.keys()])) changed = this.mutableStepData(step).replace(steps.get(step) ?? /* @__PURE__ */ new Map()) || changed;
		return changed;
	}
	/**
	* Apply changed Context publications without rebuilding Turn/Step membership.
	* @param changes - incremental removals and replacements from published Contexts.
	* @returns whether any published Location data changed.
	*/
	applyData(changes) {
		let changed = false;
		for (const change of changes) {
			const previous = change.previous;
			if (previous === null) continue;
			changed = this.storeFor(previous).remove(change.owner, previous.key) || changed;
		}
		for (const change of changes) {
			const next = change.next;
			if (next === null) continue;
			changed = this.storeFor(next).set(change.owner, next.key, next.value) || changed;
		}
		return changed;
	}
	/**
	* Resolve the latest Location for one event.
	* @param event - event already ingested into this index.
	* @returns current Location, falling back to session when it has no Turn/Step affinity.
	*/
	locationOf(event) {
		return this.locations.get(event.seq) ?? SESSION_LOCATION;
	}
	/**
	* Rebuild timeline facts after replace/prepend or a boundary append.
	* @param entries - complete current window in ascending seq order.
	* @returns seqs whose resolved Location changed.
	*/
	rebuild(entries) {
		const previousLocations = this.locations;
		const turns = /* @__PURE__ */ new Map();
		const coordinates = /* @__PURE__ */ new Map();
		let currentTurn;
		let currentStep;
		const turnDraft = (turn, seq) => {
			let draft = turns.get(turn);
			if (draft === void 0) {
				draft = {
					turn,
					firstSeq: seq,
					steps: /* @__PURE__ */ new Map()
				};
				turns.set(turn, draft);
			} else draft.firstSeq = Math.min(draft.firstSeq, seq);
			return draft;
		};
		const stepDraft = (turn, step, seq) => {
			const owner = turnDraft(turn, seq);
			let draft = owner.steps.get(step);
			if (draft === void 0) {
				draft = {
					turn,
					step,
					firstSeq: seq
				};
				owner.steps.set(step, draft);
			} else draft.firstSeq = Math.min(draft.firstSeq, seq);
			return draft;
		};
		for (const { event } of entries) {
			const explicit = payloadCoordinates(event);
			if (event.type === "turn/start") {
				currentTurn = event.data.turn;
				currentStep = void 0;
			}
			if (event.type === "step/start") {
				currentTurn = event.data.turn;
				currentStep = event.data.step;
			}
			if (explicit.session !== true && explicit.turn !== void 0) {
				if (currentTurn !== explicit.turn) currentStep = void 0;
				currentTurn = explicit.turn;
				if (explicit.step !== void 0) currentStep = explicit.step;
			}
			const turn = explicit.session === true ? void 0 : explicit.turn ?? currentTurn;
			const step = explicit.session === true || event.type === "turn/start" || event.type === "turn/end" ? void 0 : explicit.step ?? (turn === currentTurn ? currentStep : void 0);
			coordinates.set(event.seq, {
				...turn === void 0 ? {} : { turn },
				...turn === void 0 || step === void 0 ? {} : { step }
			});
			if (turn !== void 0) turnDraft(turn, event.seq);
			if (turn !== void 0 && step !== void 0) stepDraft(turn, step, event.seq);
			if (event.type === "turn/start") turnDraft(event.data.turn, event.seq).start = event;
			else if (event.type === "turn/end") turnDraft(event.data.turn, event.seq).end = event;
			else if (event.type === "step/start") stepDraft(event.data.turn, event.data.step, event.seq).start = event;
			else if (event.type === "step/end") stepDraft(event.data.turn, event.data.step, event.seq).end = event;
			if (event.type === "step/end" && currentTurn === event.data.turn && currentStep === event.data.step) currentStep = void 0;
			if (event.type === "turn/end" && currentTurn === event.data.turn) {
				currentTurn = void 0;
				currentStep = void 0;
			}
		}
		const previousTurns = this.timeline.turns;
		const nextTurns = /* @__PURE__ */ new Map();
		const orderedDrafts = [...turns.values()].sort((left, right) => left.firstSeq - right.firstSeq);
		for (const draft of orderedDrafts) {
			const previousTurn = previousTurns.get(draft.turn);
			const previousSteps = new Map(previousTurn?.steps.map((step) => [step.step, step]) ?? []);
			const steps = [...draft.steps.values()].sort((left, right) => left.firstSeq - right.firstSeq).map((candidate) => {
				const value$1 = {
					turn: candidate.turn,
					step: candidate.step,
					start: candidate.start,
					end: candidate.end,
					status: candidate.end !== void 0 ? "closed" : candidate.start === void 0 ? "unknown" : "open",
					data: this.stepData(candidate.turn, candidate.step)
				};
				const previous = previousSteps.get(candidate.step);
				return sameStep(previous, value$1) ? previous : value$1;
			});
			const value = {
				turn: draft.turn,
				start: draft.start,
				end: draft.end,
				status: draft.end !== void 0 ? "closed" : draft.start === void 0 ? "unknown" : "open",
				steps,
				data: this.turnData(draft.turn)
			};
			nextTurns.set(draft.turn, sameTurn(previousTurn, value) ? previousTurn : value);
		}
		const nextOrder = orderedDrafts.map((draft) => draft.turn);
		const turnOrder = this.timeline.turnOrder.length === nextOrder.length && this.timeline.turnOrder.every((turn, index) => turn === nextOrder[index]) ? this.timeline.turnOrder : nextOrder;
		let sameMap = previousTurns.size === nextTurns.size;
		if (sameMap) {
			for (const [turn, value] of nextTurns) if (previousTurns.get(turn) !== value) {
				sameMap = false;
				break;
			}
		}
		this.timeline = sameMap && turnOrder === this.timeline.turnOrder ? this.timeline : {
			turnOrder,
			turns: nextTurns
		};
		this.coordinates = coordinates;
		this.locations = /* @__PURE__ */ new Map();
		this.seqsByTurn = /* @__PURE__ */ new Map();
		for (const { event } of entries) {
			const coordinates$1 = this.coordinates.get(event.seq);
			if (coordinates$1?.turn !== void 0) this.indexTurnSeq(coordinates$1.turn, event.seq);
			this.locations.set(event.seq, this.resolve(event.seq));
		}
		this.currentTurn = currentTurn;
		this.currentStep = currentStep;
		const changed = /* @__PURE__ */ new Set();
		for (const { event } of entries) if (!sameLocation(previousLocations.get(event.seq), this.locations.get(event.seq))) changed.add(event.seq);
		return changed;
	}
	/**
	* Append one Turn/Step boundary while revisiting only the owning Turn.
	* @param event - contiguous tail boundary event.
	* @returns seqs whose immutable Location reference changed.
	*/
	appendBoundary(event) {
		if (event.type !== "turn/start" && event.type !== "turn/end" && event.type !== "step/start" && event.type !== "step/end") throw new Error(`conversation Location boundary expected, received ${event.type}`);
		const explicit = payloadCoordinates(event);
		if (event.type === "turn/start") {
			this.currentTurn = event.data.turn;
			this.currentStep = void 0;
		} else if (event.type === "step/start") {
			this.currentTurn = event.data.turn;
			this.currentStep = event.data.step;
		}
		if (explicit.turn !== void 0) {
			if (this.currentTurn !== explicit.turn) this.currentStep = void 0;
			this.currentTurn = explicit.turn;
			if (explicit.step !== void 0) this.currentStep = explicit.step;
		}
		const turnNumber = explicit.turn ?? this.currentTurn;
		if (turnNumber === void 0) throw new Error(`conversation boundary ${event.type} has no turn`);
		const stepNumber = event.type === "turn/start" || event.type === "turn/end" ? void 0 : explicit.step ?? (turnNumber === this.currentTurn ? this.currentStep : void 0);
		this.coordinates.set(event.seq, {
			turn: turnNumber,
			...stepNumber === void 0 ? {} : { step: stepNumber }
		});
		this.indexTurnSeq(turnNumber, event.seq);
		const previousTurn = this.timeline.turns.get(turnNumber);
		let steps = previousTurn?.steps ?? [];
		if (event.type === "step/start" || event.type === "step/end") {
			const number = event.data.step;
			const previousStep = steps.find((candidate$2) => candidate$2.step === number);
			const candidate$1 = {
				turn: turnNumber,
				step: number,
				start: event.type === "step/start" ? event : previousStep?.start,
				end: event.type === "step/end" ? event : previousStep?.end,
				status: event.type === "step/end" || previousStep?.end !== void 0 ? "closed" : "open",
				data: this.stepData(turnNumber, number)
			};
			const nextStep = sameStep(previousStep, candidate$1) ? previousStep : candidate$1;
			const index = steps.findIndex((step) => step.step === number);
			steps = index < 0 ? [...steps, nextStep] : steps.map((step, at) => at === index ? nextStep : step);
		}
		const candidate = {
			turn: turnNumber,
			start: event.type === "turn/start" ? event : previousTurn?.start,
			end: event.type === "turn/end" ? event : previousTurn?.end,
			status: event.type === "turn/end" || previousTurn?.end !== void 0 ? "closed" : event.type === "turn/start" || previousTurn?.start !== void 0 ? "open" : "unknown",
			steps,
			data: this.turnData(turnNumber)
		};
		const turn = sameTurn(previousTurn, candidate) ? previousTurn : candidate;
		const turns = new Map(this.timeline.turns);
		turns.set(turnNumber, turn);
		this.timeline = {
			turnOrder: previousTurn === void 0 ? [...this.timeline.turnOrder, turnNumber] : this.timeline.turnOrder,
			turns
		};
		const changed = /* @__PURE__ */ new Set();
		for (const seq of this.seqsByTurn.get(turnNumber) ?? []) {
			const previous = this.locations.get(seq);
			const next = this.resolve(seq);
			this.locations.set(seq, next);
			if (!sameLocation(previous, next)) changed.add(seq);
		}
		if (event.type === "step/end" && this.currentTurn === event.data.turn && this.currentStep === event.data.step) this.currentStep = void 0;
		if (event.type === "turn/end" && this.currentTurn === event.data.turn) {
			this.currentTurn = void 0;
			this.currentStep = void 0;
		}
		return changed;
	}
	/**
	* Index one non-boundary tail event without rescanning the window.
	* @param event - contiguous appended event.
	*/
	appendNonBoundary(event) {
		const explicit = payloadCoordinates(event);
		if (explicit.session === true) {
			this.coordinates.set(event.seq, {});
			this.locations.set(event.seq, SESSION_LOCATION);
			return;
		}
		if (explicit.turn !== void 0) {
			if (this.currentTurn !== explicit.turn) this.currentStep = void 0;
			this.currentTurn = explicit.turn;
			if (explicit.step !== void 0) this.currentStep = explicit.step;
		}
		const turn = explicit.turn ?? this.currentTurn;
		const step = explicit.step ?? (turn === this.currentTurn ? this.currentStep : void 0);
		this.coordinates.set(event.seq, {
			...turn === void 0 ? {} : { turn },
			...turn === void 0 || step === void 0 ? {} : { step }
		});
		if (turn !== void 0) this.indexTurnSeq(turn, event.seq);
		this.locations.set(event.seq, this.resolve(event.seq));
	}
	indexTurnSeq(turn, seq) {
		const current = this.seqsByTurn.get(turn) ?? /* @__PURE__ */ new Set();
		current.add(seq);
		this.seqsByTurn.set(turn, current);
	}
	turnData(turn) {
		return this.mutableTurnData(turn);
	}
	stepData(turn, step) {
		return this.mutableStepData(stepDataKey(turn, step));
	}
	mutableTurnData(turn) {
		const current = this.turnDataStores.get(turn) ?? new MutableLocationDataStore();
		this.turnDataStores.set(turn, current);
		return current;
	}
	mutableStepData(key) {
		const current = this.stepDataStores.get(key) ?? new MutableLocationDataStore();
		this.stepDataStores.set(key, current);
		return current;
	}
	storeFor(data) {
		return data.kind === "turn" ? this.mutableTurnData(data.turn) : this.mutableStepData(stepDataKey(data.turn, requireStep(data)));
	}
	resolve(seq) {
		const coordinates = this.coordinates.get(seq);
		if (coordinates?.turn === void 0) return SESSION_LOCATION;
		const turn = this.timeline.turns.get(coordinates.turn);
		if (turn === void 0) return UNRESOLVED_LOCATION;
		if (coordinates.step === void 0) return {
			kind: "turn",
			turn
		};
		const step = turn.steps.find((candidate) => candidate.step === coordinates.step);
		return step === void 0 ? {
			kind: "turn",
			turn
		} : {
			kind: "step",
			turn,
			step
		};
	}
};
function stepDataKey(turn, step) {
	return `${turn}:${step}`;
}
function requireStep(data) {
	if (data.kind === "step" && data.step !== void 0) return data.step;
	throw new Error(`conversation Step data "${data.key}" requires a step`);
}

//#endregion
//#region vendor/client-runtime/client/sessions/conversation-assembler.js
const PUBLICATION_RANK = {
	none: 0,
	"animation-frame": 1,
	immediate: 2
};
const LOCATION_DATA_SCOPES = ["step", "turn"];
function emptyLocationData() {
	return {
		step: null,
		turn: null
	};
}
function maximumPublication(left, right) {
	return PUBLICATION_RANK[left] >= PUBLICATION_RANK[right] ? left : right;
}
function startSeq(context) {
	return context.startSeq;
}
function insertionIndex(contexts, seq) {
	let low = 0;
	let high = contexts.length;
	while (low < high) {
		const middle = low + Math.floor((high - low) / 2);
		const candidate = contexts[middle];
		if (candidate !== void 0 && candidate.startSeq < seq) low = middle + 1;
		else high = middle;
	}
	return low;
}
function contextSnapshot(context) {
	return {
		key: context.key,
		kind: context.kind,
		id: context.id,
		matches: context.matches,
		start: context.start,
		state: context.state,
		current: context.current
	};
}
function mergeMatches(key, additions, existing) {
	const merged = [];
	let added = 0;
	let current = 0;
	while (added < additions.length || current < existing.length) {
		const left = additions[added];
		const right = existing[current];
		if (left !== void 0 && right !== void 0 && left.event.seq === right.event.seq) throw new Error(`conversation Context ${key} received duplicate Match ${left.event.seq}`);
		if (right === void 0 || left !== void 0 && left.event.seq < right.event.seq) {
			merged.push(left);
			added++;
		} else {
			merged.push(right);
			current++;
		}
	}
	return merged;
}
/**
* Session-owned incremental engine that assembles business Contexts from a
* contiguous Event window and materializes registered view snapshots.
*/
var ConversationNodeAssembler = class {
	eventDefinitions;
	viewDefinitions;
	contexts = /* @__PURE__ */ new Map();
	contextsByKind = /* @__PURE__ */ new Map();
	contextsBySeq = /* @__PURE__ */ new Map();
	inputs = /* @__PURE__ */ new Map();
	locationIndex = new ConversationLocationIndex();
	dirty = /* @__PURE__ */ new Set();
	revised = /* @__PURE__ */ new Set();
	dependents = /* @__PURE__ */ new Map();
	views = /* @__PURE__ */ new Map();
	hasMore = false;
	replacePending = true;
	timelineDirty = true;
	/**
	* @param eventDefinitions - live Event Definition registry.
	* @param viewDefinitions - live view builder registry.
	*/
	constructor(eventDefinitions, viewDefinitions) {
		this.eventDefinitions = eventDefinitions;
		this.viewDefinitions = viewDefinitions;
		this.resetViewBuilders();
	}
	/**
	* Replace the complete loaded window after open, resync, or gap repair.
	* @param entries - complete contiguous window.
	* @param hasMore - whether older history remains outside the window.
	* @returns immediate publication request.
	*/
	replaceWindow(entries, hasMore) {
		this.contexts.clear();
		this.contextsByKind.clear();
		this.contextsBySeq.clear();
		this.inputs.clear();
		this.dirty.clear();
		this.revised.clear();
		this.dependents.clear();
		this.hasMore = hasMore;
		const sorted = [...entries].sort((left, right) => left.event.seq - right.event.seq);
		for (const entry of sorted) this.inputs.set(entry.event.seq, entry);
		this.locationIndex.rebuild(sorted);
		this.timelineDirty = true;
		for (const entry of sorted) this.matchInput(entry);
		this.replayDependencies();
		this.revised.clear();
		for (const context of this.contexts.values()) this.dirty.add(context);
		this.replacePending = true;
		return "immediate";
	}
	/**
	* Add one contiguous live tail event without scanning existing Contexts.
	* @param input - appended Event and optional wire view.
	* @returns highest requested publication cadence.
	*/
	append(input) {
		if (this.inputs.has(input.event.seq)) return "none";
		this.revised.clear();
		this.inputs.set(input.event.seq, input);
		let publication = "none";
		if (isLocationBoundary(input.event.type)) {
			const previousTimeline = this.locationIndex.snapshot();
			const changed = this.locationIndex.appendBoundary(input.event);
			if (this.locationIndex.snapshot() !== previousTimeline) {
				this.timelineDirty = true;
				publication = "immediate";
			}
			this.replayContexts(this.refreshMatchLocations(changed));
			if (changed.size > 0) publication = "immediate";
		} else this.locationIndex.appendNonBoundary(input.event);
		publication = maximumPublication(publication, this.matchInput(input));
		if (this.replayRevisedDependents()) publication = "immediate";
		this.revised.clear();
		return publication;
	}
	/**
	* Add an older page while preserving existing Context and view identities.
	* @param entries - newly loaded older Events.
	* @param hasMore - whether history still precedes the expanded window.
	* @returns highest requested publication cadence.
	*/
	prepend(entries, hasMore) {
		this.revised.clear();
		let publication = "none";
		const previousHasMore = this.hasMore;
		const fresh = entries.filter((entry) => !this.inputs.has(entry.event.seq)).sort((left, right) => left.event.seq - right.event.seq);
		for (const entry of fresh) this.inputs.set(entry.event.seq, entry);
		this.hasMore = hasMore;
		const previousTimeline = this.locationIndex.snapshot();
		const changedLocations = this.locationIndex.rebuild(this.sortedInputs());
		if (this.locationIndex.snapshot() !== previousTimeline) this.timelineDirty = true;
		const affected = this.refreshMatchLocations(changedLocations);
		const pending = /* @__PURE__ */ new Map();
		for (const entry of fresh) publication = maximumPublication(publication, this.collectInput(entry, pending));
		this.applyPendingMatches(pending, affected);
		this.replayContexts(affected);
		if ((this.revised.size > 0 || previousHasMore !== hasMore) && this.replayDependencies()) publication = "immediate";
		if (changedLocations.size > 0) publication = "immediate";
		this.revised.clear();
		return publication;
	}
	/**
	* Rebuild against the current Registry set after a low-frequency plugin change.
	* @returns immediate publication request.
	*/
	rebuildRegistry() {
		this.resetViewBuilders();
		return this.replaceWindow(this.sortedInputs(), this.hasMore);
	}
	/**
	* Materialize dirty Contexts and advance every registered view builder.
	* @returns whether any view snapshot was rebuilt or incrementally applied.
	*/
	flush() {
		if (!this.replacePending && this.dirty.size === 0 && !this.timelineDirty) return false;
		if (this.replacePending) {
			this.replaceLocationData();
			const allByTarget = /* @__PURE__ */ new Map();
			for (const target of this.views.keys()) allByTarget.set(target, []);
			for (const context of this.contexts.values()) {
				const target = context.definition.target;
				if (target === void 0 || !this.views.has(target)) continue;
				const node = this.buildNode(context, target);
				context.current.set(target, node);
				if (node !== null) allByTarget.get(target)?.push(node);
			}
			for (const view of this.views.values()) view.snapshot = view.builder.replace({
				nodes: allByTarget.get(view.target) ?? [],
				timeline: this.locationIndex.snapshot()
			});
			this.replacePending = false;
			this.dirty.clear();
			this.timelineDirty = false;
			return true;
		}
		const upsertsByTarget = /* @__PURE__ */ new Map();
		for (const target of this.views.keys()) upsertsByTarget.set(target, []);
		if (this.applyDirtyLocationData()) this.timelineDirty = true;
		for (const context of this.dirty) {
			const target = context.definition.target;
			if (target === void 0 || !this.views.has(target)) continue;
			const previous = context.current.get(target) ?? null;
			const node = this.buildNode(context, target);
			if (node === null && previous !== null) throw new Error(`conversation Definition "${context.kind}" withdrew materialized target "${target}"; return the same key with hidden visibility instead`);
			context.current.set(target, node);
			if (node !== null) upsertsByTarget.get(target)?.push(node);
		}
		this.dirty.clear();
		const timelineDirty = this.timelineDirty;
		this.timelineDirty = false;
		for (const view of this.views.values()) {
			const upserts = upsertsByTarget.get(view.target) ?? [];
			if (upserts.length === 0 && !timelineDirty) continue;
			view.snapshot = view.builder.apply({
				upserts,
				timeline: this.locationIndex.snapshot()
			});
		}
		return true;
	}
	/**
	* Read the latest snapshot of a registered target.
	* @param target - registered view target.
	* @returns target snapshot, or undefined when no builder is registered.
	*/
	snapshot(target) {
		return this.views.get(target)?.snapshot;
	}
	get(target) {
		return this.snapshot(target);
	}
	sortedInputs() {
		return [...this.inputs.values()].sort((left, right) => left.event.seq - right.event.seq);
	}
	matchInput(input) {
		return this.dispatchInput(input, (definition, id, role) => this.acceptMatch(definition, id, role, input));
	}
	collectInput(input, pending) {
		return this.dispatchInput(input, (definition, id, role) => {
			const key = conversationContextKey(definition.kind, id);
			const match = {
				...input,
				role,
				location: this.locationIndex.locationOf(input.event)
			};
			const matches$1 = pending.get(key) ?? [];
			matches$1.push({
				definition,
				id,
				match
			});
			pending.set(key, matches$1);
			return definition.publication?.(match) ?? "immediate";
		});
	}
	dispatchInput(input, accept) {
		const matchedTargets = /* @__PURE__ */ new Set();
		let publication = "none";
		for (const definition of this.eventDefinitions.entries()) {
			const result = definition.match(input.event);
			if (result === null) continue;
			if (definition.target !== void 0) matchedTargets.add(definition.target);
			publication = maximumPublication(publication, accept(definition, result.id, result.role));
		}
		const fallback = this.eventDefinitions.fallbackEntry();
		const target = fallback?.target;
		if (fallback !== void 0 && target !== void 0 && !matchedTargets.has(target)) {
			const result = fallback.match(input.event);
			if (result !== null) publication = maximumPublication(publication, accept(fallback, result.id, result.role));
		}
		return publication;
	}
	acceptMatch(definition, id, role, input) {
		const key = conversationContextKey(definition.kind, id);
		let context = this.contexts.get(key);
		if (role === "start" && context?.start !== void 0) throw new Error(`conversation Context ${key} received more than one start Match`);
		if (context === void 0) {
			context = {
				key,
				kind: definition.kind,
				id,
				definition,
				startSeq: void 0,
				start: void 0,
				matches: [],
				state: void 0,
				revision: 0,
				current: /* @__PURE__ */ new Map(),
				locationData: emptyLocationData(),
				dependencies: /* @__PURE__ */ new Map()
			};
			this.contexts.set(key, context);
		}
		const match = {
			...input,
			role,
			location: this.locationIndex.locationOf(input.event)
		};
		const previous = context.matches.at(-1);
		if (previous !== void 0 && previous.event.seq >= input.event.seq) throw new Error(`conversation Context ${key} received non-appended Match ${input.event.seq}`);
		if (role === "start" && context.matches.length > 0) throw new Error(`conversation Context ${key} received an update before its start Match`);
		context.matches.push(match);
		if (role === "start") {
			context.startSeq = input.event.seq;
			context.start = match;
			this.indexStartedContext(context);
		}
		const owners = this.contextsBySeq.get(input.event.seq) ?? /* @__PURE__ */ new Set();
		owners.add(context);
		this.contextsBySeq.set(input.event.seq, owners);
		if (role === "start") this.replayContext(context);
		else if (context.state !== void 0) {
			const typed = contextSnapshot(context);
			context.state = requireState(definition, "update", definition.update(typed, match));
			context.revision++;
			this.revised.add(context);
		}
		this.dirty.add(context);
		return definition.publication?.(match) ?? "immediate";
	}
	applyPendingMatches(pending, affected) {
		const startsByKind = /* @__PURE__ */ new Map();
		for (const [key, entries] of pending) {
			const first = entries[0];
			if (first === void 0) continue;
			let context = this.contexts.get(key);
			if (context === void 0) {
				context = {
					key,
					kind: first.definition.kind,
					id: first.id,
					definition: first.definition,
					startSeq: void 0,
					start: void 0,
					matches: [],
					state: void 0,
					revision: 0,
					current: /* @__PURE__ */ new Map(),
					locationData: emptyLocationData(),
					dependencies: /* @__PURE__ */ new Map()
				};
				this.contexts.set(key, context);
			}
			let discoveredStart;
			const additions = entries.map((entry) => {
				if (entry.definition !== context.definition || entry.id !== context.id) throw new Error(`conversation Context ${key} received inconsistent Definition identity`);
				if (entry.match.role === "start") {
					if (discoveredStart !== void 0 || context.start !== void 0) throw new Error(`conversation Context ${key} received more than one start Match`);
					discoveredStart = entry.match;
				}
				const owners = this.contextsBySeq.get(entry.match.event.seq) ?? /* @__PURE__ */ new Set();
				owners.add(context);
				this.contextsBySeq.set(entry.match.event.seq, owners);
				return entry.match;
			}).sort((left, right) => left.event.seq - right.event.seq);
			context.matches = mergeMatches(context.key, additions, context.matches);
			if (discoveredStart !== void 0) {
				context.start = discoveredStart;
				context.startSeq = discoveredStart.event.seq;
				const starts = startsByKind.get(context.kind) ?? [];
				starts.push(context);
				startsByKind.set(context.kind, starts);
			}
			if (context.start !== void 0 && context.matches[0] !== context.start) throw new Error(`conversation Context ${context.key} received an update before its start Match`);
			affected.add(context);
			this.dirty.add(context);
		}
		for (const [kind, contexts] of startsByKind) this.indexStartedContexts(kind, contexts);
	}
	replayContexts(contexts) {
		const ordered = [...contexts].sort((left, right) => (left.startSeq ?? Number.POSITIVE_INFINITY) - (right.startSeq ?? Number.POSITIVE_INFINITY));
		for (const context of ordered) {
			if (context.start === void 0) {
				context.state = void 0;
				this.dirty.add(context);
				continue;
			}
			this.replayContext(context);
		}
	}
	replayContext(context) {
		const start = context.start;
		if (start === void 0) {
			context.state = void 0;
			return;
		}
		if (context.matches[0] !== start) throw new Error(`conversation Context ${context.key} received an update before its start Match`);
		const dependencies = /* @__PURE__ */ new Map();
		const reader = this.readerFor(start.event.seq, dependencies);
		context.state = void 0;
		context.state = requireState(context.definition, "start", context.definition.start(contextSnapshot(context), start, reader));
		this.replaceDependencies(context, dependencies);
		for (let index = 1; index < context.matches.length; index++) {
			const match = context.matches[index];
			if (match === void 0 || match.role !== "update") continue;
			const typed = contextSnapshot(context);
			context.state = requireState(context.definition, "update", context.definition.update(typed, match));
		}
		context.revision++;
		this.revised.add(context);
		this.dirty.add(context);
	}
	replaceDependencies(context, dependencies) {
		for (const dependency of context.dependencies.values()) {
			if (dependency.key === void 0) continue;
			const current = this.dependents.get(dependency.key);
			current?.delete(context);
			if (current?.size === 0) this.dependents.delete(dependency.key);
		}
		context.dependencies = dependencies;
		for (const dependency of dependencies.values()) {
			if (dependency.key === void 0) continue;
			const current = this.dependents.get(dependency.key) ?? /* @__PURE__ */ new Set();
			current.add(context);
			this.dependents.set(dependency.key, current);
		}
	}
	replayRevisedDependents() {
		const pending = [...this.revised];
		const affected = /* @__PURE__ */ new Set();
		for (let index = 0; index < pending.length; index++) {
			const dependency = pending[index];
			if (dependency === void 0) continue;
			for (const dependent of this.dependents.get(dependency.key) ?? []) {
				if (affected.has(dependent)) continue;
				affected.add(dependent);
				pending.push(dependent);
			}
		}
		this.replayContexts(affected);
		return affected.size > 0;
	}
	readerFor(beforeSeq, dependencies) {
		return { previous: (kind) => {
			const predecessor = this.previousContext(kind, beforeSeq);
			dependencies.set(kind, {
				kind,
				key: predecessor?.key,
				revision: predecessor?.revision,
				windowGap: predecessor === void 0 && this.hasMore
			});
			if (predecessor?.state === void 0) return void 0;
			const seq = startSeq(predecessor);
			if (seq === void 0) return void 0;
			return {
				key: predecessor.key,
				kind: predecessor.kind,
				id: predecessor.id,
				startSeq: seq,
				state: predecessor.state,
				matches: predecessor.matches
			};
		} };
	}
	previousContext(kind, beforeSeq) {
		const candidates = this.contextsByKind.get(kind) ?? [];
		const indexBefore = insertionIndex(candidates, beforeSeq);
		for (let index = indexBefore - 1; index >= 0; index--) {
			const candidate = candidates[index];
			if (candidate?.state !== void 0) return candidate;
		}
	}
	/** Insert one newly discovered start into its Definition's ordered predecessor index. */
	indexStartedContext(context) {
		const seq = context.startSeq;
		if (seq === void 0) return;
		const candidates = this.contextsByKind.get(context.kind) ?? [];
		const previous = candidates.at(-1);
		if (previous === void 0 || previous.startSeq < seq) candidates.push(context);
		else candidates.splice(insertionIndex(candidates, seq), 0, context);
		this.contextsByKind.set(context.kind, candidates);
	}
	indexStartedContexts(kind, additions) {
		if (additions.length === 0) return;
		const sorted = [...additions].sort((left, right) => left.startSeq - right.startSeq);
		const existing = this.contextsByKind.get(kind) ?? [];
		const merged = [];
		let before = 0;
		let added = 0;
		while (before < existing.length || added < sorted.length) {
			const left = existing[before];
			const right = sorted[added];
			if (right === void 0 || left !== void 0 && left.startSeq < right.startSeq) {
				merged.push(left);
				before++;
			} else {
				merged.push(right);
				added++;
			}
		}
		this.contextsByKind.set(kind, merged);
	}
	replayDependencies() {
		let replayed = false;
		const ordered = [...this.contexts.values()].filter((context) => startSeq(context) !== void 0).sort((left, right) => startSeq(left) - startSeq(right));
		for (const context of ordered) {
			if (context.state === void 0 || context.dependencies.size === 0) continue;
			const before = startSeq(context);
			if (before === void 0) continue;
			let changed = false;
			for (const dependency of context.dependencies.values()) {
				const current = this.previousContext(dependency.kind, before);
				const windowGap = current === void 0 && this.hasMore;
				if (current?.key !== dependency.key || current?.revision !== dependency.revision || windowGap !== dependency.windowGap) {
					changed = true;
					break;
				}
			}
			if (changed) {
				this.replayContext(context);
				replayed = true;
			}
		}
		return replayed;
	}
	refreshMatchLocations(changedSeqs) {
		const affected = /* @__PURE__ */ new Set();
		if (changedSeqs.size === 0) return affected;
		for (const seq of changedSeqs) for (const context of this.contextsBySeq.get(seq) ?? []) affected.add(context);
		for (const context of affected) {
			let start = context.start;
			context.matches = context.matches.map((match) => {
				if (!changedSeqs.has(match.event.seq)) return match;
				const refreshed = {
					...match,
					location: this.locationIndex.locationOf(match.event)
				};
				if (match === start) start = refreshed;
				return refreshed;
			});
			context.start = start;
		}
		return affected;
	}
	buildNode(context, target) {
		if (context.definition.target !== target || context.definition.buildViewNode === void 0) return null;
		const node = context.definition.buildViewNode(contextSnapshot(context));
		if (node === null) return null;
		if (node.key !== context.key) throw new Error(`conversation Definition "${context.kind}" returned unstable key "${node.key}"; expected "${context.key}"`);
		if (node.target !== target) throw new Error(`conversation Definition "${context.kind}" returned target "${node.target}" while building "${target}"`);
		return node;
	}
	buildLocationData(context, scope) {
		if (context.definition.buildLocationData === void 0) return null;
		const data = context.definition.buildLocationData(contextSnapshot(context), scope);
		if (data === null) return null;
		if (data.kind !== scope) throw new Error(`conversation Definition "${context.kind}" published ${data.kind} data through its ${scope} scope`);
		if (data.key !== context.kind) throw new Error(`conversation Definition "${context.kind}" published Location data key "${data.key}"; expected its owned kind`);
		if (!Number.isSafeInteger(data.turn) || data.turn < 0) throw new Error(`conversation Definition "${context.kind}" published invalid turn ${data.turn}`);
		if (data.kind === "step" && (!Number.isSafeInteger(data.step) || data.step < 0)) throw new Error(`conversation Definition "${context.kind}" published invalid step ${String(data.step)}`);
		return data;
	}
	replaceLocationData() {
		const entries = [];
		for (const scope of LOCATION_DATA_SCOPES) {
			for (const context of this.contexts.values()) {
				const data = this.buildLocationData(context, scope);
				context.locationData[scope] = data;
				if (data !== null) entries.push({
					owner: context.key,
					data
				});
			}
			this.locationIndex.replaceData(entries);
		}
	}
	applyDirtyLocationData() {
		let changed = false;
		for (const scope of LOCATION_DATA_SCOPES) {
			const changes = [];
			for (const context of this.dirty) {
				const previous = context.locationData[scope];
				const next = this.buildLocationData(context, scope);
				context.locationData[scope] = next;
				if (previous !== next) changes.push({
					owner: context.key,
					previous,
					next
				});
			}
			changed = this.locationIndex.applyData(changes) || changed;
		}
		return changed;
	}
	resetViewBuilders() {
		this.views.clear();
		for (const definition of this.viewDefinitions.entries()) {
			const builder = definition.create();
			this.views.set(definition.target, {
				target: definition.target,
				builder,
				snapshot: builder.empty
			});
		}
		this.replacePending = true;
	}
};
function isLocationBoundary(type) {
	return type === "turn/start" || type === "turn/end" || type === "step/start" || type === "step/end";
}
function requireState(definition, phase, state) {
	if (state === void 0) throw new Error(`conversation Definition "${definition.kind}" returned undefined from ${phase}()`);
	return state;
}

//#endregion
//#region vendor/client-runtime/client/sessions/conversation.js
/**
* core ContentBlock[] -> AssistantBlock[] (classifier shared by finalized messages and partial block-end).
* @param content - core content blocks verbatim.
* @returns UI-classified blocks in source order.
*/
function toAssistantBlocks(content) {
	return content.map(toAssistantBlock);
}
/**
* Classify one block (ToolCallBlock fields are id/arguments, mapped to callId/argsRaw).
* @param block - one core content block.
* @returns the UI classification.
*/
function toAssistantBlock(block$1) {
	switch (block$1.type) {
		case "text": return {
			kind: "text",
			text: block$1.text
		};
		case "reasoning": return {
			kind: "reasoning",
			text: block$1.text
		};
		case "image": return {
			kind: "image",
			attachment: block$1.attachment
		};
		case "tool-call": return {
			kind: "tool-call",
			callId: String(block$1.id),
			name: block$1.name,
			argsRaw: block$1.arguments
		};
		default: return {
			kind: "other",
			block: block$1
		};
	}
}
const EMPTY_LIST$2 = [];
const EMPTY_TIMELINE = {
	turnOrder: EMPTY_LIST$2,
	turns: /* @__PURE__ */ new Map()
};
/** Empty target store used by fixtures and Sessions without registered views. */
const EMPTY_CONVERSATION_VIEWS = { get: () => void 0 };
/** Empty Chat target used before a view builder is registered. */
const EMPTY_CHAT_SNAPSHOT = {
	order: EMPTY_LIST$2,
	nodes: {
		get: () => void 0,
		values: () => EMPTY_LIST$2
	},
	locations: {
		getTurn: () => EMPTY_LIST$2,
		getStep: () => EMPTY_LIST$2
	},
	timeline: EMPTY_TIMELINE,
	legacy: {
		nodes: EMPTY_LIST$2,
		turnTimings: /* @__PURE__ */ new Map(),
		turnEnds: /* @__PURE__ */ new Map(),
		partial: null,
		runningCalls: EMPTY_LIST$2
	}
};

//#endregion
//#region vendor/client-runtime/client/sessions/pending.js
/** Key prefixes, one per kind (the key doubles as the Session pending-map key). */
const KEY_PREFIX = {
	approval: "a",
	question: "q"
};
/**
* One pending host-owned interaction wait: an immutable render face
* (kind/key/sessionId/payload) plus the response carrier. respond() backfills
* the requested frame's rpcId into a client-response envelope — no consumer
* ever sees the raw rpcId. Settlement is expressed only by pending-list
* membership (the settled flag is a fail-loud guard, not a render input).
*/
var PendingWait = class {
	/** Interaction kind (union discriminant). */
	kind;
	/** Opaque render identity, `<prefix>:<rpcId>` — stable across baseline replay, usable as a React key. */
	key;
	/** Owning session. */
	sessionId;
	/** The requested frame's domain fields, verbatim. */
	payload;
	#settled = false;
	#rpcId;
	#respond;
	/**
	* Minted by Session on a requested frame (public construction is the test-fixture path).
	* @param kind - interaction kind.
	* @param rpcId - the requested frame's stable envelope id (kept private; respond echoes it).
	* @param sessionId - owning session.
	* @param payload - the requested frame's domain fields.
	* @param respond - the client-response carrier (api.respond).
	*/
	constructor(kind, rpcId, sessionId, payload, respond) {
		this.kind = kind;
		this.key = `${KEY_PREFIX[kind]}:${rpcId}`;
		this.sessionId = sessionId;
		this.payload = payload;
		this.#rpcId = rpcId;
		this.#respond = respond;
	}
	/**
	* Send a result for this wait: wraps it into the client-response envelope
	* with the rpcId backfilled. Throws synchronously once settled.
	* @param result - the result shell (ok value / error envelope), domain-encoded by the caller.
	* @returns the carrier receipt.
	*/
	respond(result) {
		if (this.#settled) throw new Error(`pending wait ${this.key} is already settled`);
		return this.#respond({
			type: "client-response",
			rpcId: this.#rpcId,
			result
		});
	}
	/** Session-only settlement mark (the authoritative resolved frame arrived); respond() throws afterwards. */
	markSettled() {
		this.#settled = true;
	}
};

//#endregion
//#region vendor/client-runtime/client/time-zone.js
/** Browser-owned time-zone sampling for prompt RPC provenance. */
/**
* Resolve the current browser IANA zone for one outbound operation.
* @returns The browser-provided canonical zone.
* @throws when the runtime cannot provide a non-empty zone.
*/
function resolvedClientTimeZone() {
	const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (typeof timeZone !== "string" || timeZone.length === 0) throw new Error("browser time zone is unavailable");
	return timeZone;
}

//#endregion
//#region vendor/client-runtime/client/sessions/queue-mirror.js
const QUEUE_PREVIEW_CHARS = 200;
function previewOf(content) {
	const flat = content.map((block$1) => block$1.type === "text" ? block$1.text : `[${block$1.type}]`).join(" ").replace(/\s+/g, " ").trim();
	const chars = Array.from(flat);
	return chars.length > QUEUE_PREVIEW_CHARS ? `${chars.slice(0, QUEUE_PREVIEW_CHARS).join("")}…` : flat;
}
function textOf(content) {
	if (!content.every((block$1) => block$1.type === "text")) return null;
	return content.map((block$1) => block$1.text).join("");
}
/** Authoritative transient queue projection and durable steering handoff. */
var SessionQueueMirror = class {
	current = [];
	/**
	* Return the current immutable queue projection.
	* @returns current queue rows.
	*/
	snapshot() {
		return this.current;
	}
	/**
	* Drop the stale generation before its replacement queue baseline arrives.
	* @returns whether any projected queue row was removed.
	*/
	reset() {
		if (this.current.length === 0) return false;
		this.current = [];
		return true;
	}
	/**
	* Replace from one authoritative stream queue frame.
	* @param items - complete host queue snapshot.
	*/
	replace(items) {
		this.current = items.map((item) => ({
			id: item.id,
			messageId: item.message.id,
			placement: item.placement,
			content: item.message.content,
			preview: previewOf(item.message.content),
			text: textOf(item.message.content)
		}));
	}
	/**
	* Retire a transient steering row once its durable message enters the log.
	* @param event - newly contiguous durable Session event.
	* @returns whether the projection changed.
	*/
	acceptDurable(event) {
		if (event.type !== "user/message") return false;
		const messageId = event.data.id;
		const index = this.current.findIndex((item) => item.placement === "steering" && item.messageId === messageId);
		if (index < 0) return false;
		this.current = this.current.filter((_item, candidate) => candidate !== index);
		return true;
	}
};

//#endregion
//#region vendor/client-runtime/client/sessions/session.js
/** Messages requested per history page. */
const PAGE_MESSAGES = 50;
/**
* Owns a session's event window, derived conversation state, and observable
* snapshot. React bindings remain outside this data layer. Features see only
* the {@link SessionFace} slice (ISession verbs + the snapshot source); the
* remaining public members are manager/runtime entry points.
*/
var Session = class {
	sessionId;
	api;
	remote;
	options;
	events = [];
	/** Wire views aligned with `events` by index (envelope-level annotations; undefined = no view).
	*  Kept parallel rather than merged so `events` stays the raw log slice (model-visible ⟺ logged). */
	views = [];
	baseSeq = 0;
	hasMore = false;
	openState = "cold";
	openError = null;
	openPromise = null;
	/** Bumped by resync to invalidate an in-flight doOpen: a reconnect must rebuild, never adopt
	*  a pre-disconnect open whose history request is already doomed. Stale doOpen
	*  passes drop all writes once the generation moves on. */
	openGeneration = 0;
	loadingOlder = false;
	pending = /* @__PURE__ */ new Map();
	pendingRev = 0;
	pendingCache = null;
	/** Authoritative stream-only inbox snapshot; pending work never hits history. */
	queueMirror = new SessionQueueMirror();
	/** Session-owned business Context engine over the contiguous raw window. */
	conversation;
	running = false;
	address;
	parentAvailable = false;
	/**
	* Sticky send marker, private input of the composerPhase derivation: set
	* synchronously before prompt()'s first await, never reset — the blank →
	* engaging edge of the phase machine (see ComposerPhase).
	*/
	promptAttempted = false;
	/** A first accepted prompt stays in the engaging phase until its turn is observable. */
	firstPromptPendingTurn = false;
	/** Empty-log mirror (see ConversationSnapshot.blank); unknown bare sessions begin conservatively blank. */
	blankBit = true;
	removed = false;
	promptError = null;
	lastAgentError = null;
	/** Live events buffered during open/resync and stitched by sequence once history lands. */
	liveBuffer = [];
	/** Gap repair in flight; live events detour to the buffer until the tail page lands. */
	stitching = false;
	/** subscribed.lastSeq baseline (gap detection; null when no subscribed frame arrived — degrade to the liveBuffer dedup path). */
	subscribedLastSeq = null;
	/**
	* Per-session projection value store (push model; see the session-projection
	* subsystem page, docs/subsystems/session-projection.md): finished whole
	* values computed on the host, seeded by the tail page's
	* projections block and updated by `session/projection` frames under the
	* one higher-seq-wins rule. Keys are read via `projections.faceOf(key)`
	* (the useProjection resolution face); the conversation snapshot never
	* carries projection values, and no client-side domain folding exists.
	* Manager-owned when constructed through SessionManager (frames route and
	* the store outlives instantiation, the title-snapshot precedent); a bare
	* construction gets a private store.
	*/
	projections;
	snapshotCache;
	notifier;
	/**
	* Agent-scoped cordis context, bound once by SessionRuntime when it
	* mints the scope (the client mirror of the host Agent's loopCtx). The
	* Session dispatches its own scoped events through it; undefined means
	* unbound (bare object-layer construction) or already pruned — both skip
	* dispatch-dependent behavior rather than fail.
	*/
	actx;
	/**
	* @param sessionId - Host session identity (client sessions are always Host-born).
	* @param api - shared wire client.
	* @param remote - generated Remote namespaces this session calls.
	* @param options - optional manager-owned state observers.
	*/
	constructor(sessionId, api, remote, options$1 = {}) {
		this.sessionId = sessionId;
		this.api = api;
		this.remote = remote;
		this.options = options$1;
		this.projections = options$1.projections ?? new ProjectionValueStore();
		this.address = options$1.address;
		this.parentAvailable = options$1.parentAvailable ?? false;
		this.conversation = options$1.conversation === void 0 ? new ConversationNodeAssembler({
			entries: () => [],
			fallbackEntry: () => void 0
		}, { entries: () => [] }) : new ConversationNodeAssembler(options$1.conversation.events, options$1.conversation.views);
		this.notifier = new Notifier(() => {
			this.conversation.flush();
			this.snapshotCache = this.buildSnapshot();
		});
		this.snapshotCache = this.buildSnapshot();
	}
	/**
	* Bind the Agent-scoped context minted by SessionRuntime (single write;
	* a second bind is a wiring error and throws). Direction stays one-way at
	* this binding boundary: consumers still reach the Session via `sessions.sessionOf`,
	* while the Session holds its own dispatch point (host Agent.loopCtx
	* mirror).
	* @param actx - the agent's scoped context.
	*/
	bindScope(actx) {
		if (this.actx !== void 0) throw new Error(`session ${this.sessionId} already has a bound scope`);
		this.actx = actx;
	}
	/** Release the bound scope at prune time (a later rebind accompanies a freshly minted scope). */
	unbindScope() {
		this.actx = void 0;
	}
	/**
	* Send (queue/steer passed through 1:1); failures land in the snapshot's promptError.
	* @param content - text plus browser-owned temporary image uploads.
	* @param mode - queue appends after the current turn; steer interrupts it.
	* @returns the prompt result (also mirrored into promptError on failure).
	*/
	async prompt(content, mode) {
		this.promptError = null;
		this.lastAgentError = null;
		this.promptAttempted = true;
		if (this.blankBit) this.firstPromptPendingTurn = true;
		this.notifier.markDirty();
		let result;
		try {
			if (this.address === void 0) result = (await this.api.sessions.prompt({
				sessionId: this.sessionId,
				mode,
				content,
				clientTimeZone: resolvedClientTimeZone()
			})).result;
			else if (this.address.mode === "one-shot") result = {
				ok: false,
				error: {
					code: "subagent-not-resumable",
					message: "one-shot subagent conversations are read-only",
					details: { childSessionId: this.address.childSessionId }
				}
			};
			else if (content.some((part) => part.type === "image")) result = {
				ok: false,
				error: {
					code: "attachment-error",
					message: "Image input is unavailable for subagent continuations.",
					details: { reason: "SUBAGENT_IMAGE_UNSUPPORTED" }
				}
			};
			else {
				const routed = (await this.api.subagents.prompt({
					...this.address,
					content: content.flatMap((part) => part.type === "text" ? [{
						type: "text",
						text: part.text
					}] : []),
					clientTimeZone: resolvedClientTimeZone()
				})).result;
				result = routed.ok ? {
					ok: true,
					value: { accepted: true }
				} : routed;
			}
		} catch (error) {
			result = transportError(error);
		}
		if (!result.ok) {
			this.promptError = {
				op: "send",
				error: result.error
			};
			this.notifier.markDirty();
			return result;
		}
		if (this.blankBit) {
			this.blankBit = false;
			this.options.onEngaged?.(this);
			this.notifier.markDirty();
		}
		return result;
	}
	/**
	* Resolve one image referenced by this session into browser-consumable bytes.
	* @param attachmentId - opaque id found in the folded session log.
	* @returns the authenticated reference and decoded bytes.
	*/
	async readAttachment(attachmentId) {
		try {
			const result = (await this.api.sessions.attachment({
				sessionId: this.sessionId,
				attachmentId
			})).result;
			if (!result.ok) return result;
			const binary = atob(result.value.data);
			const data = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return {
				ok: true,
				value: {
					attachment: result.value.attachment,
					data
				}
			};
		} catch (error) {
			return transportError(error);
		}
	}
	/** Apply one operation to a still-pending queue occurrence. */
	async updateQueue(itemId, action) {
		try {
			return (await this.api.sessions.updateQueue({
				sessionId: this.sessionId,
				itemId,
				action
			})).result;
		} catch (error) {
			return transportError(error);
		}
	}
	/**
	* Stop the active turn while the Host preserves pending inbox work; failures
	* land in promptError (same error-strip display slot). A continuable
	* subagent address routes through `subagent.interrupt`, whose durable
	* parent-address authority works without a live parent Agent; a one-shot
	* address stays uncancellable (the UI offers no stop action, so this arm is
	* defensive).
	* @returns the cancel result.
	*/
	async cancel() {
		const address = this.address;
		if (address !== void 0 && address.mode === "one-shot") {
			const result$1 = {
				ok: false,
				error: {
					code: "subagent-delivery-unavailable",
					message: "subagent activation cancellation is unavailable",
					details: { childSessionId: address.childSessionId }
				}
			};
			this.promptError = {
				op: "stop",
				error: result$1.error
			};
			this.notifier.markDirty();
			return result$1;
		}
		let result;
		try {
			result = address !== void 0 ? (await this.api.subagents.interrupt(address)).result : (await this.api.sessions.cancel({ sessionId: this.sessionId })).result;
		} catch (error) {
			result = transportError(error);
		}
		if (!result.ok) {
			this.promptError = {
				op: "stop",
				error: result.error
			};
			this.notifier.markDirty();
		}
		return result;
	}
	/**
	* Rename: contract session.rename 1:1. On success settle the 'title'
	* projection cell from the response's `{title, seq}` under the store's
	* higher-seq-wins rule (the push frame arriving later is a no-op replay),
	* so the list row and any useProjection('title') reader update without
	* waiting for the mux frame.
	* @param title - raw title text (the host normalizes acceptance).
	* @returns the rename result (normalized accepted title + title event seq).
	*/
	async rename(title) {
		try {
			const { result } = await this.api.sessions.rename({
				sessionId: this.sessionId,
				title
			});
			if (result.ok) this.projections.apply("title", result.value.title, result.value.seq);
			return result;
		} catch (error) {
			return transportError(error);
		}
	}
	/**
	* Execute one slash-command line against this session's agent — pure
	* admission semantics (the host executor durably logs the lifecycle;
	* outcomes render as flow nodes, never as a response echo).
	* @param line - the full command line, leading slash included.
	* @returns the admission result, or the error branch on transport failure.
	*/
	async command(line) {
		const result = await this.remote.commands.execute(this.sessionId, line);
		if (!result.ok) return result;
		return {
			ok: true,
			value: { matched: result.value !== void 0 }
		};
	}
	/** First open: pull the tail page (idempotent — in-flight/already-open returns the existing promise). */
	open() {
		if (this.openState === "open") return Promise.resolve();
		if (this.openPromise !== null) return this.openPromise;
		const promise = this.doOpen(this.openGeneration).finally(() => {
			if (this.openPromise === promise) this.openPromise = null;
		});
		this.openPromise = promise;
		return promise;
	}
	/** Page up: pull one earlier page with the window's first seq as beforeSeq and prepend. */
	async loadOlder() {
		if (this.openState !== "open" || !this.hasMore || this.loadingOlder) return;
		this.loadingOlder = true;
		this.notifier.markDirty();
		try {
			const { result } = await this.history({
				beforeSeq: this.baseSeq,
				maxMessages: PAGE_MESSAGES
			});
			if (!result.ok) return;
			const older = result.value.events;
			if (older.length === 0) {
				this.hasMore = result.value.hasMore;
				this.conversation.prepend([], this.hasMore);
				return;
			}
			const tail = older[older.length - 1];
			if (tail === void 0 || tail.event.seq + 1 !== this.baseSeq) {
				console.error(`[web-runtime] history page discontinuous: tail seq ${tail?.event.seq} vs baseSeq ${this.baseSeq}`);
				this.hasMore = false;
				this.conversation.prepend([], false);
				return;
			}
			this.events = [...older.map((e) => e.event), ...this.events];
			this.views = [...older.map((e) => e.view), ...this.views];
			/* v8 ignore next -- the ?? arm needs older[0] undefined, but the empty-page branch above already returned. */
			this.baseSeq = older[0]?.event.seq ?? this.baseSeq;
			this.hasMore = result.value.hasMore;
			this.conversation.prepend(older.map(conversationInput), this.hasMore);
		} catch (error) {
			console.error("[web-runtime] loadOlder failed:", error);
		} finally {
			this.loadingOlder = false;
			this.notifier.markDirty();
		}
	}
	/** Reconnect rebuild (manager calls this on onConnected for instances that were opened):
	*  reset the window and rerun open; pending waits for the baseline replay. Invalidates any
	*  in-flight open first — its history request rode the dead connection and must not settle
	*  the fresh generation into 'error'. */
	async resync() {
		if (this.openState === "cold") return;
		this.openGeneration++;
		this.openPromise = null;
		this.openState = "cold";
		this.openError = null;
		this.events = [];
		this.views = [];
		this.baseSeq = 0;
		this.pending.clear();
		this.pendingRev++;
		this.subscribedLastSeq = null;
		this.liveBuffer = [];
		this.notifier.markDirty();
		await this.open();
	}
	/**
	* uSES subscription entry.
	* @param listener - change callback.
	* @returns the unsubscribe function.
	*/
	subscribe(listener) {
		return this.notifier.subscribe(listener);
	}
	/**
	* Cached conversation snapshot (rebuilt lazily when dirty with no listeners).
	* @returns the cached reference (stable until the next flush).
	*/
	getSnapshot() {
		this.notifier.ensureFresh();
		return this.snapshotCache;
	}
	/**
	* Mux frame arrival (the dispatch switch).
	* @param rpcId - the frame envelope id (the respond backfill key for requested frames).
	* @param frame - the routed frame.
	*/
	handleMuxEnvelope(rpcId, frame) {
		switch (frame.type) {
			case "session/event":
				this.acceptLiveEvent(frame.event, frame.view);
				return;
			case "session/queue":
				this.queueMirror.replace(frame.items);
				this.notifier.markDirty();
				return;
			case "session/subscribed":
				this.subscribedLastSeq = frame.lastSeq;
				if (this.queueMirror.reset()) this.notifier.markDirty();
				return;
			case "approval/requested": {
				const { type: _type, sessionId: _sid,...payload } = frame;
				this.mint(new PendingWait("approval", rpcId, this.sessionId, payload, (m) => this.api.respond(m)));
				this.notifier.markDirty();
				return;
			}
			case "approval/resolved":
				for (const item of this.pending.values()) if (item.kind === "approval" && item.payload.approvalId === frame.approvalId) this.settle(item);
				this.notifier.markDirty();
				return;
			case "question/requested": {
				const { type: _type, sessionId: _sid,...payload } = frame;
				this.mint(new PendingWait("question", rpcId, this.sessionId, payload, (m) => this.api.respond(m)));
				this.notifier.markDirty();
				return;
			}
			case "question/resolved": {
				const item = this.pending.get(`q:${frame.questionRpcId}`);
				if (item !== void 0) this.settle(item);
				this.notifier.markDirty();
				return;
			}
			default: return;
		}
	}
	/**
	* Running-bit relay from the host stream (list entry and snapshot stay consistent).
	* @param running - the new running state.
	*/
	handleRunning(running) {
		if (running && this.blankBit) {
			this.blankBit = false;
			this.notifier.markDirty();
		}
		if (running) this.firstPromptPendingTurn = false;
		if (this.running === running) return;
		this.running = running;
		this.notifier.markDirty();
	}
	/**
	* Install or clear the catalog-discovered transport address. A changed
	* address rebuilds an already-open window through its new history route.
	* @param address - direct parent/child address, or undefined for ordinary transport.
	* @param parentAvailable - latest exact-parent availability hint.
	*/
	configureSubagent(address, parentAvailable = false) {
		const same = this.address?.parentSessionId === address?.parentSessionId && this.address?.childSessionId === address?.childSessionId && this.address?.mode === address?.mode;
		this.address = address;
		this.parentAvailable = parentAvailable;
		if (!same && this.openState !== "cold") this.resync();
		else this.notifier.markDirty();
	}
	/**
	* Update only the parent availability hint from a catalog refresh.
	* @param available - whether the exact direct parent is live.
	*/
	handleSubagentParentAvailable(available) {
		if (this.parentAvailable === available) return;
		this.parentAvailable = available;
		this.notifier.markDirty();
	}
	/**
	* Blank-bit relay from the authoritative summary source (list baseline and
	* the session-added frame). Monotone: once any signal (local first send,
	* running flip, an earlier summary) cleared it, a stale true never
	* re-blanks.
	* @param blank - the summary's derived empty-log bit.
	*/
	handleBlank(blank) {
		if (blank === this.blankBit) return;
		if (blank && (this.promptAttempted || this.running)) return;
		this.blankBit = blank;
		this.notifier.markDirty();
	}
	/** host/session-removed relay: flag the snapshot (instance survives — resident-instance rule). */
	handleRemoved() {
		this.removed = true;
		this.notifier.markDirty();
	}
	/**
	* host/agent-error relay: the only outlet for live failures with no turn position.
	* @param message - the stringified error.
	*/
	handleAgentError(message) {
		this.lastAgentError = message;
		this.notifier.markDirty();
	}
	/** No-op because session instances remain resident. */
	dispose() {}
	/** Rebuild the current window after a low-frequency Definition or view registration change. */
	rebuildConversationRegistry() {
		this.scheduleConversation(this.conversation.rebuildRegistry());
	}
	/** Requested-frame arrival: the wait enters the pending map under its own key. */
	mint(wait) {
		this.pending.set(wait.key, wait);
		this.pendingRev++;
	}
	/** Authoritative resolved-frame settlement: mark, then drop from the pending map. */
	settle(wait) {
		wait.markSettled();
		this.pending.delete(wait.key);
		this.pendingRev++;
	}
	/** @param generation - openGeneration at launch; every await re-checks it and a stale pass
	*  drops all writes (resync superseded this open — its outcome belongs to a dead connection). */
	async doOpen(generation) {
		this.openState = "loading";
		this.openError = null;
		this.notifier.markDirty();
		try {
			let { result } = await this.history({ maxMessages: PAGE_MESSAGES });
			if (generation !== this.openGeneration) return;
			if (!result.ok) {
				this.openState = "error";
				this.openError = result.error;
				return;
			}
			this.installWindow(result.value.events, result.value.hasMore, result.value.projections);
			const tailSeq = this.windowTailSeq();
			if (this.subscribedLastSeq !== null && tailSeq !== null && this.subscribedLastSeq > tailSeq) {
				result = (await this.history({ maxMessages: PAGE_MESSAGES })).result;
				if (generation !== this.openGeneration) return;
				if (result.ok) this.installWindow(result.value.events, result.value.hasMore, result.value.projections);
			}
			this.openState = "open";
		} catch (error) {
			if (generation !== this.openGeneration) return;
			this.openState = "error";
			const folded = transportError(error);
			/* v8 ignore next -- the `? null` arm is unreachable: transportError always returns ok:false. */
			this.openError = folded.ok ? null : folded.error;
		} finally {
			if (generation === this.openGeneration) this.notifier.markDirty();
		}
	}
	/** Install the history window + stitch the liveBuffer (seq is the sole dedup key).
	*  Stitching MUST NOT route through acceptLiveEvent: openState is still 'loading' here
	*  (doOpen flips it after install), so recursing would push every buffered event straight
	*  back into liveBuffer where nothing ever drains it — a silent drop loop.
	*  A carried projections block seeds the value store (higher seq wins, so a stale
	*  baseline cannot overwrite a newer push frame); the window events themselves are
	*  never folded — the host is the only computation site. */
	installWindow(entries, hasMore, projections) {
		this.events = entries.map((e) => e.event);
		this.views = entries.map((e) => e.view);
		this.baseSeq = this.events[0]?.seq ?? 0;
		this.hasMore = hasMore;
		if (this.events.some((event) => event.type === "turn/start")) this.firstPromptPendingTurn = false;
		this.conversation.replaceWindow(entries.map(conversationInput), hasMore);
		if (projections !== void 0) this.projections.seed(projections);
		const buffered = this.liveBuffer;
		this.liveBuffer = [];
		for (const item of buffered) this.appendLive(item.event, item.view);
		this.notifier.markDirty();
	}
	/** Seq-guarded append shared by stitching and the open-state live path. */
	appendLive(event, view) {
		const tailSeq = this.windowTailSeq();
		if (tailSeq !== null && event.seq <= tailSeq) return "none";
		this.events.push(event);
		this.views.push(view);
		if (event.type === "turn/start") this.firstPromptPendingTurn = false;
		const queueChanged = this.queueMirror.acceptDurable(event);
		const publication = this.conversation.append({
			event,
			view
		});
		return queueChanged ? "immediate" : publication;
	}
	/** Land a live session/event (open/repair in flight -> buffer; overlapping seq -> drop;
	*  a seq gap -> buffer + tail-page repull instead of appending a hole (a gap is an
	*  expected reconnect-window artifact, repaired by refetch). The window stays one contiguous
	*  raw range, which lets Conversation Definitions correlate every recorded event between its
	*  ends and lets a compaction checkpoint resolve its cited summary event. */
	acceptLiveEvent(event, view) {
		if (this.openState === "loading" || this.stitching) {
			this.liveBuffer.push({
				event,
				view
			});
			return;
		}
		if (this.openState !== "open") return;
		const tailSeq = this.windowTailSeq();
		if (tailSeq !== null && event.seq > tailSeq + 1) {
			this.liveBuffer.push({
				event,
				view
			});
			this.repairGap();
			return;
		}
		this.scheduleConversation(this.appendLive(event, view));
	}
	/** Route assembler cadence into the Session's existing microtask/RAF notifier. */
	scheduleConversation(publication) {
		if (publication === "immediate") this.notifier.markDirty();
		else if (publication === "animation-frame") this.notifier.markFrameDirty();
	}
	/** Resync-lite: repull the tail page and stitch the liveBuffer through the shared
	*  installWindow path. No openState transition — the UI keeps the current window (no loading
	*  flash); events arriving meanwhile detour to liveBuffer via the stitching flag. */
	async repairGap() {
		/* v8 ignore next -- re-entry guard: acceptLiveEvent already detours to liveBuffer while stitching, so no second call reaches here. */
		if (this.stitching) return;
		this.stitching = true;
		const generation = this.openGeneration;
		try {
			const { result } = await this.history({ maxMessages: PAGE_MESSAGES });
			if (result.ok && generation === this.openGeneration && this.openState === "open") this.installWindow(result.value.events, result.value.hasMore, result.value.projections);
		} catch (error) {
			console.error("[web-runtime] gap repair failed:", error);
		} finally {
			this.stitching = false;
		}
	}
	windowTailSeq() {
		const tail = this.events[this.events.length - 1];
		return tail === void 0 ? null : tail.seq;
	}
	buildSnapshot() {
		if (this.pendingCache === null || this.pendingCache.rev !== this.pendingRev) this.pendingCache = {
			rev: this.pendingRev,
			value: [...this.pending.values()]
		};
		const chat = this.conversation.snapshot("chat") ?? EMPTY_CHAT_SNAPSHOT;
		const legacy = chat.legacy;
		return {
			sessionId: this.sessionId,
			views: this.conversation,
			chat,
			nodes: legacy.nodes,
			turnTimings: legacy.turnTimings,
			turnEnds: legacy.turnEnds,
			partial: legacy.partial,
			runningCalls: legacy.runningCalls,
			pending: this.pendingCache.value,
			queue: this.queueMirror.snapshot(),
			running: this.running,
			subagent: this.address === void 0 ? null : {
				address: this.address,
				parentAvailable: this.parentAvailable
			},
			composerPhase: derivePhase(hasVisibleConversationContent(chat) || !this.blankBit && !this.firstPromptPendingTurn || this.running || this.pendingCache.value.length > 0, this.promptAttempted),
			removed: this.removed,
			openState: this.openState,
			openError: this.openError,
			hasMore: this.hasMore,
			loadingOlder: this.loadingOlder,
			promptError: this.promptError,
			blank: this.blankBit,
			lastAgentError: this.lastAgentError
		};
	}
	/** Select ordinary or addressed history transport from the stored browser fact. */
	history(payload) {
		return this.address === void 0 ? this.api.sessions.history({
			sessionId: this.sessionId,
			...payload
		}) : this.api.subagents.history({
			...this.address,
			...payload
		});
	}
};
/** Convert one wire history row into the assembler's transport-neutral input. */
function conversationInput(entry) {
	return {
		event: entry.event,
		view: entry.view
	};
}
/** A generic command row alone remains control-plane content; every other visible Chat Node activates the conversation. */
function hasVisibleConversationContent(chat) {
	return chat.order.some((key) => chat.nodes.get(key)?.kind !== "command");
}
/**
* The composerPhase judgment — the single site that knows the predicate
* (consumers switch on the result, never re-derive). A failed first prompt
* stays engaging until an authoritative accepted-turn, running, or pending
* signal arrives (retry semantics — see ComposerPhase).
* @param hasContent - authoritative non-blank activity beyond a pending first
*   prompt, visible non-command Chat content, a running turn, or a pending interaction.
* @param promptAttempted - a prompt was initiated on this session object.
* @returns the derived phase.
*/
function derivePhase(hasContent, promptAttempted) {
	if (hasContent) return "active";
	return promptAttempted ? "engaging" : "blank";
}

//#endregion
//#region vendor/client-runtime/client/sessions/manager.js
/** Stable identity of a frame retained until an uninstantiated Session can consume it. */
function bufferedRequestKey(envelope) {
	const frame = envelope.payload;
	switch (frame.type) {
		case "approval/requested": return `a:${frame.approvalId}`;
		case "question/requested": return `q:${envelope.rpcId}`;
		case "session/queue": return "queue";
		default: return;
	}
}
/** Match ui-user-questions's binary plan-review routing at the wire boundary. */
function questionInteractionStatus(questions) {
	if (questions.length !== 1) return "question";
	const question = questions[0];
	const intent = question.intent;
	if (intent?.kind !== "plan-review" || question.detail === void 0) return "question";
	if (question.multiSelect === true) return "question";
	const options$1 = question.options ?? [];
	if (options$1.length > 2) return "question";
	return options$1.some((option) => option.label === intent.approve) ? "plan-review" : "question";
}
/** Instance cluster + frame entry + the session list. */
var SessionManager = class {
	api;
	remote;
	conversation;
	sessions = /* @__PURE__ */ new Map();
	/** Pre-instantiation buffer for answerable requests and the queued-turn snapshot, which history
	*  cannot reconstruct on open. Live requests remain until resolution; queue and replay duplicates
	*  compact by identity. Instantiation replays and clears it, while removal drops it. */
	pendingBuffers = /* @__PURE__ */ new Map();
	/** Outstanding answerable interactions per session, keyed by their stable request identity.
	*  Manager-owned rather than read off Session instances because the sidebar must light up for
	*  sessions never instantiated. Cleared per connection generation — the reopen replay re-adds
	*  still-pending requests — and on session-removed. */
	pendingInteractions = /* @__PURE__ */ new Map();
	/**
	* Sessions that finished running while not selected — the sidebar's green
	* "done" reminder (manager-owned, survives connection generations; cleared
	* on select and session-removed, re-armed by the next completion).
	*/
	completedNotifications = /* @__PURE__ */ new Set();
	/** Last-observed running bits per session; the true→false edge here arms {@link completedNotifications}. */
	prevRunning = /* @__PURE__ */ new Map();
	/** Per-session projection value stores, retained independently of instance arrival (the
	*  title-snapshot precedent, generalized): push frames land here whether or not the Session
	*  is instantiated (list rows read the 'title' key), and an instantiated Session adopts the
	*  same store so history-baseline seeding and frames converge on one row set. */
	projectionStores = /* @__PURE__ */ new Map();
	summaries = [];
	listState = "idle";
	/** Arrival phase; the pending → ready edge fires on the first successful pull (see SessionListPhase). */
	listPhase = "pending";
	listError = null;
	listInflight = null;
	/** Mutations arriving after a list request starts are replayed over its response. */
	listMutations = null;
	addresses = /* @__PURE__ */ new Map();
	catalogs = /* @__PURE__ */ new Map();
	catalogInflight = /* @__PURE__ */ new Map();
	/** Catalog owners whose membership changed while a pull was in flight: one trailing refresh after it settles. */
	catalogStale = /* @__PURE__ */ new Set();
	openCatalogs = /* @__PURE__ */ new Set();
	catalogDebounce = /* @__PURE__ */ new Map();
	/**
	* Background jobs per session, last-wins from `session/jobs`. An empty set
	* is stored as an absent key, so absence and `[]` are one representation.
	*/
	jobsBySession = /* @__PURE__ */ new Map();
	selected;
	listSnapshotCache;
	/** Entry-identity cache (reference stability): list rebuilds reuse the previous entry
	*  object when every field matches — wire refreshes mint all-new summary objects, so identity
	*  must be recovered by value or every SessionListItem memo misses on every refresh. */
	entryCache = /* @__PURE__ */ new Map();
	itemsCache = [];
	notifier = new Notifier(() => {
		this.listSnapshotCache = this.buildListSnapshot();
	});
	/**
	* @param api - shared wire client.
	* @param restoredSelection - persisted real-Session selection candidate.
	*/
	constructor(api, remote, restoredSelection, restoredAddress, conversation) {
		this.api = api;
		this.remote = remote;
		this.conversation = conversation;
		this.selected = restoredSelection;
		if (restoredAddress !== void 0) this.addresses.set(restoredAddress.childSessionId, restoredAddress);
		this.listSnapshotCache = this.buildListSnapshot();
	}
	/**
	* Select a listed Session or a retained catalog-addressed child.
	* @param sessionId - listed or catalog-addressed Session id.
	*/
	select(sessionId) {
		const address = this.navigationAddress(sessionId);
		if (!this.summaries.some((summary) => summary.sessionId === sessionId) && address === void 0) throw new Error(`sessions.select: unknown session ${sessionId}`);
		if (address !== void 0) this.addresses.set(sessionId, address);
		this.sessions.get(sessionId)?.configureSubagent(address, address === void 0 ? false : this.catalogs.get(address.parentSessionId)?.parentAvailable ?? false);
		this.selected = sessionId;
		this.completedNotifications.delete(sessionId);
		this.refreshSubagents(sessionId);
		this.notifier.notifyNow();
	}
	/**
	* Select a healthy child through its durable direct-parent address.
	* @param address - catalog-derived parent and child ids.
	*/
	selectSubagent(address) {
		const catalog = this.catalogs.get(address.parentSessionId);
		const entry = catalog?.entries.find((candidate) => candidate.id === address.childSessionId);
		if (entry === void 0 || entry.kind !== "child" || entry.mode !== address.mode) throw new Error(`sessions.selectSubagent: ${address.childSessionId} is not a healthy catalog child`);
		this.addresses.set(address.childSessionId, address);
		this.sessions.get(address.childSessionId)?.configureSubagent(address, catalog?.parentAvailable ?? false);
		this.selected = address.childSessionId;
		this.completedNotifications.delete(address.childSessionId);
		this.refreshSubagents(address.childSessionId);
		this.notifier.notifyNow();
	}
	/** Clear the selection (the layout falls to the no-session view state). */
	clearSelection() {
		this.selected = void 0;
		this.notifier.notifyNow();
	}
	/**
	* Return the durable catalog address retained for one child.
	* @param sessionId - possible addressed child id.
	* @returns The direct-parent address, when navigation discovered one.
	*/
	subagentAddress(sessionId) {
		return this.addresses.get(sessionId);
	}
	/**
	* Resolve an address for breadcrumb navigation without retaining transport authority.
	* @param sessionId - possible child id in an already-loaded catalog.
	* @returns A retained or catalog-derived direct-parent address.
	*/
	navigationAddress(sessionId) {
		const retained = this.addresses.get(sessionId);
		if (retained !== void 0) return retained;
		for (const [parentSessionId, catalog] of this.catalogs) {
			const child = catalog.entries.find((entry) => entry.kind === "child" && entry.id === sessionId);
			if (child?.kind === "child") return {
				parentSessionId,
				childSessionId: sessionId,
				mode: child.mode
			};
		}
	}
	/**
	* Drop a session instance (scope-prune companion: instance
	* and scope share one lifecycle). The host session log is the durable
	* truth — a later get() lazily rebuilds and open() backfills history.
	* @param sessionId - the session to drop.
	*/
	drop(sessionId) {
		this.sessions.delete(sessionId);
	}
	/**
	* Lazy build: return the existing instance or construct one (no auto-open —
	* open is triggered by the container's select callback).
	* @param sessionId - the session to get.
	* @returns the resident instance.
	*/
	get(sessionId) {
		let session = this.sessions.get(sessionId);
		if (session === void 0) {
			session = this.createSession(sessionId);
			this.sessions.set(sessionId, session);
			const buffered = this.pendingBuffers.get(sessionId);
			if (buffered !== void 0) {
				this.pendingBuffers.delete(sessionId);
				for (const envelope of buffered) session.handleMuxEnvelope(envelope.rpcId, envelope.payload);
			}
			const summary = this.summaries.find((s) => s.sessionId === sessionId);
			if (summary !== void 0) {
				session.handleBlank(summary.blank);
				session.handleRunning(summary.running);
			} else {
				const address = this.addresses.get(sessionId);
				const child = address === void 0 ? void 0 : this.catalogs.get(address.parentSessionId)?.entries.find((entry) => entry.kind === "child" && entry.id === sessionId);
				if (child?.kind === "child") {
					session.handleBlank(false);
					session.handleRunning(child.activity === "running");
				}
			}
		}
		return session;
	}
	createSession(sessionId) {
		const address = this.addresses.get(sessionId);
		return new Session(sessionId, this.api, this.remote, {
			...address === void 0 ? {} : {
				address,
				parentAvailable: this.catalogs.get(address.parentSessionId)?.parentAvailable ?? false
			},
			onEngaged: (engaged) => {
				this.recordMutation({
					kind: "engaged",
					sessionId: engaged.sessionId
				});
			},
			projections: this.projectionStore(sessionId),
			...this.conversation === void 0 ? {} : { conversation: this.conversation }
		});
	}
	/** Rebuild every resident Session after one coalesced registry transaction. */
	rebuildConversationRegistry() {
		for (const session of this.sessions.values()) session.rebuildConversationRegistry();
	}
	/** Resident per-session projection store (create-on-demand; outlives instantiation). */
	projectionStore(sessionId) {
		let store = this.projectionStores.get(sessionId);
		if (store === void 0) {
			store = new ProjectionValueStore();
			store.subscribeAny(() => {
				this.notifier.markDirty();
			});
			this.projectionStores.set(sessionId, store);
		}
		return store;
	}
	/**
	* Refresh one direct-child catalog, reusing its in-flight request.
	* @param parentSessionId - catalog owner.
	*/
	refreshSubagents(parentSessionId) {
		const existing = this.catalogInflight.get(parentSessionId);
		if (existing !== void 0) return existing.promise;
		const previous = this.catalogs.get(parentSessionId);
		const expandableRows = /* @__PURE__ */ new Set();
		const activityRows = /* @__PURE__ */ new Map();
		this.catalogs.set(parentSessionId, {
			entries: previous?.entries ?? [],
			parentAvailable: previous?.parentAvailable ?? false,
			state: "loading",
			error: null
		});
		this.notifier.markDirty();
		const operation = (async () => {
			try {
				const { result } = await this.api.subagents.list({ parentSessionId });
				if (result.ok) {
					const parentAvailable = this.catalogInflight.get(parentSessionId)?.parentAvailableOverride ?? result.value.parentAvailable;
					this.catalogs.set(parentSessionId, {
						...result.value,
						entries: this.withCatalogMutations(result.value.entries, expandableRows, activityRows),
						parentAvailable,
						state: "ready",
						error: null
					});
					for (const [childId, address] of this.addresses) {
						if (address.parentSessionId !== parentSessionId) continue;
						this.sessions.get(childId)?.handleSubagentParentAvailable(parentAvailable);
					}
				} else this.catalogs.set(parentSessionId, {
					entries: this.withCatalogMutations(previous?.entries ?? [], expandableRows, activityRows),
					parentAvailable: this.catalogInflight.get(parentSessionId)?.parentAvailableOverride ?? previous?.parentAvailable ?? false,
					state: "error",
					error: result.error
				});
			} catch (error) {
				const folded = transportError(error);
				this.catalogs.set(parentSessionId, {
					entries: this.withCatalogMutations(previous?.entries ?? [], expandableRows, activityRows),
					parentAvailable: this.catalogInflight.get(parentSessionId)?.parentAvailableOverride ?? previous?.parentAvailable ?? false,
					state: "error",
					error: folded.ok ? null : folded.error
				});
			} finally {
				this.catalogInflight.delete(parentSessionId);
				if (this.catalogStale.delete(parentSessionId)) this.refreshSubagents(parentSessionId);
				this.notifier.markDirty();
			}
		})();
		this.catalogInflight.set(parentSessionId, {
			promise: operation,
			expandableRows,
			activityRows,
			parentAvailableOverride: void 0
		});
		return operation;
	}
	/**
	* Mark whether a catalog menu is consuming live membership updates.
	* @param parentSessionId - catalog owner.
	* @param open - current menu state.
	*/
	setSubagentCatalogOpen(parentSessionId, open$1) {
		if (open$1) {
			this.openCatalogs.add(parentSessionId);
			this.refreshSubagents(parentSessionId);
		} else {
			this.openCatalogs.delete(parentSessionId);
			const timer = this.catalogDebounce.get(parentSessionId);
			if (timer !== void 0) {
				clearTimeout(timer);
				this.catalogDebounce.delete(parentSessionId);
			}
		}
	}
	/** Full refresh via session.list (single-flight: an in-flight call is reused). */
	refreshList() {
		if (this.listInflight !== null) return this.listInflight;
		this.listState = "loading";
		this.listError = null;
		const established = this.summaries;
		const mutations = [];
		this.listMutations = mutations;
		this.notifier.markDirty();
		this.listInflight = (async () => {
			try {
				const { result } = await this.api.sessions.list({});
				if (result.ok) {
					const baseline = this.listPhase === "pending" ? result.value.items : mergeOrderedBaseline(established, result.value.items, (summary) => summary.sessionId);
					for (const s of baseline) if (!this.prevRunning.has(s.sessionId)) this.prevRunning.set(s.sessionId, s.running);
					let summaries = baseline;
					for (const mutation of mutations) {
						summaries = applyMutation(summaries, mutation);
						this.summaries = summaries;
						this.syncCompletedNotifications();
					}
					this.summaries = summaries;
					this.listState = "idle";
					this.listPhase = "ready";
					this.syncCompletedNotifications();
					for (const s of this.summaries) {
						const session = this.sessions.get(s.sessionId);
						if (session === void 0) continue;
						session.handleBlank(s.blank);
						session.handleRunning(s.running);
					}
					for (const s of result.value.items) {
						const block$1 = s.projections;
						if (block$1 === void 0) continue;
						const store = this.projectionStore(s.sessionId);
						const values = block$1.values;
						for (const key of Object.keys(values)) store.apply(key, values[key], block$1.asOfSeq);
					}
				} else {
					this.listState = "error";
					this.listError = result.error;
				}
			} catch (error) {
				this.listState = "error";
				const folded = transportError(error);
				/* v8 ignore next -- the `? null` arm is unreachable: transportError always returns ok:false. */
				this.listError = folded.ok ? null : folded.error;
			} finally {
				this.listMutations = null;
				this.listInflight = null;
				this.notifier.markDirty();
			}
		})();
		return this.listInflight;
	}
	/**
	* Search visible session message content without adding transient query
	* state to the list snapshot.
	* @param query - non-blank literal phrase.
	* @param signal - cancellation for superseded UI queries.
	* @returns the Host result or a folded transport error.
	*/
	async search(query, signal) {
		try {
			return (await this.api.sessions.search({ query }, signal)).result;
		} catch (error) {
			return transportError(error);
		}
	}
	/**
	* Contract session.create; on success merge into summaries immediately (no
	* wait for the next refresh). A created session is blank by definition
	* (entity birth precedes the first message).
	* @param opts - target workspace or working directory, plus an optional caller-owned id.
	* @returns the create result.
	*/
	async create(opts = {}) {
		try {
			const shared = opts.sessionId === void 0 ? {} : { sessionId: opts.sessionId };
			const payload = opts.workspaceId !== void 0 ? {
				workspaceId: opts.workspaceId,
				...shared
			} : {
				...opts.cwd === void 0 ? {} : { cwd: opts.cwd },
				...shared
			};
			const { result } = await this.api.sessions.create(payload);
			if (result.ok) this.recordMutation({
				kind: "upsert",
				summary: {
					sessionId: result.value.sessionId,
					updatedAt: Date.now(),
					running: false,
					blank: true,
					...opts.cwd !== void 0 ? { cwd: opts.cwd } : {},
					...result.value.agentPreset !== void 0 ? { agentPreset: result.value.agentPreset } : {}
				}
			});
			else {
				const publishedSessionId = workspaceAttachSessionId(result.error);
				if (publishedSessionId !== void 0) this.recordMutation({
					kind: "upsert",
					summary: {
						sessionId: publishedSessionId,
						updatedAt: Date.now(),
						running: false,
						blank: true
					}
				});
			}
			return result;
		} catch (error) {
			return transportError(error);
		}
	}
	/**
	* Contract session.fork; on success merge the child into summaries
	* immediately (same synchronous-addressability guarantee as create). The
	* child carries the source's history, so it is never blank; lineage rides
	* parentSessionId so the list nests it under its source. A child published
	* before Workspace attachment fails is also reconciled into the list.
	* @param opts - source session and the optional seq anchoring the cut.
	* @returns the fork result (the child session id).
	*/
	async fork(opts) {
		try {
			const source = this.summaries.find((s) => s.sessionId === opts.sessionId);
			const { result } = await this.api.sessions.fork({
				sessionId: opts.sessionId,
				...opts.atSeq === void 0 ? {} : { atSeq: opts.atSeq }
			});
			const childId = result.ok ? result.value.sessionId : workspaceAttachSessionId(result.error);
			if (childId !== void 0) this.recordMutation({
				kind: "upsert",
				summary: {
					sessionId: childId,
					updatedAt: Date.now(),
					running: false,
					blank: false,
					parentSessionId: opts.sessionId,
					...source?.cwd !== void 0 ? { cwd: source.cwd } : {}
				}
			});
			return result;
		} catch (error) {
			return transportError(error);
		}
	}
	/**
	* Insert-or-enrich a locally synthesized summary: a new id prepends; an
	* existing entry only gains fields it lacks (the session-added frame and the
	* create() echo race — whichever lands second must fill the placeholder's
	* missing cwd/parentSessionId, never overwrite list-refresh data).
	*/
	mergeSummary(summary) {
		this.recordMutation({
			kind: "upsert",
			summary
		});
	}
	/**
	* Record a host-confirmed composition switch (see ISessions.noteAgentPreset).
	* @param sessionId - the switched session.
	* @param agentPreset - the preset id the host confirmed.
	*/
	noteAgentPreset(sessionId, agentPreset) {
		this.recordMutation({
			kind: "upsert",
			summary: {
				sessionId,
				updatedAt: Date.now(),
				running: false,
				blank: true,
				agentPreset
			}
		});
	}
	/** Apply immediately and retain for replay when a list response is in flight. */
	recordMutation(mutation) {
		this.listMutations?.push(mutation);
		this.summaries = applyMutation(this.summaries, mutation);
		this.syncCompletedNotifications();
		this.notifier.markDirty();
	}
	/**
	* uSES subscription entry for useSessionList.
	* @param listener - change callback.
	* @returns the unsubscribe function.
	*/
	subscribe(listener) {
		return this.notifier.subscribe(listener);
	}
	/**
	* Cached list snapshot (rebuilt lazily when dirty with no listeners).
	* @returns the cached reference (stable until the next flush).
	*/
	getListSnapshot() {
		this.notifier.ensureFresh();
		return this.listSnapshotCache;
	}
	/** Add or refresh one stable pending-interaction identity. */
	trackPending(sessionId, key, status) {
		let interactions = this.pendingInteractions.get(sessionId);
		if (interactions === void 0) {
			interactions = /* @__PURE__ */ new Map();
			this.pendingInteractions.set(sessionId, interactions);
		}
		if (interactions.get(key) === status) return;
		interactions.set(key, status);
		this.notifier.markDirty();
	}
	/** Settle one pending-interaction identity without disturbing sibling waits. */
	resolvePending(sessionId, key) {
		const interactions = this.pendingInteractions.get(sessionId);
		if (interactions === void 0 || !interactions.delete(key)) return;
		if (interactions.size === 0) this.pendingInteractions.delete(sessionId);
		this.notifier.markDirty();
	}
	/**
	* Mux frame entry: sessionId-bearing frames go only to instantiated sessions
	* (no lazy build; non-pending frames for uninstantiated sessions drop —
	* history backfills them on open).
	* @param envelope - the frame with its wire rpcId.
	*/
	handleMuxEnvelope(envelope) {
		const frame = envelope.payload;
		if (frame.type === "stream/error") return;
		if (frame.type === "session/event" && frame.event.type === "user/message" && frame.event.data.source.kind === "user") this.recordMutation({
			kind: "activity",
			sessionId: frame.sessionId,
			updatedAt: frame.event.time
		});
		if (frame.type === "session/projection") {
			this.projectionStore(frame.sessionId).apply(frame.key, frame.value, frame.seq);
			this.notifier.markDirty();
			return;
		}
		if (frame.type === "session/jobs") {
			if (frame.jobs.length === 0) this.jobsBySession.delete(frame.sessionId);
			else this.jobsBySession.set(frame.sessionId, frame.jobs);
			this.notifier.markDirty();
			return;
		}
		if (frame.type === "session/subscribed") {
			this.projectionStores.get(frame.sessionId)?.truncate(frame.lastSeq);
			this.jobsBySession.delete(frame.sessionId);
			this.notifier.markDirty();
			const buffered = this.pendingBuffers.get(frame.sessionId);
			if (buffered !== void 0) {
				const kept = buffered.filter((item) => item.payload.type !== "session/queue");
				if (kept.length !== buffered.length) if (kept.length === 0) this.pendingBuffers.delete(frame.sessionId);
				else this.pendingBuffers.set(frame.sessionId, kept);
			}
		}
		if (frame.type === "approval/requested") this.trackPending(frame.sessionId, `a:${frame.approvalId}`, "approval");
		else if (frame.type === "approval/resolved") this.resolvePending(frame.sessionId, `a:${frame.approvalId}`);
		else if (frame.type === "question/requested") this.trackPending(frame.sessionId, `q:${envelope.rpcId}`, questionInteractionStatus(frame.questions));
		else if (frame.type === "question/resolved") this.resolvePending(frame.sessionId, `q:${frame.questionRpcId}`);
		const session = this.sessions.get(frame.sessionId);
		if (session === void 0) switch (frame.type) {
			case "approval/requested":
			case "question/requested":
			case "session/queue": {
				const buffer = this.pendingBuffers.get(frame.sessionId) ?? [];
				const key = frame.type === "approval/requested" ? `a:${frame.approvalId}` : frame.type === "question/requested" ? `q:${envelope.rpcId}` : "queue";
				const prior = buffer.findIndex((item) => bufferedRequestKey(item) === key);
				if (prior === -1) buffer.push(envelope);
				else buffer[prior] = envelope;
				this.pendingBuffers.set(frame.sessionId, buffer);
				return;
			}
			case "approval/resolved":
			case "question/resolved": {
				const buffer = this.pendingBuffers.get(frame.sessionId);
				if (buffer === void 0) return;
				const key = frame.type === "approval/resolved" ? `a:${frame.approvalId}` : `q:${frame.questionRpcId}`;
				const prior = buffer.findIndex((item) => bufferedRequestKey(item) === key);
				if (prior !== -1) buffer.splice(prior, 1);
				if (buffer.length === 0) this.pendingBuffers.delete(frame.sessionId);
				return;
			}
			default: return;
		}
		session.handleMuxEnvelope(envelope.rpcId, frame);
	}
	/**
	* Host frame entry: list upkeep + per-instance running/removed/agent-error relay.
	* @param envelope - the frame with its wire rpcId.
	*/
	handleHostEnvelope(envelope) {
		const frame = envelope.payload;
		switch (frame.type) {
			case "host/session-added":
				this.mergeSummary({
					sessionId: frame.sessionId,
					updatedAt: Date.now(),
					running: false,
					blank: frame.blank,
					...frame.parentSessionId !== void 0 ? { parentSessionId: frame.parentSessionId } : {},
					...frame.origin !== void 0 ? { origin: frame.origin } : {},
					...frame.cwd !== void 0 ? { cwd: frame.cwd } : {},
					...frame.agentPreset !== void 0 ? { agentPreset: frame.agentPreset } : {}
				});
				this.sessions.get(frame.sessionId)?.handleBlank(frame.blank);
				if (frame.origin === "subagent" && frame.parentSessionId !== void 0) this.markCatalogParentExpandable(frame.parentSessionId);
				if (frame.parentSessionId !== void 0 && (this.selected === frame.parentSessionId || this.openCatalogs.has(frame.parentSessionId))) this.scheduleCatalogRefresh(frame.parentSessionId);
				return;
			case "host/session-removed": {
				const durableSubagent = this.summaries.find((candidate) => candidate.sessionId === frame.sessionId)?.origin === "subagent" || this.addresses.has(frame.sessionId);
				this.recordMutation(durableSubagent ? {
					kind: "status",
					sessionId: frame.sessionId,
					running: false
				} : {
					kind: "remove",
					sessionId: frame.sessionId
				});
				this.updateCatalogActivity(frame.sessionId, false);
				if (durableSubagent) this.sessions.get(frame.sessionId)?.handleRunning(false);
				else this.sessions.get(frame.sessionId)?.handleRemoved();
				this.pendingBuffers.delete(frame.sessionId);
				this.pendingInteractions.delete(frame.sessionId);
				this.jobsBySession.delete(frame.sessionId);
				if (!durableSubagent) this.projectionStores.delete(frame.sessionId);
				const inflightCatalog = this.catalogInflight.get(frame.sessionId);
				if (inflightCatalog !== void 0) {
					inflightCatalog.parentAvailableOverride = false;
					this.catalogStale.add(frame.sessionId);
				}
				const ownedCatalog = this.catalogs.get(frame.sessionId);
				if (ownedCatalog !== void 0 && ownedCatalog.parentAvailable) this.catalogs.set(frame.sessionId, {
					...ownedCatalog,
					parentAvailable: false
				});
				for (const [childId, address] of this.addresses) {
					if (address.parentSessionId !== frame.sessionId) continue;
					this.sessions.get(childId)?.handleSubagentParentAvailable(false);
				}
				return;
			}
			case "host/session-status":
				this.recordMutation({
					kind: "status",
					sessionId: frame.sessionId,
					running: frame.running
				});
				this.sessions.get(frame.sessionId)?.handleRunning(frame.running);
				this.updateCatalogActivity(frame.sessionId, frame.running);
				return;
			case "host/agent-error":
				this.sessions.get(frame.sessionId)?.handleAgentError(frame.message);
				return;
			default: return;
		}
	}
	/**
	* The moment a connection generation dies (before any next-generation frame
	* can arrive — onConnected waits for the readiness handshake while replayed
	* frames flow from stream open, so clearing there would race the replay):
	* drop generation-scoped live state. Interactions resolved while disconnected
	* send no frame, so stale statuses and buffered answerable frames must not
	* survive into the next generation — mux-open replay re-adds every still-pending
	* request with its live rpcId.
	*/
	handleDisconnected() {
		if (this.pendingInteractions.size > 0) {
			this.pendingInteractions.clear();
			this.notifier.markDirty();
		}
		for (const [sessionId, buffer] of [...this.pendingBuffers]) {
			const kept = buffer.filter((item) => item.payload.type !== "approval/requested" && item.payload.type !== "question/requested");
			if (kept.length === buffer.length) continue;
			if (kept.length === 0) this.pendingBuffers.delete(sessionId);
			else this.pendingBuffers.set(sessionId, kept);
		}
	}
	/** After each connection generation: refresh the session baseline and rebuild opened windows. */
	handleConnected() {
		this.refreshList();
		const selectedAddress = this.selected === void 0 ? void 0 : this.addresses.get(this.selected);
		if (selectedAddress !== void 0) this.refreshSubagents(selectedAddress.parentSessionId);
		if (this.selected !== void 0) this.refreshSubagents(this.selected);
		for (const parentSessionId of this.openCatalogs) this.refreshSubagents(parentSessionId);
		for (const session of this.sessions.values()) session.resync();
	}
	/** Debounce membership refetches while one parent catalog is selected or open. */
	scheduleCatalogRefresh(parentSessionId) {
		if (this.catalogDebounce.has(parentSessionId)) return;
		const timer = setTimeout(() => {
			this.catalogDebounce.delete(parentSessionId);
			if (this.catalogInflight.has(parentSessionId)) {
				this.catalogStale.add(parentSessionId);
				return;
			}
			this.refreshSubagents(parentSessionId);
		}, 50);
		this.catalogDebounce.set(parentSessionId, timer);
	}
	/** Apply one Agent-driver transition to loaded and in-flight catalogs. */
	updateCatalogActivity(childSessionId, running) {
		const activity = running ? "running" : "inactive";
		for (const inflight of this.catalogInflight.values()) inflight.activityRows.set(childSessionId, activity);
		let changed = false;
		for (const [parentSessionId, catalog] of this.catalogs) {
			if (!catalog.entries.some((entry) => entry.kind === "child" && entry.id === childSessionId && entry.activity !== activity)) continue;
			const entries = catalog.entries.map((entry) => {
				if (entry.kind !== "child" || entry.id !== childSessionId) return entry;
				return {
					...entry,
					activity
				};
			});
			changed = true;
			this.catalogs.set(parentSessionId, {
				...catalog,
				entries
			});
		}
		if (changed) this.notifier.markDirty();
	}
	/** Preserve and project a positive expandability hint after one direct subagent publishes. */
	markCatalogParentExpandable(parentSessionId) {
		this.applyCatalogParentExpandable(parentSessionId);
		for (const inflight of this.catalogInflight.values()) inflight.expandableRows.add(parentSessionId);
	}
	/** Apply one positive expandability hint to every loaded catalog containing that unique row id. */
	applyCatalogParentExpandable(parentSessionId) {
		let changed = false;
		for (const [catalogParentId, catalog] of this.catalogs) {
			if (!catalog.entries.some((entry) => entry.kind === "child" && entry.id === parentSessionId && !entry.hasChildren)) continue;
			const entries = catalog.entries.map((entry) => {
				if (entry.kind !== "child" || entry.id !== parentSessionId || entry.hasChildren) return entry;
				return {
					...entry,
					hasChildren: true
				};
			});
			changed = true;
			this.catalogs.set(catalogParentId, {
				...catalog,
				entries
			});
		}
		if (changed) this.notifier.markDirty();
	}
	/** Fold request-local row mutations into one catalog result before publication. */
	withCatalogMutations(entries, expandableRows, activityRows) {
		return entries.map((entry) => {
			if (entry.kind !== "child") return entry;
			const activity = activityRows.get(entry.id);
			if (!expandableRows.has(entry.id) && activity === void 0) return entry;
			return {
				...entry,
				...expandableRows.has(entry.id) ? { hasChildren: true } : {},
				...activity === void 0 ? {} : { activity }
			};
		});
	}
	/**
	* Reconcile completion reminders against the latest summaries, eagerly after
	* every mutation and pull (a snapshot-build-time pass would collapse
	* consecutive status frames into one observation). A running→idle edge of a
	* non-selected session arms its reminder; running disarms it; removal drops
	* it. First observation only records the running bit — sessions already
	* idle at load get no reminder.
	*/
	syncCompletedNotifications() {
		const seen = /* @__PURE__ */ new Set();
		for (const s of this.summaries) {
			seen.add(s.sessionId);
			const prev = this.prevRunning.get(s.sessionId);
			if (prev === void 0) {
				this.prevRunning.set(s.sessionId, s.running);
				continue;
			}
			if (prev && !s.running) {
				if (s.sessionId !== this.selected) this.completedNotifications.add(s.sessionId);
			} else if (s.running) this.completedNotifications.delete(s.sessionId);
			this.prevRunning.set(s.sessionId, s.running);
		}
		for (const id of this.prevRunning.keys()) if (!seen.has(id)) this.prevRunning.delete(id);
		for (const id of this.completedNotifications) if (!seen.has(id)) this.completedNotifications.delete(id);
	}
	buildListSnapshot() {
		const merged = this.summaries.map((summary) => {
			const projectionStore = this.projectionStores.get(summary.sessionId);
			const title = projectionStore?.get("title");
			const projectionValues = projectionStore?.values();
			return {
				...summary,
				...typeof title === "string" && title !== "" ? { title } : {},
				...projectionValues === void 0 ? {} : { projectionValues }
			};
		});
		const pendingInteractions = /* @__PURE__ */ new Map();
		for (const [sessionId, interactions] of this.pendingInteractions) {
			const statuses = [...interactions.values()];
			const status = statuses.find((candidate) => candidate !== "approval") ?? statuses[0];
			if (status !== void 0) pendingInteractions.set(sessionId, status);
		}
		const items = flattenLineage(merged, pendingInteractions, this.completedNotifications).map((entry) => {
			const prev = this.entryCache.get(entry.sessionId);
			if (prev !== void 0 && prev.updatedAt === entry.updatedAt && prev.running === entry.running && prev.blank === entry.blank && prev.agentPreset === entry.agentPreset && prev.parentSessionId === entry.parentSessionId && prev.cwd === entry.cwd && prev.origin === entry.origin && prev.title === entry.title && prev.depth === entry.depth && prev.pendingInteraction === entry.pendingInteraction && prev.projectionValues === entry.projectionValues && prev.completed === entry.completed) return prev;
			this.entryCache.set(entry.sessionId, entry);
			return entry;
		});
		for (const id of this.entryCache.keys()) if (!items.some((e) => e.sessionId === id)) this.entryCache.delete(id);
		if (!(items.length === this.itemsCache.length && items.every((e, i) => e === this.itemsCache[i]))) this.itemsCache = items;
		const selected = this.selected;
		const current = selected !== void 0 && (items.some((item) => item.sessionId === selected) || this.addresses.has(selected)) ? selected : void 0;
		return {
			items: this.itemsCache,
			current,
			state: this.listState,
			phase: this.listPhase,
			error: this.listError,
			subagentsByParent: Object.fromEntries(this.catalogs),
			jobsBySession: Object.fromEntries(this.jobsBySession),
			currentAddress: current === void 0 ? void 0 : this.addresses.get(current)
		};
	}
};
/** Apply one list mutation without deriving display order. */
function applyMutation(summaries, mutation) {
	switch (mutation.kind) {
		case "upsert": {
			const existing = summaries.find((summary) => summary.sessionId === mutation.summary.sessionId);
			if (existing === void 0) return [mutation.summary, ...summaries];
			const filled = {
				...existing,
				blank: existing.blank && mutation.summary.blank,
				...existing.cwd === void 0 && mutation.summary.cwd !== void 0 ? { cwd: mutation.summary.cwd } : {},
				...existing.parentSessionId === void 0 && mutation.summary.parentSessionId !== void 0 ? { parentSessionId: mutation.summary.parentSessionId } : {},
				...existing.origin === void 0 && mutation.summary.origin !== void 0 ? { origin: mutation.summary.origin } : {},
				...mutation.summary.agentPreset !== void 0 ? { agentPreset: mutation.summary.agentPreset } : {}
			};
			if (filled.cwd === existing.cwd && filled.parentSessionId === existing.parentSessionId && filled.origin === existing.origin && filled.blank === existing.blank && filled.agentPreset === existing.agentPreset) return [...summaries];
			return summaries.map((summary) => summary.sessionId === mutation.summary.sessionId ? filled : summary);
		}
		case "remove": return summaries.filter((summary) => summary.sessionId !== mutation.sessionId);
		case "status": return summaries.map((summary) => summary.sessionId === mutation.sessionId && (summary.running !== mutation.running || mutation.running && summary.blank) ? {
			...summary,
			running: mutation.running,
			blank: summary.blank && !mutation.running
		} : summary);
		case "activity": return summaries.map((summary) => summary.sessionId === mutation.sessionId && mutation.updatedAt > summary.updatedAt ? {
			...summary,
			updatedAt: mutation.updatedAt
		} : summary);
		case "engaged": return summaries.map((summary) => summary.sessionId === mutation.sessionId && summary.blank ? {
			...summary,
			blank: false
		} : summary);
	}
}
/** Temporary source-plane bridge while the Host contract and client project build independently. */
function workspaceAttachSessionId(error) {
	const candidate = error;
	return candidate.code === "workspace-attach-failed" ? candidate.details.sessionId : void 0;
}

//#endregion
//#region vendor/client-runtime/client/sessions/provide.js
/**
* Provider roster + materialization + current projection. The channel owns
* every rule a provider contribution must satisfy; owners keep only their
* per-session bundle storage and the definition of "current".
*/
var SessionProvideChannel = class {
	host;
	providers = [];
	maybeInfoCache;
	/** Latest published current bundle (identity comparison dedupes republish). */
	currentSnapshot;
	/** Projection subscribers (plain cell: bundles hold live session sources, so no store freeze may touch them). */
	listeners = /* @__PURE__ */ new Set();
	/**
	* Atomic current-session provide projection: selection changes and
	* provider-roster changes publish through this one source, so a roster
	* change under a stable current id republishes the bundle instead of
	* stranding mounted entries.
	*/
	currentProvideInfo;
	/**
	* @param host - owner-side bundle storage and current-selection resolution.
	*/
	constructor(host) {
		this.host = host;
		this.providers.push({
			hooks: ["session"],
			resolve: (binding) => ({ hooks: { session: binding.session } })
		});
		this.maybeInfoCache = this.materializeMaybeInfo();
		this.currentSnapshot = this.maybeInfoCache;
		this.currentProvideInfo = {
			getSnapshot: () => this.currentSnapshot,
			subscribe: (fn) => {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			}
		};
	}
	/** The static no-session projection under the current roster (declared names present, values undefined). */
	get maybeInfo() {
		return this.maybeInfoCache;
	}
	/**
	* Register a per-session standard-props provider (see
	* SessionRuntime.provide for the product contract). Live bundles rebuild
	* immediately; misdeclared providers fail loud here, at the registration
	* edge, and the registration rolls back — the channel never stays on a
	* roster it cannot materialize.
	* @param descriptor - static member roster plus per-session resolver.
	* @returns disposer removing the provider.
	*/
	provide(descriptor) {
		this.providers.push(descriptor);
		try {
			this.applyRosterChange();
		} catch (error) {
			this.providers.splice(this.providers.indexOf(descriptor), 1);
			this.applyRosterChange();
			throw error;
		}
		return () => {
			const at = this.providers.indexOf(descriptor);
			if (at >= 0) this.providers.splice(at, 1);
			this.applyRosterChange();
		};
	}
	/**
	* Re-derive the current selection's bundle and publish it when it changed.
	* Bundles are identity-stable per (scope, roster) materialization, so an
	* identity compare is exact; synchronous notify — call sites (the owner's
	* list subscription, provide()) already sit behind their own batching or
	* registration edges.
	*/
	publishCurrent() {
		const next = this.host.resolveCurrent();
		if (next === this.currentSnapshot) return;
		this.currentSnapshot = next;
		for (const fn of [...this.listeners]) try {
			fn();
		} catch (error) {
			console.error("sessions.currentProvideInfo subscriber failed:", error);
		}
	}
	/**
	* Materialize the standard-props bundle for one session (fails loud on
	* undeclared, missing, and duplicate member names).
	* @param binding - session assembly handle fed to every resolver.
	* @returns the materialized bundle (identity-stable until the next materialization).
	*/
	materializeInfo(binding) {
		const hooks = {};
		const props = {};
		for (const descriptor of this.providers) {
			const contribution = descriptor.resolve(binding);
			const contributedHooks = contribution.hooks ?? {};
			const contributedProps = contribution.props ?? {};
			for (const name$1 of Object.keys(contributedHooks)) if (!(descriptor.hooks ?? []).includes(name$1)) throw new Error(`sessions.provide: undeclared hook "${name$1}"`);
			for (const name$1 of Object.keys(contributedProps)) if (!(descriptor.props ?? []).includes(name$1)) throw new Error(`sessions.provide: undeclared prop "${name$1}"`);
			for (const name$1 of descriptor.hooks ?? []) {
				const source = contributedHooks[name$1];
				if (source === void 0) throw new Error(`sessions.provide: missing hook "${name$1}"`);
				if (Object.hasOwn(hooks, name$1)) throw new Error(`sessions.provide: duplicate hook "${name$1}"`);
				hooks[name$1] = source;
			}
			for (const name$1 of descriptor.props ?? []) {
				if (!Object.hasOwn(contributedProps, name$1)) throw new Error(`sessions.provide: missing prop "${name$1}"`);
				if (Object.hasOwn(props, name$1)) throw new Error(`sessions.provide: duplicate prop "${name$1}"`);
				props[name$1] = contributedProps[name$1];
			}
		}
		return {
			sessionId: binding.sessionId,
			hooks,
			props,
			projections: { faceOf: (key) => binding.session.projections.faceOf(key) }
		};
	}
	/** Rebuild the static projection and the owner's live bundles, then republish the current one. */
	applyRosterChange() {
		this.maybeInfoCache = this.materializeMaybeInfo();
		this.host.rebuildBundles();
		this.publishCurrent();
	}
	/** Build the static no-session kit and reject duplicate declared names. */
	materializeMaybeInfo() {
		const hooks = {};
		const props = {};
		for (const descriptor of this.providers) {
			for (const name$1 of descriptor.hooks ?? []) {
				if (Object.hasOwn(hooks, name$1)) throw new Error(`sessions.provide: duplicate hook "${name$1}"`);
				hooks[name$1] = void 0;
			}
			for (const name$1 of descriptor.props ?? []) {
				if (Object.hasOwn(props, name$1)) throw new Error(`sessions.provide: duplicate prop "${name$1}"`);
				props[name$1] = void 0;
			}
		}
		return {
			sessionId: void 0,
			hooks,
			props
		};
	}
};

//#endregion
//#region vendor/client-runtime/client/sessions/service.js
/** Structured session-create failure. */
var SessionCreateError = class extends Error {
	rpcError;
	requestedSessionId;
	name = "SessionCreateError";
	/**
	* @param rpcError - Host business or folded transport error.
	* @param requestedSessionId - caller-preallocated id used for later stream/list reconciliation.
	*/
	constructor(rpcError, requestedSessionId) {
		super(`session create failed: ${rpcError.code}: ${rpcError.message}`);
		this.rpcError = rpcError;
		this.requestedSessionId = requestedSessionId;
	}
};
/** Structured session-fork failure. */
var SessionForkError = class extends Error {
	rpcError;
	sourceSessionId;
	name = "SessionForkError";
	/**
	* @param rpcError - Host business or folded transport error.
	* @param sourceSessionId - the session the fork was cut from.
	*/
	constructor(rpcError, sourceSessionId) {
		super(`session fork failed: ${rpcError.code}: ${rpcError.message}`);
		this.rpcError = rpcError;
		this.sourceSessionId = sourceSessionId;
	}
};
/**
* Workspace display title of a session cwd: the path's last non-empty
* segment (both separators accepted; trailing separators ignored), or ''
* for separator-only paths — callers own their fallback (session id, raw
* cwd, default-directory copy). The repo-wide single basename derivation —
* every surface naming a workspace (picker rows, toggle labels, list titles)
* calls this instead of re-splitting paths.
* @param cwd - workspace directory path.
* @returns basename title, or '' when no non-empty segment exists.
*/
function workspaceTitleOf(cwd) {
	return cwd.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? "";
}
/**
* Display title projection: durable title, project directory basename, then
* the raw id.
*/
function displayTitleOf(title, cwd, id) {
	if (title !== void 0) return title;
	if (cwd !== void 0 && cwd !== "") {
		const base = workspaceTitleOf(cwd);
		if (base !== "") return base;
	}
	return id;
}
/**
* Increment a trailing fork number while preserving its half-width or
* full-width parentheses; an unnumbered title starts with ` (1)`.
* @param title - source session's durable title.
* @returns the title assigned to the fork child.
*/
function increasedForkTitle(title) {
	const ascii = /^(.*?)\((\d+)\)$/u.exec(title);
	if (ascii?.[1] !== void 0 && ascii[2] !== void 0) return `${ascii[1]}(${BigInt(ascii[2]) + 1n})`;
	const fullWidth = /^(.*?)（(\d+)）$/u.exec(title);
	if (fullWidth?.[1] !== void 0 && fullWidth[2] !== void 0) return `${fullWidth[1]}（${BigInt(fullWidth[2]) + 1n}）`;
	return `${title} (1)`;
}
/** Root sessions service: list store, current selection, object-layer manager, scope tree, bindings, and breadcrumb routes. */
var SessionRuntime = class {
	rootCtx;
	/**
	* The wire schema's own result bound, re-exposed for presentation plugins as
	* injected data. Not per-connection state: the `session.search` response
	* schema caps `items` at this constant, so every transport (fixture included)
	* reports the same number.
	*/
	searchResultLimit = SESSION_SEARCH_RESULT_LIMIT;
	/** List snapshot store (list RPC + host stream increments; re-pulled on reconnect) — the useSessions standard feed, current included. */
	list;
	/** The object-layer instance cluster and frame dispatch entry. */
	manager;
	/**
	* Atomic current-session provide projection: selection changes and
	* provider-roster changes publish through this one source (the renderer
	* host's `sessions.provide` feed), so a roster change under a stable
	* current id republishes the bundle instead of stranding mounted entries.
	*/
	currentProvideInfo;
	/**
	* Persisted selection cell (the durable half of `list.current`). Private on
	* purpose: reads go through the list snapshot; writes through {@link
	* SessionRuntime.open} / {@link SessionRuntime.clear}. Projection
	* validates it against the live list instead of destructively pruning, so a
	* selection survives transient list states (reconnect re-pull) and
	* resurfaces when its session returns.
	*/
	selection;
	scopes = /* @__PURE__ */ new Map();
	/** The provide channel (roster, materialization rules, current projection) — shared with the test runtime's double. */
	provideChannel;
	/**
	* The staged session id — follows `list.current` exactly, holding its last
	* defined value across masked gaps (a transiently absent selection blanks
	* `current` without moving the stage, so reconnect re-pulls and removals
	* keep the staged scope's frozen view alive until the stage moves on).
	*/
	watched;
	/** Removed-while-staged sessions whose teardown waits for the stage to move away. */
	deferredRemovals = /* @__PURE__ */ new Set();
	/**
	* @param ctx - client root context (scope fibers mount under it).
	* @param api - wire client shared with every Session.
	* @param remote - generated Remote namespaces shared with every Session.
	* @param conversationRuntime - same-pass registry instances, when runtime apply owns them.
	*/
	constructor(rootCtx, api, remote, conversationRuntime) {
		this.rootCtx = rootCtx;
		this.selection = createSnapshotStore({}, { persist: { name: "dsh.sessions.current" } });
		const restored = this.selection.getSnapshot();
		const conversationEvents = rootCtx.get("conversationEvents");
		const conversationViews = rootCtx.get("conversationViews");
		const conversation = conversationRuntime ?? (conversationEvents === void 0 || conversationViews === void 0 ? void 0 : {
			events: conversationEvents,
			views: conversationViews
		});
		this.manager = new SessionManager(api, remote, restored.sessionId, restored.subagentAddress, conversation);
		this.list = createSnapshotStore({
			ids: [],
			byId: {},
			current: void 0,
			phase: "pending",
			subagentsByParent: {},
			jobsBySession: {},
			currentAddress: void 0
		});
		this.manager.subscribe(() => {
			this.projectList();
		});
		this.list.subscribe(() => {
			this.followCurrent();
			this.provideChannel.publishCurrent();
		});
		this.provideChannel = new SessionProvideChannel({
			rebuildBundles: () => {
				for (const record of this.scopes.values()) record.provideInfo = this.provideChannel.materializeInfo(record.binding);
			},
			resolveCurrent: () => this.maybeProvideInfo(this.list.getSnapshot().current)
		});
		this.currentProvideInfo = this.provideChannel.currentProvideInfo;
		let registryRebuildQueued = false;
		const scheduleRegistryRebuild = () => {
			if (registryRebuildQueued) return;
			registryRebuildQueued = true;
			queueMicrotask(() => {
				registryRebuildQueued = false;
				this.manager.rebuildConversationRegistry();
			});
		};
		if (conversation !== void 0) rootCtx.effect(() => {
			const disposeEvents = conversation.events.subscribe(scheduleRegistryRebuild);
			const disposeViews = conversation.views.subscribe(scheduleRegistryRebuild);
			return () => {
				disposeEvents();
				disposeViews();
			};
		}, "sessions: conversation registry rebuild");
		rootCtx.reflect.provide("sessions", this, void 0);
	}
	/**
	* Register a per-session standard-props provider: every session-scope slot
	* component receives the contributed members as standard props (`hooks`
	* sources become `use<Name>` selector hooks on the render side; `props`
	* spread verbatim). Contributions materialize lazily with the session's
	* scope record and die with it. Registration order is resolution order;
	* duplicate member names fail loud at materialization.
	* @param descriptor - static member roster plus per-session resolver.
	* @returns disposer removing the provider (already-materialized bundles keep their members until their scope drops).
	*/
	provide(descriptor) {
		return this.provideChannel.provide(descriptor);
	}
	/**
	* Select a listed or retained catalog-addressed session as current.
	* @param id - listed or addressed session id.
	*/
	open(id) {
		this.manager.select(id);
	}
	/**
	* Open a healthy catalog child through its direct-parent address.
	* @param address - catalog-derived parent and child ids.
	*/
	openSubagent(address) {
		this.manager.selectSubagent(address);
	}
	/**
	* Resolve an already discovered direct-parent address without opening it.
	* Feature plugins use this to avoid Agent-bound RPCs in persisted child views.
	* @param id - possible addressed child id.
	* @returns The retained address, when present.
	*/
	subagentAddress(id) {
		return this.manager.subagentAddress(id);
	}
	/**
	* Inform the runtime whether a catalog menu is consuming membership updates.
	* @param parentSessionId - selected parent.
	* @param open - menu state.
	*/
	setSubagentCatalogOpen(parentSessionId, open$1) {
		this.manager.setSubagentCatalogOpen(parentSessionId, open$1);
	}
	/**
	* Refresh one direct-child catalog.
	* @param parentSessionId - catalog owner.
	*/
	refreshSubagents(parentSessionId) {
		return this.manager.refreshSubagents(parentSessionId);
	}
	noteAgentPreset(sessionId, agentPreset) {
		this.manager.noteAgentPreset(sessionId, agentPreset);
	}
	/**
	* Clear the current selection so the layout shows the no-session empty
	* state (new-session affordance and the workspace preselection flow).
	* Wipes the persisted selection too — a reload stays on empty until the
	* user opens or starts a session. The staged scope keeps its frozen view
	* per the masked-gap contract until the next open() moves the stage.
	*/
	clear() {
		this.manager.clearSelection();
	}
	/**
	* Refresh the real Session baseline, reusing an in-flight pull.
	* @returns completion of the current or newly started baseline pull.
	*/
	refresh() {
		return this.manager.refreshList();
	}
	/**
	* Search the Host's visible message-content index. Results stay
	* request-local; the list snapshot remains the metadata authority.
	* @param query - non-blank literal phrase.
	* @param signal - cancellation for a superseded search.
	* @returns bounded results or a business/transport error.
	*/
	search(query, signal) {
		return this.manager.search(query, signal);
	}
	/**
	* Route a mux stream envelope into the Session object layer.
	* @param envelope - validated mux stream envelope.
	*/
	handleMuxEnvelope(envelope) {
		this.manager.handleMuxEnvelope(envelope);
	}
	/**
	* Route a Host stream envelope into the Session object layer.
	* @param envelope - validated Host stream envelope.
	*/
	handleHostEnvelope(envelope) {
		this.manager.handleHostEnvelope(envelope);
	}
	/** Rebuild the Session baseline and every opened window after connection. */
	handleConnected() {
		this.manager.handleConnected();
	}
	/** Drop generation-scoped live interaction state the moment a connection generation dies. */
	handleDisconnected() {
		this.manager.handleDisconnected();
	}
	/**
	* Create a session on the host. Resolution guarantee: by the time the
	* promise resolves, the created session is in the list store and
	* {@link SessionRuntime.binding} resolves it — callers (New Session
	* draft hand-off) may address the scope synchronously, without waiting a
	* notifier flush. The synchronous projection below makes this structural
	* rather than an accident of microtask ordering.
	* @param opts - target workspace or directory and an optional preallocated id.
	* @returns the new session id.
	* @throws {SessionCreateError} with the requested id.
	*/
	async create(opts = {}) {
		const result = await this.manager.create(opts);
		if (!result.ok) throw new SessionCreateError(result.error, opts.sessionId);
		this.projectList();
		return result.value.sessionId;
	}
	/**
	* Fork a session from a completed-turn prefix of the source (same
	* synchronous-addressability guarantee as {@link SessionRuntime.create}:
	* on resolution the child is in the list store and open() can target it).
	* @param opts - source session id, the optional event seq anchoring the
	*   cut (the boundary is the first turn/end at or after it; an in-log
	*   anchor in an open turn is unavailable rather than clipped backward),
	*   and whether to increment an inherited durable title before resolving.
	*   A fractional anchor floors to a real event seq: the frozen nodes of an
	*   interrupted turn carry flow-ordering seqs between two events, and the
	*   wire takes integers only.
	* @returns the child session id.
	* @throws {SessionForkError} with the source id.
	* @throws {Error} when a requested child-title rename fails after creation.
	*/
	async fork(opts) {
		const sourceTitle = opts.increaseTitle ? this.list.getSnapshot().byId[opts.sessionId]?.title : void 0;
		const result = await this.manager.fork({
			sessionId: opts.sessionId,
			...opts.atSeq === void 0 ? {} : { atSeq: Math.floor(opts.atSeq) }
		});
		if (!result.ok) throw new SessionForkError(result.error, opts.sessionId);
		this.projectList();
		const childId = result.value.sessionId;
		if (sourceTitle !== void 0) {
			const child = this.binding(childId)?.session;
			if (child === void 0) throw new Error(`fork child "${childId}" is not locally addressable`);
			const renamed = await child.rename(increasedForkTitle(sourceTitle));
			if (!renamed.ok) throw new Error(`fork child rename failed: ${renamed.error.code}: ${renamed.error.message}`);
		}
		return childId;
	}
	/**
	* Resolve an Agent-scoped context view (use-and-discard).
	* @param id - session id (the agent identity — 1:1 same axis).
	* @returns scoped ctx, or undefined for a session neither listed nor already scoped.
	*/
	scope(id) {
		return this.resolve(id)?.ctx;
	}
	/**
	* Read the Agent scope tag off a context. Service-method boundary: fetch
	* bundles must reach scope resolution through ctx.sessions — a cross-bundle
	* value import of the standalone helper would inline a second module
	* instance whose private tag Symbol never matches.
	* @param ctx - any client context.
	* @returns the session id, or undefined on root contexts.
	*/
	scopeOf(ctx) {
		return scopeOf(ctx);
	}
	/**
	* Resolve the business Session behind an Agent-scoped context — the one
	* hop every scoped consumer (event listeners, per-session controllers)
	* takes from ctx-space into object-space (the client mirror of host
	* `agent.session`). Same service-method boundary as
	* {@link SessionRuntime.scopeOf}.
	* @param ctx - an Agent-scoped context.
	* @returns the session face, or undefined when the ctx is untagged or its scope was pruned.
	*/
	sessionOf(ctx) {
		const id = scopeOf(ctx);
		if (id === void 0) return void 0;
		return this.scopes.get(id)?.binding.session;
	}
	/**
	* Resolve the stable session binding (scope-addressed assembly feed). Pure
	* resolution — no staging, no window side effects.
	* @param id - session id.
	* @returns binding, or undefined for a session neither listed nor already scoped.
	*/
	binding(id) {
		return this.resolve(id)?.binding;
	}
	/**
	* Resolve one session's render-layer standard-props bundle (ctx never
	* enters the render layer; the renderer subscribes to
	* {@link SessionRuntime.currentProvideInfo}). Pure resolution — render-safe:
	* no staging, no window side effects (StrictMode double-invokes and
	* concurrent discarded passes must stay free).
	*/
	provideInfo(id) {
		return this.resolve(id)?.provideInfo;
	}
	/**
	* Resolve the current-session-optional standard kit. Unknown or absent ids
	* return the static no-session projection rather than removing hook props.
	*/
	maybeProvideInfo(id) {
		return (id === void 0 ? void 0 : this.provideInfo(id)) ?? this.provideChannel.maybeInfo;
	}
	/**
	* Move the stage to the list's current session: sweep teardowns deferred
	* behind the previous occupant and pull the new occupant's history window.
	* Staging IS the open signal — the window opens ⟺ the session is on stage
	* — and open() is idempotent (an in-flight or completed open no-ops; a
	* failed one retries the next time current is touched).
	*/
	followCurrent() {
		const snapshot = this.list.getSnapshot();
		const current = snapshot.current;
		if (current === void 0 || snapshot.byId[current] === void 0 || current === this.watched) return;
		this.watched = current;
		this.sweepDeferred();
		const record = this.resolve(current);
		/* v8 ignore next 3 -- defensive: current is always a listed id (open()
		* validates and the projection masks absent selections), so resolve
		* cannot miss; kept so a future current writer cannot crash the notify. */
		if (record !== void 0) {
			record.session.open();
			this.manager.refreshSubagents(current);
		}
	}
	/**
	* Lazily mint the scope + binding for an eligible session. Eligibility and
	* prune share one predicate: listed on the host or selected
	* through a retained subagent address. Breadcrumb-only ancestors remain
	* summary data and do not keep scopes alive.
	*/
	resolve(id) {
		const existing = this.scopes.get(id);
		if (existing !== void 0) return existing;
		if (!this.eligible(id)) return void 0;
		const { fiber, ctx } = createScope(this.rootCtx, id);
		const session = this.manager.get(id);
		session.bindScope(ctx);
		const binding = {
			sessionId: id,
			session,
			ctx
		};
		const record = {
			fiber,
			ctx,
			binding,
			session,
			provideInfo: this.provideChannel.materializeInfo(binding)
		};
		this.scopes.set(id, record);
		return record;
	}
	/** The one aliveness predicate shared by scope mint and prune: host-listed or currently addressed. */
	eligible(id) {
		const { ids, current } = this.list.getSnapshot();
		return current === id || ids.includes(id);
	}
	/** Project the manager's list snapshot into the store (title derivation is display-only). */
	projectList() {
		const { items, current, phase, subagentsByParent, jobsBySession, currentAddress } = this.manager.getListSnapshot();
		const ids = [];
		const byId = {};
		for (const entry of items) {
			ids.push(entry.sessionId);
			byId[entry.sessionId] = {
				id: entry.sessionId,
				displayTitle: displayTitleOf(entry.title, entry.cwd, entry.sessionId),
				running: entry.running,
				...entry.completed ? { completed: true } : {},
				blank: entry.blank,
				updatedAt: entry.updatedAt,
				...entry.pendingInteraction === void 0 ? {} : { pendingInteraction: entry.pendingInteraction },
				...entry.projectionValues === void 0 ? {} : { projectionValues: entry.projectionValues },
				...entry.title !== void 0 ? { title: entry.title } : {},
				...entry.cwd !== void 0 ? { cwd: entry.cwd } : {},
				...entry.parentSessionId !== void 0 ? { parentId: entry.parentSessionId } : {},
				...entry.origin !== void 0 ? { origin: entry.origin } : {},
				...entry.agentPreset !== void 0 ? { agentPreset: entry.agentPreset } : {}
			};
		}
		if (current !== void 0 && currentAddress !== void 0) {
			const seen = /* @__PURE__ */ new Set();
			let address = currentAddress;
			while (address !== void 0 && !seen.has(address.childSessionId)) {
				const childId = address.childSessionId;
				seen.add(childId);
				const child = subagentsByParent[address.parentSessionId]?.entries.find((entry) => entry.kind === "child" && entry.id === childId);
				if (child?.kind !== "child") break;
				const displayTitle = child.label ?? childId;
				const summary = byId[childId];
				if (summary === void 0) byId[childId] = {
					id: childId,
					displayTitle,
					parentId: address.parentSessionId,
					origin: "subagent",
					running: child.activity === "running",
					blank: false,
					updatedAt: 0
				};
				else if (summary.displayTitle !== displayTitle) byId[childId] = {
					...summary,
					displayTitle
				};
				const parent = byId[address.parentSessionId];
				if (parent !== void 0 && parent.origin !== "subagent") break;
				address = this.manager.navigationAddress(address.parentSessionId);
			}
		}
		const persisted = this.selection.getSnapshot().sessionId;
		if (current === void 0) {
			if (persisted !== void 0) this.selection.set({});
		} else if (byId[current] !== void 0 && (persisted !== current || this.selection.getSnapshot().subagentAddress?.childSessionId !== currentAddress?.childSessionId || this.selection.getSnapshot().subagentAddress?.parentSessionId !== currentAddress?.parentSessionId || this.selection.getSnapshot().subagentAddress?.mode !== currentAddress?.mode)) this.selection.set({
			sessionId: current,
			...currentAddress === void 0 ? {} : { subagentAddress: currentAddress }
		});
		this.list.set({
			ids,
			byId,
			current,
			phase,
			subagentsByParent,
			jobsBySession,
			currentAddress
		});
		this.pruneScopes();
	}
	/** Tear down scope + instance for no-longer-eligible sessions off stage; the staged one defers until the stage moves. */
	pruneScopes() {
		for (const [id, record] of this.scopes) {
			if (this.eligible(id)) continue;
			if (id === this.watched) {
				this.deferredRemovals.add(id);
				continue;
			}
			this.scopes.delete(id);
			this.deferredRemovals.delete(id);
			this.dropScope(id, record);
		}
	}
	/**
	* One teardown for the whole per-session axis: the scope
	* fiber (cascading every actx-registered effect: input shell, slash
	* controller, popup, plugin stores, listeners), the session-keyed slot
	* stores, and the Session instance itself — the host session log is the
	* durable truth, a reopen lazily rebuilds and backfills via open().
	*/
	dropScope(id, record) {
		record.fiber.dispose();
		record.session.unbindScope();
		this.rootCtx.get("slots")?.pruneStoreScope(id);
		this.manager.drop(id);
	}
	/** Run deferred teardowns whose session is no longer staged (called when the stage moves). */
	sweepDeferred() {
		for (const id of [...this.deferredRemovals]) {
			/* v8 ignore next -- defensive: only the staged id ever defers, and every
			* stage move sweeps first, so the set cannot contain the id the stage just
			* moved to; kept as a guard against future extra sweep call sites. */
			if (id === this.watched) continue;
			if (this.eligible(id)) {
				this.deferredRemovals.delete(id);
				continue;
			}
			const record = this.scopes.get(id);
			this.deferredRemovals.delete(id);
			/* v8 ignore next -- defensive: prune deletes a scope and its deferral
			* together, so a deferred id always still owns its record; kept so a
			* future teardown path cannot double-dispose. */
			if (record !== void 0) {
				this.scopes.delete(id);
				this.dropScope(id, record);
			}
		}
	}
};

//#endregion
//#region vendor/client-runtime/client/workspaces/workspace.js
/**
* Observable Workspace object whose identity survives Host materialization.
* Local instances retain their create input and failure state; materialized
* instances expose the latest Host view.
*/
var Workspace = class {
	api;
	view;
	intent;
	materialization = null;
	snapshotCache;
	notifier = new Notifier(() => {
		this.snapshotCache = this.buildSnapshot();
	});
	/**
	* @param api - shared wire client.
	* @param source - local create input or an existing Host Workspace view.
	*/
	constructor(api, source) {
		this.api = api;
		if ("workspaceId" in source) this.view = source;
		else this.intent = {
			input: source,
			snapshot: {
				name: intentName(source),
				phase: "ready"
			}
		};
		this.snapshotCache = this.buildSnapshot();
	}
	/**
	* Materialize this local Workspace through the Host create API.
	* Re-entry shares the in-flight completion; a materialized instance returns undefined.
	* @returns the Host result, or undefined when this Workspace is already materialized.
	*/
	materialize() {
		if (this.materialization !== null) return this.materialization;
		const intent = this.intent;
		if (intent === void 0) return void 0;
		intent.snapshot = {
			name: intent.snapshot.name,
			phase: "creating"
		};
		this.notifier.notifyNow();
		const completion = this.completeMaterialization(intent).finally(() => {
			if (this.materialization === completion) this.materialization = null;
		});
		this.materialization = completion;
		return completion;
	}
	/**
	* Adopt a Host view without replacing this Workspace object.
	* An existing materialized identity accepts updates only for the same Workspace id.
	* @param view - latest Host projection.
	*/
	adopt(view) {
		if (this.view !== void 0 && this.view.workspaceId !== view.workspaceId) throw new Error("cannot adopt a different Workspace id");
		this.view = view;
		this.intent = void 0;
		this.notifier.markDirty();
	}
	/**
	* Subscribe to Workspace snapshot invalidation.
	* @param listener - snapshot invalidation callback.
	* @returns unsubscribe function.
	*/
	subscribe(listener) {
		return this.notifier.subscribe(listener);
	}
	/**
	* Read the cached Workspace snapshot after flushing pending notifications.
	* @returns the cached Workspace snapshot.
	*/
	getSnapshot() {
		this.notifier.ensureFresh();
		return this.snapshotCache;
	}
	async completeMaterialization(intent) {
		let result;
		try {
			result = (await this.api.workspace.create(intent.input)).result;
		} catch (error) {
			result = transportError(error);
		}
		if (this.intent !== intent) return result;
		if (result.ok) this.adopt(result.value.workspace);
		else {
			intent.snapshot = {
				name: intent.snapshot.name,
				phase: "ready",
				error: `${result.error.code}: ${result.error.message}`
			};
			this.notifier.markDirty();
		}
		return result;
	}
	buildSnapshot() {
		return {
			view: this.view,
			intent: this.intent?.snapshot
		};
	}
};
function intentName(input) {
	return input.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? input.path;
}

//#endregion
//#region vendor/client-runtime/client/workspaces/manager.js
/** Workspace object cluster driven by one list baseline and changed-frame upserts. */
var WorkspaceManager = class {
	api;
	items = [];
	itemViewsSource = null;
	itemViewsCache = [];
	archivedSessionIds = [];
	state = "idle";
	phase = "pending";
	error = null;
	inflight = null;
	refreshFrames = null;
	/**
	* True once a frame or unary echo installed the archive set while a list
	* request was in flight: that install is newer than the pending baseline,
	* so the baseline's (older) set must not roll it back — the archive
	* mirror of replaying refreshFrames over the item baseline.
	*/
	archivedSupersedesRefresh = false;
	/** Latest local reorder request; only its unary echo may install order. */
	orderRequestGeneration = 0;
	/** Increments on order frames so a later remote commit outranks an older unary echo. */
	orderFrameGeneration = 0;
	/** Last complete order accepted from a Host baseline, frame, or current unary echo. */
	committedOrder = [];
	/**
	* Ids this process has seen removed, kept for the connection's lifetime so
	* a late changed frame or a stale baseline row cannot resurrect a deleted
	* row. Correctness rests on Host ids never being reused (the registry mints
	* a fresh `randomUUID` per record, including when the same directory is
	* registered again) — a path-derived id scheme would turn these entries
	* into permanent blindfolds and must clear them instead.
	*/
	removedIds = /* @__PURE__ */ new Set();
	snapshotCache;
	notifier = new Notifier(() => {
		this.snapshotCache = this.buildSnapshot();
	});
	/** @param api - shared wire client. */
	constructor(api) {
		this.api = api;
		this.snapshotCache = this.buildSnapshot();
	}
	/**
	* Refresh from workspace.list. The first successful response establishes
	* Host order; later responses re-establish the durable order so reconnects
	* adopt reorders committed while this client was offline. Frames arriving
	* during the RPC are replayed over its response.
	* @returns the shared in-flight refresh.
	*/
	refresh() {
		if (this.inflight !== null) return this.inflight;
		this.state = "loading";
		this.error = null;
		const frames = [];
		this.refreshFrames = frames;
		this.notifier.markDirty();
		this.inflight = (async () => {
			try {
				const { result } = await this.api.workspace.list({});
				if (result.ok) {
					let items = result.value.items;
					items = items.filter((workspace) => !this.removedIds.has(workspace.workspaceId));
					for (const delta of frames) items = applyWorkspaceDelta(items, delta);
					this.installViews(items);
					if (!this.archivedSupersedesRefresh) this.installArchived(result.value.archivedSessionIds);
					this.state = "idle";
					this.phase = "ready";
				} else {
					this.state = "error";
					this.error = result.error;
				}
			} catch (error) {
				this.state = "error";
				const folded = transportError(error);
				/* v8 ignore next -- transportError always returns the failure branch. */
				this.error = folded.ok ? null : folded.error;
			} finally {
				this.refreshFrames = null;
				this.archivedSupersedesRefresh = false;
				this.inflight = null;
				this.notifier.markDirty();
			}
		})();
		return this.inflight;
	}
	/**
	* Create or resolve a real Workspace, then publish its returned snapshot
	* without waiting for the changed frame.
	* @param input - the existing absolute path to adopt.
	* @returns the wire result.
	*/
	async create(input) {
		const workspace = new Workspace(this.api, input);
		const completion = workspace.materialize();
		if (completion === void 0) throw new Error("a local Workspace must be materializable");
		const result = await completion;
		if (result.ok) this.upsert(result.value.workspace, workspace);
		return result;
	}
	/**
	* Rename a Workspace, then publish its returned snapshot without waiting
	* for the changed frame.
	* @param workspaceId - target workspace.
	* @param title - new display title.
	* @returns the wire result.
	*/
	async rename(workspaceId, title) {
		const { result } = await this.api.workspace.rename({
			workspaceId,
			title
		});
		if (result.ok) this.upsert(result.value.workspace);
		return result;
	}
	/**
	* Delete a Workspace registration and remove its local projection from the
	* unary response without waiting for the Host frame.
	* @param workspaceId - target workspace.
	* @returns the wire result.
	*/
	async delete(workspaceId) {
		const { result } = await this.api.workspace.delete({ workspaceId });
		if (result.ok) this.remove(workspaceId, true);
		return result;
	}
	/**
	* Move a Workspace within the registry display order and install the full
	* returned order without waiting for the Host frame.
	* @param workspaceId - Workspace to move.
	* @param beforeWorkspaceId - Anchor workspace; omitted appends.
	* @returns the wire result.
	*/
	async insertBefore(workspaceId, beforeWorkspaceId) {
		const requestGeneration = ++this.orderRequestGeneration;
		const frameGeneration = this.orderFrameGeneration;
		const localOrder = this.itemViews().map((workspace) => workspace.workspaceId);
		this.installOrder(insertIdBefore(localOrder, workspaceId, beforeWorkspaceId));
		let result;
		try {
			({result} = await this.api.workspace.insertBefore({
				workspaceId,
				...beforeWorkspaceId === void 0 ? {} : { beforeWorkspaceId }
			}));
		} catch (error) {
			if (requestGeneration === this.orderRequestGeneration && frameGeneration === this.orderFrameGeneration) this.installOrder(this.committedOrder);
			throw error;
		}
		if (result.ok && requestGeneration === this.orderRequestGeneration && frameGeneration === this.orderFrameGeneration) this.installOrder(result.value.workspaceIds, true);
		else if (!result.ok && requestGeneration === this.orderRequestGeneration && frameGeneration === this.orderFrameGeneration) this.installOrder(this.committedOrder);
		return result;
	}
	/**
	* Move a session within its Workspace's manual order, then publish the
	* returned snapshot without waiting for the changed frame.
	* @param workspaceId - owning workspace.
	* @param sessionId - accounted session to move.
	* @param beforeSessionId - accounted anchor to insert before; omitted appends.
	* @returns the wire result.
	*/
	async insertSessionBefore(workspaceId, sessionId, beforeSessionId) {
		const { result } = await this.api.workspace.insertSessionBefore({
			workspaceId,
			sessionId,
			...beforeSessionId === void 0 ? {} : { beforeSessionId }
		});
		if (result.ok) this.upsert(result.value.workspace);
		return result;
	}
	/**
	* Archive one session in the registry-global set, then install the
	* returned full set without waiting for the changed frame.
	* @param sessionId - session to archive.
	* @returns the wire result.
	*/
	async archiveSession(sessionId) {
		const { result } = await this.api.workspace.archiveSession({ sessionId });
		if (result.ok) this.installArchived(result.value.archivedSessionIds);
		return result;
	}
	/**
	* Host-frame entry. Non-workspace frames are ignored so the runtime can
	* fan one host stream out to both object managers.
	* @param envelope - host stream envelope.
	*/
	handleHostEnvelope(envelope) {
		if (envelope.payload.type === "host/workspace-changed") this.upsert(envelope.payload.workspace);
		else if (envelope.payload.type === "host/workspace-removed") this.remove(envelope.payload.workspaceId);
		else if (envelope.payload.type === "host/workspace-order-changed") {
			this.orderFrameGeneration++;
			this.installOrder(envelope.payload.workspaceIds, true);
		} else if (envelope.payload.type === "host/archived-sessions-changed") this.installArchived(envelope.payload.archivedSessionIds);
	}
	/** Re-pull the baseline after each connection generation. */
	handleConnected() {
		this.refresh();
	}
	/**
	* Subscribe to workspace snapshot invalidation.
	* @param listener - snapshot invalidation callback.
	* @returns unsubscribe function.
	*/
	subscribe(listener) {
		return this.notifier.subscribe(listener);
	}
	/**
	* Read the cached workspace snapshot after flushing pending notifications.
	* @returns the cached workspace snapshot.
	*/
	getSnapshot() {
		this.notifier.ensureFresh();
		return this.snapshotCache;
	}
	buildSnapshot() {
		return {
			items: this.itemViews(),
			archivedSessionIds: this.archivedSessionIds,
			state: this.state,
			phase: this.phase,
			error: this.error
		};
	}
	/**
	* Replace the archive set when membership actually changed (array identity
	* backs Object.is short-circuits). Host snapshots are append-ordered, so
	* positional comparison is exact, not merely heuristic.
	*/
	installArchived(archivedSessionIds) {
		if (this.refreshFrames !== null) this.archivedSupersedesRefresh = true;
		if (archivedSessionIds.length === this.archivedSessionIds.length && archivedSessionIds.every((id, index) => id === this.archivedSessionIds[index])) return;
		this.archivedSessionIds = [...archivedSessionIds];
		this.notifier.markDirty();
	}
	/** Reorder known Workspace objects, optionally recording a Host-committed sequence. */
	installOrder(workspaceIds, committed = false) {
		if (committed) {
			this.refreshFrames?.push({
				type: "order",
				workspaceIds
			});
			this.committedOrder = [...workspaceIds];
		}
		const rank = new Map(workspaceIds.map((id, index) => [id, index]));
		const items = [...this.items].sort((left, right) => {
			const leftId = left.getSnapshot().view?.workspaceId;
			const rightId = right.getSnapshot().view?.workspaceId;
			return (leftId === void 0 ? Number.MAX_SAFE_INTEGER : rank.get(leftId) ?? Number.MAX_SAFE_INTEGER) - (rightId === void 0 ? Number.MAX_SAFE_INTEGER : rank.get(rightId) ?? Number.MAX_SAFE_INTEGER);
		});
		if (items.every((item, index) => item === this.items[index])) return;
		this.items = items;
		this.notifier.markDirty();
	}
	/** Upsert one Host view, optionally retaining the local object that materialized it. */
	upsert(view, identity) {
		if (this.removedIds.has(view.workspaceId)) return;
		this.refreshFrames?.push({
			type: "upsert",
			workspace: view
		});
		const index = this.items.findIndex((item) => item.getSnapshot().view?.workspaceId === view.workspaceId);
		const installed = index === -1 ? void 0 : this.items[index]?.getSnapshot().view;
		if (installed !== void 0 && Date.parse(view.updatedAt) < Date.parse(installed.updatedAt)) return;
		if (!this.committedOrder.includes(view.workspaceId)) this.committedOrder = [view.workspaceId, ...this.committedOrder];
		if (identity !== void 0) this.items = index === -1 ? [identity, ...this.items] : this.items.map((item, position) => position === index ? identity : item);
		else if (index === -1) this.items = [new Workspace(this.api, view), ...this.items];
		else {
			this.items[index]?.adopt(view);
			this.items = [...this.items];
		}
		this.notifier.markDirty();
	}
	/** Remove one id idempotently and retain a tombstone against late echoes. */
	remove(workspaceId, direct = false) {
		this.refreshFrames?.push({
			type: "remove",
			workspaceId
		});
		this.removedIds.add(workspaceId);
		this.committedOrder = this.committedOrder.filter((id) => id !== workspaceId);
		const items = this.items.filter((item) => item.getSnapshot().view?.workspaceId !== workspaceId);
		if (items.length === this.items.length) {
			if (direct) this.notifier.notifyNow();
			return;
		}
		this.items = items;
		if (direct) this.notifier.notifyNow();
		else this.notifier.markDirty();
	}
	installViews(views) {
		const existing = new Map(this.items.flatMap((workspace) => {
			const view = workspace.getSnapshot().view;
			return view === void 0 ? [] : [[view.workspaceId, workspace]];
		}));
		const installed = /* @__PURE__ */ new Map();
		for (const view of views) {
			const duplicate = installed.get(view.workspaceId);
			if (duplicate !== void 0) {
				duplicate.adopt(view);
				continue;
			}
			const workspace = existing.get(view.workspaceId) ?? new Workspace(this.api, view);
			workspace.adopt(view);
			installed.set(view.workspaceId, workspace);
		}
		this.items = [...installed.values()];
		this.committedOrder = views.map((view) => view.workspaceId);
	}
	itemViews() {
		if (this.itemViewsSource === this.items) return this.itemViewsCache;
		this.itemViewsSource = this.items;
		this.itemViewsCache = this.items.flatMap((workspace) => {
			const view = workspace.getSnapshot().view;
			return view === void 0 ? [] : [view];
		});
		return this.itemViewsCache;
	}
};
/** Known ids retain their position; a newly created Workspace enters first. */
function upsertWorkspace(items, workspace) {
	const index = items.findIndex((item) => item.workspaceId === workspace.workspaceId);
	return index === -1 ? [workspace, ...items] : items.map((item, position) => position === index ? workspace : item);
}
/** Replay one ordered delta over a baseline: upsert in place, or drop the removed id. */
function applyWorkspaceDelta(items, delta) {
	if (delta.type === "upsert") return upsertWorkspace(items, delta.workspace);
	if (delta.type === "remove") return items.filter((workspace) => workspace.workspaceId !== delta.workspaceId);
	const rank = new Map(delta.workspaceIds.map((id, index) => [id, index]));
	return [...items].sort((left, right) => (rank.get(left.workspaceId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.workspaceId) ?? Number.MAX_SAFE_INTEGER));
}
/** Move one known id before an optional anchor; unknown ids leave the order unchanged. */
function insertIdBefore(ids, id, beforeId) {
	if (!ids.includes(id) || beforeId !== void 0 && !ids.includes(beforeId) || beforeId === id) return [...ids];
	const without = ids.filter((candidate) => candidate !== id);
	const at = beforeId === void 0 ? without.length : without.indexOf(beforeId);
	return [
		...without.slice(0, at),
		id,
		...without.slice(at)
	];
}

//#endregion
//#region vendor/client-runtime/client/workspaces/service.js
/** Structured create failure for UI flows that distinguish Host business errors. */
var WorkspaceCreateError = class extends Error {
	rpcError;
	constructor(rpcError) {
		super(`workspace create failed: ${rpcError.code}: ${rpcError.message}`);
		this.rpcError = rpcError;
		this.name = "WorkspaceCreateError";
	}
};
/** Structured browse failure so the directory browser can branch on Host business codes. */
var DirectoryBrowseError = class extends Error {
	rpcError;
	constructor(rpcError) {
		super(`directory browse failed: ${rpcError.code}: ${rpcError.message}`);
		this.rpcError = rpcError;
		this.name = "DirectoryBrowseError";
	}
};
/** Real Workspace object layer and Host actions. */
var WorkspaceRuntime = class {
	api;
	sessions;
	/** UI-facing immutable projection; the manager remains wire truth. */
	list;
	/** Workspace baseline and frame owner. */
	manager;
	/** In-flight blank-session creates keyed by workspace (connectWorkspace coalescing). */
	connecting = /* @__PURE__ */ new Map();
	/** Guards the runtime-owned one-shot initial-selection subscription. */
	initialSelectionStarted = false;
	/**
	* @param ctx - client root context.
	* @param api - shared wire client.
	* @param sessions - cross-domain sessions face used for recency and blank-session reuse.
	*/
	constructor(ctx, api, sessions) {
		this.api = api;
		this.sessions = sessions;
		this.manager = new WorkspaceManager(api);
		this.list = createSnapshotStore({
			items: [],
			archivedSessionIds: [],
			state: "idle",
			phase: "pending",
			error: null,
			baselinesReady: false,
			recentWorkspaceId: void 0
		});
		this.manager.subscribe(() => {
			this.project();
		});
		this.sessions.list.subscribe(() => {
			this.project();
		});
		ctx.reflect.provide("workspaces", this, void 0);
	}
	/**
	* Resolve the session a New Session flow lands in once this Workspace is
	* chosen: reuse the workspace's existing blank session when one is in the
	* list mirror, else create a fresh one on the host (`session.create` births
	* the full Session+Agent — the client holds no intermediate state). The
	* caller owns navigation: take the returned id to `sessions.open`.
	* Resolution guarantee (both arms): the returned id is already in the list
	* store and `sessions.binding(id)` resolves synchronously — draft hand-off
	* may write the new scope's machine before opening.
	* @param workspaceId - chosen Workspace (must be in the workspace list).
	* @returns the reused or newly created session id.
	*/
	async connectWorkspace(workspaceId) {
		const workspace = this.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
		if (workspace === void 0) throw new Error(`workspaces.connectWorkspace: unknown workspace ${workspaceId}`);
		const inflight = this.connecting.get(workspaceId);
		if (inflight !== void 0) return inflight;
		const archived = this.list.getSnapshot().archivedSessionIds;
		const sessions = this.sessions.list.getSnapshot();
		for (const id of sessions.ids) {
			const summary = sessions.byId[id];
			if (summary !== void 0 && summary.blank && summary.cwd === workspace.path && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) return summary.id;
		}
		const attempt = this.sessions.create({ workspaceId }).finally(() => {
			this.connecting.delete(workspaceId);
		});
		this.connecting.set(workspaceId, attempt);
		return attempt;
	}
	/**
	* Follow the first complete Workspace/Session baseline and select a default
	* session exactly once. A restored current session wins; otherwise the most
	* recent Workspace is connected (reusing or creating its blank session).
	* Later explicit clears stay cleared instead of retriggering this startup
	* policy. A failed connect may retry on the next baseline projection.
	* @returns disposer for the baseline subscription; late work cannot navigate after disposal.
	*/
	startInitialSelection() {
		if (this.initialSelectionStarted) throw new Error("workspaces.startInitialSelection: already started");
		this.initialSelectionStarted = true;
		let state = "waiting";
		let disposed = false;
		const reconcile = () => {
			if (disposed || state !== "waiting") return;
			const workspace = this.list.getSnapshot();
			if (!workspace.baselinesReady) return;
			const current = this.sessions.list.getSnapshot().current;
			const target = workspace.recentWorkspaceId;
			if (current !== void 0 || target === void 0) {
				state = "done";
				return;
			}
			state = "connecting";
			this.connectWorkspace(target).then((sessionId) => {
				if (disposed) return;
				if (this.sessions.list.getSnapshot().current === void 0) this.sessions.open(sessionId);
				state = "done";
			}, (reason) => {
				if (disposed) return;
				state = "waiting";
				console.warn("initial workspace selection failed:", reason);
			});
		};
		const unsubscribe = this.list.subscribe(reconcile);
		reconcile();
		return () => {
			disposed = true;
			unsubscribe();
		};
	}
	/**
	* The shared New Session action behind the shell entry points (sidebar
	* button, workspace browser): resolve the target Workspace — explicit wins,
	* then the current Session's Workspace, then the recent-Workspace
	* projection — connect its blank session and navigate there; with no
	* Workspace at all, clear the selection into the New Session view state.
	* Connect failures are non-fatal (console diagnostics; the current view
	* stays usable).
	* @param workspaceId - explicit target Workspace for scoped actions.
	*/
	startSession(workspaceId) {
		const workspace = this.list.getSnapshot();
		const current = this.sessions.list.getSnapshot().current;
		const currentWorkspaceId = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
		const target = workspaceId ?? currentWorkspaceId ?? workspace.recentWorkspaceId;
		if (target === void 0) {
			this.sessions.clear();
			return;
		}
		this.connectWorkspace(target).then((sessionId) => {
			this.sessions.open(sessionId);
		}, (reason) => {
			console.warn("new session failed:", reason);
		});
	}
	/**
	* Register an existing path as a Workspace.
	* @param input - the Host create payload.
	* @returns the created or idempotently resolved Workspace.
	*/
	async create(input) {
		const result = await this.manager.create(input);
		if (!result.ok) throw new WorkspaceCreateError(result.error);
		return result.value.workspace;
	}
	/**
	* Open the Host's native directory picker (the `native` capability).
	* @returns the selected path, or null when the user cancelled.
	*/
	async pickDirectory() {
		const response = await this.api.host.pickDirectory({});
		if (!response.result.ok) throw new Error(`directory picker failed: ${response.result.error.message}`);
		return response.result.value.path;
	}
	/**
	* List one directory level through the Host's `browse` capability.
	* @param path - absolute directory to list; absent lists the Host home directory.
	* @param signal - aborts the wire request (and the Host's scan) when the caller supersedes it.
	* @returns the level's listing with breadcrumb ancestry.
	*/
	async listDirectory(path$1, signal) {
		const response = await this.api.host.listDirectory(path$1 === void 0 ? {} : { path: path$1 }, signal);
		if (!response.result.ok) throw new DirectoryBrowseError(response.result.error);
		return response.result.value;
	}
	/**
	* Create one child directory through the Host's `browse` capability.
	* @param path - absolute existing parent directory.
	* @param name - single non-blank path segment.
	* @returns the created directory's absolute path.
	*/
	async createDirectory(path$1, name$1) {
		const response = await this.api.host.createDirectory({
			path: path$1,
			name: name$1
		});
		if (!response.result.ok) throw new DirectoryBrowseError(response.result.error);
		return response.result.value.path;
	}
	/**
	* Open a filesystem path with the Host operating system's default application.
	* @param path - absolute or host-resolvable path.
	*/
	async openPath(path$1) {
		const response = await this.api.host.openPath({ path: path$1 });
		if (!response.result.ok) throw new Error(`path open failed: ${response.result.error.message}`);
	}
	/**
	* Rename a Workspace.
	* @param workspaceId - target workspace.
	* @param title - new display title (trimmed non-empty by the Host).
	* @returns the renamed Workspace view.
	*/
	async rename(workspaceId, title) {
		const result = await this.manager.rename(workspaceId, title);
		if (!result.ok) throw new Error(`workspace rename failed: ${result.error.code}: ${result.error.message}`);
		return result.value.workspace;
	}
	/**
	* Delete one Workspace registration. Sessions, session logs, and the
	* directory remain Host-owned outside this operation.
	* @param workspaceId - target workspace.
	*/
	async delete(workspaceId) {
		const result = await this.manager.delete(workspaceId);
		if (!result.ok) throw new Error(`workspace delete failed: ${result.error.code}: ${result.error.message}`);
	}
	/**
	* Move a Workspace within the durable registry display order.
	* @param workspaceId - Workspace to move.
	* @param beforeWorkspaceId - Anchor workspace; omitted appends.
	*/
	async insertBefore(workspaceId, beforeWorkspaceId) {
		const result = await this.manager.insertBefore(workspaceId, beforeWorkspaceId);
		if (!result.ok) throw new Error(`workspace reorder failed: ${result.error.code}: ${result.error.message}`);
	}
	/**
	* Archive a session into the registry-global set. Clearing an archived
	* current selection is the projection sweep's job (one rule for the local
	* echo and a remote tab's frame alike).
	* @param sessionId - session to archive.
	*/
	async archiveSession(sessionId) {
		const result = await this.manager.archiveSession(sessionId);
		if (!result.ok) throw new Error(`session archive failed: ${result.error.code}: ${result.error.message}`);
	}
	/**
	* Move a session within its Workspace's manual order (DOM-insertBefore-like).
	* @param workspaceId - owning workspace.
	* @param sessionId - accounted session to move.
	* @param beforeSessionId - accounted anchor to insert before; omitted appends.
	* @returns the updated Workspace view.
	*/
	async insertSessionBefore(workspaceId, sessionId, beforeSessionId) {
		const result = await this.manager.insertSessionBefore(workspaceId, sessionId, beforeSessionId);
		if (!result.ok) throw new Error(`workspace move failed: ${result.error.code}: ${result.error.message}`);
		return result.value.workspace;
	}
	/**
	* Refresh the workspace baseline, reusing an in-flight pull.
	* @returns completion of the current or newly started workspace baseline pull.
	*/
	refresh() {
		return this.manager.refresh();
	}
	/**
	* Route a Host stream envelope into the Workspace object layer.
	* @param envelope - validated Host stream envelope.
	*/
	handleHostEnvelope(envelope) {
		this.manager.handleHostEnvelope(envelope);
	}
	/** Rebuild the Workspace baseline after connection. */
	handleConnected() {
		this.manager.handleConnected();
	}
	project() {
		const workspace = this.manager.getSnapshot();
		const sessions = this.sessions.list.getSnapshot();
		const baselinesReady = workspace.phase === "ready" && sessions.phase === "ready";
		if (sessions.current !== void 0 && workspace.archivedSessionIds.includes(sessions.current)) this.sessions.clear();
		this.list.set({
			items: workspace.items,
			archivedSessionIds: workspace.archivedSessionIds,
			state: workspace.state,
			phase: workspace.phase,
			error: workspace.error,
			baselinesReady,
			recentWorkspaceId: baselinesReady ? recentWorkspace(workspace.items, sessions.byId) : void 0
		});
	}
};
/** Stable tie-breaking follows Host Workspace order. */
function recentWorkspace(workspaces, sessions) {
	let selected;
	let selectedTime = Number.NEGATIVE_INFINITY;
	for (const workspace of workspaces) {
		let latest = Number.NEGATIVE_INFINITY;
		for (const sessionId of workspace.sessionIds) {
			const session = sessions[sessionId];
			if (session !== void 0) latest = Math.max(latest, session.updatedAt);
		}
		if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt);
		if (selected === void 0 || latest > selectedTime) {
			selected = workspace.workspaceId;
			selectedTime = latest;
		}
	}
	return selected;
}

//#endregion
//#region vendor/client-runtime/client/conversation/definition-registry.js
/** Shared lifecycle and stable-entry storage for one Conversation Definition registry. */
var ConversationDefinitionRegistry = class extends Service {
	definitions = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Set();
	cached = [];
	/**
	* Return reference-stable Definitions in registration order.
	* @returns current Definitions.
	*/
	entries() {
		return this.cached;
	}
	/**
	* Observe low-frequency registry changes.
	* @param listener - synchronous invalidation callback.
	* @returns unsubscribe callback.
	*/
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	/**
	* Register one uniquely keyed Definition for the caller's lifetime.
	* @param key - registry-local unique key.
	* @param definition - contributed Definition.
	* @param duplicateMessage - error raised when the key is already owned.
	* @param effectName - Cordis effect diagnostic label.
	* @returns idempotent disposer.
	*/
	registerDefinition(key, definition, duplicateMessage, effectName) {
		if (this.definitions.has(key)) throw new Error(duplicateMessage);
		const dispose = this.ctx.effect(() => {
			this.definitions.set(key, definition);
			this.refresh();
			return () => {
				if (this.definitions.get(key) !== definition) return;
				this.definitions.delete(key);
				this.refresh();
			};
		}, effectName);
		return () => {
			dispose();
		};
	}
	/** Refresh cached entries and synchronously invalidate subscribers. */
	refresh() {
		this.cached = [...this.definitions.values()];
		for (const listener of this.listeners) listener();
	}
};

//#endregion
//#region vendor/client-runtime/client/conversation/event-registry.js
/** Runtime registry of independently owned Conversation business Definitions. */
var ConversationEventRegistry = class extends ConversationDefinitionRegistry {
	fallback;
	/** @param ctx - owning Client Runtime context. */
	constructor(ctx) {
		super(ctx, "conversationEvents");
	}
	/**
	* Register a uniquely named business Definition for the caller's lifetime.
	* @param definition - Definition contribution.
	* @returns idempotent disposer.
	*/
	register(definition) {
		assertDefinitionTarget(definition);
		return this.registerDefinition(definition.kind, definition, `conversation Definition "${definition.kind}" is already registered`, `conversationEvents.register(${JSON.stringify(definition.kind)})`);
	}
	/**
	* Register the sole fallback used only when no ordinary Definition matches.
	* @param definition - fallback Definition.
	* @returns idempotent disposer.
	*/
	registerFallback(definition) {
		assertDefinitionTarget(definition);
		if (definition.target === void 0) throw new Error("conversation fallback Definition must declare a target");
		if (this.fallback !== void 0) throw new Error("conversation fallback Definition is already registered");
		const dispose = this.ctx.effect(() => {
			this.fallback = definition;
			this.refresh();
			return () => {
				if (this.fallback !== definition) return;
				this.fallback = void 0;
				this.refresh();
			};
		}, `conversationEvents.registerFallback(${JSON.stringify(definition.kind)})`);
		return () => {
			dispose();
		};
	}
	/**
	* Return the current unmatched-event fallback.
	* @returns installed fallback, when present.
	*/
	fallbackEntry() {
		return this.fallback;
	}
};
function assertDefinitionTarget(definition) {
	if (definition.target === void 0 !== (definition.buildViewNode === void 0)) throw new Error(`conversation Definition "${definition.kind}" must declare target and buildViewNode together`);
}

//#endregion
//#region vendor/client-runtime/client/conversation/view-registry.js
/** Runtime registry of per-target Conversation snapshot builders. */
var ConversationViewRegistry = class extends ConversationDefinitionRegistry {
	/** @param ctx - owning Client Runtime context. */
	constructor(ctx) {
		super(ctx, "conversationViews");
	}
	/**
	* Register a uniquely named view builder factory for the caller's lifetime.
	* @param definition - target builder contribution.
	* @returns idempotent disposer.
	*/
	register(definition) {
		return this.registerDefinition(definition.target, definition, `conversation view target "${definition.target}" is already registered`, `conversationViews.register(${JSON.stringify(definition.target)})`);
	}
};

//#endregion
//#region vendor/client-runtime/client/sessions/subagent-lineage.js
/**
* Index every subagent descendant under each ancestor it reaches through an
* uninterrupted subagent-origin chain. Cycles fail soft and orphan owners
* remain harmless map keys until their summaries arrive.
* @param summaries - retained session summaries keyed by id.
* @returns descendant totals and running totals keyed by possible parent id.
*/
function indexSubagentDescendants(summaries) {
	const indexed = /* @__PURE__ */ new Map();
	for (const descendant of Object.values(summaries)) {
		if (descendant.origin !== "subagent") continue;
		const seen = /* @__PURE__ */ new Set();
		let current = descendant;
		while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
			seen.add(current.id);
			const aggregate = indexed.get(current.parentId);
			if (aggregate === void 0) indexed.set(current.parentId, {
				count: 1,
				runningCount: descendant.running ? 1 : 0
			});
			else {
				aggregate.count += 1;
				if (descendant.running) aggregate.runningCount += 1;
			}
			current = summaries[current.parentId];
		}
	}
	return indexed;
}

//#endregion
//#region vendor/client-runtime/client/workspaces/path.js
/**
* Resolve a workspace-relative path into the Host-facing spelling used by openPath.
* @param cwd - session workspace root, when known.
* @param path - absolute or workspace-relative path.
* @returns an absolute path when a workspace root is available, otherwise the original path.
*/
function resolveWorkspacePath(cwd, path$1) {
	if (path$1.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path$1) || path$1.startsWith("\\\\")) return path$1;
	if (cwd === void 0 || cwd === "") return path$1;
	return `${cwd.replace(/[/\\]+$/, "")}/${path$1.replace(/^[/\\]+/, "")}`;
}

//#endregion
//#region vendor/client-runtime/client/sessions/partial.js
/**
* Create the empty client projection for one streamed Assistant block kind.
* @param blockType - wire block kind.
* @returns empty projected block ready to receive deltas.
*/
function emptyAssistantBlock(blockType) {
	switch (blockType) {
		case "text": return {
			kind: "text",
			text: ""
		};
		case "reasoning": return {
			kind: "reasoning",
			text: ""
		};
		case "tool-call": return {
			kind: "tool-call",
			callId: "",
			name: "",
			argsRaw: ""
		};
		default: return {
			kind: "other",
			block: null
		};
	}
}

//#endregion
//#region vendor/client-runtime/client/sessions/context-provenance.js
/** One durable source narrowed to the readable-record shape; null for anything else. */
function asRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
/** A record field read as a non-empty string, or null. */
function readString(record, key) {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}
/** Distinct non-empty `field` values of an array-valued source member, in first-seen order. */
function collect(source, member, field) {
	const list$1 = source[member];
	if (!Array.isArray(list$1)) return [];
	const seen = [];
	for (const entry of list$1) {
		const record = asRecord(entry);
		const value = record === null ? null : readString(record, field);
		if (value !== null && !seen.includes(value)) seen.push(value);
	}
	return seen;
}
/** A collected name list rendered as one label; null when the list is empty. */
function joined(names) {
	return names.length > 0 ? names.join(", ") : null;
}
/**
* Project one durable message source onto its transcript role and producer name.
*
* The source arrives over the wire as opaque JSON (`MessageSource` is
* merge-extensible, so no client-side union can be exhaustive), and a durable
* log may predate or postdate this UI; every unreadable shape therefore
* degrades to `inject` with whatever name the record still carries.
* @param source - the logged `user/message` source, exactly as recorded.
* @returns the role and producer name to present for this context.
*/
function contextProvenance(source) {
	const record = asRecord(source);
	const kind = record === null ? null : readString(record, "kind");
	if (record === null || kind === null) return {
		role: "inject",
		label: null
	};
	switch (kind) {
		case "session-reference": return {
			role: "recall",
			label: joined(collect(record, "references", "label")) ?? kind
		};
		case "agent-instructions": return {
			role: "inject",
			label: joined(collect(record, "changes", "path")) ?? kind
		};
		case "plugin": return {
			role: "inject",
			label: readString(record, "plugin") ?? kind
		};
		case "skill-invocation": return {
			role: "inject",
			label: readString(record, "name") ?? kind
		};
		default: return {
			role: "inject",
			label: kind
		};
	}
}
/**
* Context forms this UI version renders with a dedicated presentation. The
* durable vocabulary (`ContextForm` in `dsh-llm`) may already be wider — an
* unrecognized or absent value degrades to the opaque presentation rather than
* dropping the row, so a log written by a newer or foreign producer still
* renders.
*/
const KNOWN_FORMS = [
	"instructions",
	"catalog",
	"snapshot",
	"notice",
	"relay",
	"recall"
];
/**
* Read the producer-declared form off one durable message source.
* @param source - the logged `user/message` source, exactly as recorded.
* @returns the form when this UI version presents it, otherwise null (opaque).
*/
function contextForm(source) {
	const record = asRecord(source);
	const form = record === null ? null : readString(record, "form");
	return form !== null && KNOWN_FORMS.includes(form) ? form : null;
}

//#endregion
//#region vendor/client-runtime/client/sessions/failure-display.js
/**
* Convert a durable failure into copy that is safe to expose in the GUI.
* @param failure - Failure value preserved by the session event.
* @returns Display-safe copy for client projections.
*/
function displayFailureMessage(failure) {
	if (failure === null || typeof failure !== "object") return String(failure);
	const record = failure;
	if (record.code === "AUTH") return "API key is invalid";
	return typeof record.message === "string" ? record.message : JSON.stringify(failure);
}

//#endregion
//#region vendor/client-runtime/client/index.js
var client_exports$2 = /* @__PURE__ */ __export({
	ConversationEventRegistry: () => ConversationEventRegistry,
	ConversationLocationIndex: () => ConversationLocationIndex,
	ConversationNodeAssembler: () => ConversationNodeAssembler,
	ConversationViewRegistry: () => ConversationViewRegistry,
	DirectoryBrowseError: () => DirectoryBrowseError,
	EMPTY_CHAT_SNAPSHOT: () => EMPTY_CHAT_SNAPSHOT,
	EMPTY_CONVERSATION_VIEWS: () => EMPTY_CONVERSATION_VIEWS,
	PendingWait: () => PendingWait,
	SessionCreateError: () => SessionCreateError,
	SessionProvideChannel: () => SessionProvideChannel,
	SessionRuntime: () => SessionRuntime,
	SlotRegistry: () => SlotRegistry,
	WorkspaceCreateError: () => WorkspaceCreateError,
	WorkspaceRuntime: () => WorkspaceRuntime,
	apply: () => apply$2,
	contextForm: () => contextForm,
	contextProvenance: () => contextProvenance,
	conversationContextKey: () => conversationContextKey,
	createScope: () => createScope,
	createSnapshotStore: () => createSnapshotStore,
	defineStore: () => defineStore,
	displayFailureMessage: () => displayFailureMessage,
	emptyAssistantBlock: () => emptyAssistantBlock,
	indexSubagentDescendants: () => indexSubagentDescendants,
	inject: () => inject$2,
	isAppendSurfaceEvent: () => isAppendSurfaceEvent,
	isReplacementSurfaceEvent: () => isReplacementSurfaceEvent,
	isTokenDelta: () => isTokenDelta,
	resolveWorkspacePath: () => resolveWorkspacePath,
	scopeOf: () => scopeOf,
	shallowEqual: () => shallowEqual,
	toAssistantBlock: () => toAssistantBlock,
	toAssistantBlocks: () => toAssistantBlocks,
	workspaceTitleOf: () => workspaceTitleOf
});
/** Required services: the wire handle and Client Typert registry. */
const inject$2 = [
	"connection",
	"typert",
	"remote",
	"remote.commands"
];
/** Mounts the browser runtime services and connection stream.
* @param ctx - Client Cordis context.
* @param config - optional Surface startup policy.
*/
function apply$2(ctx, config = {}) {
	ctx.plugin(SlotRegistry);
	const conversation = {
		events: new ConversationEventRegistry(ctx),
		views: new ConversationViewRegistry(ctx)
	};
	const connection = ctx.get("connection");
	const remote = ctx.remote;
	const sessions = new SessionRuntime(ctx, connection.api, ctx.remote, conversation);
	ctx.typert.contexts.registerClient("agent", { identity: (candidate) => sessions.scopeOf(candidate) });
	const workspaces = new WorkspaceRuntime(ctx, connection.api, sessions);
	if (config.initialSelection !== false) ctx.effect(() => workspaces.startInitialSelection(), "runtime: initial Workspace selection");
	const loop = connection.start({
		onMuxEnvelope: (envelope) => {
			sessions.handleMuxEnvelope(envelope);
		},
		onHostEnvelope: (envelope) => {
			sessions.handleHostEnvelope(envelope);
			workspaces.handleHostEnvelope(envelope);
			const frame = envelope.payload;
			if (frame.type === "host/remote-event") remote.$dispatch(frame.event, frame.args);
		},
		onConnected: () => {
			sessions.handleConnected();
			workspaces.handleConnected();
			ctx.emit("connection/reset");
		},
		onStateChange: (state) => {
			if (state === "reconnecting") sessions.handleDisconnected();
		}
	});
	ctx.effect(() => () => {
		loop.stop();
	}, "runtime: connection stream loop");
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/common.js
/**
* Relative positions in one durable event's seq neighborhood: interrupted
* Assistant, its follow-up Nodes, then follow-ups to an ordinary final. The
* max-tokens notice sits between a closing Assistant and the turn-tail so the
* tail stays the turn's last node and keeps its branch action enabled.
*/
const CHAT_SYNTHETIC_SEQ_OFFSETS = {
	interruptedAssistant: -.9,
	interruptedFollowup: -.8,
	maxTokensNotice: .05,
	finalizedFollowup: .1
};
/**
* Resolve one Context's best currently loaded event Location.
* @param context - assembled business Context.
* @returns start or first-match Location, otherwise unresolved.
*/
function contextLocation(context) {
	return context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" };
}
/**
* Build one final Chat target Node with the engine-owned stable key.
* @param context - assembled business Context.
* @param kind - Chat renderer dispatch key.
* @param anchorSeq - sortable render position.
* @param data - renderer-owned payload.
* @param options - optional Location and visibility overrides.
* @returns final Chat view Node.
*/
function chatNode(context, kind, anchorSeq, data, options$1 = {}) {
	return {
		key: context.key,
		kind,
		id: context.id,
		target: "chat",
		anchorSeq,
		location: options$1.location ?? contextLocation(context),
		visibility: options$1.visibility ?? "visible",
		data
	};
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/assistant.js
function initialState$1(turn, step) {
	return {
		turn,
		step,
		blocks: [],
		firstVisibleSeq: void 0,
		firstVisibleTime: void 0,
		firstTokenTime: void 0,
		hidden: false,
		final: void 0,
		usage: void 0
	};
}
function compactBlocks$1(blocks) {
	return blocks.filter((block$1) => block$1 !== void 0);
}
function hasVisibleContent$1(blocks) {
	return blocks.some((block$1) => {
		if (block$1.kind === "tool-call") return false;
		if (block$1.kind === "text" || block$1.kind === "reasoning") return block$1.text.trim() !== "";
		return true;
	});
}
function hasInterruptionEvidence$1(blocks) {
	return blocks.some((block$1) => {
		if (block$1.kind === "text" || block$1.kind === "reasoning") return block$1.text.trim() !== "";
		return true;
	});
}
function resetForRetry(state) {
	return {
		...initialState$1(state.turn, state.step),
		firstTokenTime: state.firstTokenTime,
		hidden: true
	};
}
function updateChunk$1(state, match) {
	if (match.event.type !== "assistant/chunk") return state;
	const chunk = match.event.data.chunk;
	const blocks = [...state.blocks];
	switch (chunk.type) {
		case "block-start":
			blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
			break;
		case "text-delta": {
			const previous = blocks[chunk.index];
			blocks[chunk.index] = {
				kind: "text",
				text: (previous?.kind === "text" ? previous.text : "") + chunk.text
			};
			break;
		}
		case "reasoning-delta": {
			const previous = blocks[chunk.index];
			blocks[chunk.index] = {
				kind: "reasoning",
				text: (previous?.kind === "reasoning" ? previous.text : "") + chunk.text
			};
			break;
		}
		case "tool-call-delta": {
			const previous = blocks[chunk.index];
			const base = previous?.kind === "tool-call" ? previous : {
				kind: "tool-call",
				callId: "",
				name: "",
				argsRaw: ""
			};
			blocks[chunk.index] = {
				kind: "tool-call",
				callId: base.callId || String(chunk.id),
				name: chunk.name ?? base.name,
				argsRaw: base.argsRaw + chunk.argumentsDelta
			};
			break;
		}
		case "block-end":
			blocks[chunk.index] = toAssistantBlock(chunk.block);
			break;
		case "usage": return {
			...state,
			usage: chunk.usage
		};
		default: return state;
	}
	const visible = hasVisibleContent$1(compactBlocks$1(blocks));
	const firstToken = isTokenDelta(chunk);
	return {
		...state,
		blocks,
		hidden: visible ? false : state.hidden,
		...visible && state.firstVisibleSeq === void 0 ? {
			firstVisibleSeq: match.event.seq,
			firstVisibleTime: match.event.time
		} : {},
		...firstToken && state.firstTokenTime === void 0 ? { firstTokenTime: match.event.time } : {}
	};
}
function closedBoundary$1(location$1) {
	if (location$1.kind === "step" && location$1.step.status === "closed" && location$1.step.end !== void 0) return location$1.step.end;
	if ((location$1.kind === "step" || location$1.kind === "turn") && location$1.turn.status === "closed" && location$1.turn.end !== void 0) return location$1.turn.end;
}
function finalNode$1(state, context) {
	const final = state.final;
	if (final?.event.type === "assistant/message") {
		const event = final.event;
		return {
			kind: "assistant",
			seq: event.seq,
			messageId: event.data.message.id,
			time: event.time,
			turn: state.turn,
			step: state.step,
			blocks: toAssistantBlocks(event.data.message.content),
			usage: event.data.usage,
			timing: {
				stepStartTime: context.start?.event.time ?? null,
				firstTokenTime: state.firstTokenTime ?? null,
				completedTime: event.time
			}
		};
	}
	const location$1 = context.start?.location ?? context.matches.at(-1)?.location;
	const boundary = location$1 === void 0 ? void 0 : closedBoundary$1(location$1);
	const blocks = compactBlocks$1(state.blocks);
	if (boundary === void 0 || !hasInterruptionEvidence$1(blocks)) return void 0;
	return {
		kind: "assistant",
		seq: boundary.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedAssistant,
		time: boundary.time,
		turn: state.turn,
		step: state.step,
		blocks,
		interrupted: true
	};
}
function fallbackState$6(context) {
	let state;
	for (const match of context.matches) {
		if (match.event.type === "assistant/chunk") {
			state ??= initialState$1(match.event.data.turn, match.event.data.step);
			state = updateChunk$1(state, match);
			continue;
		}
		if (match.event.type === "assistant/message") {
			state ??= initialState$1(match.event.data.turn, match.event.data.step);
			state = {
				...state,
				blocks: toAssistantBlocks(match.event.data.message.content),
				hidden: false,
				final: match,
				usage: match.event.data.usage
			};
			continue;
		}
		if (match.event.type === "llm/retry" && state !== void 0) state = resetForRetry(state);
	}
	return state;
}
function projectAssistant(context) {
	const state = context.state ?? fallbackState$6(context);
	if (state === void 0) return void 0;
	const settled = finalNode$1(state, context);
	const blocks = settled?.blocks ?? compactBlocks$1(state.blocks);
	const visible = hasVisibleContent$1(blocks);
	const status = settled?.interrupted === true ? "interrupted" : settled === void 0 ? "running" : "settled";
	const anchorSeq = settled?.seq ?? state.firstVisibleSeq ?? context.matches[0]?.event.seq ?? 0;
	const time = settled?.time ?? state.firstVisibleTime ?? context.matches[0]?.event.time ?? 0;
	return {
		anchorSeq,
		visible,
		settled,
		data: {
			status,
			turn: state.turn,
			step: state.step,
			blocks,
			time,
			...state.usage === void 0 ? {} : { usage: state.usage },
			...settled === void 0 ? {} : { finalNode: settled }
		}
	};
}
/** Per-step Assistant streaming/final/interruption Definition. */
const assistantDefinition = {
	kind: "assistant-step",
	target: "chat",
	match: (event) => {
		if (event.type === "step/start") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "start"
		};
		if (event.type === "assistant/chunk" || event.type === "assistant/message" && isAppendSurfaceEvent(event)) return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "update"
		};
		if (event.type === "llm/retry") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "step/start") throw new Error("assistant-step start requires step/start");
		return initialState$1(match.event.data.turn, match.event.data.step);
	},
	update: (context, match) => {
		if (match.event.type === "assistant/chunk") return updateChunk$1(context.state, match);
		if (match.event.type === "assistant/message") return {
			...context.state,
			blocks: toAssistantBlocks(match.event.data.message.content),
			hidden: false,
			final: match,
			usage: match.event.data.usage
		};
		if (match.event.type === "llm/retry") return resetForRetry(context.state);
		return context.state;
	},
	publication: (match) => {
		if (match.event.type === "step/start") return "none";
		if (match.event.type !== "assistant/chunk") return "immediate";
		const type = match.event.data.chunk.type;
		return type === "usage" || type === "finish" ? "none" : "animation-frame";
	},
	buildLocationData: (context, scope) => {
		if (scope !== "step") return null;
		const projected = projectAssistant(context);
		if (projected === void 0) return null;
		return {
			kind: "step",
			turn: projected.data.turn,
			step: projected.data.step,
			key: "assistant-step",
			value: projected.data
		};
	},
	buildViewNode: (context) => {
		const projected = projectAssistant(context);
		if (projected === void 0) return null;
		if (projected.settled === void 0 && !projected.visible) {
			const state = context.state ?? fallbackState$6(context);
			if (state === void 0) return null;
			const current = context.current.get("chat");
			if (!state.hidden || current === void 0 || current === null) return null;
		}
		return chatNode(context, "assistant-step", projected.anchorSeq, projected.data, { visibility: projected.settled?.interrupted === true || projected.visible ? "visible" : "hidden" });
	}
};
/**
* Register the Assistant lifecycle business contribution.
* @param ctx - owning UI Conversation context.
*/
function registerAssistantConversationNode(ctx) {
	ctx.conversationEvents.register(assistantDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/contract/chat-nodes.js
/**
* Test whether a Tool root has settled.
* @param block - Tool root lifecycle value.
* @returns whether the root carries its final result.
*/
function isSettledTool(block$1) {
	return "kind" in block$1;
}
/**
* Test whether a Tool root is still running.
* @param block - Tool root lifecycle value.
* @returns whether the root lacks a final result.
*/
function isRunningTool(block$1) {
	return !isSettledTool(block$1);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/chat-snapshot-builder.js
const EMPTY_KEYS = [];
const EMPTY_TURNS = [];
const EMPTY_LIST$1 = [];
function sameReferences$1(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
var MutableChatNodeStore = class {
	byKey = /* @__PURE__ */ new Map();
	valuesCache = EMPTY_LIST$1;
	valuesDirty = false;
	get(key) {
		return this.byKey.get(key);
	}
	values() {
		if (this.valuesDirty) {
			this.valuesCache = [...this.byKey.values()];
			this.valuesDirty = false;
		}
		return this.valuesCache;
	}
	replace(nodes) {
		this.byKey.clear();
		for (const node of nodes) this.byKey.set(node.key, node);
		this.valuesCache = [...this.byKey.values()];
		this.valuesDirty = false;
	}
	upsert(nodes) {
		let changed = false;
		for (const node of nodes) {
			if (this.byKey.get(node.key) === node) continue;
			this.byKey.set(node.key, node);
			changed = true;
		}
		if (changed) this.valuesDirty = true;
	}
};
var MutableChatLocationIndex = class {
	turns = /* @__PURE__ */ new Map();
	steps = /* @__PURE__ */ new Map();
	getTurn(turn) {
		return this.turns.get(turn) ?? EMPTY_KEYS;
	}
	getStep(turn, step) {
		return this.steps.get(stepKey$1(turn, step)) ?? EMPTY_KEYS;
	}
	rebuild(order, store) {
		const turns = /* @__PURE__ */ new Map();
		const steps = /* @__PURE__ */ new Map();
		for (const key of order) {
			const location$1 = store.get(key)?.location;
			if (location$1 === void 0) continue;
			const coordinates = locationCoordinates(location$1);
			if (coordinates.turn === void 0) continue;
			const turnKeys = turns.get(coordinates.turn) ?? [];
			turnKeys.push(key);
			turns.set(coordinates.turn, turnKeys);
			if (coordinates.step === void 0) continue;
			const step = stepKey$1(coordinates.turn, coordinates.step);
			const stepKeys = steps.get(step) ?? [];
			stepKeys.push(key);
			steps.set(step, stepKeys);
		}
		this.turns = updateIndex(this.turns, turns);
		this.steps = updateIndex(this.steps, steps);
	}
	/** Invalidate aggregate readers when member data changes without moving. */
	touch(nodes) {
		const turns = /* @__PURE__ */ new Set();
		const steps = /* @__PURE__ */ new Set();
		for (const node of nodes) {
			const coordinates = locationCoordinates(node.location);
			if (coordinates.turn === void 0 || !this.turns.get(coordinates.turn)?.includes(node.key)) continue;
			turns.add(coordinates.turn);
			if (coordinates.step !== void 0) steps.add(stepKey$1(coordinates.turn, coordinates.step));
		}
		for (const turn of turns) {
			const keys = this.turns.get(turn);
			if (keys === void 0) continue;
			this.turns.set(turn, [...keys]);
		}
		for (const step of steps) {
			const keys = this.steps.get(step);
			if (keys === void 0) continue;
			this.steps.set(step, [...keys]);
		}
	}
};
function updateIndex(previous, nextMutable) {
	const next = /* @__PURE__ */ new Map();
	const keys = new Set([...previous.keys(), ...nextMutable.keys()]);
	for (const key of keys) {
		const before = previous.get(key) ?? EMPTY_KEYS;
		const candidate = nextMutable.get(key) ?? EMPTY_KEYS;
		const value = sameReferences$1(before, candidate) ? before : candidate;
		if (candidate.length > 0) next.set(key, value);
	}
	return next;
}
function stepKey$1(turn, step) {
	return `${turn}:${step}`;
}
function locationCoordinates(location$1) {
	if (location$1.kind === "step") return {
		turn: location$1.turn.turn,
		step: location$1.step.step
	};
	if (location$1.kind === "turn") return { turn: location$1.turn.turn };
	return {};
}
function orderedVisible(nodes) {
	return nodes.filter((node) => node.visibility === "visible").sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
}
const EMPTY_CONTRIBUTION = {
	anchorSeq: 0,
	nodes: EMPTY_LIST$1,
	partial: null,
	running: null
};
function legacyContribution(raw) {
	const node = raw;
	if (raw.visibility !== "visible" && node.kind !== "assistant-step") return EMPTY_CONTRIBUTION;
	switch (node.kind) {
		case "user":
		case "steering":
		case "context":
		case "command":
		case "compaction":
		case "turn-error":
		case "turn-max-tokens":
		case "unknown": return {
			anchorSeq: node.anchorSeq,
			nodes: [node.data],
			partial: null,
			running: null
		};
		case "assistant-step": {
			const data = node.data;
			if (data.status === "running") {
				if (raw.visibility !== "visible") return EMPTY_CONTRIBUTION;
				return {
					anchorSeq: node.anchorSeq,
					nodes: EMPTY_LIST$1,
					partial: {
						turn: data.turn,
						step: data.step,
						blocks: data.blocks
					},
					running: null
				};
			}
			return {
				anchorSeq: node.anchorSeq,
				nodes: data.finalNode === void 0 ? EMPTY_LIST$1 : [data.finalNode],
				partial: null,
				running: null
			};
		}
		case "tool-call": {
			const root = node.data.root;
			return isRunningTool(root) ? {
				anchorSeq: node.anchorSeq,
				nodes: EMPTY_LIST$1,
				partial: null,
				running: root
			} : {
				anchorSeq: node.anchorSeq,
				nodes: [root],
				partial: null,
				running: null
			};
		}
		case "manual-compaction": {
			const data = node.data;
			return {
				anchorSeq: node.anchorSeq,
				nodes: data.compaction === null ? [data.command] : [data.command, data.compaction],
				partial: null,
				running: null
			};
		}
		case "model-retry": return {
			anchorSeq: node.anchorSeq,
			nodes: node.data.attempts,
			partial: null,
			running: null
		};
		case "turn-tail": return EMPTY_CONTRIBUTION;
		default: return EMPTY_CONTRIBUTION;
	}
}
function sameContribution(left, right) {
	return left !== void 0 && left.anchorSeq === right.anchorSeq && left.partial?.blocks === right.partial?.blocks && left.partial?.turn === right.partial?.turn && left.partial?.step === right.partial?.step && left.running === right.running && sameReferences$1(left.nodes, right.nodes);
}
/** Incremental compatibility projection for StatsLine and legacy top-level snapshot fields. */
var LegacySliceBuilder = class {
	contributions = /* @__PURE__ */ new Map();
	finalizedContributions = /* @__PURE__ */ new Map();
	runningContributions = /* @__PURE__ */ new Map();
	partialContributions = /* @__PURE__ */ new Map();
	finalized = EMPTY_LIST$1;
	runningCalls = EMPTY_LIST$1;
	partial = null;
	timeline;
	turnTimings = /* @__PURE__ */ new Map();
	turnEnds = /* @__PURE__ */ new Map();
	replace(nodes, timeline) {
		this.contributions.clear();
		this.finalizedContributions.clear();
		this.runningContributions.clear();
		this.partialContributions.clear();
		for (const node of nodes) {
			const contribution = legacyContribution(node);
			this.contributions.set(node.key, contribution);
			this.indexContribution(node.key, contribution);
		}
		this.rebuildFinalized();
		this.rebuildRunning();
		this.rebuildPartial();
		this.updateTimeline(timeline);
		return this.snapshot();
	}
	apply(upserts, timeline) {
		let finalizedChanged = false;
		let runningChanged = false;
		let partialChanged = false;
		for (const node of upserts) {
			const contribution = legacyContribution(node);
			const previous = this.contributions.get(node.key);
			if (sameContribution(previous, contribution)) continue;
			finalizedChanged ||= finalizedContributionChanged(previous, contribution);
			runningChanged ||= runningContributionChanged(previous, contribution);
			partialChanged ||= partialContributionChanged(previous, contribution);
			this.contributions.set(node.key, contribution);
			this.indexContribution(node.key, contribution);
		}
		if (finalizedChanged) this.rebuildFinalized();
		if (runningChanged) this.rebuildRunning();
		if (partialChanged) this.rebuildPartial();
		this.updateTimeline(timeline);
		return this.snapshot();
	}
	indexContribution(key, contribution) {
		updateContributionIndex(this.finalizedContributions, key, contribution, contribution.nodes.length > 0);
		updateContributionIndex(this.runningContributions, key, contribution, contribution.running !== null);
		updateContributionIndex(this.partialContributions, key, contribution, contribution.partial !== null);
	}
	rebuildFinalized() {
		const finalized = [...this.finalizedContributions.values()].flatMap((value) => value.nodes).sort((left, right) => left.seq - right.seq);
		if (!sameReferences$1(this.finalized, finalized)) this.finalized = finalized;
	}
	rebuildRunning() {
		const runningCalls = [...this.runningContributions.values()].sort((left, right) => left.anchorSeq - right.anchorSeq).flatMap((value) => value.running === null ? [] : [value.running]);
		if (!sameReferences$1(this.runningCalls, runningCalls)) this.runningCalls = runningCalls;
	}
	rebuildPartial() {
		const partial = [...this.partialContributions.values()].sort((left, right) => left.anchorSeq - right.anchorSeq).findLast((value) => value.partial !== null)?.partial ?? null;
		if (this.partial?.blocks !== partial?.blocks || this.partial?.turn !== partial?.turn || this.partial?.step !== partial?.step) this.partial = partial;
	}
	updateTimeline(timeline) {
		if (this.timeline === timeline) return;
		this.timeline = timeline;
		const turnTimings = /* @__PURE__ */ new Map();
		const turnEnds = /* @__PURE__ */ new Map();
		for (const turn of timeline.turns.values()) {
			if (turn.start !== void 0) turnTimings.set(turn.turn, {
				startTime: turn.start.time,
				...turn.end === void 0 ? {} : { endTime: turn.end.time }
			});
			if (turn.end !== void 0) turnEnds.set(turn.turn, turn.end.seq);
		}
		this.turnTimings = turnTimings;
		this.turnEnds = turnEnds;
	}
	snapshot() {
		return {
			nodes: this.finalized,
			turnTimings: this.turnTimings,
			turnEnds: this.turnEnds,
			partial: this.partial,
			runningCalls: this.runningCalls
		};
	}
};
function updateContributionIndex(index, key, contribution, present) {
	if (present) index.set(key, contribution);
	else index.delete(key);
}
function finalizedContributionChanged(previous, next) {
	const previousNodes = previous?.nodes ?? EMPTY_LIST$1;
	return !sameReferences$1(previousNodes, next.nodes) || (previousNodes.length > 0 || next.nodes.length > 0) && previous?.anchorSeq !== next.anchorSeq;
}
function runningContributionChanged(previous, next) {
	return previous?.running !== next.running || (previous.running !== null || next.running !== null) && previous.anchorSeq !== next.anchorSeq;
}
function partialContributionChanged(previous, next) {
	return previous?.partial?.blocks !== next.partial?.blocks || previous?.partial?.turn !== next.partial?.turn || previous?.partial?.step !== next.partial?.step || ((previous?.partial ?? null) !== null || next.partial !== null) && previous?.anchorSeq !== next.anchorSeq;
}
/** Incremental keyed Chat builder registered under the `chat` target. */
var ChatSnapshotBuilder = class {
	store = new MutableChatNodeStore();
	locations = new MutableChatLocationIndex();
	legacy = new LegacySliceBuilder();
	order = EMPTY_KEYS;
	empty;
	constructor() {
		this.empty = this.snapshot({
			turnOrder: EMPTY_TURNS,
			turns: /* @__PURE__ */ new Map()
		});
	}
	replace(input) {
		this.store.replace(input.nodes);
		this.order = orderedVisible(input.nodes).map((node) => node.key);
		this.locations.rebuild(this.order, this.store);
		return this.snapshot(input.timeline, this.legacy.replace(input.nodes, input.timeline));
	}
	apply(input) {
		let structural = false;
		const contentOnly = [];
		for (const node of input.upserts) {
			const previous = this.store.get(node.key);
			const nodeStructural = previous === void 0 || previous.anchorSeq !== node.anchorSeq || previous.visibility !== node.visibility || locationIdentity(previous.location) !== locationIdentity(node.location);
			structural ||= nodeStructural;
			if (!nodeStructural) contentOnly.push(node);
		}
		this.store.upsert(input.upserts);
		if (structural) {
			const next = orderedVisible(this.store.values()).map((node) => node.key);
			this.order = sameReferences$1(this.order, next) ? this.order : next;
			this.locations.rebuild(this.order, this.store);
		}
		this.locations.touch(contentOnly);
		return this.snapshot(input.timeline, this.legacy.apply(input.upserts, input.timeline));
	}
	snapshot(timeline, legacy = this.legacy.replace(EMPTY_LIST$1, timeline)) {
		return {
			order: this.order,
			nodes: this.store,
			locations: this.locations,
			timeline,
			legacy
		};
	}
};
function locationIdentity(location$1) {
	const coordinates = locationCoordinates(location$1);
	return `${location$1.kind}:${coordinates.turn ?? ""}:${coordinates.step ?? ""}`;
}
/** Chat target factory contributed to the Runtime view registry. */
const chatViewDefinition = {
	target: "chat",
	create: () => new ChatSnapshotBuilder()
};
/**
* Register the incremental Chat target builder.
* @param ctx - owning UI Conversation context.
*/
function registerChatConversationView(ctx) {
	ctx.conversationViews.register(chatViewDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/command.js
const COMPACT_PLUGIN = "compact";
function commandFromRun(match) {
	if (match.event.type !== "command/run") throw new Error("command start requires command/run");
	const data = match.event.data;
	return {
		kind: "command",
		seq: match.event.seq,
		time: match.event.time,
		commandId: data.commandId,
		name: data.name,
		args: data.args ?? null,
		outcome: null
	};
}
function commandFromDone(match, previous) {
	if (match.event.type !== "command/done") throw new Error("command update requires command/done");
	const data = match.event.data;
	const sourceEventSeq = data.kind === "success" && data.sourceEventSeq !== void 0 && Number.isSafeInteger(data.sourceEventSeq) && data.sourceEventSeq >= 0 ? data.sourceEventSeq : void 0;
	return {
		kind: "command",
		seq: previous?.seq ?? match.event.seq,
		time: previous?.time ?? match.event.time,
		commandId: data.commandId,
		name: previous?.name ?? null,
		args: previous?.args ?? null,
		outcome: {
			kind: data.kind,
			...data.text === void 0 ? {} : { text: data.text },
			...sourceEventSeq === void 0 ? {} : { sourceEventSeq }
		}
	};
}
/**
* Read correlation identity from a compaction replacement checkpoint.
* @param event - candidate Session event.
* @returns correlated compaction and optional command identity.
*/
function compactSource(event) {
	if (event.type !== "user/message" || !isReplacementSurfaceEvent(event)) return void 0;
	const source = event.data.source;
	if (source.kind !== "plugin" || source.plugin !== COMPACT_PLUGIN || typeof source.compactionId !== "string") return void 0;
	return {
		compactionId: source.compactionId,
		...source.sourceCommandId === void 0 ? {} : { sourceCommandId: source.sourceCommandId }
	};
}
/**
* Build the visible summary marker from optional lifecycle evidence.
* @param match - compaction/summary Match, when loaded.
* @param checkpoint - replacement checkpoint Match.
* @returns final compaction summary Node data.
*/
function compactSummary(match, checkpoint) {
	let summary = null;
	let shadowedItemCount = null;
	let shadowedTokenCount = null;
	if (match?.event.type === "compaction/summary") {
		const data = match.event.data;
		if (Array.isArray(data.summary)) {
			const text = data.summary.map((block$1) => block$1.type === "text" ? block$1.text : "").join("");
			summary = text.trim() === "" ? null : text;
		}
		shadowedItemCount = Array.isArray(data.shadowedSeqs) && data.shadowedSeqs.every((seq) => Number.isSafeInteger(seq) && seq >= 0) ? data.shadowedSeqs.length : null;
		shadowedTokenCount = Number.isSafeInteger(data.shadowedTokenCount) && data.shadowedTokenCount >= 0 ? data.shadowedTokenCount : null;
	}
	return {
		kind: "compaction",
		seq: checkpoint.event.seq,
		time: checkpoint.event.time,
		summary,
		summaryEventSeq: match?.event.seq ?? null,
		shadowedItemCount,
		shadowedTokenCount
	};
}
function fallbackState$5(context) {
	const done = context.matches.find((match) => match.event.type === "command/done");
	const checkpoint = context.matches.find((match) => compactSource(match.event) !== void 0);
	const summary = context.matches.find((match) => match.event.type === "compaction/summary");
	if (checkpoint === void 0) return done === void 0 ? void 0 : { command: commandFromDone(done) };
	const source = compactSource(checkpoint.event);
	if (source?.sourceCommandId === void 0) return done === void 0 ? void 0 : { command: commandFromDone(done) };
	return {
		command: done === void 0 ? {
			kind: "command",
			seq: checkpoint.event.seq,
			time: checkpoint.event.time,
			commandId: source.sourceCommandId,
			name: "compact",
			args: null,
			outcome: null
		} : {
			...commandFromDone(done),
			name: "compact"
		},
		checkpoint,
		...summary === void 0 ? {} : { summary }
	};
}
/**
* Fold shared compaction evidence into a Definition-owned State.
* @param state - current business State carrying optional compaction evidence.
* @param match - next compaction lifecycle Match.
* @returns adopted State, preserving reference identity when the Match adds no evidence.
*/
function updateCompactionState(state, match) {
	if (match.event.type === "compaction/summary") return {
		...state,
		summary: match
	};
	if (compactSource(match.event) !== void 0) return {
		...state,
		checkpoint: match
	};
	return state;
}
/** Slash-command lifecycle, including integrated manual compaction, Definition. */
const commandDefinition = {
	kind: "command",
	target: "chat",
	match: (event) => {
		if (event.type === "command/run") return {
			id: String(event.data.commandId),
			role: "start"
		};
		if (event.type === "command/done") return {
			id: String(event.data.commandId),
			role: "update"
		};
		const checkpoint = compactSource(event);
		if (checkpoint?.sourceCommandId !== void 0) return {
			id: String(checkpoint.sourceCommandId),
			role: "update"
		};
		if (event.type === "compaction/start" || event.type === "compaction/summary" || event.type === "compaction/end") {
			if (event.data.sourceCommandId !== void 0) return {
				id: String(event.data.sourceCommandId),
				role: "update"
			};
		}
		return null;
	},
	start: (_context, match) => ({ command: commandFromRun(match) }),
	update: (context, match) => {
		if (match.event.type === "command/done") return {
			...context.state,
			command: commandFromDone(match, context.state.command)
		};
		return updateCompactionState(context.state, match);
	},
	buildViewNode: (context) => {
		const state = context.state ?? fallbackState$5(context);
		if (state === void 0) return null;
		if (state.command.name !== "compact") return chatNode(context, "command", state.command.seq, state.command);
		const compaction = state.checkpoint === void 0 ? null : compactSummary(state.summary, state.checkpoint);
		const data = {
			command: state.command,
			compaction
		};
		return chatNode(context, "manual-compaction", compaction?.seq ?? state.command.seq, data);
	}
};
/**
* Register the command lifecycle business contribution.
* @param ctx - owning UI Conversation context.
*/
function registerCommandConversationNode(ctx) {
	ctx.conversationEvents.register(commandDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/compaction.js
function fallbackState$4(context) {
	const summary = context.matches.find((match) => match.event.type === "compaction/summary");
	const checkpoint = context.matches.find((match) => compactSource(match.event) !== void 0);
	return {
		...summary === void 0 ? {} : { summary },
		...checkpoint === void 0 ? {} : { checkpoint }
	};
}
/** Automatic compaction lifecycle and landed checkpoint Definition. */
const compactionDefinition = {
	kind: "compaction",
	target: "chat",
	match: (event) => {
		const checkpoint = compactSource(event);
		if (checkpoint !== void 0 && checkpoint.sourceCommandId === void 0) return {
			id: checkpoint.compactionId,
			role: "update"
		};
		if (event.type === "compaction/start" || event.type === "compaction/summary" || event.type === "compaction/end") {
			if (event.data.sourceCommandId !== void 0) return null;
			const compactionId = event.data.compactionId;
			if (typeof compactionId !== "string" || compactionId === "") return null;
			return {
				id: compactionId,
				role: event.type === "compaction/start" ? "start" : "update"
			};
		}
		return null;
	},
	start: () => ({}),
	update: (context, match) => updateCompactionState(context.state, match),
	buildViewNode: (context) => {
		const state = context.state ?? fallbackState$4(context);
		if (state.checkpoint === void 0) return null;
		const marker = compactSummary(state.summary, state.checkpoint);
		return chatNode(context, "compaction", marker.seq, marker);
	}
};
/**
* Register the automatic-compaction business contribution.
* @param ctx - owning UI Conversation context.
*/
function registerCompactionConversationNode(ctx) {
	ctx.conversationEvents.register(compactionDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/fallback.js
/** Unclaimed append-surface fallback Definition. */
const unknownFallbackDefinition = {
	kind: "unknown-surface",
	target: "chat",
	match: (event) => isAppendSurfaceEvent(event) ? {
		id: String(event.seq),
		role: "start"
	} : null,
	start: (_context, match) => ({
		kind: "unknown",
		seq: match.event.seq,
		time: match.event.time,
		type: match.event.type,
		data: match.event.data
	}),
	update: (context) => context.state,
	buildViewNode: (context) => context.state === void 0 ? null : chatNode(context, "unknown", context.state.seq, context.state)
};
/**
* Register the unmatched append-surface fallback contribution.
* @param ctx - owning UI Conversation context.
*/
function registerUnknownConversationFallback(ctx) {
	ctx.conversationEvents.registerFallback(unknownFallbackDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/inbox.js
function applySplice$1(previous, splice) {
	const pending = [...previous?.state.pending ?? []];
	const claimed = new Set(previous?.state.claimed ?? []);
	const removed = pending.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted);
	for (const identity of splice.inserted) claimed.delete(identity.id);
	if (splice.target === "next-step" && splice.outcome !== "canceled") for (const identity of removed) claimed.add(identity.id);
	return {
		pending,
		claimed
	};
}
function inboxDefinition(target) {
	const kind = `inbox-${target}`;
	return {
		kind,
		match: (event) => event.type === "agent/inbox/spliced" && event.data.target === target ? {
			id: String(event.seq),
			role: "start"
		} : null,
		start: (_context, match, reader) => {
			if (match.event.type !== "agent/inbox/spliced") throw new Error(`${kind} start requires agent/inbox/spliced`);
			return applySplice$1(reader.previous(kind), match.event.data);
		},
		update: (context) => context.state,
		publication: () => "none"
	};
}
/** Cumulative next-turn inbox splice Definition. */
const nextTurnInboxDefinition = inboxDefinition("next-turn");
/** Cumulative next-step inbox splice Definition used to classify steering. */
const nextStepInboxDefinition = inboxDefinition("next-step");
/**
* Register the two durable Inbox-state contributions.
* @param ctx - owning UI Conversation context.
*/
function registerInboxConversationNodes(ctx) {
	ctx.conversationEvents.register(nextTurnInboxDefinition);
	ctx.conversationEvents.register(nextStepInboxDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/message.js
function isCompactionCheckpoint(event) {
	if (event.type !== "user/message" || !isReplacementSurfaceEvent(event)) return false;
	const source = event.data.source;
	return source.kind === "plugin" && source.plugin === "compact";
}
/** User, steering, and injected-context message classification Definition. */
const messageDefinition = {
	kind: "input-message",
	target: "chat",
	match: (event) => event.type === "user/message" && isAppendSurfaceEvent(event) && !isCompactionCheckpoint(event) ? {
		id: String(event.data.id),
		role: "start"
	} : null,
	start: (_context, match, reader) => {
		if (match.event.type !== "user/message") throw new Error("input-message start requires user/message");
		const event = match.event;
		if (event.data.source.kind !== "user") return {
			kind: "context",
			seq: event.seq,
			time: event.time,
			content: event.data.content,
			source: event.data.source,
			provenance: contextProvenance(event.data.source),
			form: contextForm(event.data.source)
		};
		return reader.previous("inbox-next-step")?.state.claimed.has(String(event.data.id)) === true ? {
			kind: "steering",
			messageId: event.data.id,
			seq: event.seq,
			time: event.time,
			content: event.data.content,
			source: event.data.source
		} : {
			kind: "user",
			seq: event.seq,
			time: event.time,
			content: event.data.content,
			source: event.data.source
		};
	},
	update: (context) => context.state,
	buildViewNode: (context) => {
		if (context.state === void 0) return null;
		return chatNode(context, context.state.kind, context.state.seq, context.state);
	}
};
/**
* Register the user, steering, and injected-context message contribution.
* @param ctx - owning UI Conversation context.
*/
function registerMessageConversationNode(ctx) {
	ctx.conversationEvents.register(messageDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/retry.js
function scheduledNode(match) {
	if (match.event.type !== "llm/retry") return void 0;
	return {
		kind: "model-retry",
		seq: match.event.seq,
		time: match.event.time,
		retryState: "scheduled",
		...match.event.data
	};
}
/** A scheduled attempt is cancelled once either owning boundary closes. */
function isClosed(location$1) {
	return location$1.kind === "step" && location$1.step.status === "closed" || (location$1.kind === "step" || location$1.kind === "turn") && location$1.turn.status === "closed";
}
/** Producer-correlated model retry chain Definition. */
const retryDefinition = {
	kind: "model-retry",
	target: "chat",
	match: (event) => {
		if (event.type === "llm/retry") {
			const retryId = event.data.retryId;
			if (typeof retryId !== "string" || retryId === "") return null;
			return {
				id: retryId,
				role: event.data.retry === 1 ? "start" : "update"
			};
		}
		if (event.type === "llm/retry-started") {
			const retryId = event.data.retryId;
			return typeof retryId === "string" && retryId !== "" ? {
				id: retryId,
				role: "update"
			} : null;
		}
		return null;
	},
	start: (_context, match) => {
		const node = scheduledNode(match);
		if (node === void 0) throw new Error("model-retry start requires a valid llm/retry event");
		return {
			turn: node.turn,
			step: node.step,
			attempts: [node]
		};
	},
	update: (context, match) => {
		if (match.event.type === "llm/retry") {
			const node = scheduledNode(match);
			return node === void 0 ? context.state : {
				...context.state,
				attempts: [...context.state.attempts, node]
			};
		}
		if (match.event.type !== "llm/retry-started") return context.state;
		const retry = match.event.data.retry;
		return {
			...context.state,
			attempts: context.state.attempts.map((attempt) => attempt.retry === retry ? {
				...attempt,
				retryState: "started"
			} : attempt)
		};
	},
	buildViewNode: (context) => {
		if (context.state === void 0 || context.state.attempts.length === 0) return null;
		const location$1 = context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" };
		const stateAttempts = context.state.attempts;
		const attempts = stateAttempts.map((attempt, index) => index === stateAttempts.length - 1 && attempt.retryState === "scheduled" && isClosed(location$1) ? {
			...attempt,
			retryState: "cancelled"
		} : attempt);
		const current = attempts.at(-1);
		if (current === void 0) return null;
		const data = {
			attempts,
			current
		};
		return chatNode(context, "model-retry", attempts[0]?.seq ?? current.seq, data);
	}
};
/**
* Register the correlated model-retry business contribution.
* @param ctx - owning UI Conversation context.
*/
function registerRetryConversationNode(ctx) {
	ctx.conversationEvents.register(retryDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/tool.js
const MAX_DEPTH$1 = 256;
const projectedBlocks = /* @__PURE__ */ new WeakMap();
function jsonArguments(value) {
	return JSON.stringify(value);
}
function rootCall$1(match) {
	if (match.event.type !== "tool/call") throw new Error("tool-call start requires tool/call");
	return {
		callId: String(match.event.data.callId),
		name: match.event.data.name,
		argsRaw: match.event.data.arguments,
		turn: match.event.data.turn,
		step: match.event.data.step,
		time: match.event.time,
		callView: match.view?.for === "call" ? match.view.view : null,
		subCalls: []
	};
}
function rootResult$1(match, previous) {
	if (match.event.type !== "tool/result") return void 0;
	const result = match.event.data.message.content[0];
	return {
		kind: "tool-result",
		seq: match.event.seq,
		time: match.event.time,
		callId: String(match.event.data.message.source.callId),
		call: previous === void 0 ? null : {
			name: previous.name,
			argsRaw: previous.argsRaw
		},
		callTime: previous?.time ?? null,
		content: result.content,
		isError: result.isError === true,
		...match.event.data.error === void 0 ? {} : { error: match.event.data.error },
		meta: match.event.data.meta,
		callView: previous?.callView ?? null,
		resultView: match.view?.for === "result" ? match.view.view : null,
		subCalls: []
	};
}
function childCall$1(match, data) {
	return {
		callId: data.subCallId,
		name: data.name,
		argsRaw: jsonArguments(data.arguments),
		turn: locationTurn$1(match),
		step: locationStep$1(match),
		time: match.event.time,
		callView: null,
		subCalls: []
	};
}
function childResult$1(match, data, previous) {
	return {
		kind: "tool-result",
		seq: match.event.seq,
		time: match.event.time,
		callId: data.subCallId,
		call: {
			name: data.name,
			argsRaw: jsonArguments(data.arguments)
		},
		callTime: previous?.time ?? null,
		content: data.content ?? [],
		isError: data.isError === true,
		callView: null,
		resultView: null,
		subCalls: []
	};
}
function locationTurn$1(match) {
	return match.location.kind === "step" || match.location.kind === "turn" ? match.location.turn.turn : 0;
}
function locationStep$1(match) {
	return match.location.kind === "step" ? match.location.step.step : 0;
}
function acceptsEdge$1(state, parent, child) {
	if (parent === child || state.parents.has(child)) return false;
	let cursor = parent;
	let parentDepth = 0;
	const ancestors = /* @__PURE__ */ new Set();
	while (cursor !== void 0) {
		if (cursor === child || ancestors.has(cursor)) return false;
		ancestors.add(cursor);
		parentDepth++;
		cursor = state.parents.get(cursor);
	}
	const pending = [{
		callId: child,
		depth: 1
	}];
	const descendants = /* @__PURE__ */ new Set();
	let subtreeDepth = 0;
	for (const candidate of pending) {
		if (descendants.has(candidate.callId)) return false;
		descendants.add(candidate.callId);
		subtreeDepth = Math.max(subtreeDepth, candidate.depth);
		for (const nested of state.children.get(candidate.callId) ?? []) pending.push({
			callId: nested.callId,
			depth: candidate.depth + 1
		});
	}
	return parentDepth + subtreeDepth <= MAX_DEPTH$1;
}
function updateDispatch$1(state, match) {
	const event = match.event;
	if (event.type !== "tool/code-dispatch-start" && event.type !== "tool/code-dispatch") return state;
	const data = event.data;
	const parentCallId = String(data.parentCallId);
	const subCallId = String(data.subCallId);
	const siblings = state.children.get(parentCallId) ?? [];
	const index = siblings.findIndex((candidate) => candidate.callId === subCallId);
	if (event.type === "tool/code-dispatch-start") {
		if (index >= 0 || !acceptsEdge$1(state, parentCallId, subCallId)) return state;
		const children$1 = new Map(state.children);
		children$1.set(parentCallId, [...siblings, childCall$1(match, data)]);
		const parents$1 = new Map(state.parents);
		parents$1.set(subCallId, parentCallId);
		return {
			...state,
			children: children$1,
			parents: parents$1
		};
	}
	if (index < 0 && !acceptsEdge$1(state, parentCallId, subCallId)) return state;
	const settled = childResult$1(match, data, index < 0 ? void 0 : siblings[index]);
	const children = new Map(state.children);
	children.set(parentCallId, index < 0 ? [...siblings, settled] : siblings.map((child, at) => at === index ? settled : child));
	const parents = new Map(state.parents);
	if (index < 0) parents.set(subCallId, parentCallId);
	return {
		...state,
		children,
		parents
	};
}
function projectBlock(block$1, state, interruptedAt, visited = /* @__PURE__ */ new Set(), depth = 1) {
	if (visited.has(block$1.callId) || depth > MAX_DEPTH$1) return {
		...block$1,
		subCalls: []
	};
	const nextVisited = new Set(visited);
	nextVisited.add(block$1.callId);
	const children = (state.children.get(block$1.callId) ?? block$1.subCalls).map((child) => projectBlock(child, state, interruptedAt, nextVisited, depth + 1));
	const interruptionSeq = "kind" in block$1 ? void 0 : interruptedAt?.seq;
	const interruptionTime = "kind" in block$1 ? void 0 : interruptedAt?.time;
	const cached = projectedBlocks.get(block$1);
	if (cached !== void 0 && cached.interruptionSeq === interruptionSeq && cached.interruptionTime === interruptionTime && sameReferences(cached.children, children)) return cached.value;
	const projected = "kind" in block$1 || interruptedAt === void 0 ? sameReferences(block$1.subCalls, children) ? block$1 : {
		...block$1,
		subCalls: children
	} : {
		kind: "tool-result",
		seq: interruptedAt.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedFollowup,
		time: interruptedAt.time,
		callId: block$1.callId,
		call: {
			name: block$1.name,
			argsRaw: block$1.argsRaw
		},
		callTime: block$1.time,
		content: [],
		isError: true,
		error: {
			name: "Interrupted",
			code: "interrupted"
		},
		callView: block$1.callView,
		resultView: null,
		subCalls: children
	};
	projectedBlocks.set(block$1, {
		children,
		interruptionSeq,
		interruptionTime,
		value: projected
	});
	return projected;
}
function sameReferences(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
function interruption$1(context) {
	const location$1 = context.start?.location;
	if (location$1?.kind === "step" && location$1.step.status === "closed") return location$1.step.end;
	if ((location$1?.kind === "step" || location$1?.kind === "turn") && location$1.turn.status === "closed") return location$1.turn.end;
}
function fallbackState$3(context) {
	const match = context.matches.find((candidate) => candidate.event.type === "tool/result");
	const root = match === void 0 ? void 0 : rootResult$1(match);
	if (root === void 0) return void 0;
	let state = {
		root,
		children: /* @__PURE__ */ new Map(),
		parents: /* @__PURE__ */ new Map()
	};
	for (const candidate of context.matches) state = updateDispatch$1(state, candidate);
	return state;
}
/** Root Tool lifecycle and nested Code Dispatch Definition. */
const toolDefinition = {
	kind: "tool-call",
	target: "chat",
	match: (event) => {
		if (event.type === "tool/call") return {
			id: String(event.data.callId),
			role: "start"
		};
		if (event.type === "tool/result" && isAppendSurfaceEvent(event)) return {
			id: String(event.data.message.source.callId),
			role: "update"
		};
		if (event.type === "tool/code-dispatch-start" || event.type === "tool/code-dispatch") {
			const rootCallId = event.data.rootCallId;
			return typeof rootCallId === "string" && rootCallId !== "" ? {
				id: rootCallId,
				role: "update"
			} : null;
		}
		return null;
	},
	start: (_context, match) => ({
		root: rootCall$1(match),
		children: /* @__PURE__ */ new Map(),
		parents: /* @__PURE__ */ new Map()
	}),
	update: (context, match) => {
		if (match.event.type === "tool/result") {
			const result = rootResult$1(match, "kind" in context.state.root ? void 0 : context.state.root);
			return result === void 0 ? context.state : {
				...context.state,
				root: result
			};
		}
		return updateDispatch$1(context.state, match);
	},
	buildViewNode: (context) => {
		const state = context.state ?? fallbackState$3(context);
		if (state === void 0) return null;
		const projected = projectBlock(state.root, state, interruption$1(context));
		return chatNode(context, "tool-call", context.start?.event.seq ?? ("kind" in state.root ? state.root.seq : context.matches[0]?.event.seq ?? 0), { root: projected });
	}
};
/**
* Register the root Tool lifecycle and nested-subcall contribution.
* @param ctx - owning UI Conversation context.
*/
function registerToolConversationNode(ctx) {
	ctx.conversationEvents.register(toolDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/turn-error.js
function lastStep$1(context) {
	const location$1 = context.start?.location ?? context.matches[0]?.location;
	if (location$1?.kind !== "turn" && location$1?.kind !== "step") return 0;
	return location$1.turn.steps.at(-1)?.step ?? 0;
}
function retryTurn(event) {
	return event.type === "llm/retry" || event.type === "llm/retry-started" ? event.data.turn : void 0;
}
function failureFrom(match) {
	if (match.event.type !== "turn/end" || match.event.data.reason.kind !== "error") return void 0;
	const failure = match.event.data.reason.error;
	return {
		seq: match.event.seq,
		time: match.event.time,
		message: displayFailureMessage(failure),
		code: failure.code
	};
}
function fallbackState$2(context) {
	const end = context.matches.find((match) => failureFrom(match) !== void 0);
	if (end?.event.type !== "turn/end") return void 0;
	const failure = failureFrom(end);
	if (failure === void 0) return void 0;
	const turn = end.event.data.turn;
	return {
		turn,
		hidden: context.matches.some((match) => retryTurn(match.event) === turn),
		failure
	};
}
/** Terminal turn failure Definition, suppressed when the turn owns a retry chain. */
const turnErrorDefinition = {
	kind: "turn-error",
	target: "chat",
	match: (event) => {
		if (event.type === "turn/start") return {
			id: String(event.data.turn),
			role: "start"
		};
		if (event.type === "turn/end" && event.data.reason.kind === "error") return {
			id: String(event.data.turn),
			role: "update"
		};
		const turn = retryTurn(event);
		return turn === void 0 ? null : {
			id: String(turn),
			role: "update"
		};
	},
	start: (_context, match) => {
		if (match.event.type !== "turn/start") throw new Error("turn-error start requires turn/start");
		return {
			turn: match.event.data.turn,
			hidden: false
		};
	},
	update: (context, match) => {
		const failure = failureFrom(match);
		if (failure !== void 0) return {
			...context.state,
			failure
		};
		return retryTurn(match.event) === context.state.turn ? {
			...context.state,
			hidden: true
		} : context.state;
	},
	buildViewNode: (context) => {
		const state = context.state ?? fallbackState$2(context);
		if (state?.failure === void 0) return null;
		const failure = state.failure;
		const node = {
			kind: "turn-error",
			seq: failure.seq,
			time: failure.time,
			turn: state.turn,
			step: lastStep$1(context),
			message: failure.message,
			...failure.code === void 0 ? {} : { code: failure.code }
		};
		if (!state.hidden) return chatNode(context, "turn-error", node.seq, node);
		const current = context.current.get("chat");
		return current === void 0 || current === null ? null : chatNode(context, "turn-error", node.seq, node, { visibility: "hidden" });
	}
};
/**
* Register the terminal Turn-error business contribution.
* @param ctx - owning UI Conversation context.
*/
function registerTurnErrorConversationNode(ctx) {
	ctx.conversationEvents.register(turnErrorDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/turn-max-tokens.js
function lastStep(context) {
	const location$1 = context.start?.location ?? context.matches[0]?.location;
	if (location$1?.kind !== "turn" && location$1?.kind !== "step") return 0;
	return location$1.turn.steps.at(-1)?.step ?? 0;
}
/**
* Anchor the notice between the closing Assistant and the turn-tail so the
* tail stays the turn's last Chat node and keeps its branch action enabled.
* Without a closing text Assistant there is no branch action to protect, and
* the turn/end seq keeps the notice at the truncation point.
*/
function noticeAnchor(context, seq) {
	const location$1 = context.start?.location ?? context.matches[0]?.location;
	if (location$1?.kind !== "turn" && location$1?.kind !== "step") return seq;
	const closing = location$1.turn.data.get("turn-tail")?.closing;
	return closing === null || closing === void 0 ? seq : closing.finalNode.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.maxTokensNotice;
}
function stateFrom(match) {
	if (match.event.type !== "turn/end" || match.event.data.reason.kind !== "max-tokens") return void 0;
	return {
		turn: match.event.data.turn,
		seq: match.event.seq,
		time: match.event.time
	};
}
/** Notice Definition for a turn the provider ended at its output-token cap. */
const turnMaxTokensDefinition = {
	kind: "turn-max-tokens",
	target: "chat",
	match: (event) => {
		if (event.type === "turn/end" && event.data.reason.kind === "max-tokens") return {
			id: String(event.data.turn),
			role: "start"
		};
		return null;
	},
	start: (_context, match) => {
		const state = stateFrom(match);
		if (state === void 0) throw new Error("turn-max-tokens start requires a max-tokens turn/end");
		return state;
	},
	update: (context) => context.state,
	buildViewNode: (context) => {
		const state = context.state;
		if (state === void 0) return null;
		const node = {
			kind: "turn-max-tokens",
			seq: state.seq,
			time: state.time,
			turn: state.turn,
			step: lastStep(context)
		};
		return chatNode(context, "turn-max-tokens", noticeAnchor(context, state.seq), node);
	}
};
/**
* Register the max-tokens turn-end notice contribution.
* @param ctx - owning UI Conversation context.
*/
function registerTurnMaxTokensConversationNode(ctx) {
	ctx.conversationEvents.register(turnMaxTokensDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/chat/turn-metrics.js
function usageOutputTokens(usage) {
	if (typeof usage !== "object" || usage === null) return null;
	const value = usage.outputTokens;
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
/**
* Read one assistant node's TTFT, decode wall time, and output tokens.
* @param node - A settled assistant node.
* @returns Per-part readings with `null` for unrecorded values.
*/
function assistantStepReading(node) {
	const timing = node.timing;
	return {
		ttftMs: timing !== void 0 && timing.stepStartTime !== null && timing.firstTokenTime !== null ? Math.max(0, timing.firstTokenTime - timing.stepStartTime) : null,
		decodeMs: timing !== void 0 && timing.firstTokenTime !== null ? Math.max(0, timing.completedTime - timing.firstTokenTime) : null,
		outputTokens: usageOutputTokens(node.usage)
	};
}
/**
* Fold assistant nodes into per-turn footer metrics.
*
* TTFT is the turn's lowest-step request-dispatch-to-first-token reading, so
* it is only meaningful when the turn's start is inside
* the loaded window (the caller gates on `turnTimings`, which shares that
* window). Throughput divides summed output tokens by summed decode wall time,
* counting only steps that carry both.
* @param nodes - Snapshot nodes of the loaded window.
* @returns Turn number → available metrics; turns with none are absent.
*/
function deriveTurnMetrics(nodes) {
	const folds = /* @__PURE__ */ new Map();
	for (const node of nodes) {
		if (node.kind !== "assistant") continue;
		const reading = assistantStepReading(node);
		let fold = folds.get(node.turn);
		if (fold === void 0) {
			fold = {
				firstStep: node.step,
				firstStepTtftMs: reading.ttftMs,
				decodeMs: 0,
				outputTokens: 0,
				sampled: false
			};
			folds.set(node.turn, fold);
		} else if (node.step < fold.firstStep) {
			fold.firstStep = node.step;
			fold.firstStepTtftMs = reading.ttftMs;
		}
		if (reading.decodeMs !== null && reading.outputTokens !== null) {
			fold.decodeMs += reading.decodeMs;
			fold.outputTokens += reading.outputTokens;
			fold.sampled = true;
		}
	}
	const metrics = /* @__PURE__ */ new Map();
	for (const [turn, fold] of folds) {
		const entry = {};
		if (fold.firstStepTtftMs !== null) entry.ttftMs = fold.firstStepTtftMs;
		if (fold.sampled && fold.decodeMs > 0) entry.tokensPerSecond = fold.outputTokens / (fold.decodeMs / 1e3);
		if (entry.ttftMs !== void 0 || entry.tokensPerSecond !== void 0) metrics.set(turn, entry);
	}
	return metrics;
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/turn-tail.js
function tokenCount(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function usageBuckets(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const record = value;
	const uncachedInputTokens = tokenCount(record.inputTokens);
	const outputTokens = tokenCount(record.outputTokens);
	const cacheReadTokens = record.cacheReadTokens === void 0 ? 0 : tokenCount(record.cacheReadTokens);
	const cacheWriteTokens = record.cacheWriteTokens === void 0 ? 0 : tokenCount(record.cacheWriteTokens);
	if (uncachedInputTokens === void 0 || outputTokens === void 0 || cacheReadTokens === void 0 || cacheWriteTokens === void 0) return void 0;
	return {
		uncachedInputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens
	};
}
function addUsage$1(left, right) {
	return {
		uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
		cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
		cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens
	};
}
function turnPerformance(context, finalized) {
	const steps = /* @__PURE__ */ new Set();
	const pendingCalls = /* @__PURE__ */ new Map();
	const usageByStep = /* @__PURE__ */ new Map();
	let toolMs = 0;
	for (const match of [...context.matches].sort((left, right) => left.event.seq - right.event.seq)) {
		const event = match.event;
		if (event.type === "step/end") steps.add(event.data.step);
		if (event.type === "tool/call") pendingCalls.set(event.data.callId, event.time);
		if (event.type === "tool/result") {
			const callId = event.data.message.source.callId;
			const startedAt = pendingCalls.get(callId);
			if (startedAt !== void 0) {
				toolMs += Math.max(0, event.time - startedAt);
				pendingCalls.delete(callId);
			}
		}
		const usage$1 = event.type === "assistant/chunk" && event.data.chunk.type === "usage" ? usageBuckets(event.data.chunk.usage) : event.type === "assistant/message" ? usageBuckets(event.data.usage) : void 0;
		if (usage$1 !== void 0 && (event.type === "assistant/chunk" || event.type === "assistant/message")) usageByStep.set(event.data.step, usage$1);
	}
	let llmMs = 0;
	let ttftMs = 0;
	let ttftSteps = 0;
	let decodeMs = 0;
	let decodeTokens = 0;
	for (const candidate of finalized) {
		const node = candidate.finalNode;
		if (node.timing !== void 0 && node.timing.stepStartTime !== null) llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime);
		const reading = assistantStepReading(node);
		if (reading.ttftMs !== null) {
			ttftMs += reading.ttftMs;
			ttftSteps += 1;
		}
		if (reading.decodeMs !== null && reading.outputTokens !== null) {
			decodeMs += reading.decodeMs;
			decodeTokens += reading.outputTokens;
		}
	}
	const usage = [...usageByStep.values()].reduce(addUsage$1, {
		uncachedInputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0
	});
	return {
		statistics: {
			steps: steps.size,
			llmMs,
			toolMs,
			ttftMs,
			ttftSteps,
			decodeMs,
			decodeTokens
		},
		...usageByStep.size === 0 ? {} : { usage }
	};
}
function hasTextAssistant(event) {
	return event.type === "assistant/message" && isAppendSurfaceEvent(event) && toAssistantBlocks(event.data.message.content).some((block$1) => block$1.kind === "text" && block$1.text.trim() !== "");
}
function chunkHasText(event) {
	if (event.type !== "assistant/chunk") return false;
	const chunk = event.data.chunk;
	if (chunk.type === "text-delta") return chunk.text.trim() !== "";
	return chunk.type === "block-end" && chunk.block.type === "text" && chunk.block.text.trim() !== "";
}
function turnCoordinates(event) {
	if (event.type === "assistant/message" || event.type === "assistant/chunk" || event.type === "step/end") return {
		turn: event.data.turn,
		step: event.data.step
	};
	if (event.type === "llm/retry") return {
		turn: event.data.turn,
		step: event.data.step
	};
}
function closingAnchor(context) {
	let anchor = context.matches.find((match) => match.event.type === "turn/end")?.event.seq ?? context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0;
	const steps = /* @__PURE__ */ new Map();
	for (const match of context.matches) {
		const event = match.event;
		if (event.type === "turn/end") continue;
		const coordinates = turnCoordinates(event);
		if (coordinates?.step === void 0) continue;
		const previous = steps.get(coordinates.step) ?? {
			streamedText: false,
			finalized: false
		};
		if (event.type === "assistant/chunk") {
			steps.set(coordinates.step, {
				...previous,
				streamedText: previous.streamedText || chunkHasText(event)
			});
			continue;
		}
		if (event.type === "assistant/message") {
			steps.set(coordinates.step, {
				streamedText: false,
				finalized: true
			});
			if (hasTextAssistant(event)) anchor = event.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.finalizedFollowup;
			continue;
		}
		if (event.type === "llm/retry") {
			steps.set(coordinates.step, {
				streamedText: false,
				finalized: false
			});
			continue;
		}
		if (event.type === "step/end" && previous.streamedText && !previous.finalized) anchor = event.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedFollowup;
	}
	return anchor;
}
function turnLocation(context) {
	const location$1 = context.start?.location ?? context.matches[0]?.location;
	return location$1?.kind === "turn" || location$1?.kind === "step" ? location$1.turn : void 0;
}
function hasText(data) {
	return data.finalNode !== void 0 && data.blocks.some((block$1) => block$1.kind === "text" && block$1.text.trim() !== "");
}
function tailData(context) {
	const end = context.state?.end ?? context.matches.find((match) => match.event.type === "turn/end");
	if (end?.event.type !== "turn/end") return null;
	const turn = turnLocation(context);
	if (turn === void 0) return null;
	const finalized = turn.steps.map((step) => step.data.get("assistant-step")).filter((candidate) => candidate !== void 0).filter((candidate) => candidate.finalNode !== void 0).sort((left, right) => left.finalNode.seq - right.finalNode.seq);
	const closing = finalized.findLast(hasText) ?? null;
	let latestTranscriptSeq = finalized.at(-1)?.finalNode.seq;
	for (const match of context.matches) {
		const event = match.event;
		const candidate = event.type === "tool/call" || event.type === "tool/result" && isAppendSurfaceEvent(event) || event.type === "turn/end" && event.data.reason.kind === "error" || event.type === "llm/retry" ? event.seq : void 0;
		if (candidate !== void 0 && (latestTranscriptSeq === void 0 || candidate > latestTranscriptSeq)) latestTranscriptSeq = candidate;
	}
	const metrics = deriveTurnMetrics(finalized.map((candidate) => candidate.finalNode)).get(end.event.data.turn);
	const performance$1 = turnPerformance(context, finalized);
	return {
		turn: end.event.data.turn,
		seq: end.event.seq,
		time: end.event.time,
		closing,
		branchUnavailable: closing === null || latestTranscriptSeq !== closing.finalNode.seq,
		...metrics?.ttftMs === void 0 ? {} : { ttftMs: metrics.ttftMs },
		...metrics?.tokensPerSecond === void 0 ? {} : { tokensPerSecond: metrics.tokensPerSecond },
		statistics: performance$1.statistics,
		...performance$1.usage === void 0 ? {} : { usage: performance$1.usage }
	};
}
/** Completed-turn footer Definition independent of any Assistant row. */
const turnTailDefinition = {
	kind: "turn-tail",
	target: "chat",
	match: (event) => {
		if (event.type === "turn/start") return {
			id: String(event.data.turn),
			role: "start"
		};
		if (event.type === "turn/end") return {
			id: String(event.data.turn),
			role: "update"
		};
		if (event.type === "tool/call" || event.type === "tool/result") return {
			id: String(event.data.turn),
			role: "update"
		};
		const coordinates = turnCoordinates(event);
		if (coordinates !== void 0) return {
			id: String(coordinates.turn),
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "turn/start") throw new Error("turn-tail start requires turn/start");
		return { turn: match.event.data.turn };
	},
	update: (context, match) => match.event.type === "turn/end" ? {
		...context.state,
		end: match
	} : context.state,
	publication: (match) => match.event.type === "turn/end" ? "immediate" : "none",
	buildLocationData: (context, scope) => {
		if (scope !== "turn") return null;
		const value = tailData(context);
		return value === null ? null : {
			kind: "turn",
			turn: value.turn,
			key: "turn-tail",
			value
		};
	},
	buildViewNode: (context) => {
		const data = turnLocation(context)?.data.get("turn-tail");
		return data === void 0 ? null : chatNode(context, "turn-tail", closingAnchor(context), data);
	}
};
/**
* Register completed-Turn footer data and its Chat node contribution.
* @param ctx - owning UI Conversation context.
*/
function registerTurnTailConversationNode(ctx) {
	ctx.conversationEvents.register(turnTailDefinition);
}

//#endregion
//#region vendor/ui-conversation/client/conversation-nodes/register.js
/**
* Register the Chat business Definitions and target builder contributed by this package.
* @param ctx - owning UI Conversation context.
*/
function registerConversationNodes(ctx) {
	registerInboxConversationNodes(ctx);
	registerMessageConversationNode(ctx);
	registerAssistantConversationNode(ctx);
	registerToolConversationNode(ctx);
	registerCommandConversationNode(ctx);
	registerCompactionConversationNode(ctx);
	registerRetryConversationNode(ctx);
	registerTurnErrorConversationNode(ctx);
	registerTurnMaxTokensConversationNode(ctx);
	registerTurnTailConversationNode(ctx);
	registerUnknownConversationFallback(ctx);
	registerChatConversationView(ctx);
}

//#endregion
//#region vendor/ui-deliverables/client/turn-deliverables.js
/**
* Paths a call view reports having created or changed, by render intent rather
* than tool name: a diff card, or a generic card whose kind is `edit` (the
* shape `str_replace_editor`'s insert presents). Every other card produces
* nothing to open — a read looked, a delete removed, a terminal ran. Only
* root call views enter this Turn accumulator; nested Code Mode dispatches
* preserve the pre-assembly behavior and do not contribute independently.
*/
function producedPaths(view) {
	if (view === null) return [];
	if (view.card === "diff") return (view.locations ?? []).map((location$1) => location$1.path);
	if (view.card === "generic" && view.kind === "edit") return (view.locations ?? []).map((location$1) => location$1.path);
	return [];
}
/**
* Files produced by one Turn data value.
*
* The source is the mutation tools' own follow-along `locations`, not the
* closing prose: a produced file must be listed whether or not the model
* remembered to name it. A mutation is recognized by render intent, not by
* tool name — a diff card, or a generic card whose `kind` is `edit` (the shape
* `str_replace_editor`'s insert presents) — so a new mutation tool joins by
* declaring what it does. Reads contribute nothing (looking at a file does not
* produce it), and neither do deletes (there is nothing left to open) or
* failed calls. Paths keep first-seen order and appear once, so a file written
* and then edited in the same turn is one entry.
*
* The Conversation Location index owns turn membership before this function
* runs, so paths cannot spill across turns and this derivation does not infer
* boundaries from neighboring presentation Nodes.
* @param data - engine-published Deliverables data for one Turn.
* @param seq - closing Assistant seq; later Tool settlements are excluded.
* @returns Produced paths in first-seen order; empty when the turn wrote nothing.
*/
function producedForClosing(data, seq = Number.POSITIVE_INFINITY) {
	if (data === void 0) return [];
	const paths = [];
	const seen = /* @__PURE__ */ new Set();
	for (const produced of data.produced) {
		if (produced.seq > seq || seen.has(produced.path)) continue;
		seen.add(produced.path);
		paths.push(produced.path);
	}
	return paths;
}
/** Turn-local successful mutation accumulator; it publishes no view Node. */
const deliverablesDefinition = {
	kind: "deliverables",
	match: (event) => {
		if (event.type === "turn/start") return {
			id: String(event.data.turn),
			role: "start"
		};
		if (event.type === "tool/call") return {
			id: String(event.data.turn),
			role: "update"
		};
		if (event.type === "tool/result" && isAppendSurfaceEvent(event)) return {
			id: String(event.data.turn),
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "turn/start") throw new Error("deliverables start requires turn/start");
		return {
			turn: match.event.data.turn,
			calls: /* @__PURE__ */ new Map(),
			produced: []
		};
	},
	update: (context, match) => {
		if (match.event.type === "tool/call") {
			const calls = new Map(context.state.calls);
			calls.set(String(match.event.data.callId), match.view?.for === "call" ? match.view.view : null);
			return {
				...context.state,
				calls
			};
		}
		if (match.event.type !== "tool/result") return context.state;
		if (match.event.data.message.content[0].isError === true) return context.state;
		const callId = String(match.event.data.message.source.callId);
		const additions = producedPaths(context.state.calls.get(callId) ?? null).map((path$1) => ({
			seq: match.event.seq,
			path: path$1
		}));
		return additions.length === 0 ? context.state : {
			...context.state,
			produced: [...context.state.produced, ...additions]
		};
	},
	buildLocationData: (context, scope) => scope !== "turn" || context.state === void 0 ? null : {
		kind: "turn",
		turn: context.state.turn,
		key: "deliverables",
		value: { produced: context.state.produced }
	}
};

//#endregion
//#region vendor/ui-deliverables/client/projection.js
/**
* Register produced-file turn facts without loading the Web renderer.
* @param ctx - Client Runtime context receiving the shared Definition.
*/
function registerDeliverablesProjection(ctx) {
	ctx.conversationEvents.register(deliverablesDefinition);
}

//#endregion
//#region vendor/ui-goal/client/goal-command-input.js
/**
* Derive the visible command line from its structured durable run.
* @param event - `/goal` command run.
* @returns command text with trailing parser whitespace removed.
*/
function goalCommandText$1(event) {
	return `/${event.data.name}${(event.data.args ?? "").trimEnd()}`;
}
/** Goal-owned command input projection; the generic command Definition retains the result row. */
const goalCommandInputDefinition = {
	kind: "goal-command-input",
	target: "chat",
	match: (event) => event.type === "command/run" && event.data.name === "goal" ? {
		id: String(event.data.commandId),
		role: "start"
	} : null,
	start: (_context, match) => {
		if (match.event.type !== "command/run") throw new Error("goal-command-input start requires command/run");
		return {
			commandId: match.event.data.commandId,
			seq: match.event.seq,
			time: match.event.time,
			text: goalCommandText$1(match.event)
		};
	},
	update: (context) => context.state,
	buildViewNode: (context) => {
		if (context.state === void 0) return null;
		return {
			key: context.key,
			kind: "command-input",
			id: context.id,
			target: "chat",
			anchorSeq: context.state.seq - .1,
			location: context.start?.location ?? { kind: "unresolved" },
			visibility: "visible",
			data: {
				commandId: context.state.commandId,
				text: context.state.text,
				time: context.state.time
			}
		};
	}
};

//#endregion
//#region vendor/ui-goal/client/projection.js
/**
* Register Goal-owned conversation nodes without loading the Web renderer.
* @param ctx - Client Runtime context receiving the shared Definition.
*/
function registerGoalProjection(ctx) {
	ctx.conversationEvents.register(goalCommandInputDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-definition-common.js
/**
* Wrap one contribution in the Engine-owned target envelope.
*
* @param context - Context that owns the contribution identity.
* @param anchorSeq - Sequence used to order the contribution.
* @param data - Trajectory-specific contribution payload.
* @returns The contribution wrapped as a Trajectory view node.
*/
function trajectoryNode(context, anchorSeq, data) {
	return {
		key: context.key,
		kind: context.kind,
		id: context.id,
		target: "trajectory",
		anchorSeq,
		location: context.start?.location ?? { kind: "unresolved" },
		data
	};
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-assistant-definition.js
function initialState(turn, step, startSeq$1, startTime, started) {
	return {
		turn,
		step,
		startSeq: startSeq$1,
		startTime,
		started,
		sawChunk: false,
		blocks: [],
		firstVisibleSeq: void 0,
		firstVisibleTime: void 0,
		firstTokenTime: void 0,
		final: void 0,
		usage: void 0,
		retry: void 0,
		stepEnd: void 0
	};
}
function compactBlocks(blocks) {
	return blocks.filter((block$1) => block$1 !== void 0);
}
function hasVisibleContent(blocks) {
	return blocks.some((block$1) => {
		if (block$1.kind === "tool-call") return false;
		if (block$1.kind === "text" || block$1.kind === "reasoning") return block$1.text.trim() !== "";
		return true;
	});
}
function hasInterruptionEvidence(blocks) {
	return blocks.some((block$1) => {
		if (block$1.kind === "text" || block$1.kind === "reasoning") return block$1.text.trim() !== "";
		return true;
	});
}
function addUsage(current, next) {
	return {
		inputTokens: (current?.inputTokens ?? 0) + next.inputTokens,
		outputTokens: (current?.outputTokens ?? 0) + next.outputTokens,
		...current?.cacheReadTokens === void 0 && next.cacheReadTokens === void 0 ? {} : { cacheReadTokens: (current?.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0) },
		...current?.cacheWriteTokens === void 0 && next.cacheWriteTokens === void 0 ? {} : { cacheWriteTokens: (current?.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0) },
		...current?.reasoningTokens === void 0 && next.reasoningTokens === void 0 ? {} : { reasoningTokens: (current?.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0) }
	};
}
function updateChunk(state, match) {
	if (match.event.type !== "assistant/chunk") return state;
	const chunk = match.event.data.chunk;
	if (chunk.type === "usage") return {
		...state,
		sawChunk: true,
		usage: addUsage(state.usage, chunk.usage)
	};
	const blocks = [...state.blocks];
	switch (chunk.type) {
		case "block-start":
			blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
			break;
		case "text-delta": {
			const previous = blocks[chunk.index];
			blocks[chunk.index] = {
				kind: "text",
				text: (previous?.kind === "text" ? previous.text : "") + chunk.text
			};
			break;
		}
		case "reasoning-delta": {
			const previous = blocks[chunk.index];
			blocks[chunk.index] = {
				kind: "reasoning",
				text: (previous?.kind === "reasoning" ? previous.text : "") + chunk.text
			};
			break;
		}
		case "tool-call-delta": {
			const previous = blocks[chunk.index];
			const base = previous?.kind === "tool-call" ? previous : {
				kind: "tool-call",
				callId: "",
				name: "",
				argsRaw: ""
			};
			blocks[chunk.index] = {
				kind: "tool-call",
				callId: base.callId || String(chunk.id),
				name: chunk.name ?? base.name,
				argsRaw: base.argsRaw + chunk.argumentsDelta
			};
			break;
		}
		case "block-end":
			blocks[chunk.index] = toAssistantBlock(chunk.block);
			break;
		default: return {
			...state,
			sawChunk: true
		};
	}
	const visible = hasVisibleContent(compactBlocks(blocks));
	return {
		...state,
		sawChunk: true,
		blocks,
		...visible && state.firstVisibleSeq === void 0 ? {
			firstVisibleSeq: match.event.seq,
			firstVisibleTime: match.event.time
		} : {},
		...isTokenDelta(chunk) && state.firstTokenTime === void 0 ? { firstTokenTime: match.event.time } : {}
	};
}
function closedBoundary(context) {
	if (context.state?.stepEnd?.event.type === "step/end") return context.state.stepEnd.event;
	const location$1 = context.start?.location ?? context.matches.at(-1)?.location;
	if (location$1?.kind === "step" && location$1.step.status === "closed") return location$1.step.end;
	if ((location$1?.kind === "step" || location$1?.kind === "turn") && location$1.turn.status === "closed") return location$1.turn.end;
}
function fallbackState$1(context) {
	let state;
	for (const match of context.matches) {
		const event = match.event;
		if (event.type === "assistant/chunk") {
			state ??= initialState(event.data.turn, event.data.step, event.seq, event.time, false);
			state = updateChunk(state, match);
		} else if (event.type === "assistant/message") {
			state ??= initialState(event.data.turn, event.data.step, event.seq, event.time, false);
			state = {
				...state,
				blocks: toAssistantBlocks(event.data.message.content),
				final: match,
				usage: state.usage ?? event.data.usage
			};
		} else if (event.type === "step/end" && state !== void 0) state = {
			...state,
			stepEnd: match
		};
	}
	return state;
}
function finalNode(state, context) {
	const final = state.final;
	if (final?.event.type === "assistant/message") {
		const event = final.event;
		return {
			kind: "assistant",
			seq: event.seq,
			messageId: event.data.message.id,
			time: event.time,
			turn: state.turn,
			step: state.step,
			blocks: toAssistantBlocks(event.data.message.content),
			usage: event.data.usage,
			provenance: {
				provider: event.data.message.source.provider,
				model: event.data.message.source.model
			},
			timing: {
				stepStartTime: state.started ? state.startTime : null,
				firstTokenTime: state.firstTokenTime ?? null,
				completedTime: event.time
			}
		};
	}
	const boundary = closedBoundary(context);
	const blocks = compactBlocks(state.blocks);
	if (boundary === void 0 || !hasInterruptionEvidence(blocks)) return void 0;
	return {
		kind: "assistant",
		seq: boundary.seq - .9,
		time: boundary.time,
		turn: state.turn,
		step: state.step,
		blocks,
		interrupted: true
	};
}
function assistantRequest(state, node, boundary) {
	if (!state.started) return void 0;
	const status = node !== void 0 && node.interrupted !== true ? "complete" : state.retry !== void 0 || boundary !== void 0 ? "error" : "running";
	return {
		purpose: "assistant",
		startSeq: state.startSeq,
		turn: state.turn,
		step: state.step,
		startedAt: state.startTime,
		completedAt: node?.time ?? boundary?.time ?? null,
		status,
		...state.retry === void 0 ? {} : {
			error: state.retry.message,
			retry: state.retry.retry,
			...state.retry.maxRetries === void 0 ? {} : { maxRetries: state.retry.maxRetries },
			retryDelayMs: state.retry.delayMs
		},
		...node === void 0 || node.interrupted === true ? {} : {
			resultSeq: node.seq,
			...node.provenance === void 0 ? {} : { provenance: node.provenance }
		},
		...state.usage === void 0 ? {} : { usage: state.usage }
	};
}
/** Trajectory-owned Assistant streaming, settlement, and request lifecycle. */
const trajectoryAssistantDefinition = {
	kind: "trajectory-assistant-step",
	target: "trajectory",
	match: (event) => {
		if (event.type === "step/start") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "start"
		};
		if (event.type === "assistant/chunk" || event.type === "assistant/message" || event.type === "llm/retry" || event.type === "step/end") return {
			id: `${event.data.turn}:${event.data.step}`,
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "step/start") throw new Error("trajectory-assistant-step start requires step/start");
		return initialState(match.event.data.turn, match.event.data.step, match.event.seq, match.event.time, true);
	},
	update: (context, match) => {
		if (match.event.type === "assistant/chunk") return updateChunk(context.state, match);
		if (match.event.type === "assistant/message") return {
			...context.state,
			blocks: toAssistantBlocks(match.event.data.message.content),
			final: match,
			usage: context.state.usage ?? match.event.data.usage
		};
		if (match.event.type === "step/end") return {
			...context.state,
			stepEnd: match
		};
		if (match.event.type !== "llm/retry") return context.state;
		const data = match.event.data;
		return {
			...initialState(context.state.turn, context.state.step, context.state.startSeq, context.state.startTime, true),
			firstTokenTime: context.state.firstTokenTime,
			usage: context.state.usage,
			retry: {
				message: displayFailureMessage(data.failure),
				retry: data.retry,
				...data.mode === "normal" ? { maxRetries: data.maxRetries } : {},
				delayMs: data.delayMs
			}
		};
	},
	publication: (match) => {
		if (match.event.type === "step/start") return "none";
		if (match.event.type !== "assistant/chunk") return "immediate";
		const type = match.event.data.chunk.type;
		return type === "usage" || type === "finish" ? "none" : "animation-frame";
	},
	buildViewNode: (context) => {
		const state = context.state ?? fallbackState$1(context);
		if (state === void 0) return null;
		const node = finalNode(state, context);
		const boundary = closedBoundary(context);
		const partial = node === void 0 && boundary === void 0 && state.sawChunk ? {
			turn: state.turn,
			step: state.step,
			blocks: compactBlocks(state.blocks)
		} : null;
		const request = assistantRequest(state, node, boundary);
		if (node === void 0 && partial === null && request === void 0) return null;
		return trajectoryNode(context, state.startSeq, {
			kind: "assistant",
			...node === void 0 ? {} : { node },
			partial,
			...request === void 0 ? {} : { request }
		});
	}
};
const trajectoryTurnEndDefinition = {
	kind: "trajectory-turn-end",
	target: "trajectory",
	match: (event) => event.type === "turn/end" ? {
		id: String(event.seq),
		role: "start"
	} : null,
	start: (_context, match) => {
		if (match.event.type !== "turn/end") throw new Error("trajectory-turn-end start requires turn/end");
		const reason = match.event.data.reason;
		return {
			turn: match.event.data.turn,
			seq: match.event.seq,
			time: match.event.time,
			...reason.kind === "error" ? { error: displayFailureMessage(reason.error) } : {}
		};
	},
	update: (context) => context.state,
	buildViewNode: (context) => context.state === void 0 ? null : trajectoryNode(context, context.state.seq, {
		kind: "turn-end",
		turn: context.state.turn,
		time: context.state.time,
		...context.state.error === void 0 ? {} : { error: context.state.error }
	})
};
/**
* Register the Trajectory Assistant lifecycle.
*
* @param ctx - Plugin context receiving the Definitions.
*/
function registerTrajectoryAssistantDefinition(ctx) {
	ctx.conversationEvents.register(trajectoryAssistantDefinition);
	ctx.conversationEvents.register(trajectoryTurnEndDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-compaction-definition.js
function checkpointId(event) {
	if (event.type !== "user/message") return void 0;
	const source = event.data.source;
	return source.kind === "plugin" && source.plugin === "compact" && typeof source.compactionId === "string" && source.compactionId !== "" ? source.compactionId : void 0;
}
function eventCompactionId(event) {
	if (event.type !== "compaction/start" && event.type !== "compaction/summary" && event.type !== "compaction/end") return void 0;
	const value = event.data.compactionId;
	return typeof value === "string" && value !== "" ? value : void 0;
}
function requestFromState(state) {
	const start = state.start.event;
	if (start.type !== "compaction/start") return void 0;
	const summary = state.summary?.event;
	const end = state.end?.event;
	const checkpoint = state.checkpoint?.event;
	return {
		purpose: "compaction",
		startSeq: start.seq,
		turn: start.data.turn,
		step: 0,
		startedAt: start.time,
		completedAt: end?.type === "compaction/end" ? end.time : null,
		status: end?.type !== "compaction/end" ? "running" : end.data.error === void 0 ? "complete" : "error",
		...end?.type === "compaction/end" && end.data.error !== void 0 ? { error: end.data.error } : {},
		...summary?.type !== "compaction/summary" ? {} : {
			resultSeq: summary.seq,
			summary: summary.data.summary,
			...summary.data.rawOutput === void 0 ? {} : { rawOutput: summary.data.rawOutput },
			provenance: {
				provider: summary.data.provider,
				model: summary.data.model
			},
			requestConfig: {
				provider: summary.data.provider,
				model: summary.data.model,
				purpose: "compaction",
				...summary.data.maxTokens === void 0 ? {} : { maxTokens: summary.data.maxTokens }
			},
			...summary.data.usage === void 0 ? {} : { usage: summary.data.usage }
		},
		...checkpoint?.type === "user/message" ? { replacementSeq: checkpoint.seq } : {}
	};
}
const trajectoryCompactionDefinition = {
	kind: "trajectory-compaction",
	target: "trajectory",
	match: (event) => {
		const compactId = eventCompactionId(event);
		if (compactId !== void 0) return {
			id: compactId,
			role: event.type === "compaction/start" ? "start" : "update"
		};
		const checkpoint = checkpointId(event);
		return checkpoint === void 0 ? null : {
			id: checkpoint,
			role: "update"
		};
	},
	start: (_context, match) => {
		if (match.event.type !== "compaction/start") throw new Error("trajectory-compaction start requires compaction/start");
		return { start: match };
	},
	update: (context, match) => {
		if (match.event.type === "compaction/summary") return {
			...context.state,
			summary: match
		};
		if (match.event.type === "compaction/end") return {
			...context.state,
			end: match
		};
		return checkpointId(match.event) === void 0 ? context.state : {
			...context.state,
			checkpoint: match
		};
	},
	buildViewNode: (context) => {
		if (context.state === void 0) return null;
		const request = requestFromState(context.state);
		return request === void 0 ? null : trajectoryNode(context, request.startSeq, {
			kind: "compaction",
			request
		});
	}
};
const trajectorySessionEndDefinition = {
	kind: "trajectory-session-end",
	target: "trajectory",
	match: (event) => event.type === "session/end-seed" ? {
		id: String(event.seq),
		role: "start"
	} : null,
	start: (_context, match) => ({
		seq: match.event.seq,
		time: match.event.time
	}),
	update: (context) => context.state,
	buildViewNode: (context) => context.state === void 0 ? null : trajectoryNode(context, context.state.seq, {
		kind: "session-end",
		seq: context.state.seq,
		time: context.state.time
	})
};
/**
* Register Trajectory compaction requests and session boundaries.
*
* @param ctx - Plugin context receiving the Definitions.
*/
function registerTrajectoryCompactionDefinitions(ctx) {
	ctx.conversationEvents.register(trajectoryCompactionDefinition);
	ctx.conversationEvents.register(trajectorySessionEndDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-message-definitions.js
function applySplice(previous, splice) {
	const pending = [...previous?.state.pending ?? []];
	const claimed = new Set(previous?.state.claimed ?? []);
	const removed = pending.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted);
	for (const identity of splice.inserted) claimed.delete(identity.id);
	if (splice.outcome !== "canceled") for (const identity of removed) claimed.add(identity.id);
	return {
		pending,
		claimed
	};
}
const trajectoryInboxDefinition = {
	kind: "trajectory-inbox-next-step",
	match: (event) => event.type === "agent/inbox/spliced" && event.data.target === "next-step" ? {
		id: String(event.seq),
		role: "start"
	} : null,
	start: (_context, match, reader) => {
		if (match.event.type !== "agent/inbox/spliced") throw new Error("trajectory-inbox-next-step start requires agent/inbox/spliced");
		return applySplice(reader.previous("trajectory-inbox-next-step"), match.event.data);
	},
	update: (context) => context.state,
	publication: () => "none"
};
const trajectoryMessageDefinition = {
	kind: "trajectory-input-message",
	target: "trajectory",
	match: (event) => event.type === "user/message" ? {
		id: String(event.seq),
		role: "start"
	} : null,
	start: (_context, match, reader) => {
		if (match.event.type !== "user/message") throw new Error("trajectory-input-message start requires user/message");
		const event = match.event;
		if (event.data.source.kind !== "user") return {
			kind: "context",
			seq: event.seq,
			time: event.time,
			content: event.data.content,
			source: event.data.source,
			provenance: contextProvenance(event.data.source),
			form: contextForm(event.data.source)
		};
		return reader.previous("trajectory-inbox-next-step")?.state.claimed.has(String(event.data.id)) === true ? {
			kind: "steering",
			messageId: event.data.id,
			seq: event.seq,
			time: event.time,
			content: event.data.content,
			source: event.data.source
		} : {
			kind: "user",
			seq: event.seq,
			time: event.time,
			content: event.data.content,
			source: event.data.source
		};
	},
	update: (context) => context.state,
	buildViewNode: (context) => context.state === void 0 ? null : trajectoryNode(context, context.state.seq, {
		kind: "node",
		node: context.state
	})
};
/**
* Register Trajectory-owned inbox classification and message records.
*
* @param ctx - Plugin context receiving the Definitions.
*/
function registerTrajectoryMessageDefinitions(ctx) {
	ctx.conversationEvents.register(trajectoryInboxDefinition);
	ctx.conversationEvents.register(trajectoryMessageDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-request-header-definition.js
function requestPrompt(match) {
	if (match.event.type !== "request/header") throw new Error("trajectory-request-header start requires request/header");
	const header = match.event.data.header;
	const tools = header.tools;
	return {
		config: header.config,
		system: header.system ?? "",
		tools: Array.isArray(tools) ? tools : []
	};
}
function promptChange(previous, prompt, match) {
	if (match.event.type !== "request/header") return void 0;
	if (previous === void 0 && match.event.data.reason !== "initial") return void 0;
	const systemChanged = previous !== void 0 && previous.system !== prompt.system;
	const toolsChanged = previous !== void 0 && JSON.stringify(previous.tools) !== JSON.stringify(prompt.tools);
	if (previous !== void 0 && !systemChanged && !toolsChanged) return void 0;
	return {
		seq: match.event.seq,
		time: match.event.time,
		kind: previous === void 0 ? "initial" : systemChanged && toolsChanged ? "system-and-tools" : systemChanged ? "system" : "tools",
		...previous === void 0 ? {} : { previous }
	};
}
const trajectoryRequestHeaderDefinition = {
	kind: "trajectory-request-header",
	target: "trajectory",
	match: (event) => event.type === "request/header" ? {
		id: String(event.seq),
		role: "start"
	} : null,
	start: (_context, match, reader) => {
		const prompt = requestPrompt(match);
		const previous = reader.previous("trajectory-request-header")?.state.prompt;
		const change = promptChange(previous, prompt, match);
		return {
			seq: match.event.seq,
			time: match.event.time,
			prompt,
			location: match.location,
			...change === void 0 ? {} : { change }
		};
	},
	update: (context) => context.state,
	buildViewNode: (context) => context.state === void 0 ? null : trajectoryNode(context, context.state.seq, {
		kind: "request-header",
		header: context.state
	})
};
/**
* Register Trajectory request-header facts.
*
* @param ctx - Plugin context receiving the Definition.
*/
function registerTrajectoryRequestHeaderDefinition(ctx) {
	ctx.conversationEvents.register(trajectoryRequestHeaderDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-snapshot-builder.js
const EMPTY_LIST = [];
/** Stable empty target used until a Session has assembled Trajectory records. */
const EMPTY_TRAJECTORY_SNAPSHOT = {
	eventNodes: EMPTY_LIST,
	eventLocations: /* @__PURE__ */ new Map(),
	requests: EMPTY_LIST,
	callSchemas: /* @__PURE__ */ new Map(),
	partial: null,
	runningCalls: EMPTY_LIST
};
function stepKey(turn, step) {
	return `${turn}\u0000${step}`;
}
function headerStepKey(header) {
	const location$1 = header.location;
	return location$1.kind === "step" ? stepKey(location$1.turn.turn, location$1.step.step) : void 0;
}
function headerFor(request, headersByStep, previous) {
	return headersByStep.get(stepKey(request.turn, request.step)) ?? (previous !== void 0 && previous.seq < request.startSeq ? previous : void 0);
}
function applyHeader(request, header, includeChange) {
	return header === void 0 ? request : {
		...request,
		prompt: header.prompt,
		requestConfig: header.prompt.config,
		...includeChange && header.change !== void 0 ? { promptChange: header.change } : {}
	};
}
function withRequestConfig(node, prompt) {
	return prompt === void 0 ? node : {
		...node,
		requestConfig: prompt.config
	};
}
function captureSchemas(block$1, toolsByName, output) {
	const name$1 = "kind" in block$1 ? block$1.call?.name : block$1.name;
	const schema = name$1 === void 0 ? void 0 : toolsByName.get(name$1);
	if (schema !== void 0) output.set(block$1.callId, schema);
	for (const child of block$1.subCalls) captureSchemas(child, toolsByName, output);
}
function indexTools(tools) {
	return new Map(tools.map((tool) => [tool.name, tool]));
}
function interruptCompactions(requests, boundaries) {
	let nextRequest = 0;
	const runningCompactions = [];
	for (const boundary of boundaries) {
		while (nextRequest < requests.length) {
			const request$1 = requests[nextRequest];
			if (request$1 === void 0 || request$1.startSeq >= boundary.seq) break;
			if (request$1.purpose === "compaction" && request$1.status === "running") runningCompactions.push(nextRequest);
			nextRequest++;
		}
		let index = runningCompactions.pop();
		while (index !== void 0 && requests[index]?.status !== "running") index = runningCompactions.pop();
		if (index === void 0) continue;
		const request = requests[index];
		if (request?.purpose !== "compaction") continue;
		requests[index] = {
			...request,
			completedAt: boundary.time,
			status: "error",
			error: "Compaction was interrupted before completion."
		};
	}
}
function applyTurnErrors(requests, endings) {
	const lastAssistantByTurn = /* @__PURE__ */ new Map();
	for (const [index, request] of requests.entries()) if (request.purpose === "assistant") lastAssistantByTurn.set(request.turn, index);
	for (const ending of endings) {
		if (ending.error === void 0) continue;
		const index = lastAssistantByTurn.get(ending.turn);
		if (index === void 0) continue;
		const request = requests[index];
		if (request?.purpose !== "assistant") continue;
		requests[index] = {
			...request,
			completedAt: request.completedAt ?? ending.time,
			status: "error",
			error: ending.error
		};
	}
}
/** Simple keyed adapter retaining the old Trajectory snapshot and stage layout. */
var TrajectorySnapshotBuilder = class {
	nodes = /* @__PURE__ */ new Map();
	positions = /* @__PURE__ */ new Map();
	contributions = [];
	empty = EMPTY_TRAJECTORY_SNAPSHOT;
	replace(input) {
		this.nodes.clear();
		for (const node of input.nodes) this.nodes.set(node.key, node);
		this.rebuildContributions();
		return this.snapshot();
	}
	apply(input) {
		let structural = false;
		for (const node of input.upserts) {
			const previous = this.nodes.get(node.key);
			this.nodes.set(node.key, node);
			if (previous === void 0 || previous.anchorSeq !== node.anchorSeq) {
				structural = true;
				continue;
			}
			const position = this.positions.get(node.key);
			if (position === void 0) structural = true;
			else this.contributions[position] = node;
		}
		if (structural) this.rebuildContributions();
		return this.snapshot();
	}
	snapshot() {
		const headersByStep = /* @__PURE__ */ new Map();
		for (const contribution of this.contributions) {
			if (contribution.data.kind !== "request-header") continue;
			const key = headerStepKey(contribution.data.header);
			if (key !== void 0) headersByStep.set(key, contribution.data.header);
		}
		const finalized = [];
		const eventLocations = /* @__PURE__ */ new Map();
		const requests = [];
		const boundaries = [];
		const turnEndings = [];
		const callSchemas = /* @__PURE__ */ new Map();
		const consumedPromptChanges = /* @__PURE__ */ new Set();
		let previousHeader;
		let previousTools = /* @__PURE__ */ new Map();
		let partial = null;
		const runningCalls = [];
		for (const contribution of this.contributions) {
			const data = contribution.data;
			if (data.kind === "request-header") {
				previousHeader = data.header;
				previousTools = indexTools(data.header.prompt.tools);
				continue;
			}
			if (data.kind === "node") {
				finalized.push(data.node);
				eventLocations.set(data.node.seq, contribution.location);
				continue;
			}
			if (data.kind === "assistant") {
				const header = data.request === void 0 ? void 0 : headerFor(data.request, headersByStep, previousHeader);
				if (data.node !== void 0) finalized.push(withRequestConfig(data.node, header?.prompt));
				if (data.partial !== null) partial = data.partial;
				if (data.request !== void 0) {
					const includeChange = header?.change !== void 0 && !consumedPromptChanges.has(header.seq);
					requests.push(applyHeader(data.request, header, includeChange));
					if (includeChange) consumedPromptChanges.add(header.seq);
				}
				continue;
			}
			if (data.kind === "tool") {
				if ("kind" in data.root) finalized.push(data.root);
				else runningCalls.push(data.root);
				if (previousHeader !== void 0 && previousHeader.seq < contribution.anchorSeq) captureSchemas(data.root, previousTools, callSchemas);
				continue;
			}
			if (data.kind === "compaction") {
				requests.push(data.request);
				continue;
			}
			if (data.kind === "session-end") {
				boundaries.push({
					seq: data.seq,
					time: data.time
				});
				continue;
			}
			turnEndings.push({
				turn: data.turn,
				time: data.time,
				...data.error === void 0 ? {} : { error: data.error }
			});
		}
		requests.sort((left, right) => left.startSeq - right.startSeq);
		interruptCompactions(requests, boundaries);
		applyTurnErrors(requests, turnEndings);
		finalized.sort((left, right) => left.seq - right.seq);
		return {
			eventNodes: finalized,
			eventLocations,
			requests,
			callSchemas,
			partial,
			runningCalls
		};
	}
	rebuildContributions() {
		this.contributions = [...this.nodes.values()].sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
		this.positions.clear();
		for (const [index, contribution] of this.contributions.entries()) this.positions.set(contribution.key, index);
	}
};
/** Trajectory target factory preserving the existing stage-oriented view model. */
const trajectoryViewDefinition = {
	target: "trajectory",
	create: () => new TrajectorySnapshotBuilder()
};
/**
* Register the stage-oriented Trajectory target builder.
*
* @param ctx - Plugin context receiving the view Definition.
*/
function registerTrajectoryConversationView(ctx) {
	ctx.conversationViews.register(trajectoryViewDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/trajectory-tool-definition.js
const MAX_DEPTH = 256;
function rootCall(match) {
	if (match.event.type !== "tool/call") throw new Error("trajectory-tool-call start requires tool/call");
	return {
		callId: String(match.event.data.callId),
		name: match.event.data.name,
		argsRaw: match.event.data.arguments,
		turn: match.event.data.turn,
		step: match.event.data.step,
		time: match.event.time,
		callView: match.view?.for === "call" ? match.view.view : null,
		subCalls: []
	};
}
function rootResult(match, previous) {
	if (match.event.type !== "tool/result") return void 0;
	const result = match.event.data.message.content[0];
	return {
		kind: "tool-result",
		seq: match.event.seq,
		time: match.event.time,
		callId: String(match.event.data.message.source.callId),
		call: previous === void 0 ? null : {
			name: previous.name,
			argsRaw: previous.argsRaw
		},
		callTime: previous?.time ?? null,
		content: result.content,
		isError: result.isError === true,
		...match.event.data.error === void 0 ? {} : { error: match.event.data.error },
		meta: match.event.data.meta,
		callView: previous?.callView ?? null,
		resultView: match.view?.for === "result" ? match.view.view : null,
		subCalls: []
	};
}
function locationTurn(match) {
	return match.location.kind === "step" || match.location.kind === "turn" ? match.location.turn.turn : 0;
}
function locationStep(match) {
	return match.location.kind === "step" ? match.location.step.step : 0;
}
function childCall(match, data) {
	return {
		callId: data.subCallId,
		name: data.name,
		argsRaw: JSON.stringify(data.arguments),
		turn: locationTurn(match),
		step: locationStep(match),
		time: match.event.time,
		callView: null,
		subCalls: []
	};
}
function childResult(match, data, previous) {
	return {
		kind: "tool-result",
		seq: match.event.seq,
		time: match.event.time,
		callId: data.subCallId,
		call: {
			name: data.name,
			argsRaw: JSON.stringify(data.arguments)
		},
		callTime: previous === void 0 || "kind" in previous ? null : previous.time,
		content: data.content ?? [],
		isError: data.isError === true,
		callView: null,
		resultView: null,
		subCalls: []
	};
}
function acceptsEdge(state, parent, child) {
	if (parent === child || state.parents.has(child)) return false;
	let cursor = parent;
	let parentDepth = 0;
	const ancestors = /* @__PURE__ */ new Set();
	while (cursor !== void 0) {
		if (cursor === child || ancestors.has(cursor)) return false;
		ancestors.add(cursor);
		parentDepth++;
		cursor = state.parents.get(cursor);
	}
	const pending = [{
		callId: child,
		depth: 1
	}];
	const descendants = /* @__PURE__ */ new Set();
	let subtreeDepth = 0;
	for (const candidate of pending) {
		if (descendants.has(candidate.callId)) return false;
		descendants.add(candidate.callId);
		subtreeDepth = Math.max(subtreeDepth, candidate.depth);
		for (const nested of state.children.get(candidate.callId) ?? []) pending.push({
			callId: nested,
			depth: candidate.depth + 1
		});
	}
	return parentDepth + subtreeDepth <= MAX_DEPTH;
}
function updateDispatch(state, match) {
	const event = match.event;
	if (event.type !== "tool/code-dispatch-start" && event.type !== "tool/code-dispatch") return state;
	const data = event.data;
	const parentId = String(data.parentCallId);
	const childId = String(data.subCallId);
	const siblings = state.children.get(parentId) ?? [];
	const index = siblings.indexOf(childId);
	if (index < 0 && !acceptsEdge(state, parentId, childId)) return state;
	if (event.type === "tool/code-dispatch-start" && index >= 0) return state;
	const calls = new Map(state.calls);
	calls.set(childId, event.type === "tool/code-dispatch-start" ? childCall(match, data) : childResult(match, data, calls.get(childId)));
	if (index >= 0) return {
		...state,
		calls
	};
	const children = new Map(state.children);
	children.set(parentId, [...siblings, childId]);
	const parents = new Map(state.parents);
	parents.set(childId, parentId);
	return {
		...state,
		calls,
		children,
		parents
	};
}
function interruption(context) {
	const location$1 = context.start?.location;
	if (location$1?.kind === "step" && location$1.step.status === "closed") return location$1.step.end;
	if ((location$1?.kind === "step" || location$1?.kind === "turn") && location$1.turn.status === "closed") return location$1.turn.end;
}
function projectCall(state, callId, interruptedAt, visited = /* @__PURE__ */ new Set(), depth = 1) {
	const block$1 = state.calls.get(callId);
	if (block$1 === void 0) return void 0;
	if (visited.has(callId) || depth > MAX_DEPTH) return {
		...block$1,
		subCalls: []
	};
	const nextVisited = new Set(visited);
	nextVisited.add(callId);
	const subCalls = (state.children.get(callId) ?? []).flatMap((childId) => {
		const child = projectCall(state, childId, interruptedAt, nextVisited, depth + 1);
		return child === void 0 ? [] : [child];
	});
	if ("kind" in block$1 || interruptedAt === void 0) return {
		...block$1,
		subCalls
	};
	return {
		kind: "tool-result",
		seq: interruptedAt.seq - .8,
		time: interruptedAt.time,
		callId: block$1.callId,
		call: {
			name: block$1.name,
			argsRaw: block$1.argsRaw
		},
		callTime: block$1.time,
		content: [],
		isError: true,
		error: {
			name: "Interrupted",
			code: "interrupted"
		},
		callView: block$1.callView,
		resultView: null,
		subCalls
	};
}
function fallbackState(context) {
	const resultMatch = context.matches.find((match) => match.event.type === "tool/result");
	const root = resultMatch === void 0 ? void 0 : rootResult(resultMatch);
	if (root === void 0) return void 0;
	let state = {
		rootId: root.callId,
		calls: new Map([[root.callId, root]]),
		children: /* @__PURE__ */ new Map(),
		parents: /* @__PURE__ */ new Map()
	};
	for (const match of context.matches) state = updateDispatch(state, match);
	return state;
}
/** Trajectory-owned root Tool lifecycle with nested Code Dispatch calls. */
const trajectoryToolDefinition = {
	kind: "trajectory-tool-call",
	target: "trajectory",
	match: (event) => {
		if (event.type === "tool/call") return {
			id: String(event.data.callId),
			role: "start"
		};
		if (event.type === "tool/result") return {
			id: String(event.data.message.source.callId),
			role: "update"
		};
		if (event.type === "tool/code-dispatch-start" || event.type === "tool/code-dispatch") {
			const rootCallId = event.data.rootCallId;
			return typeof rootCallId === "string" && rootCallId !== "" ? {
				id: rootCallId,
				role: "update"
			} : null;
		}
		return null;
	},
	start: (_context, match) => {
		const root = rootCall(match);
		return {
			rootId: root.callId,
			calls: new Map([[root.callId, root]]),
			children: /* @__PURE__ */ new Map(),
			parents: /* @__PURE__ */ new Map()
		};
	},
	update: (context, match) => {
		if (match.event.type !== "tool/result") return updateDispatch(context.state, match);
		const previous = context.state.calls.get(context.state.rootId);
		const result = rootResult(match, previous !== void 0 && !("kind" in previous) ? previous : void 0);
		if (result === void 0) return context.state;
		const calls = new Map(context.state.calls);
		calls.set(context.state.rootId, result);
		return {
			...context.state,
			calls
		};
	},
	buildViewNode: (context) => {
		const state = context.state ?? fallbackState(context);
		if (state === void 0) return null;
		const root = projectCall(state, state.rootId, interruption(context));
		if (root === void 0) return null;
		return trajectoryNode(context, context.start?.event.seq ?? ("kind" in root ? root.seq : context.matches[0]?.event.seq ?? 0), {
			kind: "tool",
			root
		});
	}
};
/**
* Register the Trajectory Tool lifecycle.
*
* @param ctx - Plugin context receiving the Definition.
*/
function registerTrajectoryToolDefinition(ctx) {
	ctx.conversationEvents.register(trajectoryToolDefinition);
}

//#endregion
//#region vendor/ui-trajectory/client/projection.js
/**
* Register the complete Trajectory target without loading its Web renderer.
* @param ctx - Client Runtime context receiving the shared Definitions and view.
*/
function registerTrajectoryProjection(ctx) {
	registerTrajectoryMessageDefinitions(ctx);
	registerTrajectoryRequestHeaderDefinition(ctx);
	registerTrajectoryAssistantDefinition(ctx);
	registerTrajectoryToolDefinition(ctx);
	registerTrajectoryCompactionDefinitions(ctx);
	registerTrajectoryConversationView(ctx);
}

//#endregion
//#region vendor/ui-workflow-run/client/workflow-definition.js
/**
* Build a collision-free phase key preserving absent versus empty identity.
* @param phase - exact phase string, or null for an omitted field.
* @returns the stable renderer key for that phase identity.
*/
function workflowPhaseKey(phase) {
	return phase === null ? "missing" : `value:${phase.length}:${phase}`;
}
function statusFromStopReason(stopReason) {
	switch (stopReason) {
		case "completed": return "completed";
		case "cancelled": return "cancelled";
		case "error": return "failed";
		default: return stopReason;
	}
}
function statusFromOutcome(outcome) {
	switch (outcome) {
		case "completed": return "completed";
		case "cancelled": return "cancelled";
		case "failed": return "failed";
		default: return outcome;
	}
}
function locationClosed(location$1) {
	if (location$1.kind === "step") return location$1.step.status === "closed" || location$1.turn.status === "closed";
	return location$1.kind === "turn" && location$1.turn.status === "closed";
}
function projectWorkflow(context, location$1) {
	const state = context.state;
	const interrupted = state.stopReason === void 0 && locationClosed(location$1);
	const phases = /* @__PURE__ */ new Map();
	for (const member of state.members) {
		const phase = member.phase === void 0 ? null : member.phase;
		const key = workflowPhaseKey(phase);
		let group = phases.get(key);
		if (group === void 0) {
			group = {
				phase,
				members: []
			};
			phases.set(key, group);
		}
		group.members.push({
			seq: member.seq,
			label: member.label,
			childId: member.childId,
			status: member.outcome === void 0 ? interrupted ? "interrupted" : "running" : statusFromOutcome(member.outcome)
		});
	}
	const projectedPhases = [...phases].map(([key, phase]) => ({
		key,
		phase: phase.phase,
		members: phase.members
	}));
	return {
		name: state.name,
		status: state.stopReason === void 0 ? interrupted ? "interrupted" : "running" : statusFromStopReason(state.stopReason),
		phases: projectedPhases
	};
}
function updateAgentStart(state, data) {
	const member = {
		seq: data.seq,
		label: data.label,
		...data.phase === void 0 ? {} : { phase: data.phase },
		childId: data.childId
	};
	return {
		...state,
		members: [...state.members, member]
	};
}
function updateAgentEnd(state, data) {
	return {
		...state,
		members: state.members.map((member) => member.seq === data.seq ? {
			...member,
			outcome: data.outcome
		} : member)
	};
}
/** Durable workflow event family folded into one keyed Chat node. */
const workflowRunDefinition = {
	kind: "workflow-run",
	target: "chat",
	match: (event) => {
		if (event.type === "tool-workflow/run-start") return {
			id: String(event.data.runId),
			role: "start"
		};
		if (event.type === "tool-workflow/agent-start" || event.type === "tool-workflow/agent-end" || event.type === "tool-workflow/run-end") return {
			id: String(event.data.runId),
			role: "update"
		};
		return null;
	},
	start: (_context, match) => {
		if (match.event.type !== "tool-workflow/run-start") throw new Error("workflow-run start requires tool-workflow/run-start");
		return {
			name: match.event.data.name,
			members: []
		};
	},
	update: (context, match) => {
		if (match.event.type === "tool-workflow/agent-start") return updateAgentStart(context.state, match.event.data);
		if (match.event.type === "tool-workflow/agent-end") return updateAgentEnd(context.state, match.event.data);
		if (match.event.type === "tool-workflow/run-end") return {
			...context.state,
			stopReason: match.event.data.stopReason
		};
		return context.state;
	},
	buildViewNode: (context) => {
		if (context.start === void 0) return null;
		const data = projectWorkflow(context, context.start.location);
		return {
			key: context.key,
			kind: "workflow-run",
			id: context.id,
			target: "chat",
			anchorSeq: context.start.event.seq,
			location: context.start.location,
			visibility: "visible",
			data
		};
	}
};

//#endregion
//#region vendor/ui-workflow-run/client/projection.js
/**
* Register durable Workflow Run nodes without loading the Web renderer.
* @param ctx - Client Runtime context receiving the shared Definition.
*/
function registerWorkflowRunProjection(ctx) {
	ctx.conversationEvents.register(workflowRunDefinition);
}

//#endregion
//#region vendor/typert-registry/service.js
/**
* Compose the global key of one generated schema.
* @param packageName - contributing npm package.
* @param name - schema export name.
* @returns `<package>#<name>`.
*/
function typertKey(packageName, name$1) {
	return `${packageName}#${name$1}`;
}
/**
* Compose the identity of one package-face model.
* @param packageName - contributing npm package.
* @param face - independently compiled face.
* @returns `<package>#<face>`.
*/
function typertPackageKey(packageName, face) {
	return `${packageName}#${face}`;
}
/**
* Compose the endpoint key used by local and Remote invocation registries.
* @param descriptor - invocation whose namespace and method form the endpoint.
* @returns `<namespace>/<method>`.
*/
function typertEndpoint(descriptor) {
	return `${descriptor.namespace}/${descriptor.method}`;
}
var ChangeSource = class {
	report;
	listeners = /* @__PURE__ */ new Set();
	constructor(report) {
		this.report = report;
	}
	subscribe(ctx, listener) {
		const { listeners } = this;
		return ctx.effect(function* () {
			listeners.add(listener);
			yield () => {
				listeners.delete(listener);
			};
		}, "typert registry subscription");
	}
	emit(change) {
		for (const listener of [...this.listeners]) try {
			listener(change);
		} catch (error) {
			this.report(change, error);
		}
	}
};
var DescriptorStore = class {
	kind;
	entries = /* @__PURE__ */ new Map();
	ids = /* @__PURE__ */ new Map();
	history = /* @__PURE__ */ new Set();
	changes;
	constructor(kind, report) {
		this.kind = kind;
		this.changes = new ChangeSource(report);
	}
	validate(descriptors) {
		const endpoints = /* @__PURE__ */ new Set();
		const ids = /* @__PURE__ */ new Set();
		for (const descriptor of descriptors) {
			validateInvocation(descriptor);
			const endpoint = typertEndpoint(descriptor);
			if (endpoints.has(endpoint) || this.entries.has(endpoint)) throw new Error(`typert: ${this.kind} endpoint "${endpoint}" is already registered`);
			if (ids.has(descriptor.id) || this.ids.has(descriptor.id)) throw new Error(`typert: ${this.kind} invocation id "${descriptor.id}" is already registered`);
			endpoints.add(endpoint);
			ids.add(descriptor.id);
		}
	}
	commit(owner, descriptors) {
		for (const descriptor of descriptors) {
			const entry = {
				descriptor,
				owner
			};
			const endpoint = typertEndpoint(descriptor);
			this.entries.set(endpoint, entry);
			this.ids.set(descriptor.id, entry);
			this.history.add(endpoint);
		}
		for (const descriptor of descriptors) this.changes.emit({
			kind: this.kind,
			key: typertEndpoint(descriptor)
		});
	}
	withdraw(owner, descriptors) {
		const removed = [];
		for (const descriptor of descriptors) {
			const endpoint = typertEndpoint(descriptor);
			const entry = this.entries.get(endpoint);
			/* v8 ignore next -- duplicate registration is rejected, so no later owner can replace this entry before its effect disposes. */
			if (entry?.owner !== owner) continue;
			this.entries.delete(endpoint);
			/* v8 ignore next -- ids and endpoints are committed and withdrawn together under the same unique owner. */
			if (this.ids.get(descriptor.id) === entry) this.ids.delete(descriptor.id);
			removed.push(endpoint);
		}
		for (const endpoint of removed) this.changes.emit({
			kind: this.kind,
			key: endpoint
		});
	}
	get(endpoint) {
		return this.entries.get(endpoint)?.descriptor;
	}
	hasSeen(endpoint) {
		return this.history.has(endpoint);
	}
	list() {
		return [...this.entries.values()].map((entry) => entry.descriptor);
	}
	subscribe(ctx, listener) {
		return this.changes.subscribe(ctx, listener);
	}
};
var RemoteStore = class {
	descriptors;
	packages = /* @__PURE__ */ new Map();
	constructor(descriptors) {
		this.descriptors = descriptors;
	}
	view(ctx) {
		return {
			register: (contribution) => this.register(ctx, contribution),
			get: (endpoint) => this.descriptors.get(endpoint),
			list: () => this.descriptors.list(),
			subscribe: (listener) => this.descriptors.subscribe(ctx, listener)
		};
	}
	register(ctx, contribution) {
		validateSegment("Remote package name", contribution.package);
		if (this.packages.has(contribution.package)) throw new Error(`typert: Remote package "${contribution.package}" is already registered`);
		this.descriptors.validate(contribution.descriptors);
		const owner = {};
		const { packages, descriptors } = this;
		return ctx.effect(function* () {
			packages.set(contribution.package, owner);
			descriptors.commit(owner, contribution.descriptors);
			yield () => {
				/* v8 ignore else -- duplicate package registration is rejected, so this effect remains the package's unique owner. */
				if (packages.get(contribution.package) === owner) packages.delete(contribution.package);
				descriptors.withdraw(owner, contribution.descriptors);
			};
		}, `typert.remotes.register(${JSON.stringify(contribution.package)})`);
	}
};
var LookupStore = class {
	providers = /* @__PURE__ */ new Map();
	resolvers = /* @__PURE__ */ new Map();
	definitions = /* @__PURE__ */ new Map();
	changes;
	constructor(report) {
		this.changes = new ChangeSource(report);
	}
	view(ctx) {
		return {
			register: (key, provider) => this.register(ctx, key, provider),
			configure: (key, resolver) => this.configure(ctx, key, resolver),
			get: (key) => this.get(key),
			definitions: () => [...this.definitions.values()],
			keys: () => [...this.providers.keys()],
			subscribe: (listener) => this.changes.subscribe(ctx, listener)
		};
	}
	get(key) {
		const provider = this.providers.get(key)?.provider;
		if (provider === void 0) return void 0;
		const resolver = this.resolvers.get(key)?.provider;
		if (resolver === void 0) return provider;
		return {
			parameter: provider.parameter,
			wire: provider.wire,
			hostTypeSymbol: provider.hostTypeSymbol,
			wireTypeSymbol: provider.wireTypeSymbol,
			resolve: (id) => resolver.resolve(id)
		};
	}
	configure(ctx, key, resolver) {
		validateSegment("lookup key", key);
		if (this.resolvers.has(key)) throw new Error(`typert: lookup "${key}" resolver is already configured`);
		const entry = {
			provider: { resolve: async (id) => resolver(id) },
			owner: {}
		};
		const { resolvers, changes } = this;
		return ctx.effect(function* () {
			resolvers.set(key, entry);
			changes.emit({
				kind: "lookup",
				key
			});
			yield () => {
				/* v8 ignore next -- duplicate configuration is rejected, so this effect remains the key's unique owner. */
				if (resolvers.get(key) !== entry) return;
				resolvers.delete(key);
				changes.emit({
					kind: "lookup",
					key
				});
			};
		}, `typert.lookups.configure(${JSON.stringify(key)})`);
	}
	register(ctx, key, provider) {
		validateSegment("lookup key", key);
		validateSegment("lookup parameter", provider.parameter);
		validateWireName("lookup wire field", provider.wire);
		validateNonempty("lookup Host type symbol", provider.hostTypeSymbol);
		validateNonempty("lookup wire type symbol", provider.wireTypeSymbol);
		if (this.providers.has(key)) throw new Error(`typert: lookup "${key}" is already registered`);
		const definition = {
			key,
			parameter: provider.parameter,
			wire: provider.wire,
			hostTypeSymbol: provider.hostTypeSymbol,
			wireTypeSymbol: provider.wireTypeSymbol
		};
		const known = this.definitions.get(key);
		if (known !== void 0 && !lookupDefinitionEquals(known, definition)) throw new Error(`typert: lookup "${key}" changed its wire declaration during this registry lifetime`);
		const entry = {
			provider,
			owner: {}
		};
		const { definitions, providers, changes } = this;
		return ctx.effect(function* () {
			definitions.set(key, definition);
			providers.set(key, entry);
			changes.emit({
				kind: "lookup",
				key
			});
			yield () => {
				/* v8 ignore next -- duplicate registration is rejected, so this effect remains the key's unique owner. */
				if (providers.get(key) !== entry) return;
				providers.delete(key);
				changes.emit({
					kind: "lookup",
					key
				});
			};
		}, `typert.lookups.register(${JSON.stringify(key)})`);
	}
};
function lookupDefinitionEquals(left, right) {
	return left.parameter === right.parameter && left.wire === right.wire && left.hostTypeSymbol === right.hostTypeSymbol && left.wireTypeSymbol === right.wireTypeSymbol;
}
var ContextStore = class {
	hosts = /* @__PURE__ */ new Map();
	hostResolvers = /* @__PURE__ */ new Map();
	clients = /* @__PURE__ */ new Map();
	changes;
	constructor(report) {
		this.changes = new ChangeSource(report);
	}
	view(ctx) {
		return {
			registerHost: (key, provider) => this.registerHost(ctx, key, provider),
			configureHost: (key, resolver) => this.configureHost(ctx, key, resolver),
			registerClient: (key, binder) => this.registerClient(ctx, key, binder),
			getHost: (key) => this.getHost(key),
			getClient: (key) => this.clients.get(key)?.provider,
			subscribe: (listener) => this.changes.subscribe(ctx, listener)
		};
	}
	getHost(key) {
		const provider = this.hosts.get(key)?.provider;
		if (provider === void 0) return void 0;
		const resolver = this.hostResolvers.get(key)?.provider;
		if (resolver === void 0) return provider;
		return {
			wire: provider.wire,
			wireTypeSymbol: provider.wireTypeSymbol,
			resolve: (id) => resolver.resolve(id)
		};
	}
	configureHost(ctx, key, resolver) {
		validateSegment("Context key", key);
		if (this.hostResolvers.has(key)) throw new Error(`typert: host-context "${key}" resolver is already configured`);
		const entry = {
			provider: { resolve: async (id) => resolver(id) },
			owner: {}
		};
		const { hostResolvers, changes } = this;
		return ctx.effect(function* () {
			hostResolvers.set(key, entry);
			changes.emit({
				kind: "host-context",
				key
			});
			yield () => {
				/* v8 ignore next -- duplicate configuration is rejected, so this effect remains the key's unique owner. */
				if (hostResolvers.get(key) !== entry) return;
				hostResolvers.delete(key);
				changes.emit({
					kind: "host-context",
					key
				});
			};
		}, `typert.contexts.configureHost(${JSON.stringify(key)})`);
	}
	registerHost(ctx, key, provider) {
		validateSegment("Context key", key);
		validateWireName("Context wire field", provider.wire);
		validateNonempty("Context wire type symbol", provider.wireTypeSymbol);
		return this.registerProvider(ctx, this.hosts, "host-context", key, provider);
	}
	registerClient(ctx, key, binder) {
		validateSegment("Context key", key);
		return this.registerProvider(ctx, this.clients, "client-context", key, binder);
	}
	registerProvider(ctx, table, kind, key, provider) {
		if (table.has(key)) throw new Error(`typert: ${kind} provider "${key}" is already registered`);
		const entry = {
			provider,
			owner: {}
		};
		const { changes } = this;
		return ctx.effect(function* () {
			table.set(key, entry);
			changes.emit({
				kind,
				key
			});
			yield () => {
				/* v8 ignore next -- duplicate registration is rejected, so this effect remains the key's unique owner. */
				if (table.get(key) !== entry) return;
				table.delete(key);
				changes.emit({
					kind,
					key
				});
			};
		}, `typert.contexts.register(${JSON.stringify(key)})`);
	}
};
/**
* Registry of generated schemas, package reflection, invocations, and Remote
* dependency providers.
* @typert service typert
*/
var TypertRegistry = class extends Service {
	schemas = /* @__PURE__ */ new Map();
	packages = /* @__PURE__ */ new Map();
	localStore;
	remoteStore;
	lookupStore;
	contextStore;
	constructor(ctx) {
		super(ctx, "typert");
		const report = (change, error) => {
			ctx.logger.warn(`typert: ${change.kind} observer for "${change.key}" failed`);
			ctx.logger.warn(error);
		};
		this.localStore = new DescriptorStore("local", report);
		this.remoteStore = new RemoteStore(new DescriptorStore("remote", report));
		this.lookupStore = new LookupStore(report);
		this.contextStore = new ContextStore(report);
	}
	/** Current-environment invocation definitions. */
	get local() {
		const ctx = this.ctx;
		return {
			get: (endpoint) => this.localStore.get(endpoint),
			hasSeen: (endpoint) => this.localStore.hasSeen(endpoint),
			list: () => this.localStore.list(),
			subscribe: (listener) => this.localStore.subscribe(ctx, listener)
		};
	}
	/** Consumer-selected Remote definitions. */
	get remotes() {
		return this.remoteStore.view(this.ctx);
	}
	/** Host object lookup providers. */
	get lookups() {
		return this.lookupStore.view(this.ctx);
	}
	/** Host Context providers and Client Context binders. */
	get contexts() {
		return this.contextStore.view(this.ctx);
	}
	/**
	* Register one generated contribution atomically for the calling fiber.
	* Duplicate package-face identities, schemas, invocation ids, or endpoints
	* reject the whole batch.
	* @param contribution - generated schemas, reflection, and Host invocations.
	* @returns the exact effect disposer that removes this contribution.
	*/
	register(contribution) {
		const packageRecord = this.validatePackage(contribution);
		const schemaRecords = this.validateSchemas(contribution);
		const invocations = contribution.invocations;
		this.localStore.validate(invocations);
		const owner = {};
		const { schemas, packages, localStore } = this;
		return this.ctx.effect(function* () {
			packages.set(packageRecord.key, packageRecord);
			for (const record of schemaRecords) schemas.set(record.key, record);
			localStore.commit(owner, invocations);
			yield () => {
				/* v8 ignore else -- duplicate package-face registration is rejected, so this effect remains its unique owner. */
				if (packages.get(packageRecord.key) === packageRecord) packages.delete(packageRecord.key);
				for (const record of schemaRecords)
 /* v8 ignore else -- duplicate schema registration is rejected, so this contribution remains each record's unique owner. */
				if (schemas.get(record.key) === record) schemas.delete(record.key);
				localStore.withdraw(owner, invocations);
			};
		}, "typert.register()");
	}
	/**
	* Look up one schema by `<package>#<name>`.
	* @param key - global schema key.
	* @returns the live schema record, or `undefined` when absent.
	*/
	get(key) {
		return this.schemas.get(key);
	}
	/**
	* Resolve one required schema.
	* @param key - global schema key.
	* @returns the live schema record.
	* @throws when the key is malformed, the package face is absent, or the schema is not contributed.
	*/
	resolve(key) {
		const record = this.schemas.get(key);
		if (record !== void 0) return record;
		const hash = key.indexOf("#");
		if (hash <= 0 || hash === key.length - 1) throw new Error(`typert: invalid schema key "${key}" — expected "<package>#<name>"`);
		const packageName = key.slice(0, hash);
		if ([...this.packages.values()].some((candidate) => candidate.package === packageName)) throw new Error(`typert: cannot resolve "${key}" — package "${packageName}" is registered but contributes no schema named "${key.slice(hash + 1)}"`);
		throw new Error(`typert: cannot resolve "${key}" — package "${packageName}" has no registered contribution`);
	}
	/**
	* Enumerate live schemas in registration order.
	* @param filter - optional package and face restriction.
	* @returns matching schema records.
	*/
	list(filter = {}) {
		return [...this.schemas.values()].filter((record) => matches(record, filter));
	}
	/**
	* Look up generated reflection for one package face.
	* @param packageName - exact npm package name.
	* @param face - face to query; defaults to the host runtime.
	* @returns the live package record, or `undefined` when absent.
	*/
	getPackage(packageName, face = "host") {
		return this.packages.get(typertPackageKey(packageName, face));
	}
	/**
	* Enumerate generated package reflection in registration order.
	* @param filter - optional package and face restriction.
	* @returns matching package records.
	*/
	listPackages(filter = {}) {
		return [...this.packages.values()].filter((record) => matches(record, filter));
	}
	/**
	* Project a live Zod schema to JSON Schema without caching the result.
	* @param key - global schema key.
	* @param params - Zod projection parameters.
	* @returns a fresh JSON Schema document.
	*/
	toJSONSchema(key, params) {
		return z.toJSONSchema(this.resolve(key).schema, params);
	}
	validatePackage(contribution) {
		validateSegment("package name", contribution.package);
		const face = contribution.face;
		if (face !== "host" && face !== "client") throw new Error(`typert: invalid face ${JSON.stringify(face)} — expected "host" or "client"`);
		const key = typertPackageKey(contribution.package, contribution.face);
		if (this.packages.has(key)) throw new Error(`typert: package face "${key}" is already registered`);
		return {
			package: contribution.package,
			face,
			key,
			model: contribution.model
		};
	}
	validateSchemas(contribution) {
		const records = [];
		const batch = /* @__PURE__ */ new Set();
		for (const schema of contribution.schemas) {
			validateSegment("schema name", schema.name);
			const key = typertKey(contribution.package, schema.name);
			if (batch.has(key) || this.schemas.has(key)) throw new Error(`typert: schema "${key}" is already registered`);
			batch.add(key);
			records.push({
				...schema,
				package: contribution.package,
				face: contribution.face,
				key
			});
		}
		return records;
	}
};
function matches(record, filter) {
	return (filter.package === void 0 || record.package === filter.package) && (filter.face === void 0 || record.face === filter.face);
}
function validateInvocation(descriptor) {
	validateNonempty("invocation id", descriptor.id);
	validateSegment("invocation service key", descriptor.service);
	validateWireName("invocation namespace", descriptor.namespace);
	validateWireName("invocation method", descriptor.method);
	if (descriptor.implementation !== void 0) validateWireName("invocation implementation method", descriptor.implementation);
	validateCodec(descriptor.result, `${descriptor.id} result`);
	const wires = /* @__PURE__ */ new Set();
	for (const parameter of descriptor.parameters) {
		validateWireName("parameter name", parameter.name);
		validateWireName("parameter wire field", parameter.wire);
		if (wires.has(parameter.wire)) throw new Error(`typert: invocation "${descriptor.id}" repeats wire field "${parameter.wire}"`);
		wires.add(parameter.wire);
		if (parameter.source === "lookup") {
			if (parameter.acceptsUndefined !== void 0) throw new Error(`typert: invocation "${descriptor.id}" lookup parameter "${parameter.name}" cannot accept undefined`);
			if (parameter.lookup === void 0) throw new Error(`typert: invocation "${descriptor.id}" lookup parameter "${parameter.name}" has no lookup key`);
			validateSegment("lookup key", parameter.lookup);
		} else if (parameter.lookup !== void 0) throw new Error(`typert: invocation "${descriptor.id}" JSON parameter "${parameter.name}" declares a lookup key`);
		validateCodec(parameter.codec, `${descriptor.id} parameter ${parameter.name}`);
	}
	const cancellation = descriptor.cancellation;
	if (cancellation !== void 0 && cancellation.parameter !== "signal") throw new Error(`typert: invocation "${descriptor.id}" cancellation parameter must be "signal"`);
	if (descriptor.scope !== void 0) {
		if (descriptor.invocation.kind !== "direct") throw new Error(`typert: invocation "${descriptor.id}" Context receiver cannot declare a direct scope projection`);
		validateSegment("scope Context key", descriptor.scope.context);
		validateWireName("scope wire field", descriptor.scope.wire);
		const lookups = descriptor.parameters.filter((candidate) => candidate.source === "lookup");
		const parameter = lookups.length === 1 ? lookups[0] : void 0;
		if (parameter === void 0 || parameter.wire !== descriptor.scope.wire || parameter.lookup !== descriptor.scope.context) throw new Error(`typert: invocation "${descriptor.id}" scope wire "${descriptor.scope.wire}" must select its only lookup parameter`);
	}
	if (descriptor.invocation.kind === "context") {
		validateSegment("Context key", descriptor.invocation.context);
		validateWireName("Context wire field", descriptor.invocation.wire);
		if (wires.has(descriptor.invocation.wire)) throw new Error(`typert: invocation "${descriptor.id}" repeats wire field "${descriptor.invocation.wire}"`);
		validateCodec(descriptor.invocation.codec, `${descriptor.id} Context`);
	}
}
function validateCodec(codec, subject) {
	if (codec.mode === "src-json") return;
	validateNonempty(`${subject} type symbol`, codec.typeSymbol);
	if (typeof codec.schema.parse !== "function") throw new Error(`typert: ${subject} strict codec has no parse() method`);
}
function validateWireName(subject, value) {
	if (value === "." || value === ".." || !/^[A-Za-z0-9_$.-]+$/.test(value)) throw new Error(`typert: invalid ${subject} "${value}" — must contain only RPC endpoint segment characters`);
}
function validateSegment(subject, value) {
	if (value.length === 0 || value.includes("#")) throw new Error(`typert: invalid ${subject} "${value}" — must be nonempty and must not contain "#"`);
}
function validateNonempty(subject, value) {
	if (value.length === 0) throw new Error(`typert: invalid ${subject} — must be nonempty`);
}

//#endregion
//#region vendor/typert-registry/client/index.js
var client_exports$3 = /* @__PURE__ */ __export({
	apply: () => apply$1,
	inject: () => inject$1
});
/** Required services: none; this is the Client reflection root. */
const inject$1 = [];
/**
* Install the same registry implementation used by the Host face.
* @param ctx - Client Cordis root.
*/
function apply$1(ctx) {
	new TypertRegistry(ctx);
}

//#endregion
//#region src/client/capabilities.ts
const SAFE_PERMISSION_PRESETS = new Set(["read-only", "workspace-write"]);
const FULL_ACCESS_PRESET = "danger-full-access";
const HOST_COMMAND_DECORATORS = new Set(["permission", "feedback"]);
const HOST_COMMAND_FUNCTIONS = new Map([
	["permission", "切换权限"],
	["feedback", "提交会话反馈"],
	["plan", "开启或关闭计划模式"],
	["goal", "管理当前目标"],
	["compact", "压缩当前会话上下文"]
]);
const HOST_COMMAND_ARGUMENT_HINTS = new Map([["permission", "[权限]"], ["feedback", "[内容]"]]);
function shortFunctionDescription(description, fallback) {
	const normalized = description.replace(/\s+/gu, " ").trim();
	if (!/\p{Script=Han}/u.test(normalized)) return fallback;
	const firstSentence = normalized.split(/[。；]/u, 1)[0] ?? fallback;
	const characters = Array.from(firstSentence);
	return characters.length <= 48 ? firstSentence : `${characters.slice(0, 48).join("")}…`;
}
/** TUI-owned product commands available in the terminal Surface. */
const TUI_COMMANDS = Object.freeze([
	{
		name: "new",
		description: "新建会话",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "resume",
		description: "恢复会话",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "sessions",
		description: "查看或搜索会话",
		argumentHint: "[搜索词]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "rename",
		description: "重命名当前会话",
		argumentHint: "<标题>",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "fork",
		description: "从当前会话创建分支",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "archive",
		description: "归档当前会话",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "export",
		description: "导出当前会话",
		argumentHint: "[路径]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "copy",
		description: "复制最后一条回复",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "workspace",
		description: "管理工作区",
		argumentHint: "[子命令|路径]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "profile",
		description: "管理 Profile",
		argumentHint: "[list|switch|create|copy]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "mode",
		description: "切换模式",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "model",
		description: "切换模型和推理强度",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "theme",
		description: "切换亮色或暗色主题",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "queue",
		description: "管理排队消息",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "steer",
		description: "发送引导消息",
		argumentHint: "<消息>",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "attach",
		description: "添加图片",
		argumentHint: "<图片路径>",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "attachments",
		description: "管理待发送图片",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "pending",
		description: "处理待审批或待回答事项",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "settings",
		description: "打开设置",
		argumentHint: "[namespace]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "plugin",
		description: "打开插件中心",
		argumentHint: "[子命令]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "plugins",
		description: "打开插件中心",
		argumentHint: "[子命令]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "doctor",
		description: "检查运行环境",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "restart",
		description: "重启并恢复当前会话",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "tools",
		description: "查看工具",
		argumentHint: "[display]",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "files",
		description: "查看本轮生成文件",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "jobs",
		description: "查看后台任务",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "subagents",
		description: "查看子 Agent",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "trajectory",
		description: "查看执行轨迹",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "skills",
		description: "查看 Skills",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "mcp",
		description: "查看 MCP",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "status",
		description: "查看状态和统计",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "help",
		description: "查看帮助",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "quit",
		description: "退出",
		source: "TUI",
		behavior: "local"
	},
	{
		name: "exit",
		description: "退出",
		source: "TUI",
		behavior: "local"
	}
]);
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
function projectionRecord(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
function nonnegativeNumber$1(record, key) {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function compactNumber(value) {
	const scaled = (number) => number >= 100 ? String(Math.round(number)) : String(Math.round(number * 10) / 10);
	if (value < 1e3) return String(Math.round(value));
	if (value < 1e6) return `${scaled(value / 1e3)}K`;
	return `${scaled(value / 1e6)}M`;
}
function durationText$1(milliseconds) {
	const seconds = milliseconds / 1e3;
	if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
	const whole = Math.round(seconds);
	return `${Math.floor(whole / 60)}m${whole % 60}s`;
}
function assistantText(message) {
	return message.blocks.flatMap((block$1) => {
		if (block$1.kind === "text") return [block$1.text];
		if (block$1.kind === "image") return ["[图片]"];
		return [];
	}).join("\n").trim();
}
function latestModelRoute(snapshot) {
	const request = snapshot.views.get("trajectory")?.requests.findLast((candidate) => candidate.purpose === "assistant" && candidate.requestConfig !== void 0);
	if (request?.requestConfig !== void 0) {
		const effort$1 = request.requestConfig.reasoningEffort;
		return `${request.requestConfig.provider}/${request.requestConfig.model}${effort$1 === void 0 ? "" : ` · ${effort$1}`}`;
	}
	const message = snapshot.nodes.findLast((node) => node.kind === "assistant" && (node.requestConfig !== void 0 || node.provenance !== void 0));
	if (message?.kind !== "assistant") return void 0;
	const provider = message.requestConfig?.provider ?? message.provenance?.provider;
	const model = message.requestConfig?.model ?? message.provenance?.model;
	if (provider === void 0 || model === void 0) return void 0;
	const effort = message.requestConfig?.reasoningEffort;
	return `${provider}/${model}${effort === void 0 ? "" : ` · ${effort}`}`;
}
function isAssistantMessage(value) {
	return typeof value === "object" && value !== null && "kind" in value && value.kind === "assistant" && "seq" in value && typeof value.seq === "number" && "blocks" in value && Array.isArray(value.blocks);
}
async function saveExport(path$1, stream) {
	await mkdir(dirname$1(path$1), { recursive: true });
	const file = await open(path$1, "wx").catch(async (error) => {
		await stream.cancel("export destination unavailable").catch(() => void 0);
		throw error;
	});
	const reader = stream.getReader();
	let bytes = 0;
	let complete = false;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			let offset = 0;
			while (offset < next.value.byteLength) {
				const result = await file.write(next.value, offset, next.value.byteLength - offset, null);
				if (result.bytesWritten < 1) throw new Error("写入 Session Export 时没有取得进展");
				offset += result.bytesWritten;
				bytes += result.bytesWritten;
			}
		}
		await file.sync();
		complete = true;
		return bytes;
	} finally {
		if (!complete) await reader.cancel("export write failed").catch(() => void 0);
		reader.releaseLock();
		await file.close().catch(() => void 0);
		if (!complete) await unlink(path$1).catch(() => void 0);
	}
}
function isPermissionSelect(value) {
	if (typeof value !== "object" || value === null) return false;
	const record = value;
	if (typeof record.currentValue !== "string" || !Array.isArray(record.options)) return false;
	return record.options.every((option) => {
		if (typeof option !== "object" || option === null) return false;
		const row = option;
		return typeof row.value === "string" && typeof row.name === "string" && (row.description === void 0 || typeof row.description === "string");
	});
}
function isImageLimits(value) {
	if (typeof value !== "object" || value === null) return false;
	const row = value;
	return typeof row.maxImageBytes === "number" && typeof row.maxImagesPerMessage === "number" && typeof row.maxMessageImageBytes === "number" && typeof row.maxImagePixels === "number" && Array.isArray(row.mediaTypes) && row.mediaTypes.every((item) => typeof item === "string");
}
function mediaTypeOf(bytes, path$1) {
	if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
	if (String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" || String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a") return "image/gif";
	if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
	const lower = path$1.toLowerCase();
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".webp")) return "image/webp";
}
function workspaceFor(sessionId, path$1, workspaces) {
	return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId)) ?? workspaces.find((workspace) => workspace.path === path$1);
}
/**
* Compatibility controller used by terminal components. It stores only
* cancellable catalog caches and draft images; every durable read/write goes
* through the mounted Harness API, Remote, Session, or Workspace face.
*/
var HarnessTuiCapabilities = class {
	commandCatalogs = /* @__PURE__ */ new Map();
	modelCatalogs = /* @__PURE__ */ new Map();
	modelLoads = /* @__PURE__ */ new Map();
	attachments = [];
	modelGeneration = 0;
	/**
	* @param ctx - isolated Harness Client Context.
	* @param api - in-process API Proxy client used by the same Context.
	* @param profile - launcher-selected Profile name.
	* @param initialWorkspacePath - startup fallback until the current list row lands.
	*/
	constructor(ctx, api, profile, initialWorkspacePath, management) {
		this.ctx = ctx;
		this.api = api;
		this.profile = profile;
		this.initialWorkspacePath = initialWorkspacePath;
		this.management = management;
		ctx.remote.$on("commands/change", () => {
			this.commandCatalogs.clear();
		});
		ctx.remote.$on("agent-preset/selected", (sessionId) => {
			this.commandCatalogs.delete(sessionId);
			this.invalidateModels();
		});
		ctx.remote.$on("llm/adapters-updated", () => {
			this.invalidateModels();
		});
		ctx.remote.$on("settings/document-updated", () => {
			this.invalidateModels();
		});
		ctx.on("connection/reset", () => {
			this.commandCatalogs.clear();
			this.invalidateModels();
		});
	}
	/**
	* Access the direct same-process management bridge when the launcher supplied it.
	* @returns Host Settings/Profile/plugin bridge.
	*/
	managementBridge() {
		if (this.management === void 0) throw new Error("当前 launcher 未提供 Settings/Profile/插件管理能力");
		return this.management;
	}
	/**
	* Read the Profile selected by the launcher.
	* @returns launcher-selected current Profile name.
	*/
	currentProfile() {
		return this.profile;
	}
	/**
	* Resolve the Runtime's current selection and stable Session face.
	* @returns the active Session binding, or undefined when selection is empty.
	*/
	active() {
		const sessions = this.ctx.sessions.list.getSnapshot();
		const sessionId = sessions.current;
		if (sessionId === void 0) return void 0;
		const summary = sessions.byId[sessionId];
		const binding = this.ctx.sessions.binding(sessionId);
		if (summary === void 0 || binding === void 0) return void 0;
		const workspacePath = summary.cwd ?? this.initialWorkspacePath;
		const workspace = workspaceFor(sessionId, workspacePath, this.ctx.workspaces.list.getSnapshot().items);
		return {
			sessionId,
			session: binding.session,
			summary,
			workspacePath,
			...workspace === void 0 ? {} : { workspaceId: workspace.workspaceId }
		};
	}
	/**
	* Follow selection changes and the currently selected Session snapshot.
	* @param listener - receives the active binding and snapshot, or two undefined values after selection clears.
	* @returns disposer for both Runtime subscriptions.
	*/
	subscribeActive(listener) {
		let selected;
		let stopSession = () => void 0;
		const bind = () => {
			const active = this.active();
			if (active === void 0) {
				if (selected !== void 0) {
					stopSession();
					stopSession = () => void 0;
					selected = void 0;
				}
				listener(void 0, void 0);
				return;
			}
			if (selected !== active.sessionId) {
				stopSession();
				selected = active.sessionId;
				const notify = () => {
					const current = this.active();
					if (current === void 0 || current.sessionId !== selected) return;
					listener(current, current.session.getSnapshot());
				};
				stopSession = active.session.subscribe(notify);
			}
			listener(active, active.session.getSnapshot());
		};
		const stopList = this.ctx.sessions.list.subscribe(bind);
		bind();
		return () => {
			stopSession();
			stopList();
		};
	}
	/**
	* Read the current status strip, optionally refreshing the model directory.
	* @param refreshModel - whether to repull model metadata before rendering.
	* @returns status facts derived from current Harness projections.
	*/
	async headerFacts(refreshModel = false) {
		const active = this.requireActive();
		if (refreshModel || !this.modelCatalogs.has(active.sessionId)) await this.loadModels(active.sessionId).catch(() => void 0);
		const model = this.modelCatalogs.get(active.sessionId)?.current;
		const modelRoute = model === void 0 ? latestModelRoute(active.session.getSnapshot()) : `${model.provider}/${model.model}${model.reasoningEffort === void 0 ? "" : ` · ${model.reasoningEffort}`}`;
		const permission = this.permissionValue(active.session);
		const context = this.sessionStatistics().context;
		return {
			hostVersion: this.ctx.connection.hostDescription.getSnapshot()?.version ?? "未知",
			nodeVersion: process.version,
			platform: process.platform,
			architecture: process.arch,
			profile: this.profile,
			workspace: active.workspacePath,
			session: active.summary.displayTitle,
			mode: active.summary.agentPreset ?? "未声明",
			model: modelRoute ?? "",
			permission: permission?.currentValue ?? "未提供",
			running: active.session.getSnapshot().running,
			...context === void 0 ? {} : { context }
		};
	}
	/**
	* Dynamically merge TUI commands, the current Host command directory, and user-invocable Skills.
	* @param signal - optional cancellation signal for Host catalog requests.
	* @returns the merged, collision-checked command catalog.
	*/
	commandCatalog(signal) {
		signal?.throwIfAborted();
		const sessionId = this.active()?.sessionId;
		if (sessionId === void 0) return Promise.resolve(TUI_COMMANDS);
		const existing = this.commandCatalogs.get(sessionId);
		const request = existing ?? this.readCommandCatalog(sessionId).catch((error) => {
			this.commandCatalogs.delete(sessionId);
			throw error;
		});
		if (existing === void 0) this.commandCatalogs.set(sessionId, request);
		if (signal === void 0) return request;
		return request.then((catalog) => {
			signal.throwIfAborted();
			return catalog;
		});
	}
	/** Invalidate the current command/Skill snapshot and repull on next use. */
	invalidateCommandCatalog() {
		const id = this.active()?.sessionId;
		if (id !== void 0) this.commandCatalogs.delete(id);
	}
	/**
	* List every Host Agent Preset without a client-side enum.
	* @returns the current Host-owned mode directory.
	*/
	async listModes() {
		const active = this.requireActive();
		const response = await this.api.agentPresets.list({});
		if (!response.result.ok) throw new Error(`读取模式失败：${response.result.error.message}`);
		return response.result.value.presets.map((preset) => ({
			id: preset.id,
			label: preset.name ?? preset.id,
			...preset.description === void 0 ? {} : { description: preset.description },
			trust: preset.trust,
			current: active.summary.agentPreset === preset.id,
			isDefault: preset.isDefault,
			...preset.broken === void 0 ? {} : { disabledReason: preset.broken }
		}));
	}
	/**
	* Whether selecting another Preset must create a same-workspace session.
	* @returns true when the active Session already contains conversation state.
	*/
	modeNeedsNewSession() {
		return !this.requireActive().summary.blank;
	}
	/**
	* Apply a Preset to a blank session or to a newly connected blank in the same Workspace.
	* @param agentPreset - opaque Host Agent Preset identifier.
	* @param allowNewSession - whether an active conversation may move to a new blank Session.
	* @returns the Session receiving the selected Preset.
	*/
	async selectMode(agentPreset, allowNewSession) {
		const source = this.requireActive();
		let target = source;
		if (!source.summary.blank) {
			if (!allowNewSession) throw new Error("活跃会话不能原地切换模式");
			let workspaceId = source.workspaceId;
			if (workspaceId === void 0) workspaceId = (await this.ctx.workspaces.create({ path: source.workspacePath })).workspaceId;
			const sessionId = await this.ctx.workspaces.connectWorkspace(workspaceId);
			const summary = this.ctx.sessions.list.getSnapshot().byId[sessionId];
			const binding = this.ctx.sessions.binding(sessionId);
			if (summary === void 0 || binding === void 0 || sessionId === source.sessionId) throw new Error("Harness 未提供可用于模式切换的同工作区空白会话");
			target = {
				sessionId,
				session: binding.session,
				summary,
				workspacePath: summary.cwd ?? source.workspacePath,
				workspaceId
			};
		}
		const response = await this.api.agentPresets.select({
			sessionId: target.sessionId,
			agentPreset
		});
		if (!response.result.ok) throw new Error(`切换模式失败：${response.result.error.message}`);
		this.ctx.sessions.noteAgentPreset(target.sessionId, response.result.value.agentPreset);
		this.ctx.sessions.open(target.sessionId);
		this.commandCatalogs.delete(target.sessionId);
		return target.sessionId;
	}
	/**
	* Load the current session's Provider/model directory.
	* @param sessionId - Session whose routable model directory should be read.
	* @returns the current Provider/model directory.
	*/
	loadModels(sessionId = this.requireActive().sessionId) {
		const existing = this.modelLoads.get(sessionId);
		if (existing !== void 0) return existing;
		const generation = this.modelGeneration;
		const request = this.api.sessions.models({ sessionId }).then((response) => {
			if (!response.result.ok) throw new Error(`读取模型失败：${response.result.error.message}`);
			if (generation === this.modelGeneration) this.modelCatalogs.set(sessionId, response.result.value);
			return response.result.value;
		}).finally(() => {
			if (this.modelLoads.get(sessionId) === request) this.modelLoads.delete(sessionId);
		});
		this.modelLoads.set(sessionId, request);
		return request;
	}
	/**
	* Flatten the Host model groups while keeping selection values opaque.
	* @returns terminal options, adapter failures, and route availability.
	*/
	async listModels() {
		const directory = await this.loadModels();
		return {
			options: directory.groups.flatMap((group) => group.models.map((model) => ({
				id: `${group.id}\u0000${model.id}`,
				label: model.name,
				description: `${group.name}${model.description === void 0 ? "" : ` · ${model.description}`}`,
				selection: {
					provider: group.id,
					model: model.id
				},
				efforts: model.reasoning?.efforts ?? [],
				...model.reasoning?.defaultEffort === void 0 ? {} : { defaultEffort: model.reasoning.defaultEffort },
				current: directory.current.provider === group.id && directory.current.model === model.id
			}))),
			failures: directory.failures.map((failure) => `${failure.name}: ${failure.message}`),
			routable: directory.routable
		};
	}
	/**
	* Select one complete Provider/model/reasoning route through session.selectModel.
	* @param selection - complete opaque route selected from the Host directory.
	*/
	async selectModel(selection) {
		const active = this.requireActive();
		const response = await this.api.sessions.selectModel({
			sessionId: active.sessionId,
			...selection
		});
		if (!response.result.ok) throw new Error(`切换模型失败：${response.result.error.message}`);
		const current = this.modelCatalogs.get(active.sessionId);
		this.invalidateModels();
		if (current !== void 0) this.modelCatalogs.set(active.sessionId, {
			...current,
			current: response.result.value.selected,
			routable: true
		});
		else await this.loadModels(active.sessionId);
	}
	/**
	* Read the dynamic permission directory from the official Session projection.
	* @returns Host-ordered permission choices with conservative risk metadata.
	*/
	listPermissions() {
		const value = this.permissionValue(this.requireActive().session);
		if (value === void 0) throw new Error("当前 Profile 未提供权限投影");
		return value.options.filter((option) => option.value !== "custom").map((option) => ({
			id: option.value,
			label: option.name,
			...option.description === void 0 ? {} : { description: option.description },
			current: option.value === value.currentValue,
			needsConfirmation: this.permissionNeedsConfirmation(option.value)
		}));
	}
	/**
	* Return the next Host-ordered permission option for Shift+Tab.
	* @returns the next cyclic permission option.
	*/
	nextPermission() {
		const options$1 = this.listPermissions();
		if (options$1.length === 0) throw new Error("当前 Profile 没有可切换的权限预设");
		return options$1[(options$1.findIndex((option) => option.current) + 1 + options$1.length) % options$1.length];
	}
	/**
	* Unknown options carry no risk metadata today and therefore confirm conservatively.
	* @param id - Host permission value.
	* @returns true when the transition requires explicit confirmation.
	*/
	permissionNeedsConfirmation(id) {
		return id === FULL_ACCESS_PRESET || !SAFE_PERMISSION_PRESETS.has(id);
	}
	/**
	* Submit the existing Host /permission command; no local permission state is written.
	* @param id - Host permission value selected by the user.
	*/
	async selectPermission(id) {
		const result = await this.requireActive().session.command(`/permission ${id}`);
		if (!result.ok) throw new Error(`切换权限失败：${result.error.message}`);
		if (!result.value.matched) throw new Error(`Host 未识别权限预设 ${JSON.stringify(id)}`);
	}
	/**
	* Record session-level feedback through the existing Host command while the
	* TUI decorator supplies terminal-native input and message-rating choices.
	* @param text - human-authored session feedback.
	*/
	async recordSessionFeedback(text) {
		const normalized = text.trim();
		if (normalized === "") throw new Error("会话反馈不能为空");
		const result = await this.requireActive().session.command(`/feedback ${normalized}`);
		if (!result.ok) throw new Error(`提交会话反馈失败：${result.error.message}`);
		if (!result.value.matched) throw new Error("当前 Profile 未提供会话反馈功能");
	}
	/**
	* Visible, non-archived session rows in Runtime order.
	* @returns the current visible Session registry.
	*/
	listSessions() {
		const sessions = this.ctx.sessions.list.getSnapshot();
		const archived = new Set(this.ctx.workspaces.list.getSnapshot().archivedSessionIds);
		return sessions.ids.flatMap((id) => {
			const row = sessions.byId[id];
			return row === void 0 || archived.has(id) ? [] : [row];
		});
	}
	/**
	* Search visible session message content through the Host index.
	* @param query - non-blank literal phrase.
	* @param signal - cancellation for a superseded search.
	* @returns bounded Host search hits.
	*/
	async searchSessions(query, signal) {
		const result = await this.ctx.sessions.search(query, signal);
		if (!result.ok) throw new Error(`搜索会话失败：${result.error.message}`);
		return result.value;
	}
	/**
	* Select an existing Runtime session.
	* @param sessionId - existing Session identifier.
	*/
	openSession(sessionId) {
		if (this.ctx.sessions.list.getSnapshot().byId[sessionId] === void 0) throw new Error(`找不到会话 ${sessionId}`);
		this.ctx.sessions.open(sessionId);
	}
	/**
	* Start or reuse the selected Workspace's blank session through Workspace Runtime.
	* @param workspaceId - optional explicit Workspace selection.
	* @returns the opened blank Session, or undefined when no Workspace exists.
	*/
	async newSession(workspaceId) {
		const active = this.active();
		const target = workspaceId ?? active?.workspaceId ?? this.ctx.workspaces.list.getSnapshot().recentWorkspaceId;
		if (target === void 0) {
			this.ctx.sessions.clear();
			return;
		}
		const sessionId = await this.ctx.workspaces.connectWorkspace(target);
		this.ctx.sessions.open(sessionId);
		return sessionId;
	}
	/**
	* Fork the current session at its latest completed turn and open the child.
	* @returns the opened child Session identifier.
	*/
	async forkSession() {
		const sessionId = await this.ctx.sessions.fork({
			sessionId: this.requireActive().sessionId,
			increaseTitle: true
		});
		this.ctx.sessions.open(sessionId);
		return sessionId;
	}
	/**
	* Rename the current session through the Session face.
	* @param title - requested Session title.
	* @returns the title accepted by the Host.
	*/
	async renameSession(title) {
		const result = await this.requireActive().session.rename(title);
		if (!result.ok) throw new Error(`重命名失败：${result.error.message}`);
		return result.value.title;
	}
	/** Archive the current session through Workspace Runtime. */
	async archiveSession() {
		await this.ctx.workspaces.archiveSession(this.requireActive().sessionId);
	}
	/**
	* Current Workspace registry projection.
	* @returns the current Host-owned Workspace rows.
	*/
	listWorkspaces() {
		return this.ctx.workspaces.list.getSnapshot().items;
	}
	/**
	* Register a path, connect its blank session, and open it.
	* @param path - user-selected Workspace path.
	* @returns the opened blank Session identifier.
	*/
	async openWorkspace(path$1) {
		const workspace = await this.ctx.workspaces.create({ path: resolve(path$1) });
		const sessionId = await this.ctx.workspaces.connectWorkspace(workspace.workspaceId);
		this.ctx.sessions.open(sessionId);
		return sessionId;
	}
	/**
	* Open a registered Workspace through its reusable blank Session.
	* @param workspaceId - target Harness Workspace.
	* @returns opened Session id.
	*/
	async selectWorkspace(workspaceId) {
		const sessionId = await this.ctx.workspaces.connectWorkspace(workspaceId);
		this.ctx.sessions.open(sessionId);
		return sessionId;
	}
	/**
	* Rename a Workspace through the Runtime domain.
	* @param workspaceId - authoritative Workspace identifier.
	* @param title - requested display title.
	* @returns updated Host-owned Workspace row.
	*/
	renameWorkspace(workspaceId, title) {
		return this.ctx.workspaces.rename(workspaceId, title);
	}
	/**
	* Remove only a Workspace registry row; files and Session logs remain untouched.
	* @param workspaceId - authoritative Workspace identifier.
	*/
	deleteWorkspace(workspaceId) {
		return this.ctx.workspaces.delete(workspaceId);
	}
	/**
	* Move one Workspace before another, or append it when the anchor is omitted.
	* @param workspaceId - Workspace being moved.
	* @param beforeWorkspaceId - optional insertion anchor.
	*/
	moveWorkspace(workspaceId, beforeWorkspaceId) {
		return this.ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId);
	}
	/**
	* Move an accounted Session inside its Workspace-owned manual order.
	* @param workspaceId - Workspace that owns the manual order.
	* @param sessionId - Session being moved.
	* @param beforeSessionId - optional insertion anchor.
	* @returns updated Host-owned Workspace row.
	*/
	moveWorkspaceSession(workspaceId, sessionId, beforeSessionId) {
		return this.ctx.workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId);
	}
	/**
	* Add a validated image path to the transient next-prompt draft.
	* @param rawPath - absolute or Workspace-relative image path.
	* @returns validated transient attachment metadata and bytes.
	*/
	async addAttachment(rawPath) {
		const active = this.requireActive();
		let input = rawPath.trim();
		if (input.startsWith("\"") && input.endsWith("\"") || input.startsWith("'") && input.endsWith("'")) input = input.slice(1, -1);
		if (input === "") throw new Error("附件路径不能为空");
		let path$1;
		if (input.startsWith("file://")) try {
			path$1 = fileURLToPath(input);
		} catch {
			throw new Error("附件 file URL 无效");
		}
		else if (input === "~") path$1 = homedir$1();
		else if (/^~[/\\]/u.test(input)) path$1 = resolve(homedir$1(), input.slice(2));
		else path$1 = resolve(active.workspacePath, input);
		if (!(await stat(path$1)).isFile()) throw new Error("附件路径不是文件");
		const bytes = await readFile(path$1);
		const mediaType = mediaTypeOf(bytes, path$1);
		if (mediaType === void 0) throw new Error("只支持 PNG、JPEG、GIF 或 WebP 图片");
		const data = bytes.toString("base64");
		const dimensions = getImageDimensions(data, mediaType);
		const limitsValue = active.session.projections.faceOf("imageLimits").getSnapshot();
		const limits = isImageLimits(limitsValue) ? limitsValue : void 0;
		if (limits !== void 0) {
			if (!limits.mediaTypes.includes(mediaType)) throw new Error(`当前 Host 不接受 ${mediaType}`);
			if (bytes.byteLength > limits.maxImageBytes) throw new Error(`图片超过单文件限制 ${limits.maxImageBytes} 字节`);
			if (this.attachments.length + 1 > limits.maxImagesPerMessage) throw new Error(`每条消息最多 ${limits.maxImagesPerMessage} 张图片`);
			if (this.attachments.reduce((sum, item) => sum + item.bytes, 0) + bytes.byteLength > limits.maxMessageImageBytes) throw new Error(`图片总大小超过 ${limits.maxMessageImageBytes} 字节`);
			if (dimensions !== null && dimensions.widthPx * dimensions.heightPx > limits.maxImagePixels) throw new Error(`图片像素超过 ${limits.maxImagePixels}`);
		}
		const attachment = {
			path: path$1,
			name: basename$1(path$1),
			mediaType,
			data,
			bytes: bytes.byteLength,
			...dimensions === null ? {} : {
				width: dimensions.widthPx,
				height: dimensions.heightPx
			}
		};
		this.attachments.push(attachment);
		return attachment;
	}
	/**
	* Snapshot of transient image drafts.
	* @returns a copy of the next-prompt attachment list.
	*/
	draftAttachments() {
		return [...this.attachments];
	}
	/** Clear transient image drafts without touching durable attachment storage. */
	clearAttachments() {
		this.attachments.splice(0);
	}
	/**
	* Build the next official prompt payload from text and temporary image bytes.
	* @param text - current editor text.
	* @returns the official multimodal prompt content array.
	*/
	promptContent(text) {
		return [...text === "" ? [] : [{
			type: "text",
			text
		}], ...this.attachments.map((item) => ({
			type: "image",
			mediaType: item.mediaType,
			data: item.data,
			name: item.name
		}))];
	}
	/**
	* Read one Host-computed Session projection by its open extension key.
	* @param key - Session projection key registered by the active Profile.
	* @returns current whole value, or undefined when the capability is absent.
	*/
	projection(key) {
		return this.requireActive().session.projections.faceOf(key).getSnapshot();
	}
	/**
	* Read every projection value mirrored on the current Session summary.
	* @returns sorted open-key entries; unknown future keys remain visible.
	*/
	projectionEntries() {
		return Object.entries(this.requireActive().summary.projectionValues ?? {}).sort(([left], [right]) => left.localeCompare(right));
	}
	/**
	* Format durable usage, latency, throughput, and context projections without
	* assuming that every Profile mounts every projection unit.
	* @returns available statistics lines and an optional compact context label.
	*/
	sessionStatistics() {
		const usage = projectionRecord(this.projection("tokenUsage"));
		const stats = projectionRecord(this.projection("sessionStats"));
		const pressure = projectionRecord(this.projection("contextPressure"));
		const breakdown = projectionRecord(this.projection("contextBreakdown"));
		const lines = [];
		const turns = nonnegativeNumber$1(stats, "turns");
		const steps = nonnegativeNumber$1(stats, "steps");
		if (turns !== void 0 || steps !== void 0) lines.push(`轮次 ${turns === void 0 ? "未知" : compactNumber(turns)} · 步骤 ${steps === void 0 ? "未知" : compactNumber(steps)}`);
		const llmMs = nonnegativeNumber$1(stats, "llmMs");
		const toolMs = nonnegativeNumber$1(stats, "toolMs");
		const durations = [...llmMs === void 0 || llmMs === 0 ? [] : [`模型 ${durationText$1(llmMs)}`], ...toolMs === void 0 || toolMs === 0 ? [] : [`工具 ${durationText$1(toolMs)}`]];
		if (durations.length > 0) lines.push(durations.join(" · "));
		const ttftMs = nonnegativeNumber$1(stats, "ttftMs");
		const ttftSteps = nonnegativeNumber$1(stats, "ttftSteps");
		const decodeMs = nonnegativeNumber$1(stats, "decodeMs");
		const decodeTokens = nonnegativeNumber$1(stats, "decodeTokens");
		const performance$1 = [...ttftMs === void 0 || ttftSteps === void 0 || ttftSteps === 0 ? [] : [`首 Token 平均 ${durationText$1(ttftMs / ttftSteps)}`], ...decodeMs === void 0 || decodeTokens === void 0 || decodeMs === 0 ? [] : [`${Math.round(decodeTokens / (decodeMs / 1e3) * 10) / 10} tok/s`]];
		if (performance$1.length > 0) lines.push(performance$1.join(" · "));
		const uncached = nonnegativeNumber$1(usage, "uncachedInputTokens");
		const cacheRead = nonnegativeNumber$1(usage, "cacheReadTokens");
		const cacheWrite = nonnegativeNumber$1(usage, "cacheWriteTokens");
		const output = nonnegativeNumber$1(usage, "outputTokens");
		if (uncached !== void 0 && cacheRead !== void 0 && cacheWrite !== void 0 && output !== void 0) {
			const input = uncached + cacheRead + cacheWrite;
			const cache = input === 0 ? void 0 : Math.round(cacheRead / input * 100);
			lines.push(`Token 输入 ${compactNumber(input)} · 输出 ${compactNumber(output)}${cache === void 0 ? "" : ` · 缓存命中 ${cache}%`}`);
		}
		const used = nonnegativeNumber$1(pressure, "projectedTokens") ?? nonnegativeNumber$1(pressure, "pressureTokens");
		const capacity = nonnegativeNumber$1(pressure, "contextWindow");
		const context = used === void 0 || capacity === void 0 || capacity === 0 ? void 0 : `${Math.min(100, Math.round(used / capacity * 100))}% · ~${compactNumber(used)}/${compactNumber(capacity)}`;
		if (context !== void 0) lines.push(`上下文 ${context}`);
		const system = nonnegativeNumber$1(breakdown, "systemTokens");
		const tools = nonnegativeNumber$1(breakdown, "toolsTokens");
		const messages = nonnegativeNumber$1(breakdown, "messageTokens");
		if (system !== void 0 && tools !== void 0 && messages !== void 0) lines.push(`上下文估算：系统 ~${compactNumber(system)} · 工具 ~${compactNumber(tools)} · 消息 ~${compactNumber(messages)}`);
		return {
			lines,
			...context === void 0 ? {} : { context }
		};
	}
	/**
	* Read the shared Trajectory target assembled from Harness Session events.
	* @returns current Trajectory snapshot, or undefined before the target is available.
	*/
	trajectory() {
		return this.requireActive().session.getSnapshot().views.get("trajectory");
	}
	/**
	* Read the dynamic tool catalog recorded on the newest ordinary request.
	* @returns exact provider-bound tool schemas, or an empty list before the first request.
	*/
	toolCatalog() {
		const request = this.trajectory()?.requests.findLast((candidate) => candidate.purpose === "assistant");
		return request?.purpose === "assistant" ? (request.prompt?.tools ?? []).map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		})) : [];
	}
	/**
	* Read the newest closing turn's produced paths from shared Deliverables data.
	* @returns first-seen Workspace-relative paths, or an empty list when absent.
	*/
	producedFiles() {
		const snapshot = this.requireActive().session.getSnapshot();
		for (const key of snapshot.chat.order.toReversed()) {
			const node = snapshot.chat.nodes.get(key);
			if (node === void 0 || node.visibility !== "visible" || node.location.kind === "session" || node.location.kind === "unresolved" || !isAssistantMessage(node.data)) continue;
			const paths = producedForClosing(node.location.turn.data.get("deliverables"), node.data.seq);
			if (paths.length > 0) return paths;
		}
		return [];
	}
	/**
	* Ask the Harness Workspace Runtime to open one produced path.
	* @param path - Workspace-relative or absolute file path selected by the user.
	*/
	async openProducedFile(path$1) {
		const active = this.requireActive();
		await this.ctx.workspaces.openPath(resolve(active.workspacePath, path$1));
	}
	/**
	* Resolve one produced path using the active Harness Workspace root.
	* @param path - Workspace-relative or absolute file path.
	* @returns platform-normalized absolute path suitable for clipboard export.
	*/
	producedFilePath(path$1) {
		return resolve(this.requireActive().workspacePath, path$1);
	}
	/**
	* Read the current Session's Host-mirrored background Jobs.
	* @returns current immutable Job views.
	*/
	jobs() {
		const active = this.requireActive();
		return this.ctx.sessions.list.getSnapshot().jobsBySession[active.sessionId] ?? [];
	}
	/**
	* Mark whether the direct-child catalog is visibly open.
	* @param parentSessionId - parent whose direct-child catalog is being shown.
	* @param open - current Surface state.
	*/
	setSubagentCatalogOpen(parentSessionId, open$1) {
		this.ctx.sessions.setSubagentCatalogOpen(parentSessionId, open$1);
	}
	/**
	* Refresh and read the active Session's direct-child catalog.
	* @param refresh - whether to force a Host catalog read first.
	* @returns healthy and diagnostic rows with exact continuation addresses.
	*/
	async subagents(refresh = false) {
		const active = this.requireActive();
		if (refresh) await this.ctx.sessions.refreshSubagents(active.sessionId);
		const list$1 = this.ctx.sessions.list.getSnapshot();
		const catalog = list$1.subagentsByParent[active.sessionId];
		if (catalog?.state === "error") throw new Error(`读取子 Agent 失败：${catalog.error?.message ?? "未知错误"}`);
		const now = Date.now();
		return (catalog?.entries ?? []).map((entry) => {
			const summary = list$1.byId[entry.id];
			const projectionValues = projectionRecord(summary?.projectionValues);
			const usage = projectionRecord(projectionValues?.tokenUsage);
			const buckets = [
				nonnegativeNumber$1(usage, "uncachedInputTokens"),
				nonnegativeNumber$1(usage, "outputTokens"),
				nonnegativeNumber$1(usage, "cacheReadTokens"),
				nonnegativeNumber$1(usage, "cacheWriteTokens")
			];
			const completeBuckets = buckets.filter((value) => value !== void 0);
			const totalTokens = completeBuckets.length === buckets.length ? completeBuckets.reduce((total, value) => total + value, 0) : void 0;
			const timing = projectionRecord(projectionValues?.subagentTiming);
			const settled = nonnegativeNumber$1(timing, "settledMs");
			const activeTiming = projectionRecord(timing?.active);
			const since = nonnegativeNumber$1(activeTiming, "since");
			const through = nonnegativeNumber$1(activeTiming, "through");
			const durationMs = settled === void 0 ? void 0 : settled + (since === void 0 ? 0 : Math.max(0, (entry.kind === "child" && entry.activity === "running" ? now : through ?? now) - since));
			return {
				entry,
				...entry.kind === "child" ? { address: {
					parentSessionId: active.sessionId,
					childSessionId: entry.id,
					mode: entry.mode
				} } : {},
				...totalTokens === void 0 ? {} : { totalTokens },
				...durationMs === void 0 ? {} : { durationMs }
			};
		});
	}
	/**
	* Open one catalog-derived child without activating an unrelated Agent.
	* @param address - exact durable direct-parent address.
	*/
	openSubagent(address) {
		this.ctx.sessions.openSubagent(address);
	}
	/**
	* Read user-invocable Skills for the active Session project.
	* @returns authoritative Skill catalog.
	*/
	async skills() {
		const response = await this.api.skills.list({ sessionId: this.requireActive().sessionId });
		if (!response.result.ok) throw new Error(`读取 Skill 失败：${response.result.error.message}`);
		return response.result.value.skills;
	}
	/**
	* Read current live Loader entries through the generated pluginInventory Remote.
	* @returns Host-owned inventory rows.
	*/
	async pluginInventory() {
		const carried = await this.ctx.remote.pluginInventory.list();
		if (!carried.ok) throw new Error(`读取插件运行状态失败：${carried.error.message}`);
		return carried.value.entries;
	}
	/**
	* Read persisted feedback beside every eligible loaded Assistant message.
	* @returns newest-first targets with their current CAS item when present.
	*/
	async feedbackTargets() {
		const active = this.requireActive();
		const carried = await this.ctx.remote.messageFeedback.list({ sessionId: active.sessionId });
		if (!carried.ok) throw new Error(`读取反馈失败：${carried.error.message}`);
		if (!carried.value.ok) throw new Error(`读取反馈失败：${carried.value.error.code}`);
		const items = carried.value.value.items;
		const feedback = new Map(items.map((item) => [item.messageId, item]));
		return active.session.getSnapshot().nodes.flatMap((node) => {
			if (node.kind !== "assistant" || node.messageId === void 0) return [];
			const text = assistantText(node);
			const item = feedback.get(node.messageId);
			return [{
				message: node,
				preview: text.replace(/\s+/gu, " ").slice(0, 160) || "[无文本回复]",
				...item === void 0 ? {} : { feedback: item }
			}];
		}).reverse();
	}
	/**
	* Create or replace one message-feedback item using its observed CAS version.
	* @param messageId - persisted Assistant message identity.
	* @param rating - desired positive or negative judgment.
	* @param note - optional non-blank human explanation.
	* @param ifVersion - observed feedback revision, or null for first creation.
	* @returns committed authoritative feedback item.
	*/
	async putFeedback(messageId, rating, note, ifVersion) {
		const carried = await this.ctx.remote.messageFeedback.put({
			sessionId: this.requireActive().sessionId,
			messageId,
			rating,
			...note === void 0 ? {} : { note },
			ifVersion
		});
		if (!carried.ok) throw new Error(`提交反馈失败：${carried.error.message}`);
		if (!carried.value.ok) throw new Error(`提交反馈失败：${carried.value.error.code}`);
		return carried.value.value;
	}
	/**
	* Remove one observed message-feedback item.
	* @param messageId - persisted Assistant message identity.
	* @param ifVersion - observed feedback revision.
	*/
	async clearFeedback(messageId, ifVersion) {
		const carried = await this.ctx.remote.messageFeedback.delete({
			sessionId: this.requireActive().sessionId,
			messageId,
			ifVersion
		});
		if (!carried.ok) throw new Error(`删除反馈失败：${carried.error.message}`);
		if (!carried.value.ok) throw new Error(`删除反馈失败：${carried.value.error.code}`);
	}
	/**
	* Read the newest durable Assistant response as plain visible text.
	* @returns response text, or undefined when no eligible response is loaded.
	*/
	lastAssistantText() {
		const node = this.requireActive().session.getSnapshot().nodes.findLast((candidate) => candidate.kind === "assistant");
		if (node?.kind !== "assistant") return void 0;
		const text = assistantText(node);
		return text === "" ? void 0 : text;
	}
	/**
	* Stream the Host's native Session-log ZIP into one exclusive destination.
	* @param requestedPath - absolute or Workspace-relative destination.
	* @param includeDescendants - whether the Host includes subagent Session artifacts.
	* @returns saved path, byte count, media type, and scope.
	*/
	async exportSession(requestedPath, includeDescendants = false) {
		const active = this.requireActive();
		const payload = await this.managementBridge().sessionExport.download(active.sessionId, includeDescendants);
		const path$1 = resolve(active.workspacePath, requestedPath ?? payload.suggestedFilename);
		return {
			path: path$1,
			bytes: await saveExport(path$1, payload.stream),
			mediaType: payload.mediaType,
			includeDescendants
		};
	}
	/**
	* Apply one queue action through the current Session face.
	* @param itemId - authoritative queue item identifier.
	* @param action - official Session queue mutation.
	*/
	async updateQueue(itemId, action) {
		const result = await this.requireActive().session.updateQueue(itemId, action);
		if (!result.ok) throw new Error(`队列操作失败：${result.error.message}`);
	}
	/**
	* Answer a Runtime-owned approval wait with the Host protocol's correlated value.
	* @param wait - correlated Runtime approval interaction.
	* @param outcome - Host-supported one-shot allow or rejection.
	*/
	async answerApproval(wait, outcome) {
		const receipt = await wait.respond({
			ok: true,
			value: {
				sessionId: wait.sessionId,
				approvalId: wait.payload.approvalId,
				outcome
			}
		});
		if (!receipt.accepted) throw new Error(`审批响应被拒绝：${receipt.reason}`);
	}
	/**
	* Answer a Runtime-owned question wait with a complete structured batch.
	* @param wait - correlated Runtime question interaction.
	* @param answer - complete structured answer batch.
	*/
	async answerQuestion(wait, answer) {
		const receipt = await wait.respond({
			ok: true,
			value: {
				sessionId: wait.sessionId,
				answer
			}
		});
		if (!receipt.accepted) throw new Error(`问题响应被拒绝：${receipt.reason}`);
	}
	/**
	* Cancel a Runtime-owned question wait through its official error envelope.
	* @param wait - correlated Runtime question interaction.
	*/
	async cancelQuestion(wait) {
		const receipt = await wait.respond({
			ok: false,
			error: {
				code: "cancelled",
				message: "the user cancelled this question request",
				details: {}
			}
		});
		if (!receipt.accepted) throw new Error(`取消问题被拒绝：${receipt.reason}`);
	}
	/**
	* Narrow a generic pending interaction after a discriminant check.
	* @param wait - generic Runtime pending interaction.
	* @returns the approval wait when the discriminant matches.
	*/
	static approval(wait) {
		return wait.kind === "approval" ? wait : void 0;
	}
	/**
	* Narrow a generic pending interaction after a discriminant check.
	* @param wait - generic Runtime pending interaction.
	* @returns the question wait when the discriminant matches.
	*/
	static question(wait) {
		return wait.kind === "question" ? wait : void 0;
	}
	requireActive() {
		const active = this.active();
		if (active === void 0) throw new Error("当前没有打开的会话");
		return active;
	}
	permissionValue(session) {
		const value = session.projections.faceOf("permissions").getSnapshot();
		return isPermissionSelect(value) ? value : void 0;
	}
	invalidateModels() {
		this.modelGeneration += 1;
		this.modelCatalogs.clear();
		this.modelLoads.clear();
	}
	async readCommandCatalog(sessionId) {
		const isSubagent = this.ctx.sessions.subagentAddress(sessionId) !== void 0;
		const [hostResult, skillResponse] = await Promise.all([isSubagent ? Promise.resolve({
			ok: true,
			value: []
		}) : this.ctx.remote.commands.list(sessionId), isSubagent ? Promise.resolve(void 0) : this.api.skills.list({ sessionId })]);
		if (!hostResult.ok) throw new Error(`读取 Host 命令失败：${hostResult.error.message}`);
		if (skillResponse !== void 0 && !skillResponse.result.ok) throw new Error(`读取 Skill 失败：${skillResponse.result.error.message}`);
		const local = new Map(TUI_COMMANDS.map((command) => [command.name, command]));
		const merged = [...TUI_COMMANDS];
		const names = new Set(TUI_COMMANDS.map((command) => command.name));
		for (const command of hostResult.value) {
			if (local.get(command.name) !== void 0) throw new Error(`命令冲突：TUI 与 Host 都注册了 /${command.name}`);
			names.add(command.name);
			merged.push({
				name: command.name,
				description: HOST_COMMAND_FUNCTIONS.get(command.name) ?? shortFunctionDescription(command.description, "执行命令"),
				...command.input === void 0 ? {} : { argumentHint: HOST_COMMAND_ARGUMENT_HINTS.get(command.name) ?? command.input.hint },
				source: HOST_COMMAND_DECORATORS.has(command.name) ? "Host + TUI" : "Host",
				behavior: HOST_COMMAND_DECORATORS.has(command.name) ? "local" : "host"
			});
		}
		const skills = skillResponse?.result.ok === true ? skillResponse.result.value.skills : [];
		for (const skill of skills) {
			if (names.has(skill.name)) continue;
			names.add(skill.name);
			merged.push({
				name: skill.name,
				description: shortFunctionDescription(skill.description, "按名称执行对应能力"),
				source: "Skill",
				behavior: "skill"
			});
		}
		return merged;
	}
};
/**
* Convert unknown failures at Surface boundaries without losing Host text.
* @param error - unknown failure crossing into terminal presentation.
* @returns a safe user-facing failure message.
*/
function capabilityError(error) {
	return messageOf(error);
}

//#endregion
//#region src/client/client-runtime.ts
const STARTUP_TIMEOUT_MS = 2e4;
/**
* Wait until an observable reaches a required state without polling.
* @param source - Harness snapshot source.
* @param accepts - completion predicate.
* @param label - Chinese startup phase used in timeout diagnostics.
* @returns the accepted snapshot.
*/
function waitForSnapshot(source, accepts, label) {
	const current = source.getSnapshot();
	if (accepts(current)) return Promise.resolve(current);
	return new Promise((resolve$1, reject) => {
		let settled = false;
		let unsubscribe = () => void 0;
		const finish = (value) => {
			if (settled) {
				unsubscribe();
				return;
			}
			settled = true;
			clearTimeout(timeout);
			unsubscribe();
			resolve$1(value);
		};
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			unsubscribe();
			reject(/* @__PURE__ */ new Error(`${label}超时，请运行 /doctor 检查 Harness 状态`));
		}, STARTUP_TIMEOUT_MS);
		unsubscribe = source.subscribe(() => {
			const snapshot = source.getSnapshot();
			if (accepts(snapshot)) finish(snapshot);
		});
		const afterSubscribe = source.getSnapshot();
		if (accepts(afterSubscribe)) finish(afterSubscribe);
	});
}
/**
* Resolve a resumable row from the ready Runtime baseline.
* @param resume - explicit id, or `true` for the latest visible session.
* @param list - authoritative Session Runtime list snapshot.
* @param archivedSessionIds - Workspace Runtime's hidden-session set.
* @returns the selected, non-archived session summary.
*/
function selectResumeSession(resume, list$1, archivedSessionIds) {
	const archived = new Set(archivedSessionIds);
	const sessionId = resume === true ? list$1.ids.map((id) => list$1.byId[id]).filter((summary$1) => summary$1 !== void 0 && !archived.has(summary$1.id)).sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id : resume;
	if (sessionId === void 0) throw new Error("没有可恢复的会话");
	const summary = list$1.byId[sessionId];
	if (summary === void 0) throw new Error(`找不到会话 ${JSON.stringify(resume)}`);
	if (archived.has(sessionId)) throw new Error(`会话 ${JSON.stringify(resume)} 已归档；当前 Harness 不支持恢复归档会话`);
	return summary;
}
async function targetSession(ctx, options$1) {
	const workspaceState = await waitForSnapshot(ctx.workspaces.list, (snapshot) => snapshot.baselinesReady, "读取工作区与会话");
	if (options$1.resume !== void 0) {
		const summary = selectResumeSession(options$1.resume, ctx.sessions.list.getSnapshot(), workspaceState.archivedSessionIds);
		ctx.sessions.open(summary.id);
		return {
			sessionId: summary.id,
			workspacePath: summary.cwd ?? options$1.cwd
		};
	}
	const workspace = await ctx.workspaces.create({ path: options$1.cwd });
	const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId);
	ctx.sessions.open(sessionId);
	return {
		sessionId,
		workspacePath: workspace.path
	};
}
/**
* Assemble the Client half and select/open the launch target through Runtime APIs.
* @param options - Host bridge plus launch facts.
* @returns selected Client Context and Session face.
*/
async function startTuiClient(options$1) {
	const ctx = new Context();
	try {
		ctx.provide("connection", createConnectionHandle({
			api: options$1.api,
			rpc: options$1.rpc,
			isLoopback: true
		}));
		await ctx.plugin(client_exports$3).await();
		await ctx.plugin(client_exports).await();
		await ctx.plugin(client_exports$1).await();
		await ctx.plugin(client_exports$2, { initialSelection: false }).await();
		registerConversationNodes(ctx);
		registerGoalProjection(ctx);
		registerWorkflowRunProjection(ctx);
		registerDeliverablesProjection(ctx);
		registerTrajectoryProjection(ctx);
		const clientCtx = ctx;
		const target = await targetSession(clientCtx, options$1);
		const binding = clientCtx.sessions.binding(target.sessionId);
		if (binding === void 0) throw new Error(`会话 ${target.sessionId} 未进入 Harness Runtime`);
		const snapshot = await waitForSnapshot(binding.session, (candidate) => candidate.openState === "open" || candidate.openState === "error", "打开会话");
		if (snapshot.openState === "error") throw new Error(`打开会话失败：${snapshot.openError?.message ?? "未知错误"}`);
		return {
			ctx: clientCtx,
			session: binding.session,
			sessionId: target.sessionId,
			workspacePath: target.workspacePath,
			capabilities: new HarnessTuiCapabilities(clientCtx, options$1.api, options$1.profile ?? "tui", target.workspacePath, options$1.management)
		};
	} catch (error) {
		await ctx.fiber.dispose();
		throw error;
	}
}

//#endregion
//#region src/protocol.ts
/** Harness Settings namespace that persists SeekTTY-only visual preferences. */
const TUI_APPEARANCE_SETTINGS_NAMESPACE = "seektty-appearance";
/** First-run color scheme when no user override has been stored. */
const DEFAULT_TUI_THEME = "dark";
/** A stale TUI Settings writer was rejected before changing durable state. */
var TuiSettingsConflictError = class extends Error {
	/** Stable machine-readable conflict discriminator. */
	code = "TUI_SETTINGS_CONFLICT";
	/**
	* @param namespace - registered Settings namespace that changed.
	* @param expected - revision held by the terminal editor.
	* @param actual - current Host revision.
	*/
	constructor(namespace, expected, actual) {
		super(`设置 ${JSON.stringify(namespace)} 已在其他界面更新（期望 revision ${String(expected)}，当前 ${String(actual)}）`);
		this.namespace = namespace;
		this.expected = expected;
		this.actual = actual;
		this.name = "TuiSettingsConflictError";
	}
};

//#endregion
//#region src/client/theme.ts
const RESET = "\x1B[0m";
const ESC = 27;
const CSI = 155;
const ST = 156;
const OSC = 157;
const CONTROL_STRING_INTRODUCERS = new Set([
	80,
	88,
	93,
	94,
	95
]);
const C1_CONTROL_STRING_INTRODUCERS = new Set([
	144,
	152,
	OSC,
	158,
	159
]);
const SGR_PARAMETERS = /^[0-9;:]*$/u;
const palettes = {
	dark: {
		text: {
			rgb: [
				221,
				226,
				238
			],
			xterm: 253,
			ansi: 97
		},
		brand: {
			rgb: [
				102,
				130,
				255
			],
			xterm: 69,
			ansi: 94
		},
		accent: {
			rgb: [
				145,
				167,
				255
			],
			xterm: 111,
			ansi: 96
		},
		muted: {
			rgb: [
				137,
				147,
				170
			],
			xterm: 102,
			ansi: 90
		},
		border: {
			rgb: [
				52,
				65,
				95
			],
			xterm: 60,
			ansi: 90
		},
		success: {
			rgb: [
				66,
				201,
				154
			],
			xterm: 78,
			ansi: 32
		},
		warning: {
			rgb: [
				229,
				170,
				89
			],
			xterm: 179,
			ansi: 33
		},
		danger: {
			rgb: [
				240,
				113,
				127
			],
			xterm: 204,
			ansi: 91
		},
		canvas: {
			rgb: [
				9,
				14,
				27
			],
			xterm: 232,
			ansi: 40
		},
		surface: {
			rgb: [
				17,
				24,
				39
			],
			xterm: 234,
			ansi: 100
		},
		selection: {
			rgb: [
				29,
				43,
				82
			],
			xterm: 17,
			ansi: 44
		}
	},
	light: {
		text: {
			rgb: [
				29,
				36,
				51
			],
			xterm: 234,
			ansi: 30
		},
		brand: {
			rgb: [
				49,
				86,
				216
			],
			xterm: 62,
			ansi: 34
		},
		accent: {
			rgb: [
				65,
				95,
				201
			],
			xterm: 68,
			ansi: 34
		},
		muted: {
			rgb: [
				102,
				112,
				133
			],
			xterm: 60,
			ansi: 90
		},
		border: {
			rgb: [
				198,
				208,
				231
			],
			xterm: 146,
			ansi: 90
		},
		success: {
			rgb: [
				19,
				122,
				88
			],
			xterm: 29,
			ansi: 32
		},
		warning: {
			rgb: [
				146,
				87,
				0
			],
			xterm: 130,
			ansi: 33
		},
		danger: {
			rgb: [
				194,
				56,
				78
			],
			xterm: 161,
			ansi: 31
		},
		canvas: {
			rgb: [
				246,
				248,
				253
			],
			xterm: 255,
			ansi: 107
		},
		surface: {
			rgb: [
				255,
				255,
				255
			],
			xterm: 231,
			ansi: 47
		},
		selection: {
			rgb: [
				226,
				233,
				255
			],
			xterm: 189,
			ansi: 104
		}
	}
};
let selectedTheme = DEFAULT_TUI_THEME;
function controlStringEnd(text, start) {
	for (let index = start; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 7 || code === ST) return index + 1;
		if (code === ESC && text.charCodeAt(index + 1) === 92) return index + 2;
	}
	return text.length;
}
function csiEnd(text, start) {
	for (let index = start; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code >= 64 && code <= 126) return index + 1;
	}
	return text.length;
}
/**
* Escape untrusted terminal text while retaining harmless SGR foreground/style sequences.
*
* OSC, DCS, APC, PM, SOS, non-SGR CSI, two-byte ESC commands, carriage returns,
* and remaining C0/C1 controls are removed before text reaches pi-tui. Unterminated
* terminal strings consume the remainder rather than exposing an ambiguous suffix.
* @param text - terminal-bound text from Harness, extensions, files, or user metadata.
* @returns text safe to compose into a terminal frame.
*/
function escapeTerminalText(text) {
	let escaped = "";
	for (let index = 0; index < text.length;) {
		const code = text.charCodeAt(index);
		if (code === ESC) {
			const next = text.charCodeAt(index + 1);
			if (next === 91) {
				const end = csiEnd(text, index + 2);
				const final = text.charCodeAt(end - 1);
				const parameters = text.slice(index + 2, Math.max(index + 2, end - 1));
				if (final === 109 && SGR_PARAMETERS.test(parameters)) escaped += text.slice(index, end);
				index = end;
				continue;
			}
			if (CONTROL_STRING_INTRODUCERS.has(next)) {
				index = controlStringEnd(text, index + 2);
				continue;
			}
			if (next >= 32 && next <= 47) {
				let end = index + 2;
				while (text.charCodeAt(end) >= 32 && text.charCodeAt(end) <= 47) end += 1;
				if (text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 126) end += 1;
				index = end;
				continue;
			}
			index += Number.isNaN(next) ? 1 : 2;
			continue;
		}
		if (code === CSI) {
			index = csiEnd(text, index + 1);
			continue;
		}
		if (C1_CONTROL_STRING_INTRODUCERS.has(code)) {
			index = controlStringEnd(text, index + 1);
			continue;
		}
		if (code >= 0 && code <= 31 && code !== 9 && code !== 10 || code >= 127 && code <= 159) {
			index += 1;
			continue;
		}
		escaped += text.charAt(index);
		index += 1;
	}
	return escaped;
}
/**
* Detect terminal foreground-color depth without changing the terminal background.
* @param env - environment to inspect; injectable for platform-neutral tests.
* @returns 0 for plain text, 1 for ANSI-16, 2 for xterm-256, or 3 for truecolor.
*/
function terminalColorLevel(env = process.env) {
	if (env.NO_COLOR !== void 0 || env.TERM === "dumb") return 0;
	const term = env.TERM?.toLowerCase() ?? "";
	const colorTerm = env.COLORTERM?.toLowerCase() ?? "";
	const program = env.TERM_PROGRAM?.toLowerCase() ?? "";
	if (colorTerm === "truecolor" || colorTerm === "24bit" || term.includes("truecolor") || term.includes("24bit") || term.endsWith("-direct") || env.WT_SESSION !== void 0 || [
		"iterm.app",
		"wezterm",
		"hyper",
		"vscode"
	].includes(program)) return 3;
	if (term.includes("256color") || program === "apple_terminal") return 2;
	return 1;
}
function foregroundSequence(entry, level) {
	if (level === 1) return `\u001B[${String(entry.ansi)}m`;
	if (level === 2) return `\u001B[38;5;${String(entry.xterm)}m`;
	const [red, green, blue] = entry.rgb;
	return `\u001B[38;2;${String(red)};${String(green)};${String(blue)}m`;
}
function backgroundSequence(entry, level) {
	if (level === 1) return `\u001B[${String(entry.ansi)}m`;
	if (level === 2) return `\u001B[48;5;${String(entry.xterm)}m`;
	const [red, green, blue] = entry.rgb;
	return `\u001B[48;2;${String(red)};${String(green)};${String(blue)}m`;
}
function paint(entry, text) {
	const safeText = escapeTerminalText(text);
	const level = terminalColorLevel();
	if (level === 0) return safeText;
	return `${foregroundSequence(entry, level)}${safeText}${RESET}`;
}
function layer(background$1, text) {
	const level = terminalColorLevel();
	if (level === 0) return text;
	const palette = palettes[selectedTheme];
	const prefix = `${backgroundSequence(background$1, level)}${foregroundSequence(palette.text, level)}`;
	return `${prefix}${text.replace(/\u001B\[(?:0)?m/gu, `${RESET}${prefix}`)}${RESET}`;
}
function ansi(code, text) {
	const safeText = escapeTerminalText(text);
	return terminalColorLevel() === 0 ? safeText : `\u001B[${String(code)}m${safeText}${RESET}`;
}
/**
* Switch every dynamic theme function to the requested color scheme.
* @param theme - supported dark or light terminal theme.
*/
function setTheme(theme) {
	selectedTheme = theme;
}
/** Product semantic foregrounds; no component owns raw color values. */
const color = {
	brand: (text) => paint(palettes[selectedTheme].brand, text),
	accent: (text) => paint(palettes[selectedTheme].accent, text),
	muted: (text) => paint(palettes[selectedTheme].muted, text),
	border: (text) => paint(palettes[selectedTheme].border, text),
	success: (text) => paint(palettes[selectedTheme].success, text),
	warning: (text) => paint(palettes[selectedTheme].warning, text),
	danger: (text) => paint(palettes[selectedTheme].danger, text)
};
/** Background layers shared by the full frame, panels, and selected rows. */
const background = {
	canvas: (text) => layer(palettes[selectedTheme].canvas, text),
	surface: (text) => layer(palettes[selectedTheme].surface, text),
	selection: (text) => layer(palettes[selectedTheme].selection, text)
};
/**
* Fill a complete panel row with the active surface background.
* @param text - trusted, already escaped component output.
* @param width - target terminal cells.
* @returns one padded surface row.
*/
function surfaceRow(text, width) {
	return background.surface(`${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`);
}
/** Shared editor/select-list theme used by the main composer and overlays. */
const editorTheme = {
	borderColor: color.brand,
	selectList: {
		selectedPrefix: color.brand,
		selectedText: background.selection,
		description: color.muted,
		scrollInfo: color.muted,
		noMatch: color.warning
	}
};
/** Markdown/GFM theme using semantic foregrounds and no forced background. */
const markdownTheme = {
	heading: color.brand,
	link: (text) => ansi(4, color.accent(text)),
	linkUrl: color.muted,
	code: color.accent,
	codeBlock: (text) => text,
	codeBlockBorder: color.muted,
	quote: color.muted,
	quoteBorder: color.brand,
	hr: color.muted,
	listBullet: color.accent,
	bold: (text) => ansi(1, text),
	italic: (text) => ansi(3, text),
	strikethrough: (text) => ansi(9, text),
	underline: (text) => ansi(4, text)
};

//#endregion
//#region src/client/autocomplete.ts
/** Autocomplete provider that repulls only through the Harness-backed catalog cache. */
var HarnessAutocompleteProvider = class {
	/**
	* @param capabilities - current-session Harness catalog controller.
	* @param onError - non-blocking terminal diagnostic sink.
	*/
	constructor(capabilities, onError) {
		this.capabilities = capabilities;
		this.onError = onError;
	}
	async getSuggestions(lines, cursorLine, cursorCol, options$1) {
		try {
			const catalog = await this.capabilities.commandCatalog(options$1.signal);
			if (options$1.signal.aborted) return null;
			const suggestions = await new CombinedAutocompleteProvider(catalog.map((command) => ({
				name: command.name,
				description: escapeTerminalText(command.description),
				...command.argumentHint === void 0 ? {} : { argumentHint: escapeTerminalText(command.argumentHint) }
			})), this.capabilities.active()?.workspacePath ?? process.cwd()).getSuggestions(lines, cursorLine, cursorCol, options$1);
			return suggestions === null ? null : {
				...suggestions,
				items: suggestions.items.map((item) => ({
					...item,
					value: escapeTerminalText(item.value),
					label: escapeTerminalText(item.label),
					...item.description === void 0 ? {} : { description: escapeTerminalText(item.description) }
				}))
			};
		} catch (error) {
			if (!options$1.signal.aborted) this.onError(error instanceof Error ? error.message : String(error));
			return null;
		}
	}
	applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
		const currentPrefix = (lines[cursorLine] ?? "").slice(0, cursorCol);
		if (prefix.startsWith("/") && currentPrefix !== prefix) return {
			lines,
			cursorLine,
			cursorCol
		};
		return new CombinedAutocompleteProvider([], this.capabilities.active()?.workspacePath ?? process.cwd()).applyCompletion(lines, cursorLine, cursorCol, item, prefix);
	}
	shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
		return new CombinedAutocompleteProvider([], this.capabilities.active()?.workspacePath ?? process.cwd()).shouldTriggerFileCompletion(lines, cursorLine, cursorCol);
	}
};

//#endregion
//#region src/client/settings.ts
function descriptionOf(node) {
	const description = node.meta.description;
	if (typeof description === "string") return description;
	if (typeof description !== "object") return void 0;
	const localized = description;
	for (const key of [
		"zh-CN",
		"zh",
		"en-US",
		"en"
	]) if (typeof localized[key] === "string") return localized[key];
	return Object.values(localized).find((value) => typeof value === "string");
}
function samePath(left, right) {
	return left.length === right.length && left.every((part, index) => part === right[index]);
}
function enumChoices(node) {
	if (node.type === "const" && ([
		"string",
		"number",
		"boolean"
	].includes(typeof node.value) || node.value === null)) {
		const value = node.value;
		return [{
			id: JSON.stringify(value),
			label: String(value),
			value
		}];
	}
	if (node.type !== "union" || node.list === void 0) return [];
	const choices = node.list.flatMap(enumChoices);
	return choices.length === node.list.length ? choices : [];
}
function controlOf(node, secret) {
	if (secret || node.meta.role === "secret") return "secret";
	if (node.meta.role === "credential-ref") return "credential-ref";
	if (node.type === "boolean") return "boolean";
	if (enumChoices(node).length > 0) return "enum";
	if (node.type === "number" || node.type === "natural" || node.type === "percent") return "number";
	if (node.type === "string") return "text";
	return "json";
}
function inheritedValue(document, node, path$1) {
	const base = getPath(document.base, path$1);
	return base === void 0 ? node.meta.default : base;
}
function fieldOf(document, node, path$1) {
	const secret = document.secrets.find((item) => samePath(item.path, path$1));
	const description = descriptionOf(node);
	return {
		path: path$1,
		label: path$1.length === 0 ? document.namespace : path$1.join("."),
		...description === void 0 ? {} : { description },
		schemaType: node.type,
		control: controlOf(node, secret !== void 0),
		value: getPath(document.value, path$1),
		overridden: hasPath(document.user, path$1),
		inherited: inheritedValue(document, node, path$1),
		required: node.meta.required === true,
		disabled: node.meta.disabled === true,
		secretSet: secret?.set === true,
		choices: enumChoices(node)
	};
}
function walk(document, node, path$1, output) {
	if (node.meta.role === "secret" || node.meta.role === "credential-ref") {
		output.push(fieldOf(document, node, path$1));
		return;
	}
	if (node.type === "object" && node.dict !== void 0 && Object.keys(node.dict).length > 0) {
		for (const [key, child] of Object.entries(node.dict)) walk(document, child, [...path$1, key], output);
		return;
	}
	output.push(fieldOf(document, node, path$1));
}
/**
* Rehydrate and flatten one Settings schema into terminal controls. Unknown
* containers and unions remain reachable through a JSON control.
* @param document - redacted Settings descriptor from the same Host.
* @returns ordered field list.
*/
function settingsFields(document) {
	const output = [];
	walk(document, rehydrateSchema(document.schema), [], output);
	return output;
}
/**
* Parse one text submission according to a field's schema control.
* @param field - selected Settings field.
* @param text - unmasked editor value.
* @returns JSON-compatible value for a Settings path mutation.
*/
function parseSettingsValue(field, text) {
	switch (field.control) {
		case "number": {
			const value = Number(text);
			if (!Number.isFinite(value)) throw new Error(`${field.label} 必须是有限数字`);
			return value;
		}
		case "json": try {
			return JSON.parse(text);
		} catch (error) {
			throw new Error(`${field.label} 需要有效 JSON：${error instanceof Error ? error.message : String(error)}`);
		}
		case "boolean":
		case "enum": throw new Error(`${field.label} 应通过选择器写入`);
		case "credential-ref":
		case "secret":
		case "text": return text;
	}
}
/**
* Format a non-secret Settings value for selectors without losing structure.
* @param value - redacted value.
* @returns compact display string.
*/
function formatSettingsValue(value) {
	if (value === void 0) return "未设置";
	if (typeof value === "string") return value === "" ? "空字符串" : value;
	return JSON.stringify(value);
}
/**
* Label a known high-frequency section while keeping unknown namespaces visible.
* @param namespace - registered Harness Settings namespace.
* @returns dedicated-control or generic-settings label.
*/
function settingsSectionLabel(namespace) {
	if (namespace === "permission") return "默认权限";
	if (namespace === "agent-presets") return "默认 Agent Preset";
	if (namespace === "agent-default-model" || namespace.startsWith("llm-")) return "模型与 Provider";
	if (namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) return "SeekTTY 主题";
	if (namespace === "tui-plugin-marketplace") return "插件市场来源";
	return "通用设置";
}

//#endregion
//#region src/client/appearance.ts
/**
* Find the appearance descriptor registered by the Host bridge.
* @param documents - redacted Harness Settings descriptors.
* @returns the SeekTTY appearance descriptor.
*/
function appearanceSettings(documents) {
	const document = documents.find((candidate) => candidate.namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE);
	if (document === void 0) throw new Error(`Harness 未注册设置 ${TUI_APPEARANCE_SETTINGS_NAMESPACE}`);
	return document;
}
/**
* Read a validated theme id from one appearance descriptor.
* @param document - appearance descriptor returned by Harness Settings.
* @returns a supported terminal theme id.
*/
function themeFromAppearance(document) {
	if (typeof document.value !== "object" || document.value === null || !("theme" in document.value)) throw new Error("SeekTTY 主题设置缺少 theme 字段");
	const theme = document.value.theme;
	if (theme !== "dark" && theme !== "light") throw new Error(`SeekTTY 主题 ${JSON.stringify(theme)} 不受支持`);
	return theme;
}
/**
* Persist one theme through the native Harness Settings mutation path.
* @param settings - same-process redacted Settings bridge.
* @param document - descriptor whose revision protects this write.
* @param theme - requested dark or light theme.
* @returns the updated, validated appearance descriptor.
*/
async function saveTheme(settings, document, theme) {
	const updated = await settings.mutate(TUI_APPEARANCE_SETTINGS_NAMESPACE, [{
		op: "set",
		path: ["theme"],
		value: theme
	}], document.revision);
	const stored = themeFromAppearance(updated);
	if (stored !== theme) throw new Error(`Harness 保存了意外主题 ${JSON.stringify(stored)}`);
	return updated;
}

//#endregion
//#region src/client/actions.ts
function idOf(value) {
	return value;
}
function workspaceIdOf(value) {
	return value;
}
function currentMark(current) {
	return current ? "当前 · " : "";
}
function permissionDescription(option) {
	switch (option.id) {
		case "read-only": return "只能读取文件，不能修改工作区";
		case "workspace-write": return "可以修改当前工作区内的文件";
		case "danger-full-access": return "可以访问工作区外文件，并运行不受工作区限制的命令";
		default: return option.description ?? "此权限没有详细说明，请按高风险权限处理";
	}
}
function permissionLabel$1(option) {
	switch (option.id) {
		case "read-only": return "只读";
		case "workspace-write": return "工作区";
		case "danger-full-access": return "完全访问";
		default: return option.label;
	}
}
function queuePlacementLabel(placement) {
	switch (placement) {
		case "queued": return "等待下一轮";
		case "steering": return "正在引导当前轮次";
		case "context": return "正在并入上下文";
	}
}
function commandParts(args) {
	const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args.trim());
	return match === null ? {
		command: "",
		rest: ""
	} : {
		command: (match[1] ?? "").toLowerCase(),
		rest: match[2]?.trim() ?? ""
	};
}
function argumentPair(args) {
	const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(args.trim());
	return match === null ? {
		first: "",
		rest: ""
	} : {
		first: match[1] ?? "",
		rest: match[2]?.trim() ?? ""
	};
}
function detailText(value) {
	if (value === void 0 || typeof value === "function" || typeof value === "symbol") return String(value);
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return typeof value === "bigint" ? value.toString() : "[内容无法序列化]";
	}
}
function pluginIdentity(plugin) {
	return `${plugin.name}${plugin.version === void 0 ? "" : `@${plugin.version}`}`;
}
function pluginDescription(plugin) {
	const state = plugin.bundle ? plugin.active ? "已启用 Bundle" : "未启用 Bundle" : "普通 Profile 依赖";
	const diagnostics = plugin.diagnostics.length === 0 ? "" : ` · ${plugin.diagnostics.join("；")}`;
	return `${plugin.source} · ${state} · ${plugin.spec}${diagnostics}`;
}
function candidateDescription(candidate) {
	const scripts = candidate.scripts.length === 0 ? "无生命周期脚本" : `脚本 ${candidate.scripts.join(", ")}`;
	const mutable = candidate.immutable ? "不可变定位" : "可变来源";
	return `${candidate.source} · ${mutable} · ${scripts}`;
}
const EXTERNAL_COMMAND_TOOLS = new Set([
	"bash",
	"pwsh",
	"shell",
	"shell_command",
	"terminal"
]);
function toolBoundary(tool) {
	const name$1 = tool.name.toLowerCase();
	if (name$1.startsWith("mcp__")) return {
		label: "MCP · 外部服务",
		detail: "MCP 工具可能运行在独立进程或远端服务中，不受 Agent 沙箱保护；它能访问的内容由其配置、凭证和网络权限决定。"
	};
	if (EXTERNAL_COMMAND_TOOLS.has(name$1)) return {
		label: "外部命令",
		detail: "此工具可能启动 Shell 子进程。当前权限和逐次审批仍适用；获准后，子进程可按执行器权限访问文件、进程或网络。"
	};
	return {
		label: "Agent 工具",
		detail: "此工具由 Agent 调用，并受当前权限和逐次审批控制。若它继续启动外部进程或服务，确认前请查看审批说明。"
	};
}
function fieldState(field) {
	return `${field.control === "secret" ? field.secretSet ? "已配置" : "未配置" : formatSettingsValue(field.value)} · ${field.overridden ? "用户覆盖" : `继承 ${formatSettingsValue(field.inherited)}`}${field.required ? " · 必填" : ""}`;
}
function jobStatusLabel(status) {
	switch (status) {
		case "running": return "运行中";
		case "stopping": return "正在停止";
		case "completed": return "已完成";
		case "killed": return "已终止";
		case "failed": return "失败";
		default: return status;
	}
}
function jobDetailLabel(detail) {
	if (detail === void 0) return void 0;
	const exit = /^exit code: (-?\d+)$/u.exec(detail);
	if (exit !== null) return `退出码 ${exit[1]}`;
	const signal = /^signal: (.+)$/u.exec(detail);
	return signal === null ? detail : `信号 ${signal[1]}`;
}
function elapsedLabel(milliseconds) {
	if (milliseconds < 1e3) return `${milliseconds} ms`;
	if (milliseconds < 6e4) return `${Math.round(milliseconds / 100) / 10} s`;
	return `${Math.round(milliseconds / 6e3) / 10} min`;
}
/** TUI-local actions. Every durable operation delegates to HarnessTuiCapabilities. */
var TuiActions = class {
	handledInteractions = /* @__PURE__ */ new Set();
	interactionChain = Promise.resolve();
	/** @param capabilities - Harness-backed compatibility controller. */
	constructor(capabilities, host) {
		this.capabilities = capabilities;
		this.host = host;
	}
	/**
	* Execute one exact TUI-owned slash command.
	* @param name - normalized command name without a leading slash.
	* @param rawArgs - unparsed command argument text.
	*/
	async execute(name$1, rawArgs) {
		const args = rawArgs.trim();
		try {
			switch (name$1) {
				case "new":
					await this.newSession();
					break;
				case "resume":
				case "sessions":
					await this.sessions(args);
					break;
				case "rename":
					await this.rename(args);
					break;
				case "fork":
					await this.fork();
					break;
				case "archive":
					await this.archive();
					break;
				case "export":
					await this.exportSession(args);
					break;
				case "copy":
					this.copyLastResponse();
					break;
				case "workspace":
					await this.workspace(args);
					break;
				case "profile":
					await this.profile(args);
					break;
				case "mode":
					await this.mode();
					break;
				case "model":
					await this.model();
					break;
				case "theme":
					await this.theme(args);
					break;
				case "permission":
					await this.permission(args);
					break;
				case "queue":
					await this.queue();
					break;
				case "steer":
					await this.steer(args);
					break;
				case "attach":
					await this.attach(args);
					break;
				case "attachments":
					await this.attachments();
					break;
				case "settings":
					await this.settings(args);
					break;
				case "plugin":
				case "plugins":
					await this.plugin(args);
					break;
				case "doctor":
					await this.doctor();
					break;
				case "restart":
					await this.restart();
					break;
				case "tools":
					await this.tools(args);
					break;
				case "files":
					await this.files();
					break;
				case "jobs":
					await this.jobs();
					break;
				case "subagents":
					await this.subagents();
					break;
				case "trajectory":
					await this.trajectory();
					break;
				case "feedback":
					await this.feedback(args);
					break;
				case "skills":
					await this.skills();
					break;
				case "mcp":
					await this.mcp();
					break;
				case "status":
					await this.status();
					break;
				case "pending":
					this.retryPending();
					break;
				case "help":
					await this.commandPalette();
					break;
				case "quit":
				case "exit":
					this.host.close(0);
					break;
				default: throw new Error(`TUI 未实现 /${name$1}`);
			}
		} catch (error) {
			if (error instanceof TuiSettingsConflictError) {
				await this.settingsConflict(error);
				return;
			}
			this.host.notice(capabilityError(error), "error");
		}
	}
	async settingsConflict(error) {
		let actual = error.actual;
		try {
			const document = (await this.capabilities.managementBridge().settings.describe()).find((candidate) => candidate.namespace === error.namespace);
			if (document !== void 0) actual = document.revision;
		} catch (refreshError) {
			this.host.notice(`设置冲突后重新读取失败：${capabilityError(refreshError)}`, "error");
			return;
		}
		if (!await this.host.overlays.confirm(`设置 ${error.namespace} 已被其他界面更新`, `本次修改未保存，也没有覆盖其他界面的修改。是否重新读取最新设置？（版本 ${String(error.expected)} → ${String(actual)}）`, "重新读取")) return;
		try {
			await this.settings(error.namespace);
		} catch (nextError) {
			if (nextError instanceof TuiSettingsConflictError) await this.settingsConflict(nextError);
			else this.host.notice(capabilityError(nextError), "error");
		}
	}
	/** Open the complete merged command palette and place the selection in the editor. */
	async commandPalette() {
		try {
			const catalog = await this.capabilities.commandCatalog();
			const choice = await this.host.overlays.select({
				title: "命令面板",
				detail: "选择要使用的功能",
				choices: catalog.map((command$1) => ({
					id: command$1.name,
					label: `/${command$1.name}`,
					description: `${command$1.argumentHint === void 0 ? "" : `${command$1.argumentHint} — `}${command$1.description}`
				})),
				options: {
					width: "90%",
					maxHeight: "90%",
					anchor: "center",
					margin: 1
				}
			});
			if (choice === void 0) return;
			const command = catalog.find((candidate) => candidate.name === choice.id);
			if (command === void 0) return;
			this.host.setEditor(`/${command.name}${command.argumentHint !== void 0 || command.behavior === "skill" ? " " : ""}`);
		} catch (error) {
			this.host.notice(capabilityError(error), "error");
		}
	}
	/** Shift+Tab: use Host order and apply the same risk gate as /permission. */
	async cyclePermission() {
		try {
			await this.selectPermission(this.capabilities.nextPermission());
		} catch (error) {
			this.host.notice(capabilityError(error), "error");
		}
	}
	/**
	* Detect newly pending Runtime interactions and serialize them through the FIFO overlay owner.
	* @param snapshot - authoritative Runtime conversation snapshot.
	*/
	syncPending(snapshot) {
		const present = new Set(snapshot.pending.map((wait) => wait.key));
		for (const key of [...this.handledInteractions]) if (!present.has(key)) this.handledInteractions.delete(key);
		for (const wait of snapshot.pending) {
			if (this.handledInteractions.has(wait.key)) continue;
			this.handledInteractions.add(wait.key);
			this.interactionChain = this.interactionChain.then(() => this.handleInteraction(wait)).catch((error) => {
				this.host.notice(`交互处理失败：${capabilityError(error)}；输入 /pending 可重试`, "error");
			});
		}
	}
	async newSession() {
		const id = await this.capabilities.newSession();
		this.host.notice(id === void 0 ? "当前没有可用工作区" : "已打开新会话", id === void 0 ? "warning" : "success");
	}
	async sessions(query) {
		const current = this.capabilities.active()?.sessionId;
		const rows = this.capabilities.listSessions();
		if (rows.length === 0) throw new Error("没有可恢复的会话");
		const hits = query === "" ? void 0 : await this.capabilities.searchSessions(query, new AbortController().signal);
		const choices = hits === void 0 ? rows.map((row) => ({
			id: row.id,
			label: `${row.id === current ? "● " : ""}${row.displayTitle}`,
			description: `${row.cwd ?? "无工作区"} · ${row.running ? "运行中" : row.pendingInteraction ?? "空闲"}`
		})) : hits.items.map((hit) => {
			const row = rows.find((candidate) => candidate.id === hit.sessionId);
			return {
				id: hit.sessionId,
				label: `${hit.sessionId === current ? "● " : ""}${row?.displayTitle ?? hit.sessionId}`,
				description: hit.snippet
			};
		});
		if (choices.length === 0) throw new Error(`没有匹配 ${JSON.stringify(query)} 的会话`);
		const selected = await this.host.overlays.select({
			title: query === "" ? "会话" : `搜索会话 · ${query}`,
			detail: `归档会话不会出现在这里${hits?.hasMore === true ? " · 结果已达到上限" : ""}`,
			choices,
			options: {
				width: "90%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		this.capabilities.openSession(idOf(selected.id));
		this.host.notice(`已打开 ${selected.label}`, "success");
	}
	async rename(args) {
		const title = args !== "" ? args : await this.host.overlays.input({
			title: "重命名会话",
			initialValue: this.capabilities.active()?.summary.title ?? "",
			placeholder: "输入新标题"
		});
		if (title === void 0 || title.trim() === "") return;
		const accepted = await this.capabilities.renameSession(title);
		this.host.notice(`会话已重命名为 ${accepted}`, "success");
	}
	async fork() {
		const id = await this.capabilities.forkSession();
		this.host.notice(`已创建并打开分支会话 ${id}`, "success");
	}
	async archive() {
		const active = this.capabilities.active();
		if (active === void 0) return;
		if (!await this.host.overlays.confirm("归档当前会话？", `${active.summary.displayTitle} 的日志会保留，但会从普通会话列表隐藏。`, "归档")) return;
		await this.capabilities.archiveSession();
		this.host.notice("会话已归档；当前不能在这里恢复", "success");
	}
	async exportSession(args) {
		const scope = await this.host.overlays.select({
			title: "导出会话",
			detail: "将原始会话记录和附件保存为 ZIP 文件",
			searchable: false,
			choices: [{
				id: "session",
				label: "仅当前会话",
				description: "包含当前会话记录和附件"
			}, {
				id: "descendants",
				label: "当前会话与子 Agent",
				description: "同时包含全部子 Agent 会话"
			}]
		});
		if (scope === void 0) return;
		const requested = args === "" ? await this.host.overlays.input({
			title: "保存会话 ZIP",
			detail: "留空则保存到工作区根目录；已有文件不会被覆盖",
			placeholder: "可选：相对工作区或绝对路径"
		}) : args;
		if (requested === void 0) return;
		const result = await this.capabilities.exportSession(requested.trim() === "" ? void 0 : requested.trim(), scope.id === "descendants");
		this.host.notice(`已保存会话 ZIP（${String(result.bytes)} 字节）到 ${result.path}`, "success");
	}
	copyLastResponse() {
		const text = this.capabilities.lastAssistantText();
		if (text === void 0) throw new Error("当前会话没有可复制的 DeepSeek 文本回复");
		this.host.copy(text);
		this.host.notice(`已复制最后一条回复（${text.length} 个字符）`, "success");
	}
	async workspace(args) {
		const parsed = commandParts(args);
		if (parsed.command === "add" || parsed.command === "open") {
			if (parsed.rest === "") throw new Error(`用法：/workspace ${parsed.command} <目录>`);
			await this.capabilities.openWorkspace(parsed.rest);
			this.host.notice("已打开工作区会话", "success");
			return;
		}
		if (parsed.command === "rename") {
			const workspace = this.currentWorkspace() ?? await this.chooseWorkspace("选择要重命名的工作区");
			if (workspace === void 0) return;
			await this.renameWorkspace(workspace, parsed.rest);
			return;
		}
		if (parsed.command === "delete" || parsed.command === "remove") {
			const workspace = parsed.rest === "" ? this.currentWorkspace() ?? await this.chooseWorkspace("选择要移除注册的工作区") : this.capabilities.listWorkspaces().find((candidate) => candidate.workspaceId === parsed.rest);
			if (workspace === void 0) throw new Error(`找不到工作区 ${JSON.stringify(parsed.rest)}`);
			await this.deleteWorkspace(workspace);
			return;
		}
		if (parsed.command === "reorder") {
			const workspace = this.currentWorkspace() ?? await this.chooseWorkspace("选择要移动的工作区");
			if (workspace !== void 0) await this.reorderWorkspace(workspace);
			return;
		}
		if (parsed.command === "sessions") {
			const workspace = this.currentWorkspace() ?? await this.chooseWorkspace("选择工作区");
			if (workspace !== void 0) await this.reorderWorkspaceSession(workspace);
			return;
		}
		if (parsed.command !== "" && parsed.command !== "list") {
			await this.capabilities.openWorkspace(args);
			this.host.notice("已打开工作区会话", "success");
			return;
		}
		await this.workspaceCenter();
	}
	async workspaceCenter() {
		const workspaces = this.capabilities.listWorkspaces();
		const current = this.capabilities.active()?.workspaceId;
		const selected = await this.host.overlays.select({
			title: "工作区",
			choices: [...workspaces.map((workspace$1) => ({
				id: workspace$1.workspaceId,
				label: `${workspace$1.workspaceId === current ? "● " : ""}${workspace$1.title}`,
				description: workspace$1.path
			})), {
				id: "__add__",
				label: "添加目录…",
				description: "注册现有目录并打开空白会话"
			}]
		});
		if (selected === void 0) return;
		if (selected.id === "__add__") {
			const path$1 = await this.host.overlays.input({
				title: "添加工作区",
				placeholder: "输入目录路径"
			});
			if (path$1 === void 0 || path$1.trim() === "") return;
			await this.capabilities.openWorkspace(path$1);
			this.host.notice("已打开工作区会话", "success");
			return;
		}
		const workspace = workspaces.find((candidate) => candidate.workspaceId === selected.id);
		if (workspace === void 0) return;
		const action = await this.host.overlays.select({
			title: workspace.title,
			detail: `${workspace.path}\n${workspace.sessionIds.length} 个已登记会话`,
			searchable: false,
			choices: [
				{
					id: "open",
					label: "打开／新建会话",
					description: "复用该工作区的空白会话，必要时创建"
				},
				{
					id: "rename",
					label: "重命名工作区",
					description: "只改变这里显示的名称"
				},
				{
					id: "sessions",
					label: "调整会话顺序",
					description: "修改该工作区的手动会话顺序"
				},
				{
					id: "reorder",
					label: "调整工作区顺序",
					description: "修改工作区目录显示顺序"
				},
				{
					id: "delete",
					label: "移除工作区注册",
					description: "不会删除目录、文件或会话日志"
				}
			]
		});
		if (action === void 0) return;
		if (action.id === "open") {
			const sessionId = await this.capabilities.selectWorkspace(workspace.workspaceId);
			this.host.notice(`已打开会话 ${sessionId}`, "success");
		} else if (action.id === "rename") await this.renameWorkspace(workspace, "");
		else if (action.id === "sessions") await this.reorderWorkspaceSession(workspace);
		else if (action.id === "reorder") await this.reorderWorkspace(workspace);
		else await this.deleteWorkspace(workspace);
	}
	currentWorkspace() {
		const id = this.capabilities.active()?.workspaceId;
		return this.capabilities.listWorkspaces().find((candidate) => candidate.workspaceId === id);
	}
	async chooseWorkspace(title) {
		const workspaces = this.capabilities.listWorkspaces();
		const selected = await this.host.overlays.select({
			title,
			choices: workspaces.map((workspace) => ({
				id: workspace.workspaceId,
				label: workspace.title,
				description: workspace.path
			}))
		});
		return workspaces.find((candidate) => candidate.workspaceId === selected?.id);
	}
	async renameWorkspace(workspace, supplied) {
		const title = supplied !== "" ? supplied : await this.host.overlays.input({
			title: `重命名 ${workspace.title}`,
			initialValue: workspace.title,
			placeholder: "输入新标题"
		});
		if (title === void 0 || title.trim() === "") return;
		const updated = await this.capabilities.renameWorkspace(workspace.workspaceId, title);
		this.host.notice(`工作区已重命名为 ${updated.title}`, "success");
	}
	async deleteWorkspace(workspace) {
		if (!await this.host.overlays.confirm(`移除工作区注册 ${workspace.title}？`, `${workspace.path}\n目录、用户文件和全部会话记录都会保留；会话将成为未分组。`, "移除注册")) return;
		await this.capabilities.deleteWorkspace(workspace.workspaceId);
		this.host.notice(`已移除工作区注册 ${workspace.title}`, "success");
	}
	async reorderWorkspace(workspace) {
		const choices = this.capabilities.listWorkspaces().filter((candidate) => candidate.workspaceId !== workspace.workspaceId).map((candidate) => ({
			id: candidate.workspaceId,
			label: `移到 ${candidate.title} 前`,
			description: candidate.path
		}));
		choices.push({
			id: "__append__",
			label: "移到末尾",
			description: "追加到工作区目录末尾"
		});
		const selected = await this.host.overlays.select({
			title: `移动 ${workspace.title}`,
			choices
		});
		if (selected === void 0) return;
		await this.capabilities.moveWorkspace(workspace.workspaceId, selected.id === "__append__" ? void 0 : workspaceIdOf(selected.id));
		this.host.notice(`已调整工作区 ${workspace.title} 的顺序`, "success");
	}
	async reorderWorkspaceSession(workspace) {
		if (workspace.sessionIds.length < 2) {
			this.host.notice(`${workspace.title} 没有可调整的多个会话`, "info");
			return;
		}
		const summaries = new Map(this.capabilities.listSessions().map((row) => [row.id, row]));
		const source = await this.host.overlays.select({
			title: `${workspace.title} · 选择会话`,
			choices: workspace.sessionIds.map((id) => ({
				id,
				label: summaries.get(id)?.displayTitle ?? id,
				description: summaries.has(id) ? id : `${id} · 已归档或未载入`
			}))
		});
		if (source === void 0) return;
		const anchors = workspace.sessionIds.filter((id) => id !== source.id).map((id) => ({
			id,
			label: `移到 ${summaries.get(id)?.displayTitle ?? id} 前`
		}));
		anchors.push({
			id: "__append__",
			label: "移到末尾"
		});
		const anchor = await this.host.overlays.select({
			title: "选择新位置",
			choices: anchors
		});
		if (anchor === void 0) return;
		await this.capabilities.moveWorkspaceSession(workspace.workspaceId, idOf(source.id), anchor.id === "__append__" ? void 0 : idOf(anchor.id));
		this.host.notice("已调整会话顺序", "success");
	}
	async profile(args) {
		const management = this.capabilities.managementBridge();
		const parsed = commandParts(args);
		if (parsed.command === "switch") {
			if (parsed.rest === "") throw new Error("用法：/profile switch <名称>");
			await this.switchProfile(parsed.rest);
			return;
		}
		if (parsed.command === "create") {
			if (parsed.rest === "") throw new Error("用法：/profile create <名称>");
			const created = await management.profiles.create(parsed.rest);
			await this.createdProfile(created);
			return;
		}
		if (parsed.command === "copy") {
			const copy = argumentPair(parsed.rest);
			if (copy.first === "" || copy.rest === "") throw new Error("用法：/profile copy <源 Profile> <新名称>");
			const created = await management.profiles.create(copy.rest, copy.first);
			await this.createdProfile(created);
			return;
		}
		if (parsed.command !== "" && parsed.command !== "list") throw new Error("用法：/profile [list|switch <名称>|create <名称>|copy <源> <新名称>]");
		const profiles = await management.profiles.list();
		const current = this.capabilities.currentProfile();
		const orderedProfiles = [...profiles].sort((left, right) => {
			if (left.name === current) return -1;
			if (right.name === current) return 1;
			return 0;
		});
		const selected = await this.host.overlays.select({
			title: "Profile",
			detail: "切换后会重启，并恢复当前工作区、会话、草稿和附件",
			choices: [
				...orderedProfiles.map((profile) => ({
					id: `profile:${profile.name}`,
					label: `${profile.name === current ? "● " : ""}${profile.name}`,
					description: this.profileDescription(profile),
					...profile.compatible ? {} : { disabledReason: "不能直接用于终端；可复制为新的终端 Profile" }
				})),
				{
					id: "__create__",
					label: "创建 Profile…",
					description: "创建新的终端运行配置"
				},
				{
					id: "__copy__",
					label: "复制 Profile…",
					description: "基于现有 Profile 创建终端版本"
				}
			],
			options: {
				width: "90%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id === "__create__") {
			const name$1 = await this.host.overlays.input({
				title: "创建 Profile",
				placeholder: "输入小写 Profile 名称"
			});
			if (name$1 === void 0 || name$1.trim() === "") return;
			await this.createdProfile(await management.profiles.create(name$1.trim()));
			return;
		}
		if (selected.id === "__copy__") {
			const source = await this.host.overlays.select({
				title: "选择源 Profile",
				choices: profiles.map((profile) => ({
					id: profile.name,
					label: profile.name,
					description: `${this.profileDescription(profile)}${profile.compatible ? "" : " · 将转换为终端版本"}`
				}))
			});
			if (source === void 0) return;
			const name$1 = await this.host.overlays.input({
				title: "复制 Profile",
				placeholder: "输入新 Profile 名称"
			});
			if (name$1 === void 0 || name$1.trim() === "") return;
			await this.createdProfile(await management.profiles.create(name$1.trim(), source.id));
			return;
		}
		await this.switchProfile(selected.id.slice(8));
	}
	profileDescription(profile) {
		return `${profile.initialized ? "已就绪" : "尚未初始化"} · ${profile.bundles.length} 个功能组件 · ${profile.dependencyCount} 个额外插件`;
	}
	async switchProfile(profile) {
		if (profile === this.capabilities.currentProfile()) {
			this.host.notice(`${profile} 已是当前 Profile`, "info");
			return;
		}
		const target = (await this.capabilities.managementBridge().profiles.list()).find((candidate) => candidate.name === profile);
		if (target === void 0) throw new Error(`Profile ${JSON.stringify(profile)} 不存在`);
		if (!target.compatible) throw new Error(target.diagnostic ?? `Profile ${profile} 不兼容`);
		if (await this.host.overlays.confirm(`切换到 Profile ${profile}？`, "deepseek 会重新启动，并恢复工作区、会话、未发送草稿和附件；正在运行的任务会停止。", "切换并重启")) this.host.restart(profile, `已切换到 Profile ${profile}`);
	}
	async createdProfile(profile) {
		this.host.notice(`已创建 Profile ${profile.name}`, "success");
		if (await this.host.overlays.confirm(`立即切换到 ${profile.name}？`, "切换会受控重启并恢复当前上下文。", "切换并重启")) this.host.restart(profile.name, `已创建并切换到 Profile ${profile.name}`);
	}
	async mode() {
		const modes = await this.capabilities.listModes();
		const selected = await this.host.overlays.select({
			title: "Agent 模式",
			detail: "选择当前会话的工作模式；用户创建的模式会单独标记",
			choices: modes.map((mode) => ({
				id: mode.id,
				label: `${currentMark(mode.current)}${mode.label}${mode.trust === "user" ? " · 用户" : ""}`,
				description: mode.description ?? (mode.isDefault ? "部署默认模式" : mode.id),
				...mode.disabledReason === void 0 ? {} : { disabledReason: mode.disabledReason }
			}))
		});
		if (selected === void 0) return;
		const target = modes.find((mode) => mode.id === selected.id);
		if (target?.current === true) {
			this.host.notice(`${target.label} 已是当前模式`, "info");
			return;
		}
		let allowNewSession = false;
		if (this.capabilities.modeNeedsNewSession()) {
			allowNewSession = await this.host.overlays.confirm("活跃会话不能原地切换模式", "确认后会在同一工作区创建空白会话并应用目标模式；原会话、日志和标题保持不变。", "创建新会话");
			if (!allowNewSession) return;
		}
		await this.capabilities.selectMode(selected.id, allowNewSession);
		this.host.notice(allowNewSession ? `已创建新会话并切换为${target?.label ?? selected.label}` : `模式已切换为${target?.label ?? selected.label}`, "success");
	}
	async model() {
		const directory = await this.capabilities.listModels();
		const choices = directory.options.map((option$1) => ({
			id: option$1.id,
			label: `${currentMark(option$1.current)}${option$1.label}`,
			description: option$1.description
		}));
		choices.push(...directory.failures.map((failure, index) => ({
			id: `__failure_${String(index)}`,
			label: "Provider 目录不可用",
			disabledReason: failure
		})));
		if (!directory.routable) this.host.notice("当前模型路由不可用；请选择一个已加载 Provider 的模型", "warning");
		const selected = await this.host.overlays.select({
			title: "模型",
			detail: "选择当前会话使用的 Provider、模型和推理强度",
			choices,
			options: {
				width: "90%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const option = directory.options.find((candidate) => candidate.id === selected.id);
		if (option === void 0) return;
		const selection = await this.reasoningSelection(option);
		if (selection === void 0) return;
		await this.capabilities.selectModel(selection);
		this.host.refreshHeader();
		this.host.notice(`模型已切换为 ${selection.provider}/${selection.model}`, "success");
	}
	async reasoningSelection(option) {
		if (option.efforts.length === 0) return option.selection;
		const selected = await this.host.overlays.select({
			title: `${option.label} · 推理强度`,
			choices: [{
				id: "__default__",
				label: `Provider 默认${option.defaultEffort === void 0 ? "" : `（${option.defaultEffort}）`}`
			}, ...option.efforts.map((effort) => ({
				id: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))]
		});
		if (selected === void 0) return void 0;
		return {
			...option.selection,
			...selected.id === "__default__" ? {} : { reasoningEffort: selected.id }
		};
	}
	async theme(args) {
		const bridge = this.capabilities.managementBridge().settings;
		const document = appearanceSettings(await bridge.describe());
		const current = themeFromAppearance(document);
		const themes = [{
			id: "dark",
			label: "暗色",
			description: "深灰蓝画布"
		}, {
			id: "light",
			label: "亮色",
			description: "柔和冷白画布"
		}];
		let target;
		if (args !== "") {
			target = themes.find((theme) => theme.id === args)?.id;
			if (target === void 0) throw new Error("用法：/theme [dark|light]");
		} else {
			const selected = await this.host.overlays.select({
				title: "主题",
				detail: "立即切换并保存终端外观",
				choices: [...themes].sort((left, right) => Number(right.id === current) - Number(left.id === current)).map((theme) => ({
					id: theme.id,
					label: `${currentMark(theme.id === current)}${theme.label}`,
					description: theme.description
				})),
				searchable: false,
				footer: "↑↓ 选择 · Enter 确认 · Esc 关闭",
				options: {
					width: 58,
					maxHeight: 12,
					anchor: "center",
					margin: 1
				}
			});
			target = selected?.id === "dark" || selected?.id === "light" ? selected.id : void 0;
		}
		if (target === void 0) return;
		if (target === current) {
			this.host.notice(`${target === "dark" ? "暗色" : "亮色"}主题已启用`, "info");
			return;
		}
		const updated = await saveTheme(bridge, document, target);
		await this.settingsChanged(updated, `${target === "dark" ? "暗色" : "亮色"}主题`);
	}
	async permission(args) {
		const options$1 = this.capabilities.listPermissions();
		if (args !== "") {
			const target$1 = options$1.find((option) => option.id === args);
			if (target$1 === void 0) throw new Error(`未知权限预设 ${JSON.stringify(args)}`);
			await this.selectPermission(target$1);
			return;
		}
		const selected = await this.host.overlays.select({
			title: "权限",
			detail: `作用工作区：${this.capabilities.active()?.workspacePath ?? "未知"}`,
			choices: options$1.map((option) => ({
				id: option.id,
				label: `${currentMark(option.current)}${permissionLabel$1(option)}`,
				description: permissionDescription(option)
			}))
		});
		if (selected === void 0) return;
		const target = options$1.find((option) => option.id === selected.id);
		if (target !== void 0) await this.selectPermission(target);
	}
	async selectPermission(option) {
		if (option.current) return;
		if (option.needsConfirmation) {
			if (!await this.host.overlays.confirm(option.id === "danger-full-access" ? "进入完全访问？" : "切换到未知风险权限？", `${permissionLabel$1(option)}：${permissionDescription(option)}。切换后立即作用于当前会话。`, "确认切换")) return;
		}
		await this.capabilities.selectPermission(option.id);
		this.host.notice(`权限已切换为${permissionLabel$1(option)}`, "success");
	}
	async queue() {
		const rows = (this.capabilities.active()?.session.getSnapshot())?.queue ?? [];
		if (rows.length === 0) {
			this.host.notice("当前队列为空", "info");
			return;
		}
		const queued = rows.filter((row$1) => row$1.placement === "queued");
		const selected = await this.host.overlays.select({
			title: "输入队列",
			detail: "查看、编辑或提前处理排队消息",
			choices: [...queued.length > 1 ? [{
				id: "__all_steer__",
				label: "整队引导",
				description: `按当前顺序处理 ${queued.length} 条排队消息`
			}] : [], ...rows.map((row$1) => ({
				id: row$1.id,
				label: row$1.preview === "" ? "(空消息)" : row$1.preview,
				description: queuePlacementLabel(row$1.placement),
				...row$1.placement === "queued" ? {} : { disabledReason: "当前状态不接受队列修改" }
			}))],
			searchable: rows.length > 8,
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "bottom-center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id === "__all_steer__") {
			for (const row$1 of queued) await this.capabilities.updateQueue(row$1.id, { kind: "steer" });
			this.host.notice("已请求整队引导", "success");
			return;
		}
		const row = rows.find((candidate) => candidate.id === selected.id);
		if (row === void 0 || row.placement !== "queued") return;
		const action = await this.host.overlays.select({
			title: "队列操作",
			choices: [
				{
					id: "steer",
					label: "转为引导",
					description: "并入当前轮次"
				},
				{
					id: "edit",
					label: "编辑",
					...row.text === null ? { disabledReason: "含非文本内容，无法文本编辑" } : {}
				},
				{
					id: "remove",
					label: "删除",
					description: "从待处理队列移除"
				}
			],
			searchable: false
		});
		if (action === void 0) return;
		if (action.id === "steer") await this.capabilities.updateQueue(row.id, { kind: "steer" });
		if (action.id === "remove") await this.capabilities.updateQueue(row.id, { kind: "remove" });
		if (action.id === "edit" && row.text !== null) {
			const text = await this.host.overlays.input({
				title: "编辑排队消息",
				initialValue: row.text
			});
			if (text !== void 0) await this.capabilities.updateQueue(row.id, {
				kind: "edit",
				content: [{
					type: "text",
					text
				}]
			});
		}
		this.host.notice("队列操作已提交", "success");
	}
	async steer(args) {
		if (args === "") throw new Error("用法：/steer <消息>");
		const active = this.capabilities.active();
		if (active === void 0) return;
		const result = await active.session.prompt(this.capabilities.promptContent(args), "steer");
		if (!result.ok) throw new Error(`引导失败：${result.error.message}`);
		this.capabilities.clearAttachments();
		this.host.notice("引导已接受", "success");
	}
	async attach(args) {
		if (args === "") throw new Error("用法：/attach <图片路径>");
		const attachment = await this.capabilities.addAttachment(args);
		const dimensions = attachment.width === void 0 ? "" : ` · ${attachment.width}×${attachment.height}`;
		this.host.notice(`已加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`, "success");
	}
	async attachments() {
		const items = this.capabilities.draftAttachments();
		if (items.length === 0) {
			this.host.notice("没有待发送图片", "info");
			return;
		}
		if (!await this.host.overlays.confirm("清空待发送图片？", items.map((item) => `${item.name} (${item.bytes} B)`).join("；"), "清空")) return;
		this.capabilities.clearAttachments();
		this.host.notice("已清空待发送图片", "success");
	}
	async settings(args) {
		const documents = await this.capabilities.managementBridge().settings.describe();
		if (documents.length === 0) throw new Error("当前 Profile 未注册任何 Settings 命名空间");
		let document;
		if (args !== "") {
			document = documents.find((candidate) => candidate.namespace === args);
			if (document === void 0) throw new Error(`Settings 命名空间 ${JSON.stringify(args)} 不存在`);
		} else {
			const selected$1 = await this.host.overlays.select({
				title: "设置",
				detail: "搜索并修改全部功能设置",
				choices: documents.map((candidate) => ({
					id: candidate.namespace,
					label: candidate.namespace,
					description: `${settingsSectionLabel(candidate.namespace)} · ${candidate.applies === "live" ? "立即生效" : "需重启"}`
				})),
				options: {
					width: "90%",
					maxHeight: "90%",
					anchor: "center",
					margin: 1
				}
			});
			if (selected$1 === void 0) return;
			document = documents.find((candidate) => candidate.namespace === selected$1.id);
		}
		if (document === void 0) return;
		const fields = settingsFields(document);
		const special = this.settingsSpecialChoices(document);
		if (fields.length + special.length === 0) {
			this.host.notice(`${document.namespace} 没有可见设置字段`, "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: `设置 · ${document.namespace}`,
			detail: `${settingsSectionLabel(document.namespace)} · ${document.applies === "live" ? "修改立即生效" : "修改后需重启"}`,
			choices: [...special, ...fields.map((field$1) => ({
				id: JSON.stringify(field$1.path),
				label: field$1.label,
				description: `${fieldState(field$1)}${field$1.description === void 0 ? "" : ` · ${field$1.description}`}`,
				...field$1.disabled ? { disabledReason: "该字段当前不可编辑" } : {}
			}))],
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id.startsWith("__settings_")) {
			await this.editSpecialSetting(document, selected.id);
			return;
		}
		const field = fields.find((candidate) => JSON.stringify(candidate.path) === selected.id);
		if (field === void 0) return;
		await this.editSetting(document, field);
	}
	settingsSpecialChoices(document) {
		switch (document.namespace) {
			case "agent-default-model": return [{
				id: "__settings_default_model__",
				label: "选择新会话默认模型…",
				description: "动态 Provider、模型与推理强度；不会修改当前会话"
			}];
			case "permission": return [{
				id: "__settings_default_permission__",
				label: "选择新会话默认权限…",
				description: "完全访问仍需确认；不会修改当前会话"
			}];
			case "agent-presets": return [{
				id: "__settings_default_mode__",
				label: "选择新会话默认模式…",
				description: "从当前可用模式中选择"
			}];
			case "tui-plugin-marketplace": return [{
				id: "__settings_plugin_sources__",
				label: "管理插件市场来源…",
				description: "管理 npm 和其他插件目录来源"
			}];
			default: return [];
		}
	}
	async editSpecialSetting(document, action) {
		switch (action) {
			case "__settings_default_model__":
				await this.editDefaultModel(document);
				return;
			case "__settings_default_permission__":
				await this.editDefaultPermission(document);
				return;
			case "__settings_default_mode__":
				await this.editDefaultMode(document);
				return;
			case "__settings_plugin_sources__":
				await this.pluginSources("");
				return;
			default: throw new Error(`未知 Settings 专用动作 ${JSON.stringify(action)}`);
		}
	}
	async editDefaultModel(document) {
		const directory = await this.capabilities.listModels();
		const current = typeof document.value === "object" && document.value !== null ? document.value : {};
		const selected = await this.host.overlays.select({
			title: "新会话默认模型",
			detail: "保存后只影响未来创建且未单独选择模型的会话",
			choices: [...directory.options.map((option$1) => ({
				id: option$1.id,
				label: `${current.provider === option$1.selection.provider && current.model === option$1.selection.model ? "当前 · " : ""}${option$1.label}`,
				description: option$1.description
			})), ...directory.failures.map((failure, index) => ({
				id: `__failure_${String(index)}`,
				label: "Provider 目录不可用",
				disabledReason: failure
			}))],
			options: {
				width: "90%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const option = directory.options.find((candidate) => candidate.id === selected.id);
		if (option === void 0) return;
		const selection = await this.reasoningSelection(option);
		if (selection === void 0) return;
		const ops = [
			{
				op: "set",
				path: ["provider"],
				value: selection.provider
			},
			{
				op: "set",
				path: ["model"],
				value: selection.model
			},
			selection.reasoningEffort === void 0 ? {
				op: "unset",
				path: ["reasoningEffort"]
			} : {
				op: "set",
				path: ["reasoningEffort"],
				value: selection.reasoningEffort
			}
		];
		const updated = await this.capabilities.managementBridge().settings.mutate(document.namespace, ops, document.revision);
		await this.settingsChanged(updated, "新会话默认模型");
	}
	async editDefaultPermission(document) {
		const field = settingsFields(document).find((candidate) => candidate.path.length === 1 && candidate.path[0] === "defaultPreset");
		if (field === void 0) throw new Error("当前设置没有默认权限选项；仍可使用下方通用控件");
		const options$1 = this.capabilities.listPermissions();
		const selected = await this.host.overlays.select({
			title: "新会话默认权限",
			detail: "保存后只影响未来创建的会话；当前会话权限保持不变",
			choices: options$1.map((option$1) => ({
				id: option$1.id,
				label: `${field.value === option$1.id ? "当前默认 · " : ""}${permissionLabel$1(option$1)}`,
				description: permissionDescription(option$1)
			}))
		});
		if (selected === void 0) return;
		const option = options$1.find((candidate) => candidate.id === selected.id);
		if (option === void 0 || Object.is(field.value, option.id)) return;
		if (option.needsConfirmation) {
			if (!await this.host.overlays.confirm(option.id === "danger-full-access" ? "新会话默认使用完全访问？" : "使用未知风险默认权限？", `${permissionLabel$1(option)}：${permissionDescription(option)}。以后创建的会话会采用该权限；现有会话不会改变。`, "确认保存")) return;
		}
		const updated = await this.capabilities.managementBridge().settings.mutate(document.namespace, [{
			op: "set",
			path: field.path,
			value: option.id
		}], document.revision);
		await this.settingsChanged(updated, "新会话默认权限");
	}
	async editDefaultMode(document) {
		const field = settingsFields(document).find((candidate) => candidate.path.length === 1 && candidate.path[0] === "default");
		if (field === void 0) throw new Error("当前设置没有默认模式选项；仍可使用下方通用控件");
		const modes = await this.capabilities.listModes();
		const selected = await this.host.overlays.select({
			title: "新会话默认模式",
			detail: "保存后只影响未来创建且未显式选择 Agent Preset 的会话",
			choices: modes.map((mode$1) => ({
				id: mode$1.id,
				label: `${field.value === mode$1.id ? "当前默认 · " : ""}${mode$1.label}`,
				description: `${mode$1.trust === "system" ? "系统" : "用户"}${mode$1.description === void 0 ? "" : ` · ${mode$1.description}`}`,
				...mode$1.disabledReason === void 0 ? {} : { disabledReason: mode$1.disabledReason }
			}))
		});
		if (selected === void 0 || Object.is(field.value, selected.id)) return;
		const mode = modes.find((candidate) => candidate.id === selected.id);
		if (mode === void 0 || mode.disabledReason !== void 0) return;
		const updated = await this.capabilities.managementBridge().settings.mutate(document.namespace, [{
			op: "set",
			path: field.path,
			value: mode.id
		}], document.revision);
		await this.settingsChanged(updated, "新会话默认模式");
	}
	async editSetting(document, field) {
		const bridge = this.capabilities.managementBridge().settings;
		const actions = [
			{
				id: "edit",
				label: field.control === "secret" ? "写入新 Secret…" : "修改值…",
				description: `控件：${field.control}`
			},
			...field.overridden ? [{
				id: "reset",
				label: "重置用户覆盖",
				description: `恢复继承/default：${formatSettingsValue(field.inherited)}`
			}] : [],
			...field.control === "credential-ref" ? [{
				id: "credential-set",
				label: "配置该 Credential…",
				description: "密钥不会在界面回显"
			}, ...typeof field.value === "string" && field.value.trim() !== "" ? [{
				id: "credential-unset",
				label: "清除该 Credential",
				description: "不改变 Settings 中的 Credential Ref"
			}] : []] : []
		];
		const action = await this.host.overlays.select({
			title: field.label,
			detail: `${field.description ?? "暂无说明"}
当前：${field.control === "secret" ? field.secretSet ? "已配置（不可回显）" : "未配置" : formatSettingsValue(field.value)}
配置：${field.overridden ? "已单独设置" : `使用默认值 ${formatSettingsValue(field.inherited)}`}`,
			choices: actions,
			searchable: false
		});
		if (action === void 0) return;
		if (action.id === "credential-set" || action.id === "credential-unset") {
			await this.manageCredential(document, field, action.id === "credential-set");
			return;
		}
		const updated = action.id === "reset" ? await bridge.mutate(document.namespace, [{
			op: "unset",
			path: field.path
		}], document.revision) : await this.writeSetting(document, field);
		if (updated !== void 0) await this.settingsChanged(updated, `${document.namespace}.${field.path.join(".")}`);
	}
	async writeSetting(document, field) {
		let value;
		if (field.control === "boolean") {
			const choice = await this.host.overlays.select({
				title: field.label,
				choices: [{
					id: "true",
					label: "开启",
					description: "true"
				}, {
					id: "false",
					label: "关闭",
					description: "false"
				}],
				searchable: false
			});
			if (choice === void 0) return void 0;
			value = choice.id === "true";
		} else if (field.control === "enum") {
			const choice = await this.host.overlays.select({
				title: field.label,
				choices: field.choices.map((option) => ({
					id: option.id,
					label: option.label,
					...Object.is(option.value, field.value) ? { description: "当前" } : {}
				})),
				searchable: false
			});
			if (choice === void 0) return void 0;
			value = field.choices.find((option) => option.id === choice.id)?.value;
		} else if (field.control === "secret") {
			const secret = await this.host.overlays.secretInput({
				title: `写入 ${field.label}`,
				detail: "现有值不会回显；保存后将替换原值",
				placeholder: "输入新 Secret"
			});
			if (secret === void 0 || secret === "") return void 0;
			value = secret;
		} else {
			const initialValue = field.control === "json" ? JSON.stringify(field.value, null, 2) : typeof field.value === "string" ? field.value : "";
			const text = await this.host.overlays.input({
				title: `修改 ${field.label}`,
				...field.description === void 0 ? {} : { detail: field.description },
				initialValue
			});
			if (text === void 0) return void 0;
			value = parseSettingsValue(field, text);
		}
		return this.capabilities.managementBridge().settings.mutate(document.namespace, [{
			op: "set",
			path: field.path,
			value
		}], document.revision);
	}
	async manageCredential(document, field, set) {
		const bridge = this.capabilities.managementBridge().settings;
		let ref = typeof field.value === "string" ? field.value.trim() : "";
		let writeReference = false;
		if (ref === "") {
			const entered = await this.host.overlays.input({
				title: "Credential Ref",
				detail: "这是引用名，不是 Secret 值",
				placeholder: "例如 DEEPSEEK_API_KEY"
			});
			if (entered === void 0 || entered.trim() === "") return;
			ref = entered.trim();
			writeReference = true;
		}
		const info = await bridge.credentialInfo(ref);
		if (!info.writable) throw new Error(`Credential ${JSON.stringify(ref)} 由系统管理，不能在这里修改`);
		if (set) {
			const secret = await this.host.overlays.secretInput({
				title: `配置 Credential ${ref}`,
				detail: `状态：${info.configured ? "已配置" : "未配置"}。原值不会回显；保存后将替换原值。`,
				placeholder: "输入 Secret"
			});
			if (secret === void 0 || secret === "") return;
			if (writeReference) document = await bridge.mutate(document.namespace, [{
				op: "set",
				path: field.path,
				value: ref
			}], document.revision);
			await bridge.setCredential(ref, secret);
			await this.settingsChanged(document, `Credential ${ref}`);
			return;
		}
		if (writeReference) return;
		if (!info.configured) {
			this.host.notice(`Credential ${ref} 未配置`, "info");
			return;
		}
		if (!await this.host.overlays.confirm(`清除 Credential ${ref}？`, "密钥将被清除，Settings 中的引用名会保留。", "清除")) return;
		await bridge.unsetCredential(ref);
		await this.settingsChanged(document, `Credential ${ref}`);
	}
	async settingsChanged(document, label) {
		if (document.applies === "live") {
			if (document.namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) this.host.applyTheme(themeFromAppearance(document));
			this.host.notice(`${label} 已更新并立即生效`, "success");
			return;
		}
		if (await this.host.overlays.confirm(`${label} 需要重启`, "可立即受控重启并恢复工作区、会话、草稿和附件路径，或稍后使用 /restart。", "立即重启")) this.host.restart(this.capabilities.currentProfile(), `已应用 ${label}`);
		else this.host.requireRestart(`${label} 已修改，输入 /restart 生效`);
	}
	async plugin(args) {
		const parsed = commandParts(args);
		switch (parsed.command) {
			case "":
				await this.pluginCenter();
				return;
			case "list":
				await this.pluginList();
				return;
			case "search":
				await this.pluginSearch(parsed.rest);
				return;
			case "info":
				await this.pluginInfo(parsed.rest);
				return;
			case "install":
			case "add":
				await this.pluginInstall(parsed.rest);
				return;
			case "remove":
			case "rm":
				await this.pluginRemove(parsed.rest);
				return;
			case "update":
			case "up":
				await this.pluginUpdate(parsed.rest);
				return;
			case "reorder":
				await this.pluginReorder();
				return;
			case "source":
			case "sources":
				await this.pluginSources(parsed.rest);
				return;
			case "doctor":
				await this.doctor();
				return;
			default: throw new Error("用法：/plugin [list|search|info|install|remove|update|reorder|source|doctor]");
		}
	}
	async pluginCenter() {
		const snapshot = await this.capabilities.managementBridge().plugins.snapshot();
		const selected = await this.host.overlays.select({
			title: `插件中心 · ${snapshot.profile}`,
			detail: "查看已安装插件、启用状态和加载顺序",
			choices: [
				...snapshot.plugins.map((plugin) => ({
					id: `plugin:${plugin.name}`,
					label: `${plugin.active ? "● " : ""}${pluginIdentity(plugin)}`,
					description: pluginDescription(plugin)
				})),
				{
					id: "__search__",
					label: "搜索插件…",
					description: "从已启用的插件目录中搜索"
				},
				{
					id: "__install__",
					label: "安装插件…",
					description: "支持 npm、Git、压缩包和本地目录；安装前确认"
				},
				{
					id: "__update__",
					label: "更新插件…",
					description: "更新当前 Profile 的插件"
				},
				{
					id: "__reorder__",
					label: "调整插件顺序…",
					description: `${snapshot.bundles.length} 个活动插件`
				},
				{
					id: "__sources__",
					label: "插件目录…",
					description: "查看或添加插件目录"
				},
				{
					id: "__doctor__",
					label: "运行诊断",
					description: "检查插件加载和运行环境"
				}
			],
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id.startsWith("plugin:")) {
			const plugin = snapshot.plugins.find((candidate) => candidate.name === selected.id.slice(7));
			if (plugin !== void 0) await this.installedPlugin(plugin);
			return;
		}
		if (selected.id === "__search__") await this.pluginSearch("");
		if (selected.id === "__install__") await this.pluginInstall("");
		if (selected.id === "__update__") await this.pluginUpdate("");
		if (selected.id === "__reorder__") await this.pluginReorder();
		if (selected.id === "__sources__") await this.pluginSources("");
		if (selected.id === "__doctor__") await this.doctor();
	}
	async pluginList() {
		const snapshot = await this.capabilities.managementBridge().plugins.snapshot();
		if (snapshot.plugins.length === 0) {
			this.host.notice(`Profile ${snapshot.profile} 没有已安装插件依赖`, "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: `已安装插件 · ${snapshot.profile}`,
			choices: snapshot.plugins.map((plugin$1) => ({
				id: plugin$1.name,
				label: `${plugin$1.active ? "● " : ""}${pluginIdentity(plugin$1)}`,
				description: pluginDescription(plugin$1)
			})),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const plugin = snapshot.plugins.find((candidate) => candidate.name === selected.id);
		if (plugin !== void 0) await this.installedPlugin(plugin);
	}
	async installedPlugin(plugin) {
		const selected = await this.host.overlays.select({
			title: pluginIdentity(plugin),
			detail: `${plugin.description ?? "无包说明"}
spec：${plugin.spec}
来源：${plugin.source}
Bundle：${plugin.bundle ? plugin.active ? "已启用" : "未启用" : "否"}
patch：${plugin.patch ?? "未声明"} · ${plugin.patchValid ? "有效" : "无效"}
生命周期脚本：${plugin.scripts.length === 0 ? "无" : plugin.scripts.join(", ")}
诊断：${plugin.diagnostics.length === 0 ? "无" : plugin.diagnostics.join("；")}`,
			choices: [{
				id: "update",
				label: "更新…",
				description: `pnpm update ${plugin.name}`
			}, {
				id: "remove",
				label: "移除…",
				description: `pnpm remove ${plugin.name}`
			}],
			searchable: false
		});
		if (selected?.id === "update") await this.pluginUpdate(plugin.name);
		if (selected?.id === "remove") await this.pluginRemove(plugin.name);
	}
	async pluginSearch(query) {
		let text = query.trim();
		if (text === "") {
			const entered = await this.host.overlays.input({
				title: "搜索插件",
				placeholder: "名称、描述或 Catalog 关键词"
			});
			if (entered === void 0 || entered.trim() === "") return;
			text = entered.trim();
		}
		const candidates = await this.capabilities.managementBridge().plugins.search(text);
		if (candidates.length === 0) {
			this.host.notice(`未找到与 ${JSON.stringify(text)} 匹配的插件`, "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: `插件搜索 · ${text}`,
			detail: "“验证通过”只表示包结构兼容，不表示官方、审核过、安全或可信",
			choices: candidates.map((candidate$1) => ({
				id: candidate$1.id,
				label: `${candidate$1.name}${candidate$1.version === void 0 ? "" : `@${candidate$1.version}`}`,
				description: `${candidate$1.description ?? candidate$1.spec} · ${candidateDescription(candidate$1)}${candidate$1.diagnostics.length === 0 ? "" : ` · ${candidate$1.diagnostics.join("；")}`}`
			})),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const candidate = candidates.find((item) => item.id === selected.id);
		if (candidate !== void 0) await this.marketplaceCandidate(candidate);
	}
	async pluginInfo(spec) {
		if (spec === "") throw new Error("用法：/plugin info <包名或 spec>");
		const installed = (await this.capabilities.managementBridge().plugins.snapshot()).plugins.find((plugin) => plugin.name === spec);
		if (installed !== void 0) {
			await this.installedPlugin(installed);
			return;
		}
		const candidate = await this.capabilities.managementBridge().plugins.inspect(spec);
		await this.marketplaceCandidate(candidate);
	}
	async marketplaceCandidate(candidate) {
		if ((await this.host.overlays.select({
			title: `${candidate.name}${candidate.version === void 0 ? "" : `@${candidate.version}`}`,
			detail: this.candidateDetail(candidate),
			choices: [{
				id: "install",
				label: "安装到当前 Profile…",
				description: `pnpm add --save-exact ${candidate.spec}`,
				...candidate.source !== "git" && (!candidate.bundle || !candidate.patchValid) ? { disabledReason: "候选未通过 Bundle patch 安装前验证" } : {}
			}],
			searchable: false,
			options: {
				width: "90%",
				maxHeight: "85%",
				anchor: "center",
				margin: 1
			}
		}))?.id === "install") await this.installCandidate(candidate);
	}
	candidateDetail(candidate) {
		return `${candidate.description ?? "无包说明"}
发布者：${candidate.publisher ?? "未知"}
来源：${candidate.sourceId} / ${candidate.source}
spec：${candidate.spec}
定位：${candidate.immutable ? "不可变" : "可变，未来内容可能改变"}
Bundle patch：${candidate.bundle ? candidate.patchValid ? "声明且有效" : "声明但无效" : "未声明/尚未验证"}
生命周期脚本：${candidate.scripts.length === 0 ? "无或尚未知" : candidate.scripts.join(", ")}
诊断：${candidate.diagnostics.length === 0 ? "无" : candidate.diagnostics.join("；")}
信任边界：Profile 插件安装器（pnpm），不受当前 Agent permission 或 sandbox 约束；包脚本以启动 deepseek 的本机用户权限运行。
注意：结构验证不代表安全、信任或质量审核。`;
	}
	async pluginInstall(spec) {
		let value = spec.trim();
		if (value === "") {
			const entered = await this.host.overlays.input({
				title: "按 spec 安装插件",
				detail: "支持 npm、Git、tarball 和本地路径；不接受带内嵌凭证的 URL",
				placeholder: "例如 @scope/plugin@1.2.3"
			});
			if (entered === void 0 || entered.trim() === "") return;
			value = entered.trim();
		}
		const candidate = await this.capabilities.managementBridge().plugins.inspect(value);
		if (candidate.source !== "git" && (!candidate.bundle || !candidate.patchValid)) throw new Error(`已拒绝安装：${candidate.diagnostics.join("；") || "未通过 dsh.bundle.patch 验证"}`);
		await this.installCandidate(candidate);
	}
	async installCandidate(candidate) {
		const profile = this.capabilities.currentProfile();
		if (!await this.host.overlays.confirm(`安装 ${candidate.name} 到 ${profile}？`, `${this.candidateDetail(candidate)}
将执行：pnpm add --save-exact ${candidate.spec}
目标 Profile：${profile}
pnpm 可能执行上述包脚本；Git 包只能在安装后由原生 Manager 再验证。此操作不使用 Agent 沙箱。`, "理解风险并安装")) return;
		const result = await this.capabilities.managementBridge().plugins.run([
			"add",
			"--save-exact",
			candidate.spec
		]);
		await this.pluginOperation(`安装 ${candidate.name}`, result);
	}
	async pluginRemove(name$1) {
		let target = name$1.trim();
		const snapshot = await this.capabilities.managementBridge().plugins.snapshot();
		if (target === "") {
			const selected = await this.host.overlays.select({
				title: "移除插件",
				choices: snapshot.plugins.map((plugin) => ({
					id: plugin.name,
					label: pluginIdentity(plugin),
					description: pluginDescription(plugin)
				}))
			});
			if (selected === void 0) return;
			target = selected.id;
		}
		if (snapshot.plugins.find((candidate) => candidate.name === target) === void 0) throw new Error(`当前 Profile 未安装 ${JSON.stringify(target)}`);
		if (!await this.host.overlays.confirm(`从 ${snapshot.profile} 移除 ${target}？`, `将执行：pnpm remove ${target}。Bundle 列表会由原生 Manager 对账。`, "移除")) return;
		await this.pluginOperation(`移除 ${target}`, await this.capabilities.managementBridge().plugins.run(["remove", target]));
	}
	async pluginUpdate(name$1) {
		let target = name$1.trim();
		const snapshot = await this.capabilities.managementBridge().plugins.snapshot();
		if (target === "") {
			const selected = await this.host.overlays.select({
				title: "更新插件",
				choices: [{
					id: "__all__",
					label: "更新全部 Profile 依赖",
					description: "pnpm update"
				}, ...snapshot.plugins.map((plugin) => ({
					id: plugin.name,
					label: pluginIdentity(plugin),
					description: plugin.spec
				}))]
			});
			if (selected === void 0) return;
			target = selected.id === "__all__" ? "" : selected.id;
		} else if (!snapshot.plugins.some((plugin) => plugin.name === target)) throw new Error(`当前 Profile 未安装 ${JSON.stringify(target)}`);
		const args = target === "" ? ["update"] : ["update", target];
		if (!await this.host.overlays.confirm(target === "" ? `更新 ${snapshot.profile} 全部依赖？` : `更新 ${target}？`, `将执行：pnpm ${args.join(" ")}。解析结果由 Profile lockfile 持久化。`, "更新")) return;
		await this.pluginOperation(target === "" ? "更新全部插件" : `更新 ${target}`, await this.capabilities.managementBridge().plugins.run(args));
	}
	async pluginOperation(label, result) {
		if (result.exitCode !== 0) {
			const detail = result.stderr.trim() || result.stdout.trim() || "无 pnpm 输出";
			throw new Error(`${label} 失败（exit ${result.exitCode}）：${detail.slice(-1200)}`);
		}
		const warnings = result.warnings.length === 0 ? "" : `；${result.warnings.join("；")}`;
		this.host.notice(`${label} 完成${result.changed ? "" : "（没有变化）"}${warnings}`, warnings === "" ? "success" : "warning");
		if (!result.restartRequired) return;
		await this.restartAfterPluginChange(label);
	}
	async restartAfterPluginChange(label) {
		if (await this.host.overlays.confirm(`${label} 后需要重启`, "重启后会恢复当前工作区、会话、草稿和附件。", "立即重启")) this.host.restart(this.capabilities.currentProfile(), `${label} 已应用`);
		else this.host.requireRestart(`${label} 已完成，输入 /restart 加载变更`);
	}
	async pluginReorder() {
		const bridge = this.capabilities.managementBridge().plugins;
		const snapshot = await bridge.snapshot();
		if (snapshot.bundles.length < 2) {
			this.host.notice("当前插件少于 2 个，无需调整顺序", "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: "Bundle 顺序",
			detail: "顺序直接对应 dsh.profile.bundles；不会增删 Bundle",
			choices: snapshot.bundles.map((bundle, index$1) => ({
				id: bundle,
				label: `${index$1 + 1}. ${bundle}`
			}))
		});
		if (selected === void 0) return;
		const index = snapshot.bundles.indexOf(selected.id);
		const direction = await this.host.overlays.select({
			title: `移动 ${selected.id}`,
			choices: [
				{
					id: "top",
					label: "移到最前",
					...index === 0 ? { disabledReason: "已在最前" } : {}
				},
				{
					id: "up",
					label: "上移一位",
					...index === 0 ? { disabledReason: "已在最前" } : {}
				},
				{
					id: "down",
					label: "下移一位",
					...index === snapshot.bundles.length - 1 ? { disabledReason: "已在最后" } : {}
				},
				{
					id: "bottom",
					label: "移到最后",
					...index === snapshot.bundles.length - 1 ? { disabledReason: "已在最后" } : {}
				}
			],
			searchable: false
		});
		if (direction === void 0) return;
		const bundles = [...snapshot.bundles];
		bundles.splice(index, 1);
		const target = direction.id === "top" ? 0 : direction.id === "bottom" ? bundles.length : direction.id === "up" ? index - 1 : index + 1;
		bundles.splice(target, 0, selected.id);
		await bridge.reorder(bundles);
		this.host.notice("插件顺序已保存", "success");
		await this.restartAfterPluginChange("调整 Bundle 顺序");
	}
	async pluginSources(args) {
		const bridge = this.capabilities.managementBridge().plugins;
		const parsed = commandParts(args);
		if (parsed.command === "add") {
			const input = commandParts(parsed.rest);
			if (input.command === "" || input.rest === "") throw new Error("用法：/plugin source add <id> <URL或文件>");
			const snapshot$1 = await bridge.sources();
			await bridge.saveSources([...snapshot$1.sources, {
				id: input.command,
				kind: "catalog",
				label: input.command,
				url: input.rest,
				enabled: true,
				builtIn: false
			}], snapshot$1.revision);
			this.host.notice(`已添加插件目录 ${input.command}`, "success");
			return;
		}
		if ([
			"remove",
			"enable",
			"disable"
		].includes(parsed.command)) {
			if (parsed.rest === "") throw new Error(`/plugin source ${parsed.command} 需要 Source id`);
			const snapshot$1 = await bridge.sources();
			const target = snapshot$1.sources.find((source$1) => source$1.id === parsed.rest);
			if (target === void 0 || target.builtIn) throw new Error(`插件目录 ${JSON.stringify(parsed.rest)} 不存在或不可修改`);
			const sources = parsed.command === "remove" ? snapshot$1.sources.filter((source$1) => source$1.id !== target.id) : snapshot$1.sources.map((source$1) => source$1.id === target.id ? {
				...source$1,
				enabled: parsed.command === "enable"
			} : source$1);
			await bridge.saveSources(sources, snapshot$1.revision);
			this.host.notice(`插件目录 ${target.id} 已${parsed.command === "remove" ? "移除" : parsed.command === "enable" ? "启用" : "停用"}`, "success");
			return;
		}
		if (parsed.command !== "" && parsed.command !== "list") throw new Error("用法：/plugin source [list|add <id> <URL>|remove|enable|disable]");
		const snapshot = await bridge.sources();
		const selected = await this.host.overlays.select({
			title: "插件市场来源",
			detail: "npm 与插件提供的目录为只读；你添加的插件目录可在这里管理",
			choices: [...snapshot.sources.map((source$1) => ({
				id: `source:${source$1.id}`,
				label: `${source$1.enabled ? "● " : "○ "}${source$1.label}`,
				description: `${source$1.kind} · ${source$1.url}${source$1.credentialRef === void 0 ? "" : ` · Credential ${source$1.credentialRef}`}${source$1.builtIn ? " · 内置" : ""}`
			})), {
				id: "__add__",
				label: "添加插件目录…"
			}],
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id === "__add__") {
			await this.addPluginSource(snapshot.sources, snapshot.revision);
			return;
		}
		const source = snapshot.sources.find((item) => item.id === selected.id.slice(7));
		if (source === void 0) return;
		await this.editPluginSource(source, snapshot.sources, snapshot.revision);
	}
	async addPluginSource(sources, revision) {
		const id = await this.host.overlays.input({
			title: "插件目录 ID",
			placeholder: "小写 kebab-case"
		});
		if (id === void 0 || id.trim() === "") return;
		const label = await this.host.overlays.input({
			title: "插件目录名称",
			initialValue: id.trim()
		});
		if (label === void 0 || label.trim() === "") return;
		const url = await this.host.overlays.input({
			title: "目录 URL 或文件",
			placeholder: "https://example/catalog.json"
		});
		if (url === void 0 || url.trim() === "") return;
		const credentialRef$1 = await this.host.overlays.input({
			title: "Credential Ref（可选）",
			detail: "只输入引用名，不要在 URL 或此处粘贴 Secret",
			placeholder: "留空表示无认证"
		});
		if (credentialRef$1 === void 0) return;
		const source = {
			id: id.trim(),
			kind: "catalog",
			label: label.trim(),
			url: url.trim(),
			enabled: true,
			...credentialRef$1.trim() === "" ? {} : { credentialRef: credentialRef$1.trim() },
			builtIn: false
		};
		await this.capabilities.managementBridge().plugins.saveSources([...sources, source], revision);
		this.host.notice(`已添加插件目录 ${source.id}`, "success");
		if (source.credentialRef !== void 0) await this.configureSourceCredential(source.credentialRef);
	}
	async editPluginSource(source, sources, revision) {
		const choices = source.builtIn ? [...source.credentialRef === void 0 ? [] : [{
			id: "credential",
			label: "配置 Credential…",
			description: source.credentialRef
		}], {
			id: "close",
			label: "内置插件目录不可修改",
			disabledReason: "由插件提供方管理"
		}] : [
			{
				id: "toggle",
				label: source.enabled ? "停用" : "启用"
			},
			{
				id: "credential",
				label: "配置 Credential…",
				description: source.credentialRef ?? "尚未设置 Credential Ref"
			},
			{
				id: "remove",
				label: "移除插件目录…"
			}
		];
		const selected = await this.host.overlays.select({
			title: source.label,
			detail: `${source.url}
${source.credentialRef === void 0 ? "无 Credential Ref" : `Credential Ref：${source.credentialRef}`}`,
			choices,
			searchable: false
		});
		if (selected === void 0) return;
		if (selected.id === "credential") {
			let ref = source.credentialRef;
			if (ref === void 0 || ref === "") {
				const entered = await this.host.overlays.input({
					title: "Credential Ref",
					placeholder: "输入引用名，不是 Secret"
				});
				if (entered === void 0 || entered.trim() === "") return;
				ref = entered.trim();
				const credentialRef$1 = ref;
				const updated = sources.map((item) => item.id === source.id ? {
					...item,
					credentialRef: credentialRef$1
				} : item);
				await this.capabilities.managementBridge().plugins.saveSources(updated, revision);
			}
			await this.configureSourceCredential(ref);
			return;
		}
		if (source.builtIn) return;
		if (selected.id === "remove") {
			if (!await this.host.overlays.confirm(`移除 ${source.label}？`, "该目录将不再参与搜索；已安装插件不受影响。", "移除")) return;
		}
		const next = selected.id === "remove" ? sources.filter((item) => item.id !== source.id) : sources.map((item) => item.id === source.id ? {
			...item,
			enabled: !source.enabled
		} : item);
		await this.capabilities.managementBridge().plugins.saveSources(next, revision);
		this.host.notice(`插件目录 ${source.id} 已${selected.id === "remove" ? "移除" : source.enabled ? "停用" : "启用"}`, "success");
	}
	async configureSourceCredential(ref) {
		const bridge = this.capabilities.managementBridge().settings;
		if (!(await bridge.credentialInfo(ref)).writable) {
			this.host.notice(`Credential ${ref} 由系统管理，无需在这里配置`, "info");
			return;
		}
		const secret = await this.host.overlays.secretInput({
			title: `配置 Credential ${ref}`,
			detail: "值不会回显；保存后将替换原值",
			placeholder: "输入 Secret；Esc 跳过"
		});
		if (secret === void 0 || secret === "") return;
		await bridge.setCredential(ref, secret);
		this.host.notice(`Credential ${ref} 已配置`, "success");
	}
	async doctor() {
		const [report, status, inventory] = await Promise.all([
			this.capabilities.managementBridge().plugins.doctor(),
			this.capabilities.headerFacts(true),
			this.capabilities.pluginInventory()
		]);
		const errors = report.diagnostics.filter((item) => item.level === "error").length;
		const warnings = report.diagnostics.filter((item) => item.level === "warning").length;
		const failedInstances = inventory.filter((item) => item.fiberPhase === "failed");
		const enabledInstances = inventory.filter((item) => item.enabled).length;
		const selected = await this.host.overlays.select({
			title: `诊断 · ${report.profile}`,
			detail: `Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}\npnpm：${report.pnpm ?? "不可用"} · ${errors} 个错误 · ${warnings} 个警告 · ${enabledInstances} 个插件运行中`,
			choices: [
				{
					id: "runtime",
					label: `Runtime · ${status.running ? "运行中" : "空闲"}`,
					description: `${status.workspace} · ${status.model} · ${status.permission}`
				},
				...report.diagnostics.map((item, index) => ({
					id: `plugin:${index}`,
					label: `${item.level === "error" ? "✕" : item.level === "warning" ? "!" : "✓"} ${item.message}`,
					description: item.level
				})),
				...failedInstances.map((item) => ({
					id: `loader:${item.entryId}`,
					label: `插件实例 · ${item.moduleName}`,
					description: `${item.enabled ? "已启用" : "已禁用"} · ${item.fiberPhase ?? "未挂载"}`
				}))
			],
			searchable: false,
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id === "runtime") {
			await this.host.overlays.detail({
				title: "运行环境详情",
				content: [
					`Harness：${status.hostVersion}`,
					`Node：${status.nodeVersion}`,
					`系统：${status.platform}/${status.architecture}`,
					`pnpm：${report.pnpm ?? "不可用"}`,
					`Profile：${report.profile}`,
					`工作区：${status.workspace}`,
					`会话：${status.session}`,
					`模式：${status.mode}`,
					`模型：${status.model}`,
					`权限：${status.permission}`,
					`状态：${status.running ? "运行中" : "空闲"}`
				].join("\n"),
				options: {
					width: "95%",
					maxHeight: "90%",
					anchor: "center",
					margin: 1
				}
			});
			return;
		}
		if (selected.id.startsWith("plugin:")) {
			const index = Number(selected.id.slice(7));
			const diagnostic = Number.isInteger(index) ? report.diagnostics[index] : void 0;
			if (diagnostic === void 0) return;
			const level = diagnostic.level === "error" ? "错误" : diagnostic.level === "warning" ? "警告" : "信息";
			await this.host.overlays.detail({
				title: `诊断详情 · ${level}`,
				content: diagnostic.message,
				options: {
					width: "95%",
					maxHeight: "90%",
					anchor: "center",
					margin: 1
				}
			});
			return;
		}
		const loader = inventory.find((item) => `loader:${item.entryId}` === selected.id);
		if (loader === void 0) return;
		await this.host.overlays.detail({
			title: `插件实例详情 · ${loader.moduleName}`,
			content: [
				`模块：${loader.moduleName}`,
				`实例：${loader.entryId}`,
				`状态：${loader.enabled ? "已启用" : "已禁用"}`,
				`加载阶段：${loader.fiberPhase ?? "未挂载"}`
			].join("\n"),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
	}
	async restart() {
		const profile = this.capabilities.currentProfile();
		if (await this.host.overlays.confirm("重新启动 deepseek？", "会恢复当前工作区、会话、未发送草稿和附件；正在运行的任务会停止。", "重启")) this.host.restart(profile, `Profile ${profile} 已重启`);
	}
	async tools(args) {
		if (args === "display") {
			const mode = this.host.transcript.cycleToolVisibility();
			this.host.notice(`工具卡片：${mode === "collapsed" ? "折叠" : mode === "expanded" ? "展开" : "隐藏"}`, "info");
			this.host.refresh();
			return;
		}
		if (args !== "") throw new Error("用法：/tools [display]");
		const tools = this.capabilities.toolCatalog();
		const todos = this.capabilities.projection("todos");
		const choices = [
			{
				id: "__display__",
				label: "调整工具卡片显示",
				description: "折叠 → 展开 → 隐藏"
			},
			...Array.isArray(todos) ? [{
				id: "__todos__",
				label: `任务清单 · ${todos.length} 项`,
				description: "查看当前任务清单"
			}] : [],
			...tools.map((tool$1) => {
				const boundary$1 = toolBoundary(tool$1);
				return {
					id: `tool:${tool$1.name}`,
					label: tool$1.name,
					description: `${tool$1.description} · ${boundary$1.label}`
				};
			})
		];
		const selected = await this.host.overlays.select({
			title: "工具",
			detail: tools.length === 0 ? "当前会话尚无工具记录" : `${tools.length} 个可用工具`,
			choices,
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id === "__display__") {
			await this.tools("display");
			return;
		}
		const tool = tools.find((candidate) => `tool:${candidate.name}` === selected.id);
		const value = selected.id === "__todos__" ? todos : tool?.parameters;
		const boundary = tool === void 0 ? void 0 : toolBoundary(tool);
		await this.host.overlays.detail({
			title: selected.label,
			content: `${boundary === void 0 ? "" : `${boundary.detail}\n\n`}参数 / 数据：\n${detailText(value)}`,
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
	}
	async files() {
		const paths = this.capabilities.producedFiles();
		if (paths.length === 0) {
			this.host.notice("最近一轮没有生成文件", "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: "产出文件",
			detail: "查看、复制或打开最近一轮生成的文件",
			choices: paths.map((path$1) => ({
				id: path$1,
				label: path$1
			})),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const action = await this.host.overlays.select({
			title: selected.label,
			choices: [{
				id: "copy",
				label: "复制绝对路径"
			}, {
				id: "open",
				label: "用外部程序打开",
				description: "使用编辑器或系统默认程序"
			}],
			searchable: false
		});
		if (action?.id === "copy") {
			this.host.copy(this.capabilities.producedFilePath(selected.id));
			this.host.notice("已复制产出文件路径", "success");
		} else if (action?.id === "open") {
			if (await this.host.overlays.confirm(`使用外部程序打开 ${selected.label}？`, "所选绝对路径将交给编辑器或系统程序；该程序不受 Agent 权限限制。", "打开")) {
				await this.capabilities.openProducedFile(selected.id);
				this.host.notice(`已打开 ${selected.id}`, "success");
			}
		}
	}
	async jobs() {
		const jobs = this.capabilities.jobs();
		if (jobs.length === 0) {
			this.host.notice("当前会话没有后台任务", "info");
			return;
		}
		const now = Date.now();
		const selected = await this.host.overlays.select({
			title: "后台任务",
			detail: "查看当前会话的后台任务",
			choices: jobs.map((job$1) => ({
				id: job$1.id,
				label: `${jobStatusLabel(job$1.status)} · ${job$1.kind} · ${job$1.label}`,
				description: `${jobDetailLabel(job$1.detail) ?? "无详情"} · ${elapsedLabel(Math.max(0, (job$1.finishedAt ?? now) - job$1.startedAt))}`
			})),
			searchable: jobs.length > 8,
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "bottom-center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const job = jobs.find((candidate) => candidate.id === selected.id);
		if (job === void 0) return;
		const finishedAt = job.finishedAt;
		const duration = Math.max(0, (finishedAt ?? Date.now()) - job.startedAt);
		await this.host.overlays.detail({
			title: `后台任务 · ${job.label}`,
			content: [
				`状态：${jobStatusLabel(job.status)}`,
				`类型：${job.kind}`,
				`任务 ID：${job.id}`,
				`开始：${new Date(job.startedAt).toISOString()}`,
				`结束：${finishedAt === void 0 ? "仍在运行" : new Date(finishedAt).toISOString()}`,
				`耗时：${elapsedLabel(duration)}`,
				"",
				`详情：${jobDetailLabel(job.detail) ?? "没有任务详情。"}`
			].join("\n"),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
	}
	async subagents() {
		const parent = this.capabilities.active();
		if (parent === void 0) throw new Error("当前没有打开的父会话");
		this.capabilities.setSubagentCatalogOpen(parent.sessionId, true);
		try {
			let refresh = true;
			while (true) {
				const rows = await this.capabilities.subagents(refresh);
				refresh = false;
				const selected = await this.host.overlays.select({
					title: "子 Agent",
					detail: "查看或继续当前会话创建的子 Agent；运行时可用 Ctrl+C 停止",
					choices: [{
						id: "__refresh__",
						label: "刷新目录",
						description: "重新读取当前父会话的直接子节点"
					}, ...rows.map((row$1) => row$1.entry.kind === "diagnostic" ? {
						id: `diagnostic:${row$1.entry.id}`,
						label: `${row$1.entry.id} · ${row$1.entry.reason}`,
						disabledReason: "该子 Agent 当前不可用"
					} : {
						id: `child:${row$1.entry.id}`,
						label: `${row$1.entry.activity === "running" ? "运行中" : "空闲"} · ${row$1.entry.label ?? row$1.entry.id}`,
						description: [
							row$1.entry.mode === "continuable" ? "可继续" : "单次只读",
							row$1.entry.hasChildren ? "有子节点" : "叶节点",
							row$1.totalTokens === void 0 ? void 0 : `${row$1.totalTokens.toLocaleString("en-US")} tok`,
							row$1.durationMs === void 0 ? void 0 : `${Math.round(row$1.durationMs / 100) / 10}s`
						].filter((value) => value !== void 0).join(" · ")
					})],
					options: {
						width: "95%",
						maxHeight: "90%",
						anchor: "center",
						margin: 1
					}
				});
				if (selected === void 0) return;
				if (selected.id === "__refresh__") {
					refresh = true;
					continue;
				}
				const row = rows.find((candidate) => `child:${candidate.entry.id}` === selected.id);
				if (row?.address === void 0) return;
				this.capabilities.openSubagent(row.address);
				this.host.notice(`已打开子 Agent ${row.entry.id}${row.address.mode === "continuable" ? "；可直接输入继续，运行时 Ctrl+C 停止" : "；该会话只读"}`, "success");
				return;
			}
		} finally {
			this.capabilities.setSubagentCatalogOpen(parent.sessionId, false);
		}
	}
	async trajectory() {
		const trajectory = this.capabilities.trajectory();
		if (trajectory === void 0) throw new Error("当前 Profile 未提供 Trajectory 投影");
		const choices = trajectory.requests.map((request, index) => ({
			id: `request:${index}`,
			label: `${request.purpose} · ${request.status} · #${request.startSeq}`,
			description: `${request.requestConfig?.provider ?? "未知 Provider"}/${request.requestConfig?.model ?? "未知模型"} · ${request.completedAt === null ? "运行中" : `${Math.max(0, request.completedAt - request.startedAt)} ms`}`
		}));
		choices.push(...trajectory.runningCalls.map((call) => ({
			id: `call:${call.callId}`,
			label: `运行中工具 · ${call.name}`,
			description: call.callId
		})));
		if (choices.length === 0) {
			this.host.notice("当前会话还没有请求或工具轨迹", "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: "轨迹",
			detail: `${trajectory.eventNodes.length} 个事件节点 · ${trajectory.requests.length} 个请求 · ${trajectory.runningCalls.length} 个运行中工具`,
			choices,
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		const value = selected.id.startsWith("request:") ? trajectory.requests[Number(selected.id.slice(8))] : trajectory.runningCalls.find((call) => `call:${call.callId}` === selected.id);
		await this.host.overlays.detail({
			title: selected.label,
			content: detailText(value),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
	}
	async feedback(args) {
		if (args !== "") {
			await this.capabilities.recordSessionFeedback(args);
			this.host.notice("已记录会话反馈", "success");
			return;
		}
		const kind = await this.host.overlays.select({
			title: "反馈",
			detail: "记录对当前会话或某条回复的评价",
			choices: [{
				id: "session",
				label: "记录会话反馈",
				description: "说明本次会话的使用感受"
			}, {
				id: "message",
				label: "评价一条回复",
				description: "好评、差评、说明或删除现有评价"
			}],
			searchable: false
		});
		if (kind === void 0) return;
		if (kind.id === "session") {
			const text = await this.host.overlays.input({
				title: "会话反馈",
				placeholder: "输入对当前会话的反馈"
			});
			if (text === void 0 || text.trim() === "") return;
			await this.capabilities.recordSessionFeedback(text);
			this.host.notice("已记录会话反馈", "success");
			return;
		}
		await this.messageFeedback();
	}
	async messageFeedback() {
		const targets = await this.capabilities.feedbackTargets();
		if (targets.length === 0) throw new Error("当前会话中没有可评价的回复");
		const selected = await this.host.overlays.select({
			title: "消息反馈",
			detail: "选择要评价的回复",
			choices: targets.map((target$1) => ({
				id: String(target$1.message.messageId),
				label: `${target$1.feedback?.rating === "positive" ? "好评" : target$1.feedback?.rating === "negative" ? "差评" : "未评价"} · ${target$1.preview}`,
				description: target$1.feedback?.note ?? new Date(target$1.message.time).toLocaleString()
			})),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		const target = targets.find((candidate) => String(candidate.message.messageId) === selected?.id);
		if (target?.message.messageId === void 0) return;
		const action = await this.host.overlays.select({
			title: target.preview,
			choices: [
				{
					id: "positive",
					label: "好评",
					description: "positive"
				},
				{
					id: "negative",
					label: "差评",
					description: "negative"
				},
				...target.feedback === void 0 ? [] : [{
					id: "remove",
					label: "删除现有反馈",
					description: "回复内容不会删除"
				}]
			],
			searchable: false
		});
		if (action === void 0) return;
		if (action.id === "remove") {
			if (target.feedback === void 0) return;
			await this.capabilities.clearFeedback(target.message.messageId, target.feedback.version);
			this.host.notice("已删除该消息反馈", "success");
			return;
		}
		const note = await this.host.overlays.input({
			title: action.id === "positive" ? "好评说明（可选）" : "差评说明（可选）",
			initialValue: target.feedback?.note ?? "",
			placeholder: "留空表示不附说明"
		});
		if (note === void 0) return;
		await this.capabilities.putFeedback(target.message.messageId, action.id === "positive" ? "positive" : "negative", note.trim() === "" ? void 0 : note, target.feedback?.version ?? null);
		this.host.notice("已提交消息反馈", "success");
	}
	async skills() {
		const skills = await this.capabilities.skills();
		if (skills.length === 0) {
			this.host.notice("当前工作区没有用户可调用 Skill", "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: "Skills",
			detail: "选择一个 Skill，并补充需要它完成的任务",
			choices: skills.map((skill) => ({
				id: skill.name,
				label: `/${skill.name}${skill.modelInvocable ? "" : " · 仅用户调用"}`,
				description: `${skill.description}${skill.whenToUse === void 0 ? "" : ` · ${skill.whenToUse}`}`
			})),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected !== void 0) this.host.setEditor(`/${selected.id} `);
	}
	async mcp() {
		const [inventory, documents] = await Promise.all([this.capabilities.pluginInventory(), this.capabilities.managementBridge().settings.describe()]);
		const tools = this.capabilities.toolCatalog().filter((tool$1) => tool$1.name.startsWith("mcp__"));
		const plugins = inventory.filter((item) => item.moduleName.toLowerCase().includes("mcp"));
		const settings = documents.filter((document) => document.namespace.toLowerCase().includes("mcp"));
		if (tools.length + plugins.length + settings.length === 0) {
			this.host.notice("当前 Profile 没有可见 MCP 工具、实例或 Settings；可用 /plugin 安装扩展", "info");
			return;
		}
		const selected = await this.host.overlays.select({
			title: "MCP",
			detail: "查看 MCP 工具、实例和设置。MCP 可能在独立进程或远端服务中运行，不受 Agent 沙箱保护。",
			choices: [
				...tools.map((tool$1) => ({
					id: `tool:${tool$1.name}`,
					label: `工具 · ${tool$1.name}`,
					description: `${tool$1.description} · 外部服务`
				})),
				...plugins.map((item) => ({
					id: `plugin:${item.entryId}`,
					label: `实例 · ${item.moduleName}`,
					description: `${item.enabled ? "启用" : "禁用"} · ${item.fiberPhase ?? "未挂载"}`
				})),
				...settings.map((document) => ({
					id: `settings:${document.namespace}`,
					label: `设置 · ${document.namespace}`,
					description: document.applies === "live" ? "立即生效" : "需要重启"
				}))
			],
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0) return;
		if (selected.id.startsWith("settings:")) {
			await this.settings(selected.id.slice(9));
			return;
		}
		const plugin = plugins.find((candidate) => `plugin:${candidate.entryId}` === selected.id);
		if (plugin !== void 0) {
			const phase = plugin.fiberPhase ?? "未挂载";
			const followUp = await this.host.overlays.select({
				title: `MCP 实例 · ${plugin.moduleName}`,
				detail: [
					`模块：${plugin.moduleName}`,
					`实例 ID：${plugin.entryId}`,
					`运行状态：${plugin.enabled ? "已启用" : "已禁用"} · ${phase}`,
					"作用范围：当前 Profile；工具是否可用取决于当前会话和模型。",
					"安全提示：MCP 可能在独立进程或远端服务中运行，不受 Agent 沙箱保护；请单独检查其配置、凭证、文件和网络权限。",
					phase === "failed" ? "诊断：实例启动失败；运行 /doctor，并检查对应的 MCP 设置。" : "诊断：运行 /doctor 查看完整检查结果。"
				].join("\n"),
				choices: [
					{
						id: "close",
						label: "关闭"
					},
					{
						id: "doctor",
						label: "运行 /doctor",
						description: "检查 Profile、插件和运行环境"
					},
					...settings.map((document) => ({
						id: `settings:${document.namespace}`,
						label: `打开设置 · ${document.namespace}`,
						description: document.applies === "live" ? "立即生效" : "需要重启"
					}))
				],
				searchable: false,
				options: {
					width: "95%",
					maxHeight: "90%",
					anchor: "center",
					margin: 1
				}
			});
			if (followUp?.id === "doctor") await this.doctor();
			else if (followUp !== void 0 && followUp.id.startsWith("settings:")) await this.settings(followUp.id.slice(9));
			return;
		}
		const tool = tools.find((candidate) => `tool:${candidate.name}` === selected.id);
		if (tool !== void 0) await this.host.overlays.detail({
			title: tool.name,
			content: `${toolBoundary(tool).detail}\n\n参数：\n${detailText(tool.parameters)}`
		});
	}
	async status() {
		const status = await this.capabilities.headerFacts(true);
		const statistics = this.capabilities.sessionStatistics();
		const projections = this.capabilities.projectionEntries();
		const selected = await this.host.overlays.select({
			title: "状态与统计",
			detail: [
				`Harness ${status.hostVersion} · Node ${status.nodeVersion} · ${status.platform}/${status.architecture}`,
				`Profile ${status.profile} · ${status.running ? "运行中" : "空闲"}`,
				status.workspace,
				`${status.session} · ${status.mode} · ${status.model} · ${status.permission}`,
				...statistics.lines
			].join("\n"),
			choices: projections.length === 0 ? [{
				id: "none",
				label: "当前没有会话数据",
				description: "暂无可显示内容"
			}] : projections.map(([key, value]) => ({
				id: key,
				label: key,
				description: detailText(value).replace(/\s+/gu, " ").slice(0, 240)
			})),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
		if (selected === void 0 || selected.id === "none") return;
		const projection = projections.find(([key]) => key === selected.id);
		if (projection === void 0) return;
		await this.host.overlays.detail({
			title: `会话数据 · ${projection[0]}`,
			content: detailText(projection[1]),
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		});
	}
	retryPending() {
		const snapshot = this.capabilities.active()?.session.getSnapshot();
		if (snapshot === void 0 || snapshot.pending.length === 0) {
			this.host.notice("当前没有待处理交互", "info");
			return;
		}
		for (const wait of snapshot.pending) this.handledInteractions.delete(wait.key);
		this.syncPending(snapshot);
	}
	async handleInteraction(wait) {
		if (!(this.capabilities.active()?.session.getSnapshot().pending.some((candidate) => candidate.key === wait.key) === true)) return;
		if (wait.kind === "approval") await this.approval(wait);
		else await this.question(wait);
	}
	async approval(wait) {
		const selected = await this.host.overlays.select({
			title: `工具审批 · ${wait.payload.toolName}`,
			detail: wait.payload.reason ?? `调用 ${wait.payload.callId ?? wait.payload.approvalId}`,
			searchable: false,
			choices: [{
				id: "allow",
				label: "仅本次允许",
				description: "只允许这一次工具调用"
			}, {
				id: "reject",
				label: "拒绝",
				description: "本次工具调用不会执行"
			}],
			footer: "Enter 确认 · Esc 安全拒绝",
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "bottom-center",
				margin: 1
			}
		});
		await this.capabilities.answerApproval(wait, selected?.id === "allow" ? "allowed-once" : "rejected");
	}
	async question(wait) {
		const answers = [];
		for (const [index, question] of wait.payload.questions.entries()) {
			const planReview = question.intent?.kind === "plan-review" ? question.intent : void 0;
			const title = `${planReview === void 0 ? question.header ?? "问题" : "计划审查"} · ${index + 1}/${wait.payload.questions.length}`;
			const presentation = (option) => {
				if (planReview === void 0) return option;
				return option.label === planReview.approve ? {
					label: "批准计划",
					description: "按此计划继续"
				} : {
					label: "继续规划",
					description: "返回并修改计划"
				};
			};
			if (question.multiSelect === true) {
				const picked$1 = await this.host.overlays.multiSelect({
					title,
					detail: question.detail ?? question.question,
					choices: (question.options ?? []).map((option) => {
						const display = presentation(option);
						return {
							id: option.label,
							label: display.label,
							...display.description === void 0 ? {} : { description: display.description }
						};
					}),
					options: {
						width: "95%",
						maxHeight: "90%",
						anchor: "bottom-center",
						margin: 1
					}
				});
				if (picked$1 === void 0) {
					await this.capabilities.cancelQuestion(wait);
					return;
				}
				answers.push({
					id: question.id,
					selected: picked$1.map((option) => option.id)
				});
				continue;
			}
			const choices = [...(question.options ?? []).map((option) => {
				const display = presentation(option);
				return {
					id: `option:${option.label}`,
					label: display.label,
					...display.description === void 0 ? {} : { description: display.description }
				};
			}), ...planReview === void 0 ? [{
				id: "__custom__",
				label: "自定义回答…"
			}, {
				id: "__skip__",
				label: "跳过",
				description: "提交空选择"
			}] : []];
			const picked = await this.host.overlays.select({
				title,
				detail: question.detail ?? question.question,
				choices,
				searchable: planReview === void 0,
				options: {
					width: "95%",
					maxHeight: "90%",
					anchor: "bottom-center",
					margin: 1
				}
			});
			if (picked === void 0) {
				await this.capabilities.cancelQuestion(wait);
				return;
			}
			if (picked.id === "__custom__") {
				const custom = await this.host.overlays.input({
					title: question.question,
					...question.detail === void 0 ? {} : { detail: question.detail },
					options: {
						width: "95%",
						maxHeight: "90%",
						anchor: "bottom-center",
						margin: 1
					}
				});
				if (custom === void 0) {
					await this.capabilities.cancelQuestion(wait);
					return;
				}
				answers.push({
					id: question.id,
					selected: [],
					custom
				});
			} else if (picked.id === "__skip__") answers.push({
				id: question.id,
				selected: []
			});
			else answers.push({
				id: question.id,
				selected: [picked.id.slice(7)]
			});
		}
		await this.capabilities.answerQuestion(wait, { answers });
	}
};
/**
* Resolve one exact candidate from a previously merged catalog.
* @param catalog - merged dynamic command catalog.
* @param name - command name without a leading slash.
* @returns the exact command candidate when registered.
*/
function commandOf(catalog, name$1) {
	return catalog.find((candidate) => candidate.name === name$1);
}

//#endregion
//#region src/client/chrome.ts
function fit(text, width) {
	return truncateToWidth(text, Math.max(1, width), "…");
}
function padded(text, width) {
	const clipped = fit(text, width);
	return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}
function columns(left, right, width) {
	if (right === void 0 || right === "") return fit(left, width);
	const gap = width - visibleWidth(left) - visibleWidth(right);
	if (gap >= 1) return `${left}${" ".repeat(gap)}${right}`;
	const leftWidth = width - visibleWidth(right) - 1;
	if (leftWidth >= 8) return `${fit(left, leftWidth)} ${right}`;
	return fit(right, width);
}
function gutter(width) {
	const cells = width >= 12 ? 2 : 0;
	return {
		prefix: " ".repeat(cells),
		innerWidth: Math.max(1, width - cells * 2)
	};
}
function modeLabel(value) {
	switch (value) {
		case "standard": return "标准";
		case "code": return "PTC";
		case "minimal": return "极简";
		case "cordis": return "创造";
		default: return value;
	}
}
function modelLabel(value) {
	const [rawRoute = value, effort] = value.split(" · ", 2);
	const providerless = rawRoute.startsWith("deepseek-official/") ? rawRoute.slice(18) : rawRoute;
	return `${providerless.startsWith("deepseek-") ? providerless.slice(9) : providerless}${effort === void 0 ? "" : ` · ${{
		low: "低",
		medium: "中",
		high: "高",
		xhigh: "极高",
		max: "最大",
		ultra: "极致"
	}[effort] ?? effort}推理`}`;
}
function permissionLabel(value) {
	switch (value) {
		case "read-only": return "只读";
		case "workspace-write": return "工作区";
		case "danger-full-access": return "完全访问";
		case "custom": return "自定义";
		default: return value;
	}
}
function horizontalRule(label, width, paint$1) {
	if (width <= 1) return paint$1("─".repeat(Math.max(1, width)));
	const labelWidth = Math.max(0, width - 2);
	const safeLabel = labelWidth === 0 ? "" : truncateToWidth(label, labelWidth, "…");
	const suffix = safeLabel === "" ? "" : ` ${safeLabel}`;
	return paint$1(`${"─".repeat(Math.max(1, width - visibleWidth(suffix)))}${suffix}`);
}
function compactFacts(label, width) {
	if (width <= 0) return "";
	const parts = label.split(" · ");
	const candidates = [label];
	const model = parts[0] ?? label;
	const mode = parts.at(-1) ?? label;
	candidates.push([model, mode].join(" · "), mode);
	return candidates.find((candidate) => visibleWidth(candidate) <= width) ?? truncateToWidth(mode, width, "…");
}
function isHorizontalRule(line) {
	const plain = line.replace(/\u001B\[[0-9;:]*m/gu, "");
	return /^(?:─+|─── [↑↓] \d+ more ─*)$/u.test(plain);
}
/**
* Keep the composer and shortcut row visible while the editor or autocomplete grows.
*
* @param terminalRows - Total rows currently available in the terminal.
* @param editorRows - Rows occupied by the framed editor and autocomplete list.
* @returns Rows that remain available for the transcript viewport.
*/
function transcriptViewportRows(terminalRows, editorRows) {
	return Math.max(1, terminalRows - 3 - editorRows);
}
/** One quiet context row containing only live execution state on the right. */
var ContextBar = class {
	state;
	constructor(profile, workspace) {
		this.state = {
			kind: "loading",
			profile,
			workspace
		};
	}
	/**
	* Show the current Harness Session in the context row.
	* @param facts - Current Session facts projected from Harness capabilities.
	*/
	setFacts(facts) {
		this.state = {
			kind: "facts",
			facts
		};
	}
	/**
	* Show a connected workspace without an active Session.
	* @param profile - Connected Profile.
	* @param workspace - Current working directory.
	*/
	setEmpty(profile, workspace) {
		this.state = {
			kind: "empty",
			profile,
			workspace
		};
	}
	/**
	* Show a failed Harness connection without expanding the top row.
	* @param profile - Failed Profile.
	* @param message - Safe failure summary.
	*/
	setError(profile, message) {
		this.state = {
			kind: "error",
			profile,
			workspace: this.state.kind === "facts" ? this.state.facts.workspace : this.state.workspace,
			message
		};
	}
	invalidate() {}
	render(width) {
		const { prefix, innerWidth } = gutter(width);
		if (this.state.kind === "facts") {
			const facts = this.state.facts;
			const context = facts.context?.split(" · ", 1)[0];
			const runtime = facts.running ? color.accent("● 生成中") : color.muted("就绪");
			return [`${prefix}${columns("", context === void 0 ? runtime : `${color.muted(context)} · ${runtime}`, innerWidth)}`];
		}
		return [`${prefix}${columns("", this.state.kind === "error" ? color.danger(this.state.message) : color.muted(this.state.kind === "loading" ? "正在连接 Harness…" : "未打开会话"), innerWidth)}`];
	}
};
/** One stable permission row; high-signal runtime facts share its right side. */
var StatusBar = class {
	permission = "workspace-write";
	detail;
	/**
	* Show the current permission projected by Harness.
	* @param permission - Current permission preset id.
	*/
	setPermission(permission) {
		this.permission = permission;
	}
	/**
	* Replace the optional runtime fact or notice on the right.
	* @param detail - High-signal state; absent while idle.
	*/
	setDetail(detail) {
		this.detail = detail;
	}
	invalidate() {}
	render(width) {
		const { prefix, innerWidth } = gutter(width);
		const label = `使用权限：${permissionLabel(this.permission)}`;
		const permission = `${color.brand("▸▸")} ${this.permission === "danger-full-access" ? color.danger(label) : this.permission === "read-only" ? color.muted(label) : color.accent(label)}`;
		if (this.detail === void 0 || innerWidth - visibleWidth(permission) - visibleWidth(this.detail) < 1) return [`${prefix}${fit(permission, innerWidth)}`];
		return [`${prefix}${columns(permission, this.detail, innerWidth)}`];
	}
};
/** Open Grok-style composer with live model facts aligned to its lower rule. */
var PromptEditor = class extends Editor {
	facts = "deepseek · 标准";
	constructor(tui) {
		super(tui, editorTheme, {
			paddingX: 3,
			autocompleteMaxVisible: 6
		});
	}
	/**
	* Embed current Harness Session facts in the composer's lower rule.
	* @param facts - Current authoritative Session facts.
	*/
	setFacts(facts) {
		this.facts = [facts.model === "" ? void 0 : modelLabel(facts.model), modeLabel(facts.mode)].filter((value) => value !== void 0).join(" · ");
	}
	/** Return the composer to its connected blank-session facts. */
	setEmpty() {
		this.facts = "deepseek · 标准";
	}
	render(width) {
		this.borderColor = this.focused ? color.brand : color.border;
		if (width < 8) return super.render(width);
		const { prefix, innerWidth: frameWidth } = gutter(width);
		const lines = super.render(frameWidth);
		const lowerRule = lines.findIndex((line, index) => index > 0 && isHorizontalRule(line));
		const split = lowerRule < 0 ? lines.length - 1 : lowerRule;
		const editorRows = lines.slice(1, split);
		const autocompleteRows = lines.slice(split + 1);
		if (this.getText() === "" && !this.isShowingAutocomplete() && editorRows.length > 0) {
			const cursor = this.focused ? `${CURSOR_MARKER}\u001B[7m \u001B[0m` : "";
			editorRows[0] = padded(`${color.brand("❯")} ${cursor}${color.muted("输入消息，/ 打开命令")}`, frameWidth);
		} else if (editorRows.length > 0) editorRows[0] = `${color.brand("❯")} ${editorRows[0]?.slice(2) ?? ""}`;
		const body = [...editorRows, ...autocompleteRows].map((row) => padded(row, frameWidth));
		const compactedFacts = compactFacts(this.facts, Math.max(0, frameWidth - 2));
		return [
			horizontalRule("", frameWidth, this.borderColor),
			...body,
			horizontalRule(compactedFacts, frameWidth, this.borderColor)
		].map((line) => `${prefix}${line}`);
	}
};

//#endregion
//#region src/client/overlays.ts
function rowOf(choice, descriptionWidth) {
	const state = choice.active === true ? "● " : choice.disabledReason === void 0 ? "  " : "× ";
	const description = choice.disabledReason ?? choice.description;
	return {
		value: choice.id,
		label: escapeTerminalText(`${state}${choice.label}`),
		...description === void 0 ? {} : { description: truncateToWidth(escapeTerminalText(description), descriptionWidth, "…") }
	};
}
function escapeFrame(lines) {
	return lines.map((line) => line.split(CURSOR_MARKER).map(escapeTerminalText).join(CURSOR_MARKER));
}
function frameContentWidth(width) {
	return Math.max(1, width - 4);
}
function selectDescriptionWidth(width) {
	return Math.max(1, Math.min(60, width - 36));
}
function modalRule(title, width, top) {
	const start = top ? "╭" : "╰";
	const end = top ? "╮" : "╯";
	if (!top || title === void 0 || width < 8) return color.border(`${start}${"─".repeat(Math.max(0, width - 2))}${end}`);
	const lead = `─ ${truncateToWidth(escapeTerminalText(title), Math.max(1, width - 7), "…")} `;
	return color.border(`${start}${lead}${"─".repeat(Math.max(0, width - 2 - visibleWidth(lead)))}${end}`);
}
function modalFrame(title, lines, width) {
	const contentWidth = frameContentWidth(width);
	const vertical = color.border("│");
	const content = escapeFrame(lines.map((line) => truncateToWidth(line, contentWidth, "…"))).map((line) => `${vertical} ${line}${" ".repeat(Math.max(0, contentWidth - visibleWidth(line)))} ${vertical}`);
	return [
		modalRule(title, width, true),
		...content,
		modalRule(void 0, width, false)
	].map((line) => surfaceRow(line, width));
}
function modalOptions(options$1) {
	return {
		width: "80%",
		minWidth: 44,
		maxHeight: "80%",
		anchor: "center",
		margin: 1,
		...options$1
	};
}
function wrappedDetail(detail, width, maxLines = 4) {
	const lines = wrapTextWithAnsi(escapeTerminalText(detail), Math.max(1, width));
	if (lines.length <= maxLines) return lines.map((line) => color.muted(line));
	const visible = lines.slice(0, maxLines);
	const last = visible.at(-1) ?? "";
	visible[visible.length - 1] = truncateToWidth(`${last} …`, width, "…");
	return visible.map((line) => color.muted(line));
}
/** Search input plus SelectList, with disabled-row and Escape-first semantics. */
var SearchSelectOverlay = class {
	focused = false;
	input = new Input();
	list;
	filtered;
	descriptionWidth = 36;
	notice = "";
	constructor(request, settle) {
		this.request = request;
		this.settle = settle;
		this.filtered = request.choices;
		this.list = this.createList(this.filtered);
		this.input.onSubmit = () => {
			this.choose();
		};
		this.input.onEscape = () => {
			this.escape();
		};
	}
	invalidate() {
		this.input.invalidate();
		this.list.invalidate();
	}
	render(width) {
		const safeWidth = frameContentWidth(width);
		const descriptionWidth = selectDescriptionWidth(safeWidth);
		if (descriptionWidth !== this.descriptionWidth) {
			const selectedId = this.list.getSelectedItem()?.value;
			this.descriptionWidth = descriptionWidth;
			this.list = this.createList(this.filtered, selectedId);
		}
		const lines = [];
		if (this.request.detail !== void 0) lines.push(...wrappedDetail(this.request.detail, safeWidth));
		if (this.request.searchable !== false) {
			this.input.focused = this.focused;
			lines.push(`${color.muted("搜索 ")}${this.input.render(Math.max(1, safeWidth - 5))[0] ?? ""}`);
		}
		lines.push(...this.list.render(safeWidth));
		if (this.notice !== "") lines.push(color.warning(truncateToWidth(this.notice, safeWidth, "…")));
		lines.push(color.muted(this.request.footer ?? "↑↓ 选择 · Enter 确认 · Esc 清空/关闭"));
		return modalFrame(this.request.title, lines, width);
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.escape();
			return;
		}
		if (matchesKey(data, Key.tab)) {
			this.choose();
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.list.setSelectedIndex(0);
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.list.setSelectedIndex(Math.max(0, this.filtered.length - 1));
			return;
		}
		if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.enter)) {
			this.list.handleInput(data);
			return;
		}
		if (this.request.searchable === false) return;
		this.input.handleInput(data);
		this.applyFilter(this.input.getValue());
	}
	createList(choices, preferredId) {
		const rows = choices.map((choice) => rowOf(choice, this.descriptionWidth));
		const list$1 = new SelectList(rows, this.request.maxVisible ?? 10, editorTheme.selectList);
		const preferredIndex = preferredId === void 0 ? 0 : rows.findIndex((row) => row.value === preferredId);
		list$1.setSelectedIndex(Math.max(0, preferredIndex));
		list$1.onSelect = () => {
			this.choose();
		};
		list$1.onCancel = () => {
			this.escape();
		};
		return list$1;
	}
	applyFilter(query) {
		this.filtered = query === "" ? this.request.choices : fuzzyFilter([...this.request.choices], query, (choice) => `${choice.label} ${choice.description ?? ""} ${choice.id}`);
		this.list = this.createList(this.filtered);
		this.notice = "";
	}
	choose() {
		const selected = this.list.getSelectedItem();
		const choice = selected === null ? void 0 : this.filtered.find((candidate) => candidate.id === selected.value);
		if (choice === void 0) return;
		if (choice.disabledReason !== void 0) {
			this.notice = choice.disabledReason;
			return;
		}
		this.settle(choice);
	}
	escape() {
		if (this.request.searchable !== false && this.input.getValue() !== "") {
			this.input.setValue("");
			this.applyFilter("");
			return;
		}
		this.settle(void 0);
	}
};
/** Single-line input overlay for titles, paths, custom answers, and queue edits. */
var TextInputOverlay = class {
	focused = false;
	input = new Input();
	constructor(request, settle) {
		this.request = request;
		this.settle = settle;
		this.input.setValue(escapeTerminalText(request.initialValue ?? ""));
		this.input.onSubmit = (value) => {
			settle(escapeTerminalText(value));
		};
		this.input.onEscape = () => {
			settle(void 0);
		};
	}
	invalidate() {
		this.input.invalidate();
	}
	render(width) {
		const safeWidth = frameContentWidth(width);
		this.input.focused = this.focused;
		return modalFrame(this.request.title, [
			...this.request.detail === void 0 ? [] : wrappedDetail(this.request.detail, safeWidth),
			this.input.render(safeWidth)[0] ?? color.muted(this.request.placeholder ?? ""),
			color.muted("Enter 确认 · Esc 取消")
		], width);
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.settle(void 0);
			return;
		}
		this.input.handleInput(data);
	}
};
/** Write-only secret input: the underlying value is never returned by render(). */
var SecretInputOverlay = class {
	focused = false;
	input = new Input();
	constructor(request, settle) {
		this.request = request;
		this.settle = settle;
		this.input.onSubmit = (value) => {
			this.finish(value);
		};
		this.input.onEscape = () => {
			this.finish(void 0);
		};
	}
	invalidate() {
		this.input.invalidate();
	}
	render(width) {
		const safeWidth = frameContentWidth(width);
		const length = Array.from(this.input.getValue()).length;
		const cursor = this.focused ? CURSOR_MARKER : "";
		const masked = length === 0 ? `${cursor}${color.muted(this.request.placeholder ?? "输入新 Secret")}` : `${"•".repeat(Math.min(length, 32))}${cursor}▌`;
		return modalFrame(this.request.title, [
			...this.request.detail === void 0 ? [] : wrappedDetail(this.request.detail, safeWidth),
			truncateToWidth(masked, safeWidth, "…"),
			color.muted("输入内容不会回显或写入日志 · Enter 保存 · Esc 取消")
		], width);
	}
	handleInput(data) {
		if (matchesKey(data, Key.ctrl("c"))) {
			this.finish(void 0);
			return;
		}
		this.input.handleInput(data);
	}
	finish(value) {
		this.input.setValue("");
		this.settle(value);
	}
};
/** Multi-select question overlay; Space toggles, Enter commits. */
var MultiSelectOverlay = class {
	focused = false;
	input = new Input();
	filtered;
	list;
	selected = /* @__PURE__ */ new Set();
	descriptionWidth = 36;
	constructor(request, settle) {
		this.request = request;
		this.settle = settle;
		this.filtered = request.choices;
		this.list = this.createList();
	}
	invalidate() {
		this.input.invalidate();
		this.list.invalidate();
	}
	render(width) {
		const safeWidth = frameContentWidth(width);
		const descriptionWidth = selectDescriptionWidth(safeWidth);
		if (descriptionWidth !== this.descriptionWidth) {
			const selectedId = this.list.getSelectedItem()?.value;
			this.descriptionWidth = descriptionWidth;
			this.list = this.createList(selectedId);
		}
		this.input.focused = this.focused;
		return modalFrame(this.request.title, [
			...this.request.detail === void 0 ? [] : wrappedDetail(this.request.detail, safeWidth),
			`${color.muted("搜索 ")}${this.input.render(Math.max(1, safeWidth - 5))[0] ?? ""}`,
			...this.list.render(safeWidth),
			color.muted(this.request.footer ?? "↑↓ 选择 · Space 勾选 · Enter 提交 · Esc 取消")
		], width);
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			if (this.input.getValue() !== "") {
				this.input.setValue("");
				this.applyFilter("");
			} else this.settle(void 0);
			return;
		}
		if (matchesKey(data, Key.space)) {
			const item = this.list.getSelectedItem();
			if (item === null) return;
			if (this.selected.has(item.value)) this.selected.delete(item.value);
			else this.selected.add(item.value);
			this.list = this.createList(item.value);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.settle(this.request.choices.filter((choice) => this.selected.has(choice.id)));
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.list.setSelectedIndex(0);
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.list.setSelectedIndex(Math.max(0, this.filtered.length - 1));
			return;
		}
		if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
			this.list.handleInput(data);
			return;
		}
		this.input.handleInput(data);
		this.applyFilter(this.input.getValue());
	}
	createList(preferredId) {
		const rows = this.filtered.map((choice) => ({
			value: choice.id,
			label: escapeTerminalText(`${this.selected.has(choice.id) ? "[x]" : "[ ]"} ${choice.label}`),
			...choice.description === void 0 ? {} : { description: truncateToWidth(escapeTerminalText(choice.description), this.descriptionWidth, "…") }
		}));
		const list$1 = new SelectList(rows, this.request.maxVisible ?? 10, editorTheme.selectList);
		const index = preferredId === void 0 ? 0 : rows.findIndex((row) => row.value === preferredId);
		list$1.setSelectedIndex(Math.max(0, index));
		return list$1;
	}
	applyFilter(query) {
		this.filtered = query === "" ? this.request.choices : fuzzyFilter([...this.request.choices], query, (choice) => `${choice.label} ${choice.description ?? ""} ${choice.id}`);
		this.list = this.createList();
	}
};
/** Fixed-height, scrollable body for structured output and diagnostics. */
var ScrollableDetailOverlay = class {
	focused = false;
	offset = 0;
	lineCount = 0;
	viewportRows;
	constructor(request, settle) {
		this.request = request;
		this.settle = settle;
		this.viewportRows = Math.max(1, request.maxVisible ?? 12);
	}
	invalidate() {}
	render(width) {
		const safeWidth = frameContentWidth(width);
		const content = escapeTerminalText(this.request.content);
		const lines = wrapTextWithAnsi(content === "" ? "(无详情)" : content, safeWidth).map((line) => color.muted(line));
		this.lineCount = lines.length;
		const maxOffset = Math.max(0, this.lineCount - this.viewportRows);
		this.offset = Math.min(this.offset, maxOffset);
		const end = Math.min(this.lineCount, this.offset + this.viewportRows);
		const position = `${String(this.offset + 1)}-${String(end)}/${String(this.lineCount)} 行`;
		return modalFrame(this.request.title, [...lines.slice(this.offset, end), color.muted(this.request.footer ?? `${position} · ↑↓ 滚动 · PgUp/PgDn 翻页 · Home/End · Enter/Esc 关闭`)], width);
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.enter) || data === "q") {
			this.settle();
			return;
		}
		const maxOffset = Math.max(0, this.lineCount - this.viewportRows);
		if (matchesKey(data, Key.up)) this.offset = Math.max(0, this.offset - 1);
		else if (matchesKey(data, Key.down)) this.offset = Math.min(maxOffset, this.offset + 1);
		else if (matchesKey(data, Key.pageUp)) this.offset = Math.max(0, this.offset - this.viewportRows);
		else if (matchesKey(data, Key.pageDown)) this.offset = Math.min(maxOffset, this.offset + this.viewportRows);
		else if (matchesKey(data, Key.home)) this.offset = 0;
		else if (matchesKey(data, Key.end)) this.offset = maxOffset;
	}
};
/** One-focus-owner FIFO for every built-in terminal modal. */
var OverlayQueue = class {
	entries = [];
	active;
	accepting = true;
	/** @param tui - mounted pi-tui root whose public overlay API owns focus. */
	constructor(tui) {
		this.tui = tui;
	}
	/**
	* Whether a modal currently owns input focus.
	* @returns true while an overlay owns input focus.
	*/
	hasActive() {
		return this.active !== void 0;
	}
	/**
	* Open a searchable choice selector in FIFO order.
	* @param request - selector content and presentation options.
	* @returns the selected choice, or undefined after cancellation.
	*/
	select(request) {
		return this.enqueue((settle) => new SearchSelectOverlay(request, settle), request.options);
	}
	/**
	* Open a single-line text input in FIFO order.
	* @param request - input content and presentation options.
	* @returns submitted text, or undefined after cancellation.
	*/
	input(request) {
		return this.enqueue((settle) => new TextInputOverlay(request, settle), request.options);
	}
	/**
	* Open a write-only masked input; no existing value or raw render is supported.
	* @param request - title, safe detail, placeholder, and layout options.
	* @returns submitted secret, or undefined after cancellation.
	*/
	secretInput(request) {
		return this.enqueue((settle) => new SecretInputOverlay(request, settle), request.options);
	}
	/**
	* Open a multi-select question in FIFO order.
	* @param request - selector content and presentation options.
	* @returns selected choices, or undefined after cancellation.
	*/
	multiSelect(request) {
		return this.enqueue((settle) => new MultiSelectOverlay(request, settle), request.options);
	}
	/**
	* Open scrollable read-only content in FIFO order.
	* @param request - title, complete content, and viewport options.
	*/
	async detail(request) {
		await this.enqueue((settle) => new ScrollableDetailOverlay(request, () => {
			settle(void 0);
		}), request.options);
	}
	/**
	* Explicit high-risk confirmation.
	* @param title - concise risk prompt.
	* @param detail - complete impact description.
	* @param confirmLabel - affirmative action label.
	* @returns true only when the affirmative action was selected.
	*/
	async confirm(title, detail, confirmLabel = "确认") {
		return (await this.select({
			title,
			detail,
			searchable: false,
			choices: [{
				id: "confirm",
				label: confirmLabel,
				description: "我已理解上述影响"
			}, {
				id: "cancel",
				label: "取消",
				description: "保持当前状态"
			}],
			footer: "↑↓ 选择 · Enter 确认 · Esc 取消",
			options: {
				width: "95%",
				maxHeight: "90%",
				anchor: "center",
				margin: 1
			}
		}))?.id === "confirm";
	}
	/** Settle every active/queued request before terminal teardown. */
	dispose() {
		if (!this.accepting) return;
		this.accepting = false;
		if (this.active !== void 0) this.settle(this.active, void 0);
		for (const entry of [...this.entries]) this.settle(entry, void 0);
	}
	enqueue(create, options$1) {
		if (!this.accepting) return Promise.resolve(void 0);
		return new Promise((resolve$1, reject) => {
			const entry = {
				create: (settle) => create(settle),
				options: modalOptions(options$1),
				resolve: resolve$1,
				reject,
				settled: false
			};
			this.entries.push(entry);
			this.activateNext();
		});
	}
	activateNext() {
		if (!this.accepting || this.active !== void 0) return;
		const entry = this.entries.shift();
		if (entry === void 0) return;
		this.active = entry;
		const component = entry.create((value) => {
			this.settle(entry, value);
		});
		try {
			entry.handle = this.tui.showOverlay(component, entry.options);
			this.tui.requestRender();
		} catch (error) {
			this.fail(entry, error);
		}
	}
	settle(entry, value) {
		if (entry.settled) return;
		entry.settled = true;
		entry.handle?.hide();
		if (this.active === entry) this.active = void 0;
		const queued = this.entries.indexOf(entry);
		if (queued >= 0) this.entries.splice(queued, 1);
		entry.resolve(value);
		this.tui.requestRender();
		queueMicrotask(() => {
			this.activateNext();
		});
	}
	fail(entry, error) {
		if (entry.settled) return;
		entry.settled = true;
		if (this.active === entry) this.active = void 0;
		entry.reject(error);
		this.tui.requestRender();
		queueMicrotask(() => {
			this.activateNext();
		});
	}
};

//#endregion
//#region src/client/transcript.ts
function imageAttachment(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const row = value;
	return typeof row.attachmentId === "string" && typeof row.mediaType === "string" && typeof row.bytes === "number" && typeof row.width === "number" && typeof row.height === "number" ? value : void 0;
}
function imageRow(attachment) {
	return {
		format: "image",
		key: String(attachment.attachmentId),
		attachment
	};
}
function imageLabel(attachment) {
	return `[图片 · ${attachment.name ?? String(attachment.attachmentId)} · ${attachment.width}×${attachment.height} · ${attachment.mediaType} · ${attachment.bytes} 字节]`;
}
function jsonText(value) {
	if (value === void 0 || typeof value === "function" || typeof value === "symbol") return String(value);
	try {
		const rendered = JSON.stringify(value, null, 2);
		return rendered.length > 8e3 ? `${rendered.slice(0, 8e3)}\n…（终端显示已截断）` : rendered;
	} catch {
		return typeof value === "bigint" ? value.toString() : "[内容无法序列化]";
	}
}
function contentBlockText(block$1) {
	if (typeof block$1 !== "object" || block$1 === null) return String(block$1);
	const value = block$1;
	if (value.type === "text" || value.type === "reasoning") return typeof value.text === "string" ? value.text : `[${value.type}]`;
	if (value.type === "image") return "[图片附件]";
	if (value.type === "tool-result") return "[工具结果]";
	return `[${typeof value.type === "string" ? value.type : "内容"}]`;
}
function permissionCommandText(node) {
	if (node.name !== "permission" || node.outcome?.kind !== "success") return void 0;
	const preset = /^preset\s+(\S+)/u.exec(node.outcome.text ?? "")?.[1] ?? node.args?.trim();
	if (preset === void 0 || preset === "") return color.success("权限已切换");
	const label = preset === "read-only" ? "只读" : preset === "workspace-write" ? "工作区" : preset === "danger-full-access" ? "完全访问" : preset;
	return color.success(`权限已切换为${label}`);
}
function planCommandText(node) {
	if (node.name !== "plan") return void 0;
	if (node.outcome === null) return color.warning("正在切换计划模式");
	if (node.outcome.kind !== "success") return color.danger(`计划模式切换失败${node.outcome.text === void 0 ? "" : `\n${node.outcome.text}`}`);
	const text = node.outcome.text ?? "";
	if (node.args?.trim() === "off") {
		if (text.includes("entry cancelled")) return color.success("已取消进入计划模式");
		if (text.includes("already inactive")) return color.muted("计划模式未开启");
		if (text.startsWith("Leaving ")) return color.success("计划模式将在下一步关闭");
		return color.success("计划模式已关闭");
	}
	return color.success(text.startsWith("Entering ") ? "计划模式将在下一步开启" : "计划模式已开启");
}
function goalCommandText(node) {
	if (node.name !== "goal") return void 0;
	if (node.outcome === null) return color.warning("正在处理目标");
	const args = node.args?.trim() ?? "";
	const action = args.toLowerCase();
	if (node.outcome.kind !== "success") {
		if (node.outcome.text?.startsWith("A goal is already ") === true) return color.danger("已有进行中的目标；可编辑或清除后重新创建");
		if (action === "edit") return color.danger("请提供新的目标内容");
		if (node.outcome.text?.startsWith("No goal is currently set") === true) return color.danger("当前没有目标");
		return color.danger("当前状态不能执行此目标操作");
	}
	if (action === "clear") return color.success(node.outcome.text === "No goal to clear." ? "当前没有目标" : "目标已清除");
	if (action === "pause") return color.success("目标已暂停");
	if (action === "resume") return color.success("目标已继续");
	if (action.startsWith("edit ")) return color.success(`目标已更新：${args.slice(5).trim()}`);
	if (args !== "") return color.success(`目标已创建：${args}`);
	if (node.outcome.text?.startsWith("No goal is currently set.") === true) return color.muted("当前没有目标");
	const objective = /^Objective: (.*)$/mu.exec(node.outcome.text ?? "")?.[1];
	const phase = /^Status: (\S+)$/mu.exec(node.outcome.text ?? "")?.[1];
	const blocker = /^Blocker: (.*)$/mu.exec(node.outcome.text ?? "")?.[1];
	const phaseLabel = phase === "active" ? "进行中" : phase === "paused" ? "已暂停" : phase === "blocked" ? "受阻" : phase === "complete" ? "已完成" : void 0;
	return [
		objective === void 0 ? "当前目标" : `目标：${objective}`,
		...phaseLabel === void 0 ? [] : [`状态：${phaseLabel}`],
		...blocker === void 0 ? [] : [`阻塞原因：${blocker}`]
	].join("\n");
}
function contentText(content) {
	return content.map(contentBlockText).join("\n").trim();
}
function contentRows(content) {
	return content.flatMap((block$1) => {
		if (typeof block$1 !== "object" || block$1 === null) return [{
			format: "plain",
			text: String(block$1)
		}];
		const value = block$1;
		if (value.type === "text" && typeof value.text === "string") return value.text === "" ? [] : [{
			format: "markdown",
			text: value.text
		}];
		if (value.type === "image") {
			const attachment = imageAttachment(value.attachment);
			return attachment === void 0 ? [{
				format: "plain",
				text: color.warning("[图片附件元数据无效]")
			}] : [imageRow(attachment)];
		}
		return [{
			format: "plain",
			text: contentBlockText(block$1)
		}];
	});
}
function userContentRows(content, steering = false) {
	const rows = contentRows(content);
	const prefix = steering ? `${color.brand("❯")} ${color.muted("引导")} ` : `${color.brand("❯")} `;
	const first = rows[0];
	if (first === void 0) return [{
		format: "plain",
		text: prefix.trimEnd(),
		userTurn: true
	}];
	if (first.format === "image") return [{
		format: "plain",
		text: prefix.trimEnd(),
		userTurn: true
	}, ...rows];
	return [{
		...first,
		text: `${prefix}${first.text}`,
		userTurn: true
	}, ...rows.slice(1)];
}
function assistantBlockText(block$1, preferences) {
	switch (block$1.kind) {
		case "text": return block$1.text;
		case "reasoning": return preferences.reasoning ? color.muted(`思考\n${block$1.text}`) : "";
		case "image": return color.muted("[图片附件]");
		case "tool-call":
			if (preferences.tools === "hidden") return "";
			return color.accent(`◆ ${block$1.name}${preferences.tools === "expanded" ? `\n${prettyArgs(block$1.argsRaw)}` : ""}`);
		case "other": return color.muted("模型扩展内容 · /trajectory 查看详情");
	}
}
function assistantBlockRows(block$1, preferences) {
	switch (block$1.kind) {
		case "text": return block$1.text === "" ? [] : [{
			format: "markdown",
			text: block$1.text
		}];
		case "reasoning":
			if (!preferences.reasoning || block$1.text === "") return [];
			return [{
				format: "markdown",
				text: `> **思考**\n>\n${block$1.text.split("\n").map((line) => `> ${line}`).join("\n")}`
			}];
		case "image": return [imageRow(block$1.attachment)];
		case "tool-call":
			if (preferences.tools === "hidden") return [];
			return [{
				format: "plain",
				text: color.accent(`◆ ${block$1.name}${preferences.tools === "expanded" ? `\n${prettyArgs(block$1.argsRaw)}` : ""}`)
			}];
		case "other": return [{
			format: "plain",
			text: color.muted("模型扩展内容 · /trajectory 查看详情")
		}];
	}
}
function prettyArgs(argsRaw) {
	try {
		return jsonText(JSON.parse(argsRaw));
	} catch {
		return argsRaw;
	}
}
function contentLines(text) {
	if (text === "") return [];
	return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}
function diffText(value) {
	if (!Array.isArray(value) || value.length === 0) return jsonText(value);
	const rows = [];
	const paths = /* @__PURE__ */ new Set();
	let added = 0;
	let removed = 0;
	for (const item of value) {
		if (typeof item !== "object" || item === null) return jsonText(value);
		const { path: path$1, oldText, newText } = item;
		if (typeof path$1 !== "string" || oldText !== null && typeof oldText !== "string" || typeof newText !== "string") return jsonText(value);
		paths.add(path$1);
		rows.push(color.accent(path$1));
		if (oldText !== null) for (const line of contentLines(oldText)) {
			rows.push(color.danger(`- ${line}`));
			removed += 1;
		}
		for (const line of contentLines(newText)) {
			rows.push(color.success(`+ ${line}`));
			added += 1;
		}
	}
	const visible = rows.length <= 80 ? rows : [
		...rows.slice(0, 40),
		color.muted(`… 省略 ${rows.length - 80} 行 …`),
		...rows.slice(-40)
	];
	visible.push(color.muted(`└ +${added} -${removed} · ${paths.size} 个文件`));
	return visible.join("\n");
}
const PRODUCT_TOOL_TITLES = {
	ask_user_question: "向用户提问",
	create_goal: "创建目标",
	exit_plan_mode: "计划审查",
	get_goal: "查看目标",
	job_kill: "停止后台任务",
	job_list: "查看后台任务",
	job_output: "读取后台任务",
	subagent: "子 Agent",
	todo_write: "更新任务清单",
	update_goal: "更新目标",
	workflow: "工作流"
};
function toolTitle(node) {
	const name$1 = "kind" in node ? node.call?.name : node.name;
	const productTitle = name$1 === void 0 ? void 0 : PRODUCT_TOOL_TITLES[name$1];
	if (productTitle !== void 0) return productTitle;
	if ("kind" in node) return node.resultView?.title ?? node.callView?.title ?? node.call?.name ?? node.callId;
	return node.callView?.title ?? node.name;
}
function settledToolFailed(node) {
	if (node.isError) return true;
	const result = node.resultView;
	return result?.card === "terminal" && (result.exitCode !== void 0 && result.exitCode !== 0 || result.signal !== void 0);
}
function viewDetails(node) {
	const details = [];
	const call = node.callView;
	if (call === null && node.call?.argsRaw !== void 0) details.push(prettyArgs(node.call.argsRaw));
	if (call?.card === "generic" && call.rawInput !== void 0) details.push(jsonText(call.rawInput));
	if (call?.card === "terminal") {
		if (call.description !== void 0) details.push(call.description);
		details.push(`${call.cwd ?? "(当前工作区)"}\n$ ${call.title}`);
	}
	if (call?.card === "diff") details.push(diffText(call.diffs));
	const result = node.resultView;
	if (result?.card === "terminal") {
		if (result.output !== void 0) details.push(result.output);
		if (result.exitCode !== void 0) details.push(`退出码 ${result.exitCode}`);
		if (result.signal !== void 0) details.push(`信号 ${result.signal}`);
	} else if (result?.card === "diff") details.push(diffText(result.diffs));
	else if (result?.card === "generic" && result.content !== void 0) details.push(contentText(result.content));
	else if (result !== null) details.push(jsonText(result));
	else {
		const raw = contentText(node.content);
		if (raw !== "") details.push(raw);
	}
	if (node.meta !== void 0) details.push(`元数据\n${jsonText(node.meta)}`);
	return details.filter((value) => value !== "");
}
function runningViewDetails(node) {
	const view = node.callView;
	if (view?.card === "terminal") return [...view.description === void 0 ? [] : [view.description], `${view.cwd ?? "(当前工作区)"}\n$ ${view.title}`];
	if (view?.card === "diff") return [diffText(view.diffs)];
	if (view?.card === "generic" && view.rawInput !== void 0) return [jsonText(view.rawInput)];
	return [prettyArgs(node.argsRaw)];
}
function toolBlockText(block$1, preferences, depth) {
	const prefix = depth === 0 ? "◆ " : `${"  ".repeat(depth)}↳ `;
	if ("kind" in block$1) {
		const duration = block$1.callTime === null ? "" : ` · ${Math.max(0, block$1.time - block$1.callTime)} ms`;
		const state = settledToolFailed(block$1) ? color.danger("失败") : color.success("完成");
		const detail$1 = preferences.tools === "expanded" ? viewDetails(block$1).join("\n") : "";
		const children$1 = block$1.subCalls.map((child) => toolBlockText(child, preferences, depth + 1)).filter(Boolean);
		return `${prefix}${color.accent(toolTitle(block$1))} · ${state}${duration}${detail$1 === "" ? "" : `\n${detail$1}`}${children$1.length === 0 ? "" : `\n${children$1.join("\n")}`}`;
	}
	const detail = preferences.tools === "expanded" ? `\n${runningViewDetails(block$1).join("\n")}` : "";
	const children = block$1.subCalls.map((child) => toolBlockText(child, preferences, depth + 1)).filter(Boolean);
	return `${prefix}${color.accent(toolTitle(block$1))} · ${color.warning("运行中")}${detail}${children.length === 0 ? "" : `\n${children.join("\n")}`}`;
}
function nodeText(node, preferences) {
	switch (node.kind) {
		case "user": return `${color.brand("❯")} ${contentText(node.content)}`;
		case "steering": return `${color.brand("❯")} ${color.muted("引导")} ${contentText(node.content)}`;
		case "context": return `${color.muted(`${node.provenance.role === "recall" ? "召回" : "上下文"}${node.provenance.label === null ? "" : ` · ${node.provenance.label}`}${node.form === null ? " · 未知格式" : ` · ${node.form}`}`)}\n${contentText(node.content)}`;
		case "assistant": return `${node.blocks.map((block$1) => assistantBlockText(block$1, preferences)).filter(Boolean).join("\n")}${node.interrupted === true ? color.warning("\n已停止") : ""}`;
		case "command": return permissionCommandText(node) ?? planCommandText(node) ?? goalCommandText(node) ?? (node.outcome === null ? color.warning(`命令 /${node.name ?? "unknown"}${node.args ?? ""} · 执行中`) : `${node.outcome.kind === "success" ? color.success("命令完成") : color.danger("命令失败")} /${node.name ?? "unknown"}${node.args ?? ""}${node.outcome.text === void 0 ? "" : `\n${node.outcome.text}`}`);
		case "tool-result": return preferences.tools === "hidden" ? "" : toolBlockText(node, preferences, 0);
		case "compaction": return color.muted(`上下文已压缩${node.shadowedItemCount === null ? "" : ` · ${node.shadowedItemCount} 项`}${node.shadowedTokenCount === null ? "" : ` · 约 ${node.shadowedTokenCount} Token`}${node.summary === null ? "" : `\n${node.summary}`}`);
		case "model-retry": return color.warning(`模型请求${node.retryState === "scheduled" ? "等待重试" : node.retryState === "started" ? "正在重试" : "重试已取消"} · ${node.provider} · 第 ${node.retry} 次${node.mode === "normal" ? `/${node.maxRetries}` : ""} · ${node.delayMs} ms`);
		case "turn-error": return color.danger(`本轮执行失败${node.code === void 0 ? "" : ` [${node.code}]`}\n${node.message}`);
		case "turn-max-tokens": return color.warning("本轮已达到最大 Token 数");
		case "unknown": return color.muted(`未知事件 ${node.type} · /trajectory 查看详情`);
		default: return color.muted("未知会话事件 · /trajectory 查看详情");
	}
}
function textProperty(value) {
	if (typeof value !== "object" || value === null || !("text" in value)) return void 0;
	return typeof value.text === "string" ? value.text : void 0;
}
const CONVERSATION_KINDS = new Set([
	"user",
	"assistant",
	"steering",
	"context",
	"model-retry",
	"turn-error",
	"turn-max-tokens",
	"tool-result",
	"command",
	"compaction",
	"unknown"
]);
function isConversationNode(value) {
	return typeof value === "object" && value !== null && "kind" in value && typeof value.kind === "string" && CONVERSATION_KINDS.has(value.kind);
}
function workflowStatusLabel(status) {
	switch (status) {
		case "running": return "运行中";
		case "completed": return "已完成";
		case "failed": return "失败";
		case "cancelled": return "已取消";
		case "interrupted": return "已中断";
		default: return escapeTerminalText(status);
	}
}
function workflowStatusText(status) {
	const label = workflowStatusLabel(status);
	switch (status) {
		case "completed": return color.success(label);
		case "failed": return color.danger(label);
		case "cancelled":
		case "interrupted": return color.warning(label);
		case "running": return color.accent(label);
		default: return color.muted(label);
	}
}
function workflowMemberLabel(member) {
	const safe = escapeTerminalText(member.label.trim());
	if (safe === "") return `成员 ${member.seq}`;
	const generated = /^agent-([a-z0-9]+)$/iu.exec(safe);
	return generated === null ? safe : `Agent ${generated[1] ?? String(member.seq)}`;
}
function workflowText(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const workflow = value;
	if (typeof workflow.name !== "string" || typeof workflow.status !== "string" || !Array.isArray(workflow.phases)) return;
	const rows = workflow.phases.flatMap((phase) => {
		const phaseLabel = phase.phase === null ? void 0 : escapeTerminalText(phase.phase.trim()) || "未命名阶段";
		const members = phase.members.map((member) => `    ${workflowStatusText(member.status)} · ${workflowMemberLabel(member)}`);
		return phaseLabel === void 0 ? members.map((row) => row.slice(2)) : [`  ${color.muted(phaseLabel)}`, ...members];
	});
	const name$1 = escapeTerminalText(workflow.name);
	return `${color.accent(`工作流 · ${name$1}`)} · ${workflowStatusText(workflow.status)}${rows.length === 0 ? "" : `\n${rows.join("\n")}`}`;
}
function deliverablesText(node, data) {
	if (!isConversationNode(data) || data.kind !== "assistant") return "";
	const location$1 = node.location;
	if (location$1.kind !== "turn" && location$1.kind !== "step") return "";
	const produced = producedForClosing(location$1.turn.data.get("deliverables"), data.seq);
	return produced.length === 0 ? "" : `\n${color.success(`生成文件 · ${produced.join(" · ")}`)}`;
}
function grouped(rows) {
	return rows.map((row, index) => index === 0 ? {
		...row,
		gapBefore: true
	} : row);
}
function nonnegativeNumber(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function durationText(milliseconds) {
	const seconds = milliseconds / 1e3;
	if (seconds < 60) return `${String(Math.round(seconds * 10) / 10)}s`;
	const whole = Math.round(seconds);
	return `${String(Math.floor(whole / 60))}m${String(whole % 60)}s`;
}
function tokenText(value) {
	const scaled = (number) => number >= 100 ? String(Math.round(number)) : String(Math.round(number * 10) / 10);
	if (value < 1e3) return String(Math.round(value));
	if (value < 1e6) return `${scaled(value / 1e3)}K`;
	return `${scaled(value / 1e6)}M`;
}
function recordOf(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
/** Render Grok-style groups from the engine-owned completed-Turn footer. */
function turnTailText(data) {
	const value = recordOf(data);
	if (value === void 0) return "";
	const statistics = recordOf(value.statistics);
	const usage = recordOf(value.usage);
	const groups = [];
	const steps = nonnegativeNumber(statistics?.steps);
	if (steps !== void 0 && steps > 0) groups.push(`1 轮 · ${tokenText(steps)} 步`);
	const llmMs = nonnegativeNumber(statistics?.llmMs);
	const toolMs = nonnegativeNumber(statistics?.toolMs);
	const durations = [...llmMs === void 0 || llmMs === 0 ? [] : [`LLM ${durationText(llmMs)}`], ...toolMs === void 0 || toolMs === 0 ? [] : [`工具调用 ${durationText(toolMs)}`]];
	if (durations.length > 0) groups.push(durations.join(" · "));
	const ttftMs = nonnegativeNumber(statistics?.ttftMs);
	const ttftSteps = nonnegativeNumber(statistics?.ttftSteps);
	const decodeMs = nonnegativeNumber(statistics?.decodeMs);
	const decodeTokens = nonnegativeNumber(statistics?.decodeTokens);
	const performance$1 = [...ttftMs === void 0 || ttftSteps === void 0 || ttftSteps === 0 ? [] : [`首 token 平均 ${durationText(ttftMs / ttftSteps)}`], ...decodeMs === void 0 || decodeTokens === void 0 || decodeMs === 0 ? [] : [`${String(Math.round(decodeTokens / (decodeMs / 1e3) * 10) / 10)} tok/s`]];
	if (performance$1.length > 0) groups.push(performance$1.join(" · "));
	const uncached = nonnegativeNumber(usage?.uncachedInputTokens);
	const cacheRead = nonnegativeNumber(usage?.cacheReadTokens);
	const cacheWrite = nonnegativeNumber(usage?.cacheWriteTokens);
	const output = nonnegativeNumber(usage?.outputTokens);
	if (uncached !== void 0 && cacheRead !== void 0 && cacheWrite !== void 0 && output !== void 0) {
		const input = uncached + cacheRead + cacheWrite;
		if (input > 0) groups.push(`缓存命中 ${String(Math.round(cacheRead / input * 100))}%`);
		if (input > 0 || output > 0) groups.push(`输入 ${tokenText(input)} tok · 输出 ${tokenText(output)} tok`);
	}
	if (groups.length > 0) return color.muted(groups.join("  |  "));
	const legacy = [...nonnegativeNumber(value.ttftMs) === void 0 ? [] : [`首 token ${durationText(nonnegativeNumber(value.ttftMs) ?? 0)}`], ...nonnegativeNumber(value.tokensPerSecond) === void 0 ? [] : [`${String(Math.round((nonnegativeNumber(value.tokensPerSecond) ?? 0) * 10) / 10)} tok/s`]];
	return legacy.length === 0 ? "" : color.muted(legacy.join(" · "));
}
function assistantStepData(data) {
	if (typeof data !== "object" || data === null) return void 0;
	const value = data;
	return (value.status === "running" || value.status === "settled" || value.status === "interrupted") && Array.isArray(value.blocks) ? value : void 0;
}
function assistantStepRows(data, preferences) {
	const step = assistantStepData(data);
	if (step === void 0) return [];
	const content = step.blocks.flatMap((block$1) => block$1.kind === "tool-call" ? [] : assistantBlockRows(block$1, preferences));
	const hasFoldedReasoning = !preferences.reasoning && step.blocks.some((block$1) => block$1.kind === "reasoning" && block$1.text !== "");
	if (content.length === 0 && step.status === "settled" && !hasFoldedReasoning) return [];
	const rows = [];
	if (hasFoldedReasoning) rows.push({
		format: "plain",
		text: color.muted(step.status === "running" ? "◆ 正在思考…" : "◆ 思考完成")
	});
	else if (content.length === 0 && step.status === "running") rows.push({
		format: "plain",
		text: color.muted("◆ 正在思考…")
	});
	rows.push(...content);
	if (step.status === "interrupted") rows.push({
		format: "plain",
		text: color.warning("已停止")
	});
	return grouped(rows);
}
function toolChatData(data) {
	if (typeof data !== "object" || data === null || !("root" in data)) return void 0;
	const root = data.root;
	if (typeof root !== "object" || root === null || !("callId" in root) || typeof root.callId !== "string" || !("subCalls" in root) || !Array.isArray(root.subCalls)) return void 0;
	return data;
}
function compactContextRows(node) {
	if (node.form === "notice" && typeof node.source === "object" && node.source !== null && "kind" in node.source && node.source.kind === "plugin" && "plugin" in node.source && node.source.plugin === "plan-mode") return [];
	if (node.form === "notice" && typeof node.source === "object" && node.source !== null && "kind" in node.source && node.source.kind === "plugin" && "plugin" in node.source && node.source.plugin === "tool-jobs") return grouped([{
		format: "plain",
		text: color.muted("◆ 后台任务已结束")
	}]);
	if (node.provenance.role === "recall") {
		const source = node.provenance.label === null ? "" : ` · ${node.provenance.label}`;
		return grouped([{
			format: "plain",
			text: color.muted(`跨会话召回${source} · /trajectory 查看`)
		}]);
	}
	if (node.form === "notice" && typeof node.source === "object" && node.source !== null && "summary" in node.source && typeof node.source.summary === "string") return grouped([{
		format: "plain",
		text: color.muted(node.source.summary)
	}]);
	return [];
}
function subagentUserRows(node) {
	if (typeof node.source !== "object" || node.source === null || !("kind" in node.source)) return void 0;
	if (node.source.kind === "subagent-settled") return grouped([{
		format: "plain",
		text: color.muted("◆ 子 Agent 已结束"),
		userTurn: true
	}]);
	if (node.source.kind !== "subagent-report") return void 0;
	return grouped([{
		format: "plain",
		text: `${color.brand("❯")} ${color.muted("子 Agent 报告")}`,
		userTurn: true
	}, ...contentRows(node.content.slice(1))]);
}
function manualCompactionRows(data, preferences) {
	if (typeof data !== "object" || data === null || !("command" in data)) return [];
	const value = data;
	const rows = [];
	if (isConversationNode(value.command)) {
		const command = nodeText(value.command, preferences);
		if (command !== "") rows.push({
			format: "plain",
			text: command
		});
	}
	if (isConversationNode(value.compaction)) {
		const compaction = nodeText(value.compaction, preferences);
		if (compaction !== "") rows.push({
			format: "plain",
			text: compaction
		});
	}
	return grouped(rows);
}
function retryRows(data, preferences) {
	if (typeof data !== "object" || data === null || !("current" in data)) return [];
	const retry = data.current;
	if (!isConversationNode(retry)) return [];
	const rendered = nodeText(retry, preferences);
	return rendered === "" ? [] : grouped([{
		format: "plain",
		text: rendered
	}]);
}
function chatNodeRows(node, preferences) {
	if (node.kind === "assistant-step") return assistantStepRows(node.data, preferences);
	if (node.kind === "tool-call") {
		if (preferences.tools === "hidden") return [];
		const data = toolChatData(node.data);
		return data === void 0 ? [] : grouped([{
			format: "plain",
			text: toolBlockText(data.root, preferences, 0)
		}]);
	}
	if (node.kind === "manual-compaction") return manualCompactionRows(node.data, preferences);
	if (node.kind === "model-retry") return retryRows(node.data, preferences);
	if (isConversationNode(node.data)) {
		if (node.data.kind === "user" || node.data.kind === "steering" || node.data.kind === "context") {
			if (node.data.kind === "context") return compactContextRows(node.data);
			if (node.data.kind === "user") {
				const subagent = subagentUserRows(node.data);
				if (subagent !== void 0) return subagent;
			}
			return grouped(userContentRows(node.data.content, node.data.kind === "steering"));
		}
		if (node.data.kind === "assistant") {
			const rows = [...!preferences.reasoning && node.data.blocks.some((block$1) => block$1.kind === "reasoning" && block$1.text !== "") ? [{
				format: "plain",
				text: color.muted("◆ 思考完成")
			}] : [], ...node.data.blocks.flatMap((block$1) => assistantBlockRows(block$1, preferences))];
			if (node.data.interrupted === true) rows.push({
				format: "plain",
				text: color.warning("已停止")
			});
			const deliverables = deliverablesText(node, node.data);
			if (deliverables !== "") rows.push({
				format: "plain",
				text: deliverables.trimStart()
			});
			return grouped(rows);
		}
		const text = nodeText(node.data, preferences);
		return text === "" ? [] : grouped([{
			format: "plain",
			text
		}]);
	}
	const commandInputText = node.kind === "command-input" ? textProperty(node.data) : void 0;
	if (commandInputText !== void 0) return grouped([{
		format: "plain",
		text: `${color.brand("❯")} ${commandInputText}`,
		userTurn: true
	}]);
	if (node.kind === "workflow-run") {
		const rendered = workflowText(node.data);
		if (rendered !== void 0) return grouped([{
			format: "plain",
			text: rendered
		}]);
	}
	if (node.kind === "turn-tail") {
		const rendered = turnTailText(node.data);
		return rendered === "" ? [] : [{
			format: "plain",
			text: rendered
		}];
	}
	return grouped([{
		format: "plain",
		text: color.muted(`扩展节点 ${node.kind} · /trajectory 查看详情`)
	}]);
}
/** Mutable pi-tui component backed only by the official conversation snapshot. */
var Transcript = class {
	components = [new Text("", 0, 0)];
	rows = [];
	imageComponents = /* @__PURE__ */ new Map();
	pendingImages = /* @__PURE__ */ new Set();
	imageGeneration = 0;
	imageLoader;
	sessionId;
	toolVisibility = "collapsed";
	reasoningVisible = false;
	emptyState = true;
	scrollOffset = 0;
	renderedLineCount = 0;
	turnAnchors = [];
	turnCursor;
	focused = false;
	/**
	* @param viewportRows - current terminal-dependent transcript height.
	*/
	constructor(viewportRows = () => Number.POSITIVE_INFINITY, requestRender = () => void 0) {
		this.viewportRows = viewportRows;
		this.requestRender = requestRender;
	}
	/**
	* Cycle folded → expanded → hidden without mutating the Harness log.
	* @returns the newly active tool visibility.
	*/
	cycleToolVisibility() {
		this.toolVisibility = this.toolVisibility === "collapsed" ? "expanded" : this.toolVisibility === "expanded" ? "hidden" : "collapsed";
		return this.toolVisibility;
	}
	/**
	* Toggle reasoning presentation without changing model request parameters.
	* @returns whether reasoning is now visible.
	*/
	toggleReasoning() {
		this.reasoningVisible = !this.reasoningVisible;
		return this.reasoningVisible;
	}
	/** Follow new transcript output after the user submits from a historical viewport. */
	followLatest() {
		this.turnCursor = void 0;
		this.scrollOffset = 0;
		this.requestRender();
	}
	/**
	* Replace the transcript with non-durable empty-selection guidance.
	* @param message - guidance rendered when no Session is active.
	*/
	empty(message = "在下方输入消息，或用 /help 查看命令。") {
		this.imageGeneration += 1;
		this.imageLoader = void 0;
		this.sessionId = void 0;
		this.pendingImages.clear();
		this.imageComponents.clear();
		this.emptyState = true;
		this.replace([{
			format: "plain",
			text: color.muted(message)
		}]);
	}
	/**
	* Replace the rendered snapshot after a Harness observable notification.
	* @param snapshot - authoritative Session conversation projection.
	* @param imageLoader - authenticated reader for references in this Session.
	*/
	update(snapshot, imageLoader) {
		const sessionId = String(snapshot.sessionId);
		if (sessionId !== this.sessionId) {
			this.imageGeneration += 1;
			this.pendingImages.clear();
			this.imageComponents.clear();
			this.sessionId = sessionId;
		}
		this.imageLoader = imageLoader;
		const preferences = {
			tools: this.toolVisibility,
			reasoning: this.reasoningVisible
		};
		const visibleNodes = snapshot.chat.order.flatMap((key) => {
			const node = snapshot.chat.nodes.get(key);
			return node === void 0 || node.visibility !== "visible" ? [] : [node];
		});
		const rows = visibleNodes.flatMap((node) => chatNodeRows(node, preferences));
		if (snapshot.partial !== null && !visibleNodes.some((node) => node.kind === "assistant-step")) {
			const partialRows = snapshot.partial.blocks.flatMap((block$1) => assistantBlockRows(block$1, preferences));
			rows.push(...grouped([...partialRows.length === 0 ? [{
				format: "plain",
				text: color.muted("◆ 正在思考…")
			}] : [], ...partialRows]));
		}
		if (preferences.tools !== "hidden" && !visibleNodes.some((node) => node.kind === "tool-call")) rows.push(...snapshot.runningCalls.flatMap((call) => grouped([{
			format: "plain",
			text: toolBlockText(call, preferences, 0)
		}])));
		this.emptyState = rows.length === 0;
		if (this.emptyState) rows.push({
			format: "plain",
			text: `${color.brand("deepseek")}\n${color.muted("探索未至之境")}\n${color.muted("直接描述你想完成的事")}`
		});
		this.replace(rows);
	}
	invalidate() {
		for (const component of this.components) component.invalidate();
	}
	/** Stop pending attachment presentation updates during terminal teardown. */
	dispose() {
		this.imageGeneration += 1;
		this.imageLoader = void 0;
		this.pendingImages.clear();
		this.imageComponents.clear();
	}
	render(width) {
		const inset = width >= 12 ? 2 : 0;
		const contentWidth = Math.max(1, width - inset * 2);
		const withInset = (values) => values.map((line) => line === "" ? "" : `${" ".repeat(inset)}${line}`);
		const lines = [];
		const anchors = [];
		for (const [index, component] of this.components.entries()) {
			if (lines.length > 0 && this.rows[index]?.gapBefore === true) lines.push("");
			if (this.rows[index]?.userTurn === true) anchors.push(lines.length);
			const row = this.rows[index];
			const rendered = component.render(contentWidth);
			const escaped = row?.format === "image" ? rendered : rendered.map(escapeTerminalText);
			lines.push(...row?.userTurn === true ? escaped.map((line) => surfaceRow(line, contentWidth)) : escaped);
		}
		if (this.emptyState) for (const [index, line] of lines.entries()) {
			if (line === "") continue;
			const content = line.trimEnd();
			lines[index] = `${" ".repeat(Math.max(0, Math.floor((contentWidth - visibleWidth(content)) / 2)))}${content}`;
		}
		this.renderedLineCount = lines.length;
		this.turnAnchors = anchors;
		const rows = Math.max(1, Math.floor(this.viewportRows()));
		if (!Number.isFinite(rows)) {
			this.scrollOffset = 0;
			return withInset(lines);
		}
		if (lines.length <= rows) {
			this.scrollOffset = 0;
			const remaining = rows - lines.length;
			const before = this.emptyState ? Math.floor(remaining / 2) : 0;
			return withInset([
				...Array.from({ length: before }, () => ""),
				...lines,
				...Array.from({ length: remaining - before }, () => "")
			]);
		}
		const maxOffset = Math.max(0, lines.length - rows);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const end = lines.length - this.scrollOffset;
		const start = Math.max(0, end - rows);
		const visible = lines.slice(start, end);
		if (this.focused && start > 0 && visible.length > 0) visible[0] = color.muted(`↑ 更早内容 · ${String(start)} 行`);
		if (this.focused && end < lines.length && visible.length > 0) visible[visible.length - 1] = color.muted(`↓ 更新内容 · ${String(lines.length - end)} 行`);
		return withInset(visible);
	}
	handleInput(data) {
		this.turnCursor = void 0;
		const rows = Math.max(1, Math.floor(this.viewportRows()));
		const maxOffset = Math.max(0, this.renderedLineCount - rows);
		if (matchesKey(data, Key.up)) this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
		else if (matchesKey(data, Key.down)) this.scrollOffset = Math.max(0, this.scrollOffset - 1);
		else if (matchesKey(data, Key.pageUp)) this.scrollOffset = Math.min(maxOffset, this.scrollOffset + Math.max(1, rows - 1));
		else if (matchesKey(data, Key.pageDown)) this.scrollOffset = Math.max(0, this.scrollOffset - Math.max(1, rows - 1));
		else if (matchesKey(data, Key.home)) this.scrollOffset = maxOffset;
		else if (matchesKey(data, Key.end)) this.scrollOffset = 0;
	}
	/**
	* Move the viewport to an adjacent durable user-turn anchor.
	* @param offset - negative for an older turn, positive for a newer turn.
	* @returns whether an adjacent turn exists and was selected.
	*/
	navigateTurn(offset) {
		if (offset === 0 || this.turnAnchors.length === 0) return false;
		const rows = Math.max(1, Math.floor(this.viewportRows()));
		const viewportTop = Math.max(0, this.renderedLineCount - this.scrollOffset - rows);
		const viewportEnd = Math.min(this.renderedLineCount, viewportTop + rows);
		const index = this.turnCursor === void 0 ? offset < 0 ? this.turnAnchors.findLastIndex((candidate) => candidate < viewportEnd) : this.turnAnchors.findIndex((candidate) => candidate > viewportTop) : this.turnCursor + Math.sign(offset);
		const anchor = this.turnAnchors[index];
		if (anchor === void 0) return false;
		this.turnCursor = index;
		this.scrollOffset = Math.max(0, this.renderedLineCount - (anchor + rows));
		return true;
	}
	replace(rows) {
		this.rows = rows;
		this.turnCursor = void 0;
		this.components = rows.map((row) => this.component(row));
	}
	component(row) {
		if (row.format === "markdown") return new Markdown(escapeTerminalText(row.text), 0, 0, markdownTheme);
		if (row.format === "plain") return new Text(escapeTerminalText(row.text), 0, 0);
		const cacheKey = `${this.sessionId ?? "none"}:${row.key}`;
		const cached = this.imageComponents.get(cacheKey);
		if (cached !== void 0) return cached;
		const fallback = new Text(color.muted(imageLabel(row.attachment)), 0, 0);
		const loader = this.imageLoader;
		if (loader === void 0 || this.pendingImages.has(cacheKey)) return fallback;
		this.pendingImages.add(cacheKey);
		const generation = this.imageGeneration;
		loader(row.attachment).then((payload) => {
			if (generation !== this.imageGeneration) return;
			const attachment = payload.attachment;
			this.imageComponents.set(cacheKey, new Image(payload.data, attachment.mediaType, { fallbackColor: (value) => color.muted(value) }, {
				maxWidthCells: 60,
				maxHeightCells: 20,
				filename: escapeTerminalText(attachment.name ?? String(attachment.attachmentId))
			}, {
				widthPx: attachment.width,
				heightPx: attachment.height
			}));
		}, (error) => {
			if (generation !== this.imageGeneration) return;
			const message = error instanceof Error ? error.message : String(error);
			this.imageComponents.set(cacheKey, new Text(color.danger(`${imageLabel(row.attachment)} · 读取失败：${message}`), 0, 0));
		}).finally(() => {
			if (generation !== this.imageGeneration) return;
			this.pendingImages.delete(cacheKey);
			this.components = this.rows.map((current) => this.component(current));
			this.requestRender();
		});
		return fallback;
	}
};

//#endregion
//#region src/client/surface.ts
/** Replaceable terminal seams used by virtual-terminal tests. */
const internals$1 = {
	createTerminal: () => new ProcessTerminal(),
	isInteractive: () => process.stdin.isTTY && process.stdout.isTTY,
	reportCleanupError: (error) => {
		process.stderr.write(`${escapeTerminalText(`deepseek: 终端清理失败：${error.message}`)}\n`);
	},
	startClient: startTuiClient
};
const BRACKETED_PASTE = /^\u001B\[200~([\s\S]*)\u001B\[201~$/u;
const IMAGE_PATH_SUFFIX = /\.(?:gif|jpe?g|png|webp)$/iu;
function pastedImagePath(data) {
	const match = BRACKETED_PASTE.exec(data);
	if (match === null) return void 0;
	let candidate = (match[1] ?? "").trim();
	if (candidate === "" || candidate.includes("\n") || candidate.includes("\r") || candidate.includes("\0")) return;
	const quoted = candidate.startsWith("\"") && candidate.endsWith("\"") || candidate.startsWith("'") && candidate.endsWith("'");
	if (quoted) candidate = candidate.slice(1, -1);
	if (!(quoted || candidate.startsWith("/") || candidate.startsWith("./") || candidate.startsWith("../") || candidate.startsWith("~/") || candidate.startsWith("~\\") || candidate.startsWith("file://") || /^[A-Za-z]:[\\/]/u.test(candidate) || candidate.startsWith("\\\\") || !/\s/u.test(candidate))) return void 0;
	const suffixTarget = candidate.startsWith("file://") ? (() => {
		try {
			return new URL(candidate).pathname;
		} catch {
			return "";
		}
	})() : candidate;
	return IMAGE_PATH_SUFFIX.test(suffixTarget) ? candidate : void 0;
}
function noticeText(message, tone) {
	switch (tone) {
		case "success": return color.success(message);
		case "warning": return color.warning(message);
		case "error": return color.danger(message);
		case "info": return color.brand(message);
	}
}
/**
* Start the interactive Surface after the Host bridge is available.
* @param options - in-process API, RPC carrier, and launch target.
* @returns idempotent lifecycle handle.
*/
async function startTuiSurface(options$1) {
	if (!internals$1.isInteractive()) throw new Error("需要交互式 TTY；非交互任务请使用 dsh --profile headless");
	const terminal = internals$1.createTerminal();
	const client = await internals$1.startClient(options$1);
	let stopConstructedTui = () => void 0;
	try {
		setTheme(themeFromAppearance(appearanceSettings(await options$1.management.settings.describe())));
		const tui = new TUI(terminal, true);
		stopConstructedTui = () => {
			tui.stop();
		};
		const capabilities = client.capabilities;
		let stopping;
		const profile = options$1.profile ?? "tui";
		const contextBar = new ContextBar(profile, options$1.cwd);
		const editor = new PromptEditor(tui);
		const transcript = new Transcript(() => transcriptViewportRows(terminal.rows, editor.render(terminal.columns).length), () => {
			if (stopping === void 0) tui.requestRender();
		});
		const status = new StatusBar();
		const canvas = new Box(0, 0, background.canvas);
		if (options$1.draft !== void 0) editor.setText(escapeTerminalText(options$1.draft));
		canvas.addChild(contextBar);
		canvas.addChild(new Spacer(1));
		canvas.addChild(transcript);
		canvas.addChild(editor);
		canvas.addChild(status);
		tui.addChild(canvas);
		tui.setFocus(editor);
		const overlays = new OverlayQueue(tui);
		let resolveClosed = () => void 0;
		const closed = new Promise((resolve$1) => {
			resolveClosed = resolve$1;
		});
		let exitArmedUntil = 0;
		let active;
		let latestSessionId = "";
		let notice;
		let restartRequired;
		let headerGeneration = 0;
		let transcriptFocused = false;
		const focusEditor = () => {
			transcriptFocused = false;
			tui.setFocus(editor);
		};
		const renderWhileOpen = () => {
			if (stopping === void 0) tui.requestRender();
		};
		const updateTranscript = (current) => {
			transcript.update(current.session.getSnapshot(), async (attachment) => {
				const result = await current.session.readAttachment(attachment.attachmentId);
				if (!result.ok) throw new Error(`图片读取失败：${result.error.message}`);
				return {
					attachment: result.value.attachment,
					data: Buffer.from(result.value.data).toString("base64")
				};
			});
		};
		const setNotice = (message, tone = "info") => {
			if (stopping !== void 0) return;
			notice = {
				message,
				tone
			};
			updateStatus();
			renderWhileOpen();
		};
		const updateStatus = () => {
			if (stopping !== void 0) return;
			const snapshot = active?.session.getSnapshot();
			if (snapshot === void 0) {
				status.setDetail(color.warning("未打开会话"));
				return;
			}
			const pendingCount = snapshot.pending.length;
			const primary = snapshot.removed ? color.danger("会话已删除") : snapshot.promptError !== null ? color.danger(`${snapshot.promptError.op === "send" ? "发送" : "停止"}失败：${snapshot.promptError.error.message}`) : pendingCount > 0 ? color.warning(`/pending 处理 ${String(pendingCount)} 项交互`) : snapshot.running ? color.accent("生成中 · Ctrl+C 停止") : void 0;
			const facts = [];
			if (snapshot.queue.length > 0) facts.push(`队列 ${String(snapshot.queue.length)}`);
			const jobCount = (active === void 0 ? void 0 : capabilities.jobs())?.filter((job) => job.status === "running" || job.status === "stopping").length ?? 0;
			if (jobCount > 0) facts.push(`后台 ${String(jobCount)}`);
			const todos = active?.session.projections.faceOf("todos").getSnapshot();
			if (Array.isArray(todos) && todos.length > 0) facts.push(`任务 ${String(todos.length)}`);
			const plan = active?.session.projections.faceOf("plan").getSnapshot();
			if (typeof plan === "object" && plan !== null && "active" in plan && plan.active === true) facts.push("Plan");
			const goal = active?.session.projections.faceOf("goal").getSnapshot();
			if (goal !== null && goal !== void 0) facts.push("目标");
			const attachmentCount = capabilities.draftAttachments().length;
			if (attachmentCount > 0) facts.push(`图片 ${String(attachmentCount)}`);
			if (restartRequired !== void 0) facts.push("需要重启");
			const secondary = notice === void 0 ? [primary, facts.length === 0 ? void 0 : color.muted(facts.join(" · "))].filter((value) => value !== void 0).join(" · ") || void 0 : noticeText(notice.message, notice.tone);
			status.setDetail(secondary);
		};
		const refreshHeader = (forceModel = false) => {
			const generation = ++headerGeneration;
			capabilities.headerFacts(forceModel).then((facts) => {
				if (stopping !== void 0 || generation !== headerGeneration) return;
				contextBar.setFacts(facts);
				editor.setFacts(facts);
				status.setPermission(facts.permission);
				renderWhileOpen();
			}, (error) => {
				if (stopping !== void 0 || generation !== headerGeneration) return;
				contextBar.setError(profile, capabilityError(error));
				renderWhileOpen();
			});
		};
		const refresh = () => {
			const current = capabilities.active();
			if (current === void 0) {
				active = void 0;
				headerGeneration += 1;
				contextBar.setEmpty(profile, options$1.cwd);
				editor.setEmpty();
				status.setPermission("workspace-write");
				transcript.empty("当前没有打开的会话；使用 /workspace 或 /new 继续。");
				editor.disableSubmit = false;
				updateStatus();
				renderWhileOpen();
				return;
			}
			active = current;
			const snapshot = current.session.getSnapshot();
			updateTranscript(current);
			actions.syncPending(snapshot);
			editor.disableSubmit = false;
			updateStatus();
			renderWhileOpen();
		};
		const close = (outcome) => {
			if (stopping !== void 0) return stopping;
			stopping = (async () => {
				const failures = [];
				overlays.dispose();
				transcript.dispose();
				try {
					unsubscribeActive();
				} catch (error) {
					failures.push(error);
				}
				try {
					await terminal.drainInput(250, 30);
				} catch (error) {
					failures.push(error);
				}
				try {
					tui.stop();
				} catch (error) {
					failures.push(error);
				}
				try {
					await client.ctx.fiber.dispose();
				} catch (error) {
					failures.push(error);
				}
				resolveClosed(failures.length === 0 ? outcome : {
					kind: "exit",
					code: 1
				});
				if (failures.length > 0) {
					const error = failures.length === 1 && failures[0] instanceof Error ? failures[0] : new AggregateError(failures, "multiple terminal cleanup operations failed");
					try {
						internals$1.reportCleanupError(error);
					} catch {}
				}
			})();
			return stopping;
		};
		const actions = new TuiActions(capabilities, {
			overlays,
			transcript,
			notice: setNotice,
			refresh,
			refreshHeader: () => {
				refreshHeader(false);
			},
			applyTheme: (theme) => {
				setTheme(theme);
				tui.invalidate();
				tui.requestRender(true);
			},
			setEditor: (text) => {
				editor.setText(escapeTerminalText(text));
				focusEditor();
				renderWhileOpen();
			},
			copy: (text) => {
				const bytes = Buffer.from(text, "utf8");
				if (bytes.byteLength > 1e5) throw new Error("回复超过终端剪贴板 100000 字节安全上限；请使用 /export");
				terminal.write(`\u001B]52;c;${bytes.toString("base64")}\u0007`);
			},
			close: (code) => {
				close({
					kind: "exit",
					code
				});
			},
			restart: (profile$1, restartNotice) => {
				const current = capabilities.active();
				const draft = editor.getExpandedText();
				close({
					kind: "restart",
					request: {
						profile: profile$1,
						cwd: current?.workspacePath ?? options$1.cwd,
						...current === void 0 ? {} : { resume: current.sessionId },
						...draft === "" ? {} : { draft },
						attachmentPaths: capabilities.draftAttachments().map((item) => item.path),
						notice: restartNotice
					}
				});
			},
			requireRestart: (message) => {
				restartRequired = message;
				setNotice(`${message}；可输入 /restart 稍后重启`, "warning");
			}
		});
		const unsubscribeActive = capabilities.subscribeActive((current, snapshot) => {
			if (stopping !== void 0) return;
			if (current === void 0 || snapshot === void 0) {
				active = void 0;
				latestSessionId = "";
				headerGeneration += 1;
				transcript.empty("当前没有打开的会话；使用 /workspace 或 /new 继续。");
				editor.disableSubmit = false;
				contextBar.setEmpty(profile, options$1.cwd);
				editor.setEmpty();
				updateStatus();
				renderWhileOpen();
				return;
			}
			active = current;
			updateTranscript(current);
			actions.syncPending(snapshot);
			editor.disableSubmit = false;
			if (latestSessionId !== current.sessionId) {
				latestSessionId = current.sessionId;
				notice = void 0;
				refreshHeader(true);
			} else refreshHeader(false);
			updateStatus();
			renderWhileOpen();
		});
		editor.setAutocompleteProvider(new HarnessAutocompleteProvider(capabilities, (message) => {
			setNotice(`命令目录：${message}`, "error");
		}));
		const sendPrompt = async (text, mode = "queue") => {
			const current = capabilities.active();
			if (current === void 0) {
				setNotice("当前没有打开的会话", "error");
				if (text !== "" && editor.getText() === "") editor.setText(text);
				return false;
			}
			const content = capabilities.promptContent(text);
			if (content.length === 0) return false;
			const result = await current.session.prompt(content, mode);
			if (!result.ok) {
				setNotice(`${mode === "steer" ? "引导" : "发送"}失败：${result.error.message}`, "error");
				if (text !== "" && editor.getText() === "") editor.setText(text);
				return false;
			}
			capabilities.clearAttachments();
			notice = void 0;
			updateStatus();
			return true;
		};
		const dispatchCommand = async (line) => {
			const trimmed = line.trim();
			const separator = trimmed.search(/\s/u);
			const name$1 = (separator === -1 ? trimmed : trimmed.slice(0, separator)).slice(1);
			const args = separator === -1 ? "" : trimmed.slice(separator + 1);
			try {
				const catalog = await capabilities.commandCatalog();
				if (stopping !== void 0) return;
				const command = commandOf(catalog, name$1);
				if (command === void 0) {
					const near = catalog.filter((candidate) => candidate.name.includes(name$1)).slice(0, 3);
					setNotice(`未知命令 /${name$1}${near.length === 0 ? "" : `；可能是 ${near.map((item) => `/${item.name}`).join("、")}`}`, "warning");
					return;
				}
				if (command.behavior === "local") {
					await actions.execute(name$1, args);
					return;
				}
				const current = capabilities.active();
				if (current === void 0) throw new Error("当前没有打开的会话");
				if (command.behavior === "skill") {
					await sendPrompt(trimmed, "queue");
					return;
				}
				const result = await current.session.command(trimmed);
				if (!result.ok) setNotice(`命令失败：${result.error.message}`, "error");
				else if (!result.value.matched) setNotice(`未识别命令 /${name$1}`, "warning");
				else setNotice(`已执行 /${name$1}`, "success");
			} catch (error) {
				setNotice(capabilityError(error), "error");
			}
		};
		editor.onSubmit = (raw) => {
			const text = raw.trim();
			if (text === "" && capabilities.draftAttachments().length === 0) return;
			transcript.followLatest();
			if (text !== "") editor.addToHistory(text);
			editor.setText("");
			if (text.startsWith("/")) dispatchCommand(text);
			else sendPrompt(text);
		};
		tui.addInputListener((data) => {
			if (overlays.hasActive()) return void 0;
			const attachmentPath = pastedImagePath(data);
			if (!transcriptFocused && attachmentPath !== void 0) {
				capabilities.addAttachment(attachmentPath).then((attachment) => {
					const dimensions = attachment.width === void 0 ? "" : ` · ${attachment.width}×${attachment.height}`;
					setNotice(`已从粘贴加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`, "success");
				}, (error) => {
					editor.insertTextAtCursor(escapeTerminalText(BRACKETED_PASTE.exec(data)?.[1] ?? attachmentPath));
					setNotice(`粘贴图片未加入：${capabilityError(error)}；路径已保留为文本`, "warning");
				});
				return { consume: true };
			}
			const paste = BRACKETED_PASTE.exec(data);
			if (!transcriptFocused && paste !== null) {
				const content = paste[1] ?? "";
				const safeContent = escapeTerminalText(content);
				if (safeContent !== content) return { data: `\u001B[200~${safeContent}\u001B[201~` };
			}
			if (matchesKey(data, Key.tab) && (transcriptFocused || editor.getText() === "")) {
				transcriptFocused = !transcriptFocused;
				tui.setFocus(transcriptFocused ? transcript : editor);
				setNotice(transcriptFocused ? "对话浏览 · Tab/Escape 返回输入" : "已返回输入区", "info");
				return { consume: true };
			}
			if (transcriptFocused && matchesKey(data, Key.escape)) {
				focusEditor();
				setNotice("已返回输入区", "info");
				return { consume: true };
			}
			if (matchesKey(data, Key.shift(Key.tab))) {
				actions.cyclePermission();
				return { consume: true };
			}
			if (matchesKey(data, Key.ctrl("p"))) {
				actions.commandPalette();
				return { consume: true };
			}
			if (data !== "\r" && data !== "\n" && matchesKey(data, Key.ctrl("m"))) {
				actions.execute("model", "");
				return { consume: true };
			}
			if (matchesKey(data, Key.ctrl("s"))) {
				actions.execute("sessions", "");
				return { consume: true };
			}
			if (matchesKey(data, Key.ctrl("o"))) {
				actions.execute("tools", "display");
				return { consume: true };
			}
			if (matchesKey(data, Key.ctrl("t"))) {
				setNotice(`推理内容：${transcript.toggleReasoning() ? "显示" : "隐藏"}`, "info");
				refresh();
				return { consume: true };
			}
			if (matchesKey(data, Key.shift(Key.left)) || matchesKey(data, Key.shift(Key.right))) {
				const offset = matchesKey(data, Key.shift(Key.left)) ? -1 : 1;
				const moved = transcript.navigateTurn(offset);
				setNotice(moved ? `已跳到${offset < 0 ? "上一个" : "下一个"}用户轮次` : "没有可跳转的用户轮次", moved ? "info" : "warning");
				return { consume: true };
			}
			if (matchesKey(data, Key.f2) || matchesKey(data, Key.ctrl(Key.comma)) || matchesKey(data, Key.super(Key.comma))) {
				actions.execute("settings", "");
				return { consume: true };
			}
			if (matchesKey(data, Key.escape) && notice !== void 0 && editor.getText() === "") {
				notice = void 0;
				updateStatus();
				renderWhileOpen();
				return { consume: true };
			}
			if (!matchesKey(data, Key.ctrl("c"))) return void 0;
			const current = capabilities.active();
			if (current !== void 0 && current.session.getSnapshot().running) {
				current.session.cancel();
				return { consume: true };
			}
			if (editor.getText() !== "" || capabilities.draftAttachments().length > 0) {
				editor.setText("");
				capabilities.clearAttachments();
				setNotice("已清空输入草稿", "info");
				return { consume: true };
			}
			const now = Date.now();
			if (now <= exitArmedUntil) {
				close({
					kind: "exit",
					code: 0
				});
				return { consume: true };
			}
			exitArmedUntil = now + 1500;
			setNotice("再按一次 Ctrl+C 退出", "warning");
			return { consume: true };
		});
		terminal.setTitle("DeepSeek Harness");
		tui.start();
		refreshHeader(true);
		refresh();
		if (options$1.startupNotice !== void 0) setNotice(options$1.startupNotice, "success");
		if (options$1.attachmentPaths !== void 0 && options$1.attachmentPaths.length > 0) (async () => {
			const failures = [];
			for (const path$1 of options$1.attachmentPaths ?? []) try {
				await capabilities.addAttachment(path$1);
			} catch (error) {
				failures.push(`${path$1}: ${capabilityError(error)}`);
			}
			if (failures.length === 0) setNotice(`已恢复 ${options$1.attachmentPaths?.length ?? 0} 个附件`, "success");
			else setNotice(`部分附件未恢复：${failures.join("；")}`, "warning");
			refresh();
		})();
		if (options$1.task !== void 0) sendPrompt(options$1.task).catch((error) => {
			setNotice(`发送初始任务失败：${capabilityError(error)}`, "error");
		});
		return {
			closed,
			stop: () => close({
				kind: "exit",
				code: 0
			})
		};
	} catch (error) {
		try {
			stopConstructedTui();
		} catch {}
		try {
			await client.ctx.fiber.dispose();
		} catch {}
		throw error;
	}
}

//#endregion
//#region src/client/index.ts
/**
* Start the terminal surface over an already assembled Harness Host bridge.
* @param options - in-process API, logical RPC, and launch facts.
* @returns running terminal lifecycle.
*/
function startTui(options$1) {
	return startTuiSurface(options$1);
}

//#endregion
//#region src/host/management.ts
const MARKETPLACE_NAMESPACE = settingsNamespace("tui-plugin-marketplace");
const APPEARANCE_NAMESPACE = settingsNamespace(TUI_APPEARANCE_SETTINGS_NAMESPACE);
const TUI_BUNDLE = "seektty";
const NON_TUI_SURFACE_BUNDLES = ["@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-headless"];
const NPM_SOURCE = Object.freeze({
	id: "npm",
	kind: "npm",
	label: "npm Registry",
	url: "https://registry.npmjs.org/",
	enabled: true,
	builtIn: true
});
const CatalogSourceSchema = z$1.object({
	id: z$1.string().required(),
	label: z$1.string().required(),
	url: z$1.string().required(),
	enabled: z$1.boolean().default(true),
	credentialRef: z$1.string().role("credential-ref").default("")
});
const MarketplaceSettingsSchema = z$1.object({ sources: z$1.array(CatalogSourceSchema).default([]) });
const AppearanceSettingsSchema = z$1.object({ theme: z$1.union(["dark", "light"]).default(DEFAULT_TUI_THEME).description("SeekTTY 终端使用的暗色或亮色主题。") });
function settingsDocument(descriptor) {
	return {
		namespace: descriptor.ns,
		schema: descriptor.schema,
		value: descriptor.value,
		revision: descriptor.revision,
		applies: descriptor.applies,
		...descriptor.base === void 0 ? {} : { base: descriptor.base },
		...descriptor.user === void 0 ? {} : { user: descriptor.user },
		secrets: descriptor.secrets ?? []
	};
}
function redactInstallerOutput(value) {
	let redacted = value.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1***@").replace(/(https?:\/\/)[^\s/@]+@/giu, "$1***@").replace(/((?:_authToken|authorization|password|token)\s*[=:]\s*)[^\s]+/giu, "$1***");
	for (const [key, secret] of Object.entries(process.env)) {
		if (!/(?:TOKEN|KEY|SECRET|PASSWORD|AUTH|CREDENTIAL)/iu.test(key) || secret === void 0 || secret.length < 4) continue;
		redacted = redacted.replaceAll(secret, "***");
	}
	return redacted;
}
function sessionExportFilename(sessionId) {
	return `dsh-session-${sessionId.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 120) || "session"}.zip`;
}
function validateCatalogSource(source) {
	if (source.builtIn || source.kind !== "catalog") throw new Error("内置 npm Source 不能写入用户来源");
	if (!/^[a-z][a-z0-9-]*$/.test(source.id) || source.id === NPM_SOURCE.id) throw new Error(`Catalog Source id ${JSON.stringify(source.id)} 必须是唯一的小写 kebab-case`);
	if (source.label.trim() === "" || source.url.trim() === "") throw new Error("Catalog Source 名称和 URL 不能为空");
	assertCredentialFreeUrl(source.url, "Catalog Source URL");
	if (source.credentialRef !== void 0 && source.credentialRef !== "") credentialRef(source.credentialRef);
	return {
		id: source.id,
		label: source.label.trim(),
		url: source.url.trim(),
		enabled: source.enabled,
		credentialRef: source.credentialRef ?? ""
	};
}
function tuiProfile(summary) {
	if (!summary.compatible || summary.bundles.includes(TUI_BUNDLE)) return summary;
	return {
		...summary,
		compatible: false,
		diagnostic: "Profile 未组合 TUI Surface；可以复制为新的 TUI Profile，但不能由 deepseek 直接启动"
	};
}
async function mutateSettings(settings, namespace, ops, expectedRevision) {
	try {
		await settings.mutate(settingsNamespace(namespace), ops, expectedRevision);
	} catch (error) {
		if (error instanceof SettingsConflictError) throw new TuiSettingsConflictError(namespace, error.expected, error.actual);
		throw error;
	}
}
/**
* Build the terminal's direct Host management face. Durable changes still go
* through Harness services; returned Settings descriptors are always redacted.
* @param ctx - assembled Host Context.
* @param cwd - workspace base for local marketplace specs and Catalog files.
* @returns structural bridge passed across the dynamic Surface boundary.
*/
function createTuiManagementBridge(ctx, cwd) {
	const manager = ctx.profilePluginManager;
	const providers = ctx.get("tuiMarketplaceProviders");
	const settings = ctx.settings;
	const credentials = ctx.credentials;
	if (manager === void 0) throw new Error("tui-runner: Settings、Credentials 或 Profile Plugin Manager 未装配");
	settings.register(MARKETPLACE_NAMESPACE, MarketplaceSettingsSchema, { applies: "live" });
	settings.register(APPEARANCE_NAMESPACE, AppearanceSettingsSchema, { applies: "live" });
	const marketplace = new PluginMarketplace({
		cwd,
		resolveCredential: async (ref) => (await credentials.resolve(credentialRef(ref)))?.value,
		...providers === void 0 ? {} : { providers }
	});
	const describe = () => settings.describe({ redactSecrets: true }).map(settingsDocument);
	const one = (namespace) => {
		const document = describe().find((row) => row.namespace === namespace);
		if (document === void 0) throw new Error(`设置命名空间 ${JSON.stringify(namespace)} 已卸载`);
		return document;
	};
	const sourceSnapshot = () => {
		const document = one(MARKETPLACE_NAMESPACE);
		const stored = document.value.sources.map((source) => validateCatalogSource({
			id: source.id,
			kind: "catalog",
			label: source.label,
			url: source.url,
			enabled: source.enabled,
			...source.credentialRef === "" ? {} : { credentialRef: source.credentialRef },
			builtIn: false
		}));
		const providerSources = providers?.sources() ?? [];
		const sourceIds = new Set([NPM_SOURCE.id, ...providerSources.map((source) => source.id)]);
		for (const source of stored) {
			if (sourceIds.has(source.id)) throw new Error(`Catalog Source ${source.id} 与内置或 Provider Source 冲突`);
			sourceIds.add(source.id);
		}
		return {
			revision: document.revision,
			sources: [
				NPM_SOURCE,
				...providerSources,
				...stored.map((source) => ({
					id: source.id,
					kind: "catalog",
					label: source.label,
					url: source.url,
					enabled: source.enabled,
					...source.credentialRef === "" ? {} : { credentialRef: source.credentialRef },
					builtIn: false
				}))
			]
		};
	};
	return {
		sessionExport: { download: async (sessionId, includeDescendants, signal) => {
			const apiProxy = ctx.get("apiProxy");
			if (apiProxy === void 0) throw new Error("Harness Session Export 服务未装配");
			const request = {
				sessionId,
				...includeDescendants ? { includeDescendants: true } : {}
			};
			const response = await apiProxy.downloads.sessionLog(request, signal ?? new AbortController().signal);
			if (!response.ok) {
				const detail = (await response.text()).trim().slice(0, 1e3);
				throw new Error(`Harness Session Export 失败（HTTP ${String(response.status)}）${detail === "" ? "" : `：${detail}`}`);
			}
			if (response.body === null) throw new Error("Harness Session Export 返回了空响应体");
			const rawLength = response.headers.get("content-length");
			const contentLength = rawLength === null ? void 0 : Number.parseInt(rawLength, 10);
			return {
				suggestedFilename: sessionExportFilename(sessionId),
				mediaType: response.headers.get("content-type") ?? "application/zip",
				...contentLength === void 0 || !Number.isSafeInteger(contentLength) || contentLength < 0 ? {} : { contentLength },
				stream: response.body
			};
		} },
		settings: {
			describe: () => Promise.resolve(describe()),
			mutate: async (namespace, ops, expectedRevision) => {
				await mutateSettings(settings, namespace, ops, expectedRevision);
				return one(namespace);
			},
			credentialInfo: (ref) => credentials.describe(credentialRef(ref)),
			setCredential: async (ref, value) => {
				await credentials.set(credentialRef(ref), value);
				return credentials.describe(credentialRef(ref));
			},
			unsetCredential: async (ref) => {
				await credentials.unset(credentialRef(ref));
				return credentials.describe(credentialRef(ref));
			}
		},
		profiles: {
			list: () => Promise.resolve(manager.listProfiles().map(tuiProfile)),
			create: (name$1, copyFrom) => Promise.resolve(tuiProfile(manager.createProfile(name$1, copyFrom, {
				addBundles: [TUI_BUNDLE],
				removeBundles: NON_TUI_SURFACE_BUNDLES
			})))
		},
		plugins: {
			snapshot: () => Promise.resolve(manager.snapshot()),
			run: async (args, options$1 = {}) => {
				const output = options$1.onOutput;
				const result = await manager.run(args, { ...options$1.signal === void 0 ? {} : { signal: options$1.signal } });
				const stdout = redactInstallerOutput(result.stdout);
				const stderr = redactInstallerOutput(result.stderr);
				if (output !== void 0) {
					if (stdout !== "") output("stdout", stdout);
					if (stderr !== "") output("stderr", stderr);
				}
				return {
					exitCode: result.exitCode,
					stdout,
					stderr,
					warnings: result.warnings,
					changed: result.changed,
					restartRequired: result.restartRequired,
					snapshot: result.snapshot
				};
			},
			reorder: (bundles) => Promise.resolve(manager.reorderBundles(bundles)),
			doctor: () => Promise.resolve(manager.doctor()),
			sources: () => Promise.resolve(sourceSnapshot()),
			saveSources: async (sources, expectedRevision) => {
				const catalog = sources.filter((source) => !source.builtIn).map(validateCatalogSource);
				if (new Set(catalog.map((source) => source.id)).size !== catalog.length) throw new Error("Catalog Source id 不能重复");
				const reserved = new Set([NPM_SOURCE.id, ...(providers?.sources() ?? []).map((source) => source.id)]);
				const conflict = catalog.find((source) => reserved.has(source.id));
				if (conflict !== void 0) throw new Error(`Catalog Source ${conflict.id} 与内置或 Provider Source 冲突`);
				await mutateSettings(settings, MARKETPLACE_NAMESPACE, [{
					op: "set",
					path: ["sources"],
					value: catalog
				}], expectedRevision);
				return sourceSnapshot();
			},
			search: async (query, signal) => {
				const sources = sourceSnapshot().sources;
				return marketplace.search(query, sources, signal);
			},
			inspect: async (spec, signal) => {
				const sources = sourceSnapshot().sources;
				return marketplace.inspect(spec, sources, signal);
			}
		}
	};
}

//#endregion
//#region src/host/index.ts
/** Stable Cordis plugin name. */
const name = "tui-runner";
/** Host services required before the terminal can assemble its Client Runtime. */
const inject = [
	"apiProxy",
	"connection",
	"settings",
	"credentials",
	"profilePluginManager",
	"tuiMarketplaceProviders",
	TUI_STARTUP_SERVICE
];
function isActive(ctx) {
	return ctx.fiber.state === 2;
}
/** Replaceable process seams used by lifecycle tests. */
const internals = { stderr: process.stderr };
async function run(ctx) {
	await ctx.get("loader")?.await();
	if (!isActive(ctx)) return;
	const startup = ctx.get(TUI_STARTUP_SERVICE);
	const apiProxy = ctx.get("apiProxy");
	const connection = ctx.get("connection");
	const exit = ctx.get("appExit");
	if (startup === void 0 || apiProxy === void 0 || connection === void 0 || exit === void 0) throw new Error("tui-runner: Harness startup services are incomplete");
	const surface = await startTui({
		...startup,
		api: new InProcessApiClient(toFetchHandler(apiProxy)),
		rpc: connection.clientRpc,
		management: createTuiManagementBridge(ctx, startup.cwd)
	});
	if (!isActive(ctx)) {
		await surface.stop();
		return;
	}
	ctx.effect(() => () => surface.stop(), "tui-runner: terminal and Client Runtime");
	const outcome = await surface.closed;
	if (!isActive(ctx)) return;
	if (outcome.kind === "exit") {
		exit(outcome.code);
		return;
	}
	const restart = ctx.get("appRestart");
	if (restart === void 0) throw new Error("tui-runner: launcher 未提供受控重启能力");
	try {
		await restart({
			profile: outcome.request.profile,
			args: [
				"--cwd",
				outcome.request.cwd,
				...outcome.request.resume === void 0 ? [] : ["--resume", outcome.request.resume]
			],
			handoff: {
				channel: "seektty-v1",
				payload: outcome.request
			}
		});
	} catch (error) {
		internals.stderr.write(`deepseek: 重启失败：${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
/**
* Start the terminal surface after the complete Host tree settles.
* @param ctx - assembled Harness Host context.
*/
function apply(ctx) {
	run(ctx).catch((error) => {
		if (!isActive(ctx)) return;
		internals.stderr.write(`deepseek: ${error instanceof Error ? error.message : String(error)}\n`);
		ctx.get("appExit")?.(1);
	});
}

//#endregion
export { apply, inject, name };