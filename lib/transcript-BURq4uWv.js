import { c as ui, s as translateUiText } from "./locale-R14nFQey.js";
import { t as measureStartup } from "./startup-trace-C21NRsLn.js";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import { spawn } from "child_process";
import { readdirSync as readdirSync$1, statSync as statSync$1 } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { EventEmitter } from "events";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor } from "@shikijs/engine-javascript";
import { Worker } from "node:worker_threads";

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
					const name = "name" in cmd ? cmd.name : cmd.value;
					const hint = "argumentHint" in cmd && cmd.argumentHint ? cmd.argumentHint : void 0;
					const desc = cmd.description ?? "";
					return {
						name,
						label: name,
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
			if (!statSync$1(baseDir).isDirectory()) return null;
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
			const entries = readdirSync$1(searchDir, { withFileTypes: true });
			const suggestions = [];
			for (const entry of entries) {
				if (!entry.name.toLowerCase().startsWith(searchPrefix.toLowerCase())) continue;
				let isDirectory = entry.isDirectory();
				if (!isDirectory && entry.isSymbolicLink()) try {
					isDirectory = statSync$1(join(searchDir, entry.name)).isDirectory();
				} catch {}
				let relativePath;
				const name = entry.name;
				const displayPrefix = rawPrefix;
				if (displayPrefix.endsWith("/")) relativePath = displayPrefix + name;
				else if (displayPrefix.includes("/") || displayPrefix.includes("\\")) if (displayPrefix.startsWith("~/")) {
					const dir = dirname(displayPrefix.slice(2));
					relativePath = `~/${dir === "." ? name : join(dir, name)}`;
				} else if (displayPrefix.startsWith("/")) {
					const dir = dirname(displayPrefix);
					if (dir === "/") relativePath = `/${name}`;
					else relativePath = `${dir}/${name}`;
				} else {
					relativePath = join(dirname(displayPrefix), name);
					if (displayPrefix.startsWith("./") && !relativePath.startsWith("./")) relativePath = `./${relativePath}`;
				}
				else if (displayPrefix.startsWith("~")) relativePath = `~/${name}`;
				else relativePath = name;
				relativePath = toDisplayPath(relativePath);
				const value = buildCompletionValue(isDirectory ? `${relativePath}/` : relativePath, {
					isDirectory,
					isAtPrefix,
					isQuotedPrefix
				});
				suggestions.push({
					value,
					label: name + (isDirectory ? "/" : "")
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

function validate(codePoint) {
	if (!Number.isSafeInteger(codePoint)) throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
	validate(codePoint);
	if (isFullWidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) return 2;
	return 1;
}

var LineCache = class {
	contexts = /* @__PURE__ */ new Map();
	entries = /* @__PURE__ */ new Map();
	characters = 0;
	get(key, context = "") {
		const hit = this.contexts.get(context)?.get(key);
		if (hit === void 0) return void 0;
		this.entries.delete(hit);
		this.entries.set(hit, true);
		return hit.value;
	}
	set(key, value, valueCharacters, context = "") {
		const size = key.length + context.length + valueCharacters;
		if (size > 8e6) return;
		let bucket = this.contexts.get(context);
		const prior = bucket?.get(key);
		if (prior) {
			this.characters -= prior.size;
			this.entries.delete(prior);
		}
		while (this.entries.size >= 2e4 || this.characters + size > 8e6) {
			const oldest = this.entries.keys().next().value;
			this.characters -= oldest.size;
			const owner = this.contexts.get(oldest.context);
			owner.delete(oldest.key);
			if (owner.size === 0) this.contexts.delete(oldest.context);
			this.entries.delete(oldest);
		}
		bucket = this.contexts.get(context);
		if (!bucket) {
			bucket = /* @__PURE__ */ new Map();
			this.contexts.set(context, bucket);
		}
		const entry = {
			key,
			context,
			value,
			size
		};
		bucket.set(key, entry);
		this.entries.set(entry, true);
		this.characters += size;
	}
};

const wrapCache = new LineCache();
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
const WIDTH_CACHE_SIZE = 2e4;
const WIDTH_CACHE_CHARACTERS = 8e6;
let widthCacheCharacters = 0;
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
	if (cached !== void 0) {
		widthCache.delete(str);
		widthCache.set(str, cached);
		return cached;
	}
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
	if (str.length > WIDTH_CACHE_CHARACTERS) return width;
	while (widthCache.size >= WIDTH_CACHE_SIZE || widthCacheCharacters + str.length > WIDTH_CACHE_CHARACTERS) {
		const firstKey = widthCache.keys().next().value;
		if (firstKey !== void 0) {
			widthCacheCharacters -= firstKey.length;
			widthCache.delete(firstKey);
		}
	}
	widthCache.set(str, width);
	widthCacheCharacters += str.length;
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
	return wrapTextWithAnsiDetailed(text, width).map((line) => line.text);
}
/**
* Wrap text while retaining the exact whitespace omitted at visual wrap boundaries.
* The additional metadata is consumed by application-owned selection serializers;
* ordinary render callers continue to use wrapTextWithAnsi().
*/
function wrapTextWithAnsiDetailed(text, width) {
	const context = String(width);
	const hit = wrapCache.get(text, context);
	if (hit !== void 0) return hit.map((part) => ({ ...part }));
	const result = wrapTextWithAnsiDetailedUncached(text, width);
	wrapCache.set(text, result, result.reduce((size, part) => size + part.text.length + (part.separator?.length ?? 0), 0), context);
	return result.map((part) => ({ ...part }));
}
function wrapTextWithAnsiDetailedUncached(text, width) {
	if (!text) return [{ text: "" }];
	const inputLines = text.split("\n");
	const result = [];
	const tracker = new AnsiCodeTracker();
	for (let inputLineIndex = 0; inputLineIndex < inputLines.length; inputLineIndex++) {
		const inputLine = inputLines[inputLineIndex];
		const wrappedInputLine = wrapSingleLine((result.length > 0 ? tracker.getActiveCodes() : "") + inputLine, width);
		if (inputLineIndex < inputLines.length - 1) {
			const last = wrappedInputLine.length - 1;
			wrappedInputLine[last] = {
				...wrappedInputLine[last],
				separator: "\n"
			};
		}
		result.push(...wrappedInputLine);
		updateTrackerFromText(inputLine, tracker);
	}
	return result.length > 0 ? result : [{ text: "" }];
}
function wrapSingleLine(line, width) {
	if (!line) return [{ text: "" }];
	if (visibleWidth(line) <= width) return [{ text: line }];
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
				const separator = stripAnsiForWrap(currentLine).match(/ +$/)?.[0] ?? "";
				const lineEndReset = tracker.getLineEndReset();
				if (lineEndReset) currentLine += lineEndReset;
				wrapped.push({
					text: currentLine,
					separator
				});
				currentLine = "";
				currentVisibleLength = 0;
			}
			const broken = breakLongWord(token, width, tracker);
			wrapped.push(...broken.slice(0, -1).map((text) => ({
				text,
				separator: ""
			})));
			currentLine = broken[broken.length - 1];
			currentVisibleLength = visibleWidth(currentLine);
			continue;
		}
		if (currentVisibleLength + tokenVisibleLength > width && currentVisibleLength > 0) {
			const separator = isWhitespace ? " ".repeat(visibleWidth(token)) : stripAnsiForWrap(currentLine).match(/ +$/)?.[0] ?? "";
			let lineToWrap = currentLine.trimEnd();
			const lineEndReset = tracker.getLineEndReset();
			if (lineEndReset) lineToWrap += lineEndReset;
			wrapped.push({
				text: lineToWrap,
				separator
			});
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
	if (currentLine) wrapped.push({ text: currentLine });
	return wrapped.length > 0 ? wrapped.map((line$1) => ({
		...line$1,
		text: line$1.text.trimEnd()
	})) : [{ text: "" }];
}
function stripAnsiForWrap(text) {
	let result = "";
	let index = 0;
	while (index < text.length) {
		const ansi$1 = extractAnsiCode(text, index);
		if (ansi$1) {
			index += ansi$1.length;
			continue;
		}
		result += text[index];
		index += 1;
	}
	return result;
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
		const padded = line + " ".repeat(padNeeded);
		if (this.bgFn) return applyBackgroundToLine(padded, width, this.bgFn);
		return padded;
	}
};

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
		defaultKeys: ["ctrl+z", "ctrl+-"],
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
		const contentLines = [];
		for (const line of wrappedLines) {
			const lineWithMargins = leftMargin + line + rightMargin;
			if (this.customBgFn) contentLines.push(applyBackgroundToLine(lineWithMargins, width, this.customBgFn));
			else {
				const visibleLen = visibleWidth(lineWithMargins);
				const paddingNeeded = Math.max(0, width - visibleLen);
				contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
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
			...contentLines,
			...emptyLines
		];
		this.cachedText = this.text;
		this.cachedWidth = width;
		this.cachedLines = result;
		return result.length > 0 ? result : [""];
	}
};

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
/** Override the cached capabilities. Useful in tests to exercise both code paths. */
function setCapabilities(caps) {
	cachedCapabilities = caps;
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

const kittyLineCache = new LineCache();
const KITTY_SEQUENCE_PREFIX = "\x1B_G";
function extractKittyImageIds(line) {
	const cached = kittyLineCache.get(line);
	if (cached !== void 0) return cached;
	const result = extractKittyImageIdsUncached(line);
	kittyLineCache.set(line, result, result.length * 8);
	return result;
}
function extractKittyImageIdsUncached(line) {
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
	lineResetCache = new LineCache();
	previousResetInput = [];
	previousResetOutput = [];
	previousResetCode;
	previousKittyScanInput = [];
	previousKittyScanIds = [];
	inputFrameQueued = false;
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
	lastOverlayPlacements = [];
	lastFrameGeometry = {
		terminalWidth: 0,
		terminalHeight: 0,
		rootScreenOrigin: {
			col: 0,
			row: 0
		},
		rootSliceOffset: 0,
		overlays: []
	};
	onAfterRender;
	constructor(terminal, showHardwareCursor) {
		super();
		this.terminal = terminal;
		if (showHardwareCursor !== void 0) this.showHardwareCursor = showHardwareCursor;
	}
	get fullRedraws() {
		return this.fullRedrawCount;
	}
	getLastFrameGeometry() {
		return this.lastFrameGeometry;
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
		this.stopRenderingSync();
		if (!this.terminal.__seekttyManagedAlternateScreen && this.previousLines.length > 0) {
			const lineDiff = this.previousLines.length - this.hardwareCursorRow;
			if (lineDiff > 0) this.terminal.write(`\x1b[${lineDiff}B`);
			else if (lineDiff < 0) this.terminal.write(`\x1b[${-lineDiff}A`);
			this.terminal.write("\r\n");
		}
		this.terminal.showCursor();
		this.terminal.stop();
	}
	stopRenderingSync() {
		this.stopped = true;
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = void 0;
		}
		this.renderRequested = false;
	}
	resetRenderState() {
		this.previousLines = [];
		this.previousKittyImageIds = /* @__PURE__ */ new Set();
		this.previousWidth = 0;
		this.previousHeight = 0;
		this.cursorRow = 0;
		this.hardwareCursorRow = 0;
		this.maxLinesRendered = 0;
		this.previousViewportTop = 0;
	}
	captureRenderState() {
		return {
			previousLines: [...this.previousLines],
			previousKittyImageIds: new Set(this.previousKittyImageIds),
			previousWidth: this.previousWidth,
			previousHeight: this.previousHeight,
			cursorRow: this.cursorRow,
			hardwareCursorRow: this.hardwareCursorRow,
			maxLinesRendered: this.maxLinesRendered,
			previousViewportTop: this.previousViewportTop
		};
	}
	restoreRenderState(state) {
		if (!state || !Array.isArray(state.previousLines)) {
			this.resetRenderState();
			return;
		}
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = void 0;
		}
		this.renderRequested = false;
		this.previousLines = [...state.previousLines];
		this.previousKittyImageIds = new Set(state.previousKittyImageIds ?? []);
		this.previousWidth = state.previousWidth ?? 0;
		this.previousHeight = state.previousHeight ?? 0;
		this.cursorRow = state.cursorRow ?? 0;
		this.hardwareCursorRow = state.hardwareCursorRow ?? 0;
		this.maxLinesRendered = state.maxLinesRendered ?? this.previousLines.length;
		this.previousViewportTop = state.previousViewportTop ?? 0;
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
			if (this.renderTimer) clearTimeout(this.renderTimer);
			this.renderTimer = void 0;
			if (!this.inputFrameQueued) {
				this.inputFrameQueued = true;
				process.nextTick(() => {
					this.inputFrameQueued = false;
					if (this.stopped || !this.renderRequested) return;
					if (this.renderTimer) clearTimeout(this.renderTimer);
					this.renderTimer = void 0;
					this.renderRequested = false;
					this.lastRenderAt = performance.now();
					this.doRender();
					if (this.renderRequested) this.scheduleRender();
				});
			}
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
				w: width,
				capturing: !entry.options?.nonCapturing,
				zOrder: entry.focusOrder
			});
			minLinesNeeded = Math.max(minLinesNeeded, row + overlayLines.length);
		}
		this.lastOverlayPlacements = rendered.map((item) => ({
			row: item.row,
			col: item.col,
			width: item.w,
			height: item.overlayLines.length,
			zOrder: item.zOrder,
			capturing: item.capturing
		}));
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
		const input = [...lines];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (reset === this.previousResetCode && line === this.previousResetInput[i]) {
				lines[i] = this.previousResetOutput[i];
				continue;
			}
			let result = this.lineResetCache.get(line, reset);
			if (result === void 0) {
				result = isImageLine(line) ? line : normalizeTerminalOutput(line) + reset;
				this.lineResetCache.set(line, result, result.length, reset);
			}
			lines[i] = result;
		}
		this.previousResetInput = input;
		this.previousResetOutput = [...lines];
		this.previousResetCode = reset;
		return lines;
	}
	collectKittyImageIds(lines) {
		const ids = /* @__PURE__ */ new Set();
		const lineIds = [];
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index];
			const cached = line === this.previousKittyScanInput[index] ? this.previousKittyScanIds[index] : extractKittyImageIds(line);
			lineIds.push(cached);
			for (const id of cached) ids.add(id);
		}
		this.previousKittyScanInput = [...lines];
		this.previousKittyScanIds = lineIds;
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
		this.lastOverlayPlacements = [];
		if (this.overlayStack.length > 0) newLines = this.compositeOverlays(newLines, width, height);
		const preSliceLength = newLines.length;
		if (this.terminal.__seekttyManagedAlternateScreen !== false && newLines.length > height) newLines = newLines.slice(-height);
		this.lastFrameGeometry = {
			terminalWidth: width,
			terminalHeight: height,
			rootScreenOrigin: {
				col: 0,
				row: 0
			},
			rootSliceOffset: Math.max(0, preSliceLength - height),
			overlays: this.lastOverlayPlacements
		};
		this.onAfterRender?.();
		const cursorPos = this.extractCursorPosition(newLines, height);
		newLines = this.applyLineResets(newLines);
		if (this.terminal.__seekttyManagedAlternateScreen === false && this.terminal.__seekttyNativeFrame?.(newLines, cursorPos, width, height)) return;
		const fullRender = (clear) => {
			this.fullRedrawCount += 1;
			let buffer$1 = "\x1B[?2026h";
			if (clear) {
				buffer$1 += this.deleteKittyImages(this.previousKittyImageIds);
				buffer$1 += "\x1B[H";
			}
			const firstPaintedLine = clear ? Math.max(0, newLines.length - height) : 0;
			for (let i = firstPaintedLine; i < newLines.length; i++) {
				if (i > firstPaintedLine) buffer$1 += "\r\n";
				if (clear && visibleWidth(newLines[i]) < width) buffer$1 += "\x1B[2K";
				buffer$1 += newLines[i];
			}
			if (clear && newLines.length < height) {
				const extraLines = height - newLines.length;
				if (newLines.length === 0) buffer$1 += "\x1B[0J";
				else if (extraLines > 0) {
					buffer$1 += "\r";
					buffer$1 += "\x1B[1B";
					for (let i = 0; i < extraLines; i++) {
						buffer$1 += "\r\x1B[2K";
						if (i < extraLines - 1) buffer$1 += "\x1B[1B";
					}
					buffer$1 += `\x1b[${extraLines}A`;
				}
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
		if (widthChanged && this.terminal.__seekttyManagedAlternateScreen !== false) {
			logRedraw(`terminal width changed (${this.previousWidth} -> ${width})`);
			fullRender(true);
			return;
		}
		if (heightChanged && this.terminal.__seekttyManagedAlternateScreen !== false && !isTermuxSession()) {
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
		if (firstChanged !== -1 && firstChanged < prevViewportTop) {
			let visibleFirstChanged = -1;
			for (let i = prevViewportTop; i < maxLines; i++) if ((i < this.previousLines.length ? this.previousLines[i] : "") !== (i < newLines.length ? newLines[i] : "")) {
				visibleFirstChanged = i;
				break;
			}
			if (visibleFirstChanged === -1) {
				logRedraw(`suppressed scrollback-only change (firstChanged=${firstChanged} < viewportTop=${prevViewportTop})`);
				this.positionHardwareCursor(cursorPos, newLines.length);
				this.previousLines = newLines;
				this.previousKittyImageIds = this.collectKittyImageIds(newLines);
				this.previousWidth = width;
				this.previousHeight = height;
				this.previousViewportTop = prevViewportTop;
				return;
			}
			logRedraw(`clamped firstChanged ${firstChanged} -> ${visibleFirstChanged} (viewportTop=${prevViewportTop})`);
			firstChanged = visibleFirstChanged;
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
			const line = newLines[i];
			if (visibleWidth(line) < width) buffer += "\x1B[2K";
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

const DEFAULT_PRIMARY_COLUMN_WIDTH = 32;
const PRIMARY_COLUMN_GAP = 2;
const MIN_DESCRIPTION_WIDTH = 10;
const normalizeToSingleLine = (text) => text.replace(/[\r\n]+/g, " ").trim();
const clamp$2 = (value, min, max) => Math.max(min, Math.min(value, max));
var SelectList = class {
	items = [];
	filteredItems = [];
	selectedIndex = 0;
	maxVisible = 5;
	scrollOffset = 0;
	lastRenderSnapshot = null;
	theme;
	layout;
	onSelect;
	onCancel;
	onSelectionChange;
	constructor(items, maxVisible, theme, layout = {}) {
		this.items = items;
		this.filteredItems = items;
		this.maxVisible = Math.max(1, maxVisible);
		this.theme = theme;
		this.layout = layout;
	}
	setFilter(filter) {
		this.filteredItems = this.items.filter((item) => item.value.toLowerCase().startsWith(filter.toLowerCase()));
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.lastRenderSnapshot = null;
	}
	setSelectedIndex(index) {
		this.selectedIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
		if (this.selectedIndex < this.scrollOffset) this.setScrollOffset(this.selectedIndex);
		else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) this.setScrollOffset(this.selectedIndex - this.maxVisible + 1);
	}
	getSelectedIndex() {
		return this.selectedIndex;
	}
	getScrollOffset() {
		return this.scrollOffset;
	}
	setScrollOffset(offset) {
		this.scrollOffset = clamp$2(Math.trunc(offset), 0, Math.max(0, this.filteredItems.length - this.maxVisible));
	}
	scrollBy(delta) {
		const before = this.scrollOffset;
		this.setScrollOffset(before + delta);
		return this.scrollOffset !== before;
	}
	getRenderSnapshot() {
		return this.lastRenderSnapshot;
	}
	invalidate() {}
	render(width) {
		const lines = [];
		if (this.filteredItems.length === 0) {
			lines.push(this.theme.noMatch("  No matching commands"));
			this.lastRenderSnapshot = {
				selectedIndex: -1,
				startIndex: 0,
				visibleRows: []
			};
			return lines;
		}
		const primaryColumnWidth = this.getPrimaryColumnWidth();
		const startIndex = this.scrollOffset;
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);
		const visibleRows = [];
		for (let i = startIndex; i < endIndex; i++) {
			const item = this.filteredItems[i];
			if (!item) continue;
			const isSelected = i === this.selectedIndex;
			const descriptionSingleLine = item.description ? normalizeToSingleLine(item.description) : void 0;
			lines.push(this.renderItem(item, isSelected, width, descriptionSingleLine, primaryColumnWidth));
			visibleRows.push({
				visualRow: lines.length - 1,
				absoluteIndex: i,
				item
			});
		}
		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			const scrollText = `  (${this.selectedIndex + 1}/${this.filteredItems.length})`;
			lines.push(this.theme.scrollInfo(truncateToWidth(scrollText, width - 2, "")));
		}
		this.lastRenderSnapshot = {
			selectedIndex: this.selectedIndex,
			startIndex,
			visibleRows
		};
		return lines;
	}
	handleInput(keyData) {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up")) {
			this.setSelectedIndex(this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1);
			this.notifySelectionChange();
		} else if (kb.matches(keyData, "tui.select.down")) {
			this.setSelectedIndex(this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1);
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
				const truncatedDesc = truncateToWidth(descriptionSingleLine, remainingWidth, this.layout.descriptionEllipsis ?? "");
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
		return clamp$2(this.filteredItems.reduce((widest, item) => {
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
	visibleLineMap = [];
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
	autocompleteGeneration = 0;
	autocompleteItemIds = [];
	autocompleteRenderSnapshot = null;
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
	selectionRange = null;
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
		this.selectionRange = null;
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
		this.visibleLineMap = visibleLines.map((line, index) => ({
			row: index + 1,
			col: paddingX,
			logicalLine: line.logicalLine,
			startCol: line.startCol,
			text: line.text
		}));
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
			const selection = this.normalizedSelection();
			let selectionStart = -1;
			let selectionEnd = -1;
			if (selection && layoutLine.logicalLine >= selection.start.line && layoutLine.logicalLine <= selection.end.line) {
				selectionStart = layoutLine.logicalLine === selection.start.line ? Math.max(0, selection.start.col - layoutLine.startCol) : 0;
				selectionEnd = layoutLine.logicalLine === selection.end.line ? Math.min(displayText.length, selection.end.col - layoutLine.startCol) : displayText.length;
				selectionStart = Math.min(displayText.length, selectionStart);
				if (selectionEnd > selectionStart) displayText = displayText.slice(0, selectionStart) + "\x1B[7m" + displayText.slice(selectionStart, selectionEnd) + "\x1B[27m" + displayText.slice(selectionEnd);
			}
			if (layoutLine.hasCursor && layoutLine.cursorPos !== void 0) {
				let cursorPos = layoutLine.cursorPos;
				const cursorInsideSelection = selectionEnd > selectionStart && cursorPos >= selectionStart && cursorPos < selectionEnd;
				if (selectionEnd > selectionStart && cursorPos >= selectionStart) cursorPos += cursorPos >= selectionEnd ? 9 : 4;
				const before = displayText.slice(0, cursorPos);
				const after = displayText.slice(cursorPos);
				const marker = emitCursorMarker ? CURSOR_MARKER : "";
				if (after.length > 0) {
					const firstGrapheme = [...this.segment(after)][0]?.segment || "";
					const restAfter = after.slice(firstGrapheme.length);
					const cursor = `\x1b[7m${firstGrapheme}\x1b[0m${cursorInsideSelection ? "\x1B[7m" : ""}`;
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
			const listSnapshot = this.autocompleteList.getRenderSnapshot?.();
			this.autocompleteRenderSnapshot = listSnapshot ? {
				generation: this.autocompleteGeneration,
				selectedIndex: listSnapshot.selectedIndex,
				visibleRows: listSnapshot.visibleRows.map((row) => ({
					visualRow: row.visualRow,
					absoluteIndex: row.absoluteIndex,
					itemId: this.autocompleteItemIds[row.absoluteIndex] ?? "",
					selectable: this.autocompleteItemIds[row.absoluteIndex] !== void 0
				}))
			} : null;
		} else this.autocompleteRenderSnapshot = null;
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
		if (!this.autocompleteState && this.normalizedSelection() && kb.matches(data, "tui.select.cancel")) {
			this.clearSelection();
			return;
		}
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
				this.moveAutocompleteSelection(kb.matches(data, "tui.select.up") ? -1 : 1);
				return;
			}
			if (kb.matches(data, "tui.input.tab")) {
				this.completeAutocompleteSelection();
				return;
			}
			if (kb.matches(data, "tui.select.confirm")) {
				const activation = this.activateAutocompleteSelection("enter");
				if (activation.submitText !== void 0 && this.onSubmit) this.onSubmit(activation.submitText);
				return;
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
				cursorPos: 0,
				logicalLine: 0,
				startCol: 0
			});
			return layoutLines;
		}
		for (let i = 0; i < this.state.lines.length; i++) {
			const line = this.state.lines[i] || "";
			const isCurrentLine = i === this.state.cursorLine;
			if (visibleWidth(line) <= contentWidth) if (isCurrentLine) layoutLines.push({
				text: line,
				hasCursor: true,
				cursorPos: this.state.cursorCol,
				logicalLine: i,
				startCol: 0
			});
			else layoutLines.push({
				text: line,
				hasCursor: false,
				logicalLine: i,
				startCol: 0
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
						cursorPos: adjustedCursorPos,
						logicalLine: i,
						startCol: chunk.startIndex
					});
					else layoutLines.push({
						text: chunk.text,
						hasCursor: false,
						logicalLine: i,
						startCol: chunk.startIndex
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
	setCursor(line, col) {
		const lineCount = this.state.lines.length;
		const nextLine = Math.max(0, Math.min(Math.floor(line), Math.max(0, lineCount - 1)));
		const currentLine = this.state.lines[nextLine] || "";
		const nextCol = Math.max(0, Math.min(Math.floor(col), currentLine.length));
		this.state.cursorLine = nextLine;
		this.setCursorCol(nextCol);
	}
	getSelection() {
		return this.selectionRange ?? void 0;
	}
	setSelection(anchor, focus) {
		this.selectionRange = {
			anchor: this.clampPoint(anchor),
			focus: this.clampPoint(focus)
		};
		this.tui.requestRender();
	}
	clearSelection() {
		this.selectionRange = null;
		this.tui.requestRender();
	}
	clampPoint(point) {
		const line = Math.max(0, Math.min(Math.floor(point.line), Math.max(0, this.state.lines.length - 1)));
		return {
			line,
			col: Math.max(0, Math.min(Math.floor(point.col), (this.state.lines[line] || "").length))
		};
	}
	normalizedSelection() {
		if (!this.selectionRange) return null;
		const anchor = this.clampPoint(this.selectionRange.anchor);
		const focus = this.clampPoint(this.selectionRange.focus);
		const reversed = anchor.line > focus.line || anchor.line === focus.line && anchor.col > focus.col;
		const start = reversed ? focus : anchor;
		const end = reversed ? anchor : focus;
		return start.line === end.line && start.col === end.col ? null : {
			start,
			end
		};
	}
	deleteSelectionInternal() {
		const selection = this.normalizedSelection();
		if (!selection) return false;
		const prefix = (this.state.lines[selection.start.line] || "").slice(0, selection.start.col);
		const suffix = (this.state.lines[selection.end.line] || "").slice(selection.end.col);
		this.state.lines.splice(selection.start.line, selection.end.line - selection.start.line + 1, prefix + suffix);
		this.state.cursorLine = selection.start.line;
		this.setCursorCol(selection.start.col);
		this.selectionRange = null;
		return true;
	}
	replaceSelection(text) {
		if (!(this.normalizedSelection() !== null) && !text) return false;
		this.cancelAutocomplete();
		this.pushUndoSnapshot();
		this.lastAction = null;
		this.historyIndex = -1;
		this.deleteSelectionInternal();
		if (text) this.insertTextAtCursorInternal(text);
		else if (this.onChange) this.onChange(this.getText());
		this.tui.requestRender();
		return true;
	}
	getVisualLineMap(width) {
		return this.buildVisualLineMap(width ?? this.lastWidth);
	}
	getVisibleLineMap() {
		return this.visibleLineMap.map((line) => ({ ...line }));
	}
	getAutocompleteSnapshot() {
		const snapshot = this.autocompleteRenderSnapshot;
		if (!snapshot) return void 0;
		return {
			generation: snapshot.generation,
			selectedIndex: snapshot.selectedIndex,
			visibleRows: snapshot.visibleRows.map((row) => ({ ...row }))
		};
	}
	moveAutocompleteSelection(delta) {
		if (!this.autocompleteState || !this.autocompleteList || this.autocompleteItemIds.length === 0) return false;
		const step = Math.trunc(delta);
		if (step === 0) return false;
		const count = this.autocompleteItemIds.length;
		const next = ((this.autocompleteList.getSelectedIndex() + step) % count + count) % count;
		this.autocompleteList.setSelectedIndex(next);
		this.autocompleteRenderSnapshot = null;
		this.tui.requestRender();
		return true;
	}
	scrollAutocomplete(delta) {
		if (!this.autocompleteState || !this.autocompleteList || !this.autocompleteList.scrollBy(delta)) return false;
		this.autocompleteRenderSnapshot = null;
		this.tui.requestRender();
		return true;
	}
	selectAutocompleteItem(generation, itemId) {
		const snapshot = this.autocompleteRenderSnapshot;
		if (!snapshot || snapshot.generation !== generation || generation !== this.autocompleteGeneration) return false;
		const row = snapshot.visibleRows.find((candidate) => candidate.selectable && candidate.itemId === itemId);
		if (!row || this.autocompleteItemIds[row.absoluteIndex] !== itemId || !this.autocompleteList) return false;
		this.autocompleteList.setSelectedIndex(row.absoluteIndex);
		this.autocompleteRenderSnapshot = null;
		this.tui.requestRender();
		return true;
	}
	completeAutocompleteSelection() {
		return this.applyAutocompleteSelection(false).applied;
	}
	activateAutocompleteSelection(source) {
		return this.applyAutocompleteSelection(source === "enter" || source === "mouse");
	}
	applyAutocompleteSelection(submitSlash) {
		if (!this.autocompleteState || !this.autocompleteList || !this.autocompleteProvider) return { applied: false };
		const selected = this.autocompleteList.getSelectedItem();
		if (!selected) return { applied: false };
		const slash = this.autocompletePrefix.startsWith("/");
		this.pushUndoSnapshot();
		this.lastAction = null;
		const result = this.autocompleteProvider.applyCompletion(this.state.lines, this.state.cursorLine, this.state.cursorCol, selected, this.autocompletePrefix);
		this.state.lines = result.lines;
		this.state.cursorLine = result.cursorLine;
		this.setCursorCol(result.cursorCol);
		this.cancelAutocomplete();
		if (submitSlash && slash) {
			const submitText = this.consumeSubmitValue();
			this.tui.requestRender();
			return {
				applied: true,
				submitText
			};
		}
		if (this.onChange) this.onChange(this.getText());
		this.tui.requestRender();
		return { applied: true };
	}
	setText(text, options$1) {
		this.cancelAutocomplete();
		this.lastAction = null;
		this.historyIndex = -1;
		const normalized = this.normalizeText(text);
		if (options$1?.recordUndo !== false && this.getText() !== normalized) this.pushUndoSnapshot();
		this.setTextInternal(normalized);
	}
	/**
	* Insert text at the current cursor position.
	* Used for programmatic insertion (e.g., clipboard image markers).
	* This is atomic for undo - single undo restores entire pre-insert state.
	*/
	insertTextAtCursor(text) {
		if (!text) return;
		if (this.normalizedSelection()) {
			this.replaceSelection(text);
			return;
		}
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
		const replacingSelection = this.normalizedSelection() !== null;
		if (!skipUndoCoalescing) {
			if (replacingSelection || isWhitespaceChar(char) || this.lastAction !== "type-word") this.pushUndoSnapshot();
			this.lastAction = "type-word";
		}
		this.deleteSelectionInternal();
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
		this.deleteSelectionInternal();
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
		if (this.normalizedSelection()) {
			this.replaceSelection("\n");
			return;
		}
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
	consumeSubmitValue() {
		this.cancelAutocomplete();
		this.selectionRange = null;
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
		return result;
	}
	submitValue() {
		const result = this.consumeSubmitValue();
		if (this.onSubmit) this.onSubmit(result);
	}
	handleBackspace() {
		this.historyIndex = -1;
		this.lastAction = null;
		if (this.normalizedSelection()) {
			this.cancelAutocomplete();
			this.pushUndoSnapshot();
			this.deleteSelectionInternal();
			if (this.onChange) this.onChange(this.getText());
			return;
		}
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
		if (this.normalizedSelection()) {
			this.cancelAutocomplete();
			this.pushUndoSnapshot();
			this.deleteSelectionInternal();
			if (this.onChange) this.onChange(this.getText());
			return;
		}
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
		this.cancelAutocomplete();
		this.selectionRange = null;
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
		const occurrences = /* @__PURE__ */ new Map();
		this.autocompleteItemIds = suggestions.items.map((item) => {
			const identity = JSON.stringify([
				item.value,
				item.label,
				item.description ?? ""
			]);
			const occurrence = occurrences.get(identity) ?? 0;
			occurrences.set(identity, occurrence + 1);
			return JSON.stringify([identity, occurrence]);
		});
		this.autocompleteGeneration += 1;
		this.autocompleteRenderSnapshot = null;
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
		this.autocompleteItemIds = [];
		this.autocompleteRenderSnapshot = null;
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

const segmenter = getSegmenter();
/**
* Input component - single-line text input with horizontal scrolling
*/
var Input = class {
	value = "";
	cursor = 0;
	selectionAnchor;
	viewportStart = 0;
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
		this.undoStack.clear();
		this.lastAction = null;
		this.value = value;
		this.cursor = Math.min(this.cursor, value.length);
		this.selectionAnchor = void 0;
	}
	getCursor() {
		return this.cursor;
	}
	setCursor(offset) {
		this.cursor = this.snapOffset(offset);
		this.selectionAnchor = void 0;
		this.lastAction = null;
	}
	snapOffset(offset) {
		const clamped = Math.max(0, Math.min(offset, this.value.length));
		for (const part of segmenter.segment(this.value)) if (clamped >= part.index && clamped < part.index + part.segment.length) return part.index;
		return clamped;
	}
	getSelection() {
		return this.selectionAnchor === void 0 || this.selectionAnchor === this.cursor ? void 0 : {
			anchor: this.selectionAnchor,
			focus: this.cursor
		};
	}
	setSelection(anchor, focus) {
		this.selectionAnchor = this.snapOffset(anchor);
		this.cursor = this.snapOffset(focus);
		this.lastAction = null;
	}
	replaceSelection(text) {
		const selection = this.getSelection();
		if (!selection) return false;
		const start = Math.min(selection.anchor, selection.focus);
		const end = Math.max(selection.anchor, selection.focus);
		this.pushUndo();
		this.value = this.value.slice(0, start) + text + this.value.slice(end);
		this.cursor = start + text.length;
		this.selectionAnchor = void 0;
		this.lastAction = null;
		return true;
	}
	getPointerOffset(column) {
		let col = 2;
		for (const part of segmenter.segment(this.value.slice(this.viewportStart))) {
			const width = Math.max(1, visibleWidth(part.segment));
			if (column < col + width) return this.viewportStart + part.index;
			col += width;
		}
		return this.value.length;
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
		const shiftedMovement = [
			[Key.shift(Key.left), "\x1B[D"],
			[Key.shift(Key.right), "\x1B[C"],
			[Key.shift(Key.home), ""],
			[Key.shift(Key.end), ""],
			[Key.ctrlShift(Key.left), "\x1Bb"],
			[Key.ctrlShift(Key.right), "\x1Bf"]
		].find(([key]) => matchesKey(data, key));
		if (shiftedMovement) {
			const anchor = this.selectionAnchor ?? this.cursor;
			this.selectionAnchor = void 0;
			this.handleInput(shiftedMovement[1]);
			this.selectionAnchor = anchor;
			return;
		}
		const selection = this.getSelection();
		if (selection && (kb.matches(data, "tui.editor.cursorLeft") || kb.matches(data, "tui.editor.cursorRight"))) {
			this.setCursor(kb.matches(data, "tui.editor.cursorLeft") ? Math.min(selection.anchor, selection.focus) : Math.max(selection.anchor, selection.focus));
			return;
		}
		if ([
			"tui.editor.cursorLineStart",
			"tui.editor.cursorLineEnd",
			"tui.editor.cursorWordLeft",
			"tui.editor.cursorWordRight"
		].some((key) => kb.matches(data, key))) this.selectionAnchor = void 0;
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
		if (this.replaceSelection(char)) return;
		if (isWhitespaceChar(char) || this.lastAction !== "type-word") this.pushUndo();
		this.lastAction = "type-word";
		this.value = this.value.slice(0, this.cursor) + char + this.value.slice(this.cursor);
		this.cursor += char.length;
	}
	handleBackspace() {
		if (this.replaceSelection("")) return;
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
		if (this.replaceSelection("")) return;
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
		if (this.replaceSelection("")) return;
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
		if (this.replaceSelection("")) return;
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
		if (this.replaceSelection("")) return;
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
		if (this.replaceSelection("")) return;
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
		if (this.replaceSelection(text)) return;
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
		this.selectionAnchor = void 0;
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
		const cleanText = pastedText.replace(/\r\n/g, "").replace(/\r/g, "").replace(/\n/g, "").replace(/\t/g, "    ");
		if (this.replaceSelection(cleanText)) return;
		this.lastAction = null;
		this.pushUndo();
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
		this.viewportStart = this.cursor - cursorDisplay;
		let textWithCursor = beforeCursor + marker + cursorChar + afterCursor;
		const selection = this.getSelection();
		if (selection) {
			const start = Math.min(selection.anchor, selection.focus);
			const end = Math.max(selection.anchor, selection.focus);
			textWithCursor = "";
			for (const part of segmenter.segment(visibleText)) {
				const offset = this.viewportStart + part.index;
				if (part.index === cursorDisplay) textWithCursor += marker;
				textWithCursor += offset >= start && offset < end ? `\x1b[7m${part.segment}\x1b[27m` : part.segment;
			}
			if (cursorDisplay === visibleText.length) textWithCursor += marker + " ";
		}
		const visualLength = visibleWidth(textWithCursor);
		const padding = " ".repeat(Math.max(0, availableWidth - visualLength));
		return [prompt + textWithCursor + padding];
	}
};

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
		replace: (name, val) => {
			let valSource = typeof val === "string" ? val : val.source;
			valSource = valSource.replace(other.caret, "$1");
			source = source.replace(name, valSource);
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
		for (const align$1 of aligns) if (this.rules.other.tableAlignRight.test(align$1)) item.align.push("right");
		else if (this.rules.other.tableAlignCenter.test(align$1)) item.align.push("center");
		else if (this.rules.other.tableAlignLeft.test(align$1)) item.align.push("left");
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

const projectionCache = new LineCache();
function tokenFingerprint(value) {
	const strings = [];
	return [JSON.stringify(value, (_key, item) => {
		if (typeof item !== "string") return item;
		strings.push(item);
		return "";
	}), ...strings];
}
function sameTokenFingerprint(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
const COPY_START = "\x1B_seektty-copy:start\x07";
const COPY_END = "\x1B_seektty-copy:end\x07";
const COPY_SKIP = "\x1B_seektty-copy:skip\x07";
const COPY_JOIN_PREFIX = "\x1B_seektty-copy:join:";
const COPY_MARKER_SUFFIX = "\x07";
function copyJoinMarker(joiner) {
	if (joiner === "\n") return `${COPY_JOIN_PREFIX}hard${COPY_MARKER_SUFFIX}`;
	if (joiner === "") return `${COPY_JOIN_PREFIX}none${COPY_MARKER_SUFFIX}`;
	return `${COPY_JOIN_PREFIX}spaces:${joiner.length}${COPY_MARKER_SUFFIX}`;
}
function markCopyText(text) {
	return `${COPY_START}${text}${COPY_END}`;
}
function stripProjectionMarkers(text) {
	return text.replace(/\x1b_seektty-copy:[^\x07]*\x07/g, "");
}
function stripAnsi$1(text) {
	let result = "";
	let index = 0;
	while (index < text.length) {
		const ansi$1 = extractAnsiCode(text, index);
		if (ansi$1) {
			index += ansi$1.length;
			continue;
		}
		result += text[index];
		index += 1;
	}
	return result;
}
function selectionProjection(line, displayPadding, defaultJoiner) {
	const context = `${displayPadding}:${defaultJoiner}`;
	const hit = projectionCache.get(line, context);
	if (hit !== void 0) return { ...hit };
	const result = selectionProjectionUncached(line, displayPadding, defaultJoiner);
	projectionCache.set(line, result, result.text.length + result.joinerAfter.length, context);
	return { ...result };
}
function selectionProjectionUncached(line, displayPadding, defaultJoiner) {
	let before = "";
	let selected = "";
	let mode = "before";
	let marked$1 = false;
	let skipped = false;
	let joinerAfter = defaultJoiner;
	let index = 0;
	while (index < line.length) {
		const ansi$1 = extractAnsiCode(line, index);
		if (ansi$1) {
			if (ansi$1.code === COPY_START) {
				marked$1 = true;
				mode = "selected";
			} else if (ansi$1.code === COPY_END) mode = "after";
			else if (ansi$1.code === COPY_SKIP) skipped = true;
			else if (ansi$1.code.startsWith(COPY_JOIN_PREFIX)) {
				const encoded = ansi$1.code.slice(20, -1);
				if (encoded === "hard") joinerAfter = "\n";
				else if (encoded === "none") joinerAfter = "";
				else if (encoded.startsWith("spaces:")) {
					const count = Number.parseInt(encoded.slice(7), 10);
					joinerAfter = " ".repeat(Number.isFinite(count) ? Math.max(0, count) : 0);
				}
			} else if (mode === "selected") selected += ansi$1.code;
			else if (mode === "before") before += ansi$1.code;
			index += ansi$1.length;
			continue;
		}
		if (mode === "selected") selected += line[index];
		else if (mode === "before") before += line[index];
		index += 1;
	}
	if (skipped) return {
		text: "",
		displayStartCell: displayPadding,
		joinerAfter
	};
	return {
		text: marked$1 ? stripAnsi$1(selected) : stripAnsi$1(line).trimEnd(),
		displayStartCell: displayPadding + (marked$1 ? visibleWidth(before) : 0),
		joinerAfter
	};
}
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
	renderUnpadded(width) {
		return this.render(width).map((line, index) => {
			const source = this.cachedSelectionLines?.[index];
			return source ? truncateToWidth(line, source.displayStartCell + visibleWidth(source.text), "", false) : line;
		});
	}
	tokenCache = [];
	nextTokenCache;
	tokenCursor = 0;
	nextTokenCharacters = 0;
	layoutContext;
	logicalLayouts = [];
	paddedInputs = [];
	paddedOutputs = [];
	text;
	paddingX;
	paddingY;
	defaultTextStyle;
	theme;
	defaultStylePrefix;
	cachedText;
	cachedWidth;
	cachedLines;
	cachedSelectionLines;
	constructor(text, paddingX, paddingY, theme, defaultTextStyle) {
		this.text = text;
		this.paddingX = paddingX;
		this.paddingY = paddingY;
		this.theme = theme;
		this.defaultTextStyle = defaultTextStyle;
	}
	setText(text) {
		this.text = text;
		const retained = this.theme.cacheKey === void 0 ? void 0 : this.tokenCache;
		const layout = retained === void 0 ? void 0 : [
			this.layoutContext,
			this.logicalLayouts,
			this.paddedInputs,
			this.paddedOutputs
		];
		this.invalidate();
		if (retained !== void 0) this.tokenCache = retained;
		if (layout !== void 0) [this.layoutContext, this.logicalLayouts, this.paddedInputs, this.paddedOutputs] = layout;
	}
	invalidate() {
		this.tokenCache = [];
		this.nextTokenCache = void 0;
		this.tokenCursor = 0;
		this.nextTokenCharacters = 0;
		this.layoutContext = void 0;
		this.logicalLayouts = [];
		this.paddedInputs = [];
		this.paddedOutputs = [];
		this.cachedText = void 0;
		this.cachedWidth = void 0;
		this.cachedLines = void 0;
		this.cachedSelectionLines = void 0;
	}
	getSelectionLines() {
		return this.cachedSelectionLines ?? [];
	}
	render(width) {
		if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) return this.cachedLines;
		const contentWidth = Math.max(1, width - this.paddingX * 2);
		const layoutContext = this.theme.cacheKey === void 0 ? void 0 : JSON.stringify([
			this.theme.cacheKey(),
			width,
			this.paddingX,
			this.paddingY,
			getCapabilities()
		]);
		const reuseLayout = layoutContext !== void 0 && layoutContext === this.layoutContext;
		const nextLogicalLayouts = [];
		if (!this.text || this.text.trim() === "") {
			const result$1 = [];
			this.cachedText = this.text;
			this.cachedWidth = width;
			this.cachedLines = result$1;
			this.cachedSelectionLines = [];
			return result$1;
		}
		const normalizedText = this.text.replace(/\t/g, "   ");
		const tokens = markdownParser.lexer(normalizedText);
		const renderedLines = [];
		this.nextTokenCache = [];
		this.tokenCursor = 0;
		this.nextTokenCharacters = 0;
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const nextToken = tokens[i + 1];
			const tokenLines = this.renderToken(token, contentWidth, nextToken?.type);
			for (const line of tokenLines) renderedLines.push(line);
		}
		this.tokenCache = this.nextTokenCache;
		this.nextTokenCache = void 0;
		const wrappedLines = [];
		const selectionLines = [];
		for (let renderedLineIndex = 0; renderedLineIndex < renderedLines.length; renderedLineIndex++) {
			const line = renderedLines[renderedLineIndex];
			const hasFollowingLogicalLine = renderedLineIndex < renderedLines.length - 1;
			const previous = reuseLayout ? this.logicalLayouts[renderedLineIndex] : void 0;
			if (previous !== void 0 && previous.source === line && previous.following === hasFollowingLogicalLine) {
				for (const line$1 of previous.lines) wrappedLines.push(line$1);
				for (const part of previous.projections) selectionLines.push({ ...part });
				nextLogicalLayouts.push(previous);
				continue;
			}
			const start = wrappedLines.length;
			if (isImageLine(line)) {
				wrappedLines.push(line);
				selectionLines.push({
					text: "",
					displayStartCell: this.paddingX,
					joinerAfter: ""
				});
			} else {
				const wrapped = wrapTextWithAnsiDetailed(line, contentWidth);
				for (let wrappedIndex = 0; wrappedIndex < wrapped.length; wrappedIndex++) {
					const part = wrapped[wrappedIndex];
					const isLastPart = wrappedIndex === wrapped.length - 1;
					const defaultJoiner = part.separator ?? (isLastPart && hasFollowingLogicalLine ? "\n" : "");
					wrappedLines.push(stripProjectionMarkers(part.text));
					selectionLines.push(selectionProjection(part.text, this.paddingX, defaultJoiner));
				}
			}
			nextLogicalLayouts.push({
				source: line,
				following: hasFollowingLogicalLine,
				lines: wrappedLines.slice(start),
				projections: selectionLines.slice(start).map((part) => ({ ...part }))
			});
		}
		const leftMargin = " ".repeat(this.paddingX);
		const rightMargin = " ".repeat(this.paddingX);
		const bgFn = this.defaultTextStyle?.bgColor;
		const contentLines = [];
		for (const [lineIndex, line] of wrappedLines.entries()) {
			if (!bgFn && reuseLayout && this.paddedInputs[lineIndex] === line) {
				contentLines.push(this.paddedOutputs[lineIndex]);
				continue;
			}
			if (isImageLine(line)) {
				contentLines.push(line);
				continue;
			}
			const lineWithMargins = leftMargin + line + rightMargin;
			if (bgFn) contentLines.push(applyBackgroundToLine(lineWithMargins, width, bgFn));
			else {
				const visibleLen = visibleWidth(lineWithMargins);
				const paddingNeeded = Math.max(0, width - visibleLen);
				contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
			}
		}
		this.layoutContext = layoutContext;
		this.logicalLayouts = nextLogicalLayouts;
		this.paddedInputs = wrappedLines.slice();
		this.paddedOutputs = contentLines.slice();
		const emptyLine = " ".repeat(width);
		const emptyLines = [];
		for (let i = 0; i < this.paddingY; i++) {
			const line = bgFn ? applyBackgroundToLine(emptyLine, width, bgFn) : emptyLine;
			emptyLines.push(line);
		}
		const result = [
			...emptyLines,
			...contentLines,
			...emptyLines
		];
		const paddingProjection = {
			text: "",
			displayStartCell: this.paddingX,
			joinerAfter: ""
		};
		const resultSelectionLines = [
			...new Array(this.paddingY).fill(paddingProjection),
			...selectionLines,
			...new Array(this.paddingY).fill(paddingProjection)
		];
		this.cachedText = this.text;
		this.cachedWidth = width;
		this.cachedLines = result;
		this.cachedSelectionLines = resultSelectionLines;
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
		if (styleContext !== void 0 || this.theme.cacheKey === void 0) return this.renderTokenUncached(token, width, nextTokenType, styleContext);
		const key = tokenFingerprint([
			this.theme.cacheKey(),
			getCapabilities(),
			width,
			nextTokenType,
			token
		]);
		const index = this.tokenCursor++;
		const previous = this.tokenCache[index];
		const result = previous !== void 0 && sameTokenFingerprint(previous.key, key) ? previous.result : this.renderTokenUncached(token, width, nextTokenType, styleContext);
		const characters = key.reduce((size, part) => size + part.length, 0) + result.reduce((size, line) => size + line.length, 0);
		if (index < 2e4 && this.nextTokenCharacters + characters <= 8e6) {
			(this.nextTokenCache ?? this.tokenCache)[index] = {
				key,
				result
			};
			this.nextTokenCharacters += characters;
		}
		return [...result];
	}
	renderTokenUncached(token, width, nextTokenType, styleContext) {
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
				const codeWidth = Math.max(1, width - visibleWidth(indent));
				if (this.theme.highlightCode) {
					const highlightedLines = this.theme.highlightCode(token.text, token.lang);
					for (const hlLine of highlightedLines) {
						const wrapped = wrapTextWithAnsiDetailed(hlLine, codeWidth);
						for (const part of wrapped) {
							const padding = " ".repeat(Math.max(0, codeWidth - visibleWidth(part.text)));
							lines.push(`${indent}${this.theme.codeBlock(markCopyText(part.text) + padding)}${part.separator !== void 0 ? copyJoinMarker(part.separator) : ""}`);
						}
					}
				} else {
					const codeLines = token.text.split("\n");
					for (const codeLine of codeLines) {
						const wrapped = wrapTextWithAnsiDetailed(codeLine, codeWidth);
						for (const part of wrapped) {
							const padding = " ".repeat(Math.max(0, codeWidth - visibleWidth(part.text)));
							lines.push(`${indent}${this.theme.codeBlock(markCopyText(part.text) + padding)}${part.separator !== void 0 ? copyJoinMarker(part.separator) : ""}`);
						}
					}
				}
				if (nextTokenType && nextTokenType !== "space") lines.push("");
				break;
			}
			case "list": {
				const listLines = this.renderList(token, 0, styleContext, width);
				for (const line of listLines) lines.push(line);
				break;
			}
			case "table": {
				const tableLines = this.renderTable(token, width, nextTokenType, styleContext);
				for (const line of tableLines) lines.push(line);
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
					for (const line of this.renderToken(quoteToken, quoteContentWidth, nextQuoteToken?.type, quoteInlineStyleContext)) renderedQuoteLines.push(line);
				}
				while (renderedQuoteLines.length > 0 && renderedQuoteLines[renderedQuoteLines.length - 1] === "") renderedQuoteLines.pop();
				for (const quoteLine of renderedQuoteLines) {
					const styledLine = applyQuoteStyle(quoteLine);
					const wrappedLines = wrapTextWithAnsiDetailed(styledLine, quoteContentWidth);
					for (const wrappedLine of wrappedLines) {
						const content = styledLine.includes(COPY_START) ? wrappedLine.text : markCopyText(wrappedLine.text);
						lines.push(this.theme.quoteBorder("│ ") + content + (wrappedLine.separator !== void 0 ? copyJoinMarker(wrappedLine.separator) : ""));
					}
				}
				if (nextTokenType && nextTokenType !== "space") lines.push("");
				break;
			}
			case "hr":
				lines.push(`${COPY_SKIP}${this.theme.hr("─".repeat(Math.min(width, 80)))}`);
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
	renderList(token, depth, styleContext, width) {
		const lines = [];
		const indent = "  ".repeat(depth);
		const startNumber = token.start ?? 1;
		for (let i = 0; i < token.items.length; i++) {
			const item = token.items[i];
			const bullet$1 = token.ordered ? `${startNumber + i}. ` : "- ";
			const contentWidth = Math.max(1, width - visibleWidth(indent) - visibleWidth(bullet$1));
			const itemLines = this.renderListItem(item.tokens || [], depth, styleContext, width, contentWidth);
			if (itemLines.length > 0) {
				const firstLine = itemLines[0];
				if (/^\s+\x1b\[36m[-\d]/.test(firstLine)) lines.push(firstLine);
				else lines.push(indent + this.theme.listBullet(bullet$1) + firstLine);
				for (let j = 1; j < itemLines.length; j++) {
					const line = itemLines[j];
					if (/^\s+\x1b\[36m[-\d]/.test(line)) lines.push(line);
					else lines.push(`${indent}${" ".repeat(visibleWidth(bullet$1))}${line}`);
				}
			} else lines.push(indent + this.theme.listBullet(bullet$1));
		}
		return lines;
	}
	/**
	* Render list item tokens, handling nested lists
	* Returns lines WITHOUT the parent indent (renderList will add it)
	*/
	renderListItem(tokens, parentDepth, styleContext, width, contentWidth) {
		const lines = [];
		for (const token of tokens) if (token.type === "list") {
			const nestedLines = this.renderList(token, parentDepth + 1, styleContext, width);
			for (const line of nestedLines) lines.push(line);
		} else if (token.type === "text") {
			const text = token.tokens && token.tokens.length > 0 ? this.renderInlineTokens(token.tokens, styleContext) : token.text || "";
			lines.push(text);
		} else if (token.type === "paragraph") {
			const text = this.renderInlineTokens(token.tokens || [], styleContext);
			lines.push(text);
		} else if (token.type === "code") {
			const indent = this.theme.codeBlockIndent ?? "  ";
			const codeWidth = Math.max(1, contentWidth - visibleWidth(indent));
			if (this.theme.highlightCode) {
				const highlightedLines = this.theme.highlightCode(token.text, token.lang);
				for (const hlLine of highlightedLines) {
					const wrapped = wrapTextWithAnsiDetailed(hlLine, codeWidth);
					for (const part of wrapped) {
						const padding = " ".repeat(Math.max(0, codeWidth - visibleWidth(part.text)));
						lines.push(`${indent}${this.theme.codeBlock(markCopyText(part.text) + padding)}${part.separator !== void 0 ? copyJoinMarker(part.separator) : ""}`);
					}
				}
			} else {
				const codeLines = token.text.split("\n");
				for (const codeLine of codeLines) {
					const wrapped = wrapTextWithAnsiDetailed(codeLine, codeWidth);
					for (const part of wrapped) {
						const padding = " ".repeat(Math.max(0, codeWidth - visibleWidth(part.text)));
						lines.push(`${indent}${this.theme.codeBlock(markCopyText(part.text) + padding)}${part.separator !== void 0 ? copyJoinMarker(part.separator) : ""}`);
					}
				}
			}
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
				const padded = text + " ".repeat(Math.max(0, columnWidths[colIdx] - visibleWidth(text)));
				return this.theme.bold(padded);
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

const ESC$1 = "\x1B";
const SGR_MOUSE_PREFIX = "\x1B[<";
const MAX_MOUSE_SEQUENCE = 64;
const OSC_PREFIX = "\x1B]";
const MAX_OSC_SEQUENCE = 1024;
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
		if (remaining.startsWith(ESC$1 + ESC$1)) {
			sequences.push(ESC$1);
			pos++;
			continue;
		}
		if (remaining.startsWith(OSC_PREFIX)) {
			let end = -1;
			let restart = -1;
			for (let index = 2; index < remaining.length; index++) {
				if (remaining[index] === "\x07") {
					end = index + 1;
					break;
				}
				if (remaining[index] === ESC$1) {
					if (index + 1 === remaining.length) break;
					if (remaining[index + 1] === "\\") end = index + 2;
					else restart = index;
					break;
				}
			}
			if (restart !== -1) {
				pos += restart;
				continue;
			}
			if (end === -1) return {
				sequences,
				remainder: remaining
			};
			if (end <= MAX_OSC_SEQUENCE) sequences.push(remaining.slice(0, end));
			pos += end;
			continue;
		}
		if (remaining.startsWith(SGR_MOUSE_PREFIX)) {
			const end = remaining.search(/[Mm]/);
			const restart = remaining.indexOf(ESC$1, 3);
			if (restart !== -1 && (end === -1 || restart < end)) {
				pos += restart;
				continue;
			}
			if (end === -1) return {
				sequences,
				remainder: remaining
			};
			if (end + 1 <= MAX_MOUSE_SEQUENCE) sequences.push(remaining.slice(0, end + 1));
			pos += end + 1;
			continue;
		}
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
			const byte$1 = data[0] - 128;
			str = `\x1b${String.fromCharCode(byte$1)}`;
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
				if (result$1.remainder === ESC$1) this.emitDataSequence(ESC$1);
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
		if (this.buffer.startsWith(SGR_MOUSE_PREFIX)) {
			if (this.buffer.length > MAX_MOUSE_SEQUENCE) this.buffer = SGR_MOUSE_PREFIX + "!";
			return;
		}
		if (this.buffer.startsWith("\x1B[M")) return;
		if (this.buffer.startsWith(OSC_PREFIX)) {
			if (this.buffer.length > MAX_OSC_SEQUENCE) this.buffer = OSC_PREFIX + "!" + (this.buffer.endsWith(ESC$1) ? ESC$1 : "");
			return;
		}
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
		if (this.buffer.length === 0 || this.buffer.startsWith(OSC_PREFIX)) return [];
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
	_protocolsRestored = false;
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
		this._protocolsRestored = false;
		this.resizeHandler = onResize;
		this.wasRaw = process.stdin.isRaw || false;
		if (process.stdin.setRawMode) process.stdin.setRawMode(true);
		process.stdin.setEncoding("utf8");
		process.stdin.resume();
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[?2004h");
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
			if (!this._protocolsRestored && !this._kittyProtocolActive) {
				if (sequence.match(kittyResponsePattern)) {
					this._kittyProtocolActive = true;
					setKittyProtocolActive(true);
					(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[>7u");
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
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[?u");
		setTimeout(() => {
			if (!this._protocolsRestored && this.inputHandler && !this._kittyProtocolActive && !this._modifyOtherKeysActive) {
				(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[>4;2m");
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
	restoreProtocolsSync() {
		this._protocolsRestored = true;
		this.inputHandler = void 0;
		if (this.stdinBuffer) {
			this.stdinBuffer.destroy();
			this.stdinBuffer = void 0;
		}
		if (this.stdinDataHandler) {
			process.stdin.removeListener("data", this.stdinDataHandler);
			this.stdinDataHandler = void 0;
		}
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[?2004l");
		if (this._kittyProtocolActive) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[<u");
			this._kittyProtocolActive = false;
			setKittyProtocolActive(false);
		}
		if (this._modifyOtherKeysActive) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[>4;0m");
			this._modifyOtherKeysActive = false;
		}
	}
	restoreRawModeSync() {
		if (process.stdin.setRawMode) process.stdin.setRawMode(this.wasRaw);
	}
	async drainInput(maxMs = 1e3, idleMs = 50) {
		if (this._kittyProtocolActive) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[<u");
			this._kittyProtocolActive = false;
			setKittyProtocolActive(false);
		}
		if (this._modifyOtherKeysActive) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[>4;0m");
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
		if (this.clearProgressInterval()) (this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[?2004l");
		if (this._kittyProtocolActive) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[<u");
			this._kittyProtocolActive = false;
			setKittyProtocolActive(false);
		}
		if (this._modifyOtherKeysActive) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[>4;0m");
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
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(data);
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
		if (lines > 0) (this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(`\x1b[${lines}B`);
		else if (lines < 0) (this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(`\x1b[${-lines}A`);
	}
	hideCursor() {
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[?25l");
	}
	showCursor() {
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[?25h");
	}
	clearLine() {
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[K");
	}
	clearFromCursor() {
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[J");
	}
	clearScreen() {
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))("\x1B[2J\x1B[H");
	}
	setTitle(title) {
		(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(`\x1b]0;${title}\x07`);
	}
	setProgress(active) {
		if (active) {
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
			if (!this.progressInterval) this.progressInterval = setInterval(() => {
				(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(TERMINAL_PROGRESS_ACTIVE_SEQUENCE);
			}, TERMINAL_PROGRESS_KEEPALIVE_MS);
		} else {
			this.clearProgressInterval();
			(this.__seekttyWrite ?? process.stdout.write.bind(process.stdout))(TERMINAL_PROGRESS_CLEAR_SEQUENCE);
		}
	}
	clearProgressInterval() {
		if (!this.progressInterval) return false;
		clearInterval(this.progressInterval);
		this.progressInterval = void 0;
		return true;
	}
};

/** Harness Settings namespace that persists SeekTTY-only visual preferences. */
const TUI_APPEARANCE_SETTINGS_NAMESPACE = "seektty-appearance";
/** Keep theme colors while inheriting the terminal's background effects. */
const DEFAULT_TUI_BACKGROUND_MODE = "theme";
/** First-run color scheme when no user override has been stored. */
const DEFAULT_TUI_THEME = "dark";
/** Default code pairing follows the active interface theme. */
const DEFAULT_TUI_CODE_THEME = "auto";
/** Maximum named themes accepted by one Settings document. */
const MAX_CUSTOM_THEMES = 32;
/** Maximum imported TextMate rules stored in one custom theme. */
const MAX_TEXTMATE_RULES = 4096;
/** Harness Settings namespace that persists SeekTTY interaction defaults. */
const TUI_BEHAVIOR_SETTINGS_NAMESPACE = "seektty-behavior";
/** Harness Settings namespace that persists composer prompt history with revision. */
const TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE = "seektty-composer-history";
/** Harness Settings namespace that persists the non-durable startup presentation. */
const TUI_WELCOME_SETTINGS_NAMESPACE = "seektty-welcome";
/** Maximum persisted custom rows and one literal value's terminal-safe length. */
const MAX_WELCOME_ROWS = 64;
const MAX_WELCOME_TEXT_LENGTH = 512;
/** Privacy-conscious first-run modules; Fastfetch is not invoked in custom mode. */
const DEFAULT_SAFE_FASTFETCH_MODULES = Object.freeze([
	"os",
	"kernel",
	"uptime",
	"cpu",
	"gpu",
	"memory",
	"shell",
	"terminal",
	"theme"
]);
/** First-run welcome page shown to new and existing Profiles without this namespace. */
const DEFAULT_TUI_WELCOME = Object.freeze({
	infoMode: "custom",
	mixedOrder: "custom-first",
	customRows: Object.freeze([
		Object.freeze({
			kind: "heading",
			text: "SeekTTY"
		}),
		Object.freeze({
			kind: "fact",
			fact: "seekttyVersion"
		}),
		Object.freeze({
			kind: "fact",
			fact: "workspace"
		}),
		Object.freeze({
			kind: "fact",
			fact: "model"
		}),
		Object.freeze({
			kind: "fact",
			fact: "reasoning"
		}),
		Object.freeze({
			kind: "fact",
			fact: "mode"
		}),
		Object.freeze({
			kind: "fact",
			fact: "permission"
		}),
		Object.freeze({
			kind: "fact",
			fact: "theme"
		})
	]),
	logo: Object.freeze({
		source: "builtin",
		colorMode: "original",
		largePath: "",
		compactPath: ""
	}),
	fastfetch: Object.freeze({
		source: "safe",
		modules: DEFAULT_SAFE_FASTFETCH_MODULES,
		configPath: ""
	})
});
/** Default wheel detents converted to transcript lines in the mouse controller. */
const DEFAULT_WHEEL_SCROLL_LINES = 3;
/** Inclusive upper bound for `wheelScrollLines`; also the per-frame accelerated cap. */
const MAX_WHEEL_SCROLL_LINES = 12;
/** First-run interaction defaults when no user override has been stored. */
const DEFAULT_TUI_BEHAVIOR = Object.freeze({
	toolCards: "collapsed",
	showReasoning: false,
	desktopNotifications: true,
	followTerminalTitle: true,
	composerHistoryLimit: 200,
	statusElapsed: true,
	clipboardFallback: "auto",
	toolOutputLineLimit: 200,
	diffContextLines: 3,
	dangerConfirmDefault: "cancel",
	mouseMode: "full",
	hoverFeedback: true,
	scrollbarVisibility: "always",
	copyOnSelect: true,
	wheelScrollLines: DEFAULT_WHEEL_SCROLL_LINES,
	wheelAcceleration: true,
	keyBindings: Object.freeze({})
});
/** Upper bound for persisted composer history entries. */
const MAX_COMPOSER_HISTORY = 1e4;
/** Upper bound for one expanded tool-output block; 0 disables folding. */
const MAX_TOOL_OUTPUT_LINE_LIMIT = 1e4;
/** Upper bound for unified-diff context lines around each change. */
const MAX_DIFF_CONTEXT_LINES = 100;
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
		super(`TUI_SETTINGS_CONFLICT ${JSON.stringify(namespace)} expected=${String(expected)} actual=${String(actual)}`);
		this.namespace = namespace;
		this.expected = expected;
		this.actual = actual;
		this.name = "TuiSettingsConflictError";
	}
};

/**
* Representative scopes used when deriving the compact role palette from an imported theme.
* These are selectors, not a replacement grammar: Shiki still owns language tokenization.
*/
const SYNTAX_ROLE_SCOPES = {
	comment: ["comment"],
	keyword: [
		"keyword.control",
		"keyword.other",
		"keyword",
		"storage.type",
		"storage.modifier"
	],
	string: [
		"string.quoted",
		"string.template",
		"string.unquoted",
		"string"
	],
	number: ["constant.numeric"],
	constant: [
		"constant.language",
		"constant.character",
		"constant.other",
		"constant",
		"variable.language"
	],
	function: [
		"entity.name.function",
		"support.function",
		"variable.function"
	],
	type: [
		"entity.name.type",
		"entity.name.class",
		"entity.name.interface",
		"entity.name.enum",
		"entity.name.struct",
		"entity.name.namespace",
		"support.type",
		"support.class"
	],
	variable: [
		"variable.other",
		"variable.language",
		"variable"
	],
	property: [
		"variable.other.property",
		"variable.other.object.property",
		"support.variable.property",
		"support.type.property-name"
	],
	parameter: ["variable.parameter"],
	operator: ["keyword.operator"],
	punctuation: ["punctuation"],
	tag: ["entity.name.tag"],
	attribute: [
		"entity.other.attribute-name",
		"meta.decorator",
		"meta.annotation"
	],
	regexp: ["string.regexp"]
};
function foreground(scope, color$1, fontStyle) {
	return {
		scope,
		foreground: color$1,
		...fontStyle === void 0 ? {} : { fontStyle }
	};
}
/**
* Build a complete, ordered TextMate theme from SeekTTY's compact syntax palette.
*
* The order is deliberately broad-to-specific. TextMate selector specificity remains
* authoritative, while equal-specificity special cases later in the list can refine
* a general role. Parent meta scopes are never colored on their own, which prevents
* a function-call container from swallowing argument, punctuation, and string colors.
*/
function visualTextMateRules(syntax, colors$1) {
	return [
		foreground(["comment", "punctuation.definition.comment"], syntax.comment),
		foreground([
			"punctuation",
			"meta.brace",
			"meta.delimiter",
			"punctuation.definition.tag",
			"punctuation.definition.string"
		], syntax.punctuation),
		foreground([
			"variable",
			"variable.other",
			"variable.language"
		], syntax.variable),
		foreground([
			"variable.other.property",
			"variable.other.object.property",
			"support.variable.property",
			"support.type.property-name",
			"meta.object-literal.key",
			"meta.mapping.key"
		], syntax.property),
		foreground(["variable.parameter", "meta.function.parameters variable"], syntax.parameter),
		foreground([
			"keyword",
			"keyword.control",
			"keyword.other",
			"storage.type",
			"storage.modifier"
		], syntax.keyword),
		foreground(["keyword.operator", "punctuation.separator.key-value"], syntax.operator),
		foreground([
			"string",
			"string.quoted",
			"string.template",
			"string.unquoted"
		], syntax.string),
		foreground(["constant.character.escape", "constant.other.placeholder"], syntax.constant),
		foreground([
			"string.regexp",
			"constant.other.character-class.regexp",
			"constant.character.escape.regexp",
			"keyword.operator.quantifier.regexp",
			"punctuation.definition.character-class.regexp"
		], syntax.regexp),
		foreground([
			"constant",
			"constant.language",
			"constant.character",
			"constant.other",
			"variable.language"
		], syntax.constant),
		foreground(["constant.numeric"], syntax.number),
		foreground([
			"entity.name.type",
			"entity.name.class",
			"entity.name.interface",
			"entity.name.enum",
			"entity.name.struct",
			"entity.name.union",
			"entity.name.namespace",
			"support.type",
			"support.class",
			"support.other.namespace",
			"storage.type.primitive"
		], syntax.type),
		foreground([
			"entity.name.function",
			"support.function",
			"variable.function",
			"meta.function-call entity.name.function",
			"meta.function-call variable.function"
		], syntax.function),
		foreground(["entity.name.tag"], syntax.tag),
		foreground([
			"entity.other.attribute-name",
			"entity.other.attribute-name.class",
			"entity.other.attribute-name.id",
			"meta.decorator",
			"meta.annotation",
			"punctuation.decorator"
		], syntax.attribute),
		foreground(["markup.heading", "entity.name.section"], syntax.keyword, ["bold"]),
		foreground(["markup.bold"], syntax.foreground, ["bold"]),
		foreground(["markup.italic"], syntax.foreground, ["italic"]),
		foreground(["markup.strikethrough"], syntax.foreground, ["strikethrough"]),
		foreground(["markup.inline.raw", "markup.fenced_code.block"], syntax.string),
		foreground(["markup.underline.link", "string.other.link"], syntax.function),
		foreground(["markup.quote", "punctuation.definition.quote"], syntax.comment),
		foreground(["markup.inserted", "punctuation.definition.inserted"], colors$1.success),
		foreground(["markup.deleted", "punctuation.definition.deleted"], colors$1.danger),
		foreground(["meta.diff.header", "meta.diff.range"], colors$1.accent)
	];
}

const LEGACY = {
	theme: {
		colorMode: "auto",
		backgroundFill: "terminal",
		terminalBackgroundSync: "theme"
	},
	terminal: {
		colorMode: "auto",
		backgroundFill: "terminal",
		terminalBackgroundSync: "off"
	},
	explicit: {
		colorMode: "auto",
		backgroundFill: "theme",
		terminalBackgroundSync: "theme"
	},
	foreground: {
		colorMode: "rgb",
		backgroundFill: "terminal",
		terminalBackgroundSync: "off"
	}
};
const RENDERING_VALUES = {
	colorMode: ["auto", "rgb"],
	backgroundFill: ["terminal", "theme"],
	terminalBackgroundSync: ["off", "theme"]
};
/** Do not materialize absent fields: old files retain their original meaning. */
function renderingOverrides(input) {
	const value = input;
	const result = {};
	for (const key of Object.keys(RENDERING_VALUES)) {
		if (value[key] === void 0) continue;
		if (!RENDERING_VALUES[key].includes(value[key])) throw new Error(ui(`SeekTTY 设置 ${key} 无效`, `Invalid SeekTTY setting ${key}`));
		result[key] = value[key];
	}
	return result;
}
function resolveRendering(appearance) {
	return {
		...LEGACY[appearance.backgroundMode ?? "theme"],
		...renderingOverrides(appearance)
	};
}
/** Adapt the background-protocol controller without coupling it to RGB encoding. */
function backgroundSyncMode(rendering$1) {
	if (rendering$1.terminalBackgroundSync === "off") return "foreground";
	return rendering$1.backgroundFill === "theme" ? "explicit" : "theme";
}

const UI_COLOR_KEYS = [
	"text",
	"muted",
	"border",
	"brand",
	"accent",
	"success",
	"warning",
	"danger",
	"canvas",
	"surface",
	"selection"
];
const SYNTAX_COLOR_KEYS = [
	"background",
	"foreground",
	"comment",
	"keyword",
	"string",
	"number",
	"constant",
	"function",
	"type",
	"variable",
	"property",
	"parameter",
	"operator",
	"punctuation",
	"tag",
	"attribute",
	"regexp"
];
const BUILT_IN_DARK_COLORS = {
	text: "#DDE2EE",
	muted: "#8993AA",
	border: "#34415F",
	brand: "#6682FF",
	accent: "#91A7FF",
	success: "#42C99A",
	warning: "#E5AA59",
	danger: "#F0717F",
	canvas: "#090E1B",
	surface: "#111827",
	selection: "#1D2B52"
};
const BUILT_IN_DARK_SYNTAX = {
	background: "#111827",
	foreground: "#DDE2EE",
	comment: "#8993AA",
	keyword: "#91A7FF",
	string: "#42C99A",
	number: "#E5AA59",
	constant: "#F0717F",
	function: "#7F9BFF",
	type: "#73D0FF",
	variable: "#DDE2EE",
	property: "#B4C2FF",
	parameter: "#E8ECF5",
	operator: "#91A7FF",
	punctuation: "#8993AA",
	tag: "#6682FF",
	attribute: "#E5AA59",
	regexp: "#F0717F"
};
const BUILT_IN_DARK = Object.freeze({
	id: "dark",
	get name() {
		return ui("DeepSeek 暗色", "DeepSeek dark");
	},
	tone: "dark",
	syntaxTone: "dark",
	source: "builtin",
	colors: BUILT_IN_DARK_COLORS,
	syntax: BUILT_IN_DARK_SYNTAX,
	tokenColors: visualTextMateRules(BUILT_IN_DARK_SYNTAX, BUILT_IN_DARK_COLORS)
});
const BUILT_IN_LIGHT_COLORS = {
	text: "#1D2433",
	muted: "#667085",
	border: "#C6D0E7",
	brand: "#3156D8",
	accent: "#415FC9",
	success: "#137A58",
	warning: "#925700",
	danger: "#C2384E",
	canvas: "#F6F8FD",
	surface: "#FFFFFF",
	selection: "#E2E9FF"
};
const BUILT_IN_LIGHT_SYNTAX = {
	background: "#FFFFFF",
	foreground: "#1D2433",
	comment: "#667085",
	keyword: "#3156D8",
	string: "#137A58",
	number: "#925700",
	constant: "#C2384E",
	function: "#415FC9",
	type: "#006A8E",
	variable: "#1D2433",
	property: "#3F55A8",
	parameter: "#313B50",
	operator: "#3156D8",
	punctuation: "#667085",
	tag: "#3156D8",
	attribute: "#925700",
	regexp: "#C2384E"
};
const BUILT_IN_LIGHT = Object.freeze({
	id: "light",
	get name() {
		return ui("DeepSeek 亮色", "DeepSeek light");
	},
	tone: "light",
	syntaxTone: "light",
	source: "builtin",
	colors: BUILT_IN_LIGHT_COLORS,
	syntax: BUILT_IN_LIGHT_SYNTAX,
	tokenColors: visualTextMateRules(BUILT_IN_LIGHT_SYNTAX, BUILT_IN_LIGHT_COLORS)
});
/** Immutable built-in DeepSeek themes. */
const BUILT_IN_THEMES = Object.freeze({
	dark: BUILT_IN_DARK,
	light: BUILT_IN_LIGHT
});
function clamp$1(value, min = 0, max = 1) {
	return Math.min(max, Math.max(min, value));
}
function byte(value) {
	return Math.round(clamp$1(value, 0, 255));
}
function parseChannel(value) {
	const trimmed = value.trim();
	if (trimmed.endsWith("%")) {
		const percent = Number(trimmed.slice(0, -1));
		return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent * 2.55 : void 0;
	}
	const channel = Number(trimmed);
	return Number.isFinite(channel) && channel >= 0 && channel <= 255 ? channel : void 0;
}
function parseAlpha(value) {
	const trimmed = value.trim();
	if (trimmed.endsWith("%")) {
		const percent = Number(trimmed.slice(0, -1));
		return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent / 100 : void 0;
	}
	const alpha = Number(trimmed);
	return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? alpha : void 0;
}
function parseHex(value) {
	const match = /^#([0-9A-Fa-f]{3,8})$/u.exec(value.trim());
	if (match === null) return void 0;
	const digits = match[1] ?? "";
	if (![
		3,
		4,
		6,
		8
	].includes(digits.length)) return void 0;
	const expanded = digits.length <= 4 ? [...digits].map((character) => `${character}${character}`).join("") : digits;
	return {
		red: Number.parseInt(expanded.slice(0, 2), 16),
		green: Number.parseInt(expanded.slice(2, 4), 16),
		blue: Number.parseInt(expanded.slice(4, 6), 16),
		alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
	};
}
function parseRgbFunction(value) {
	const match = /^rgba?\((.*)\)$/iu.exec(value.trim());
	if (match === null) return void 0;
	const slash = (match[1] ?? "").split("/");
	if (slash.length > 2) return void 0;
	const channelPart = slash[0]?.trim() ?? "";
	const commaSeparated = channelPart.includes(",");
	const channels = commaSeparated ? channelPart.split(",").map((part) => part.trim()) : channelPart.split(/\s+/u).filter(Boolean);
	let alphaText = slash[1]?.trim();
	if (commaSeparated && channels.length === 4 && alphaText === void 0) alphaText = channels.pop();
	if (channels.length !== 3) return void 0;
	const red = parseChannel(channels[0] ?? "");
	const green = parseChannel(channels[1] ?? "");
	const blue = parseChannel(channels[2] ?? "");
	const alpha = alphaText === void 0 ? 1 : parseAlpha(alphaText);
	if (red === void 0 || green === void 0 || blue === void 0 || alpha === void 0) return void 0;
	return {
		red,
		green,
		blue,
		alpha
	};
}
function parseRgba(value) {
	return parseHex(value) ?? parseRgbFunction(value);
}
function hexOf(rgb$1) {
	const component = (value) => byte(value).toString(16).padStart(2, "0").toUpperCase();
	return `#${component(rgb$1.red)}${component(rgb$1.green)}${component(rgb$1.blue)}`;
}
/**
* Normalize one opaque HEX or RGB color for durable Settings storage.
* @param value - user-entered color code.
* @returns uppercase six-digit HEX.
*/
function normalizeThemeColor(value) {
	const parsed = parseRgba(value);
	if (parsed === void 0 || parsed.alpha !== 1) throw new Error(ui(`颜色 ${JSON.stringify(value)} 必须是无透明度的 HEX 或 RGB`, `Color ${JSON.stringify(value)} must be opaque HEX or RGB`));
	return hexOf(parsed);
}
/**
* Normalize a VS Code color, compositing its optional alpha over an opaque background.
* @param value - VS Code HEX/RGB color value.
* @param background - opaque fallback layer used for alpha colors.
* @returns uppercase six-digit HEX.
*/
function normalizeThemeColorOn(value, background$1) {
	const parsed = parseRgba(value);
	if (parsed === void 0) throw new Error(ui(`颜色 ${JSON.stringify(value)} 不是有效的 HEX 或 RGB`, `Color ${JSON.stringify(value)} is not valid HEX or RGB`));
	if (parsed.alpha === 1) return hexOf(parsed);
	const base = rgbOf(normalizeThemeColor(background$1));
	return hexOf({
		red: parsed.red * parsed.alpha + base.red * (1 - parsed.alpha),
		green: parsed.green * parsed.alpha + base.green * (1 - parsed.alpha),
		blue: parsed.blue * parsed.alpha + base.blue * (1 - parsed.alpha)
	});
}
function rgbOf(color$1) {
	const parsed = parseRgba(color$1);
	if (parsed === void 0) throw new Error(ui(`颜色 ${JSON.stringify(color$1)} 无效`, `Color ${JSON.stringify(color$1)} is invalid`));
	return parsed;
}
function linearChannel(channel) {
	const value = channel / 255;
	return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
}
function gammaChannel(channel) {
	const value = clamp$1(channel);
	return 255 * (value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055);
}
function luminance(color$1) {
	const value = rgbOf(color$1);
	return .2126 * linearChannel(value.red) + .7152 * linearChannel(value.green) + .0722 * linearChannel(value.blue);
}
/**
* WCAG contrast ratio for two opaque colors.
* @param left - first normalized or parseable color.
* @param right - second normalized or parseable color.
* @returns ratio from 1 through 21.
*/
function themeContrast(left, right) {
	const first = luminance(left);
	const second = luminance(right);
	return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}
function oklabOf(color$1) {
	const rgb$1 = rgbOf(color$1);
	const red = linearChannel(rgb$1.red);
	const green = linearChannel(rgb$1.green);
	const blue = linearChannel(rgb$1.blue);
	const l = .4122214708 * red + .5363325363 * green + .0514459929 * blue;
	const m = .2119034982 * red + .6806995451 * green + .1073969566 * blue;
	const s = .0883024619 * red + .2817188376 * green + .6299787005 * blue;
	const lRoot = Math.cbrt(l);
	const mRoot = Math.cbrt(m);
	const sRoot = Math.cbrt(s);
	return {
		lightness: .2104542553 * lRoot + .793617785 * mRoot - .0040720468 * sRoot,
		a: 1.9779984951 * lRoot - 2.428592205 * mRoot + .4505937099 * sRoot,
		b: .0259040371 * lRoot + .7827717662 * mRoot - .808675766 * sRoot
	};
}
function colorOfOklab(value) {
	const lRoot = value.lightness + .3963377774 * value.a + .2158037573 * value.b;
	const mRoot = value.lightness - .1055613458 * value.a - .0638541728 * value.b;
	const sRoot = value.lightness - .0894841775 * value.a - 1.291485548 * value.b;
	const l = lRoot ** 3;
	const m = mRoot ** 3;
	const s = sRoot ** 3;
	return hexOf({
		red: gammaChannel(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s),
		green: gammaChannel(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s),
		blue: gammaChannel(-.0041960863 * l - .7034186147 * m + 1.707614701 * s)
	});
}
function oklchOf(color$1) {
	const value = oklabOf(color$1);
	const hue = Math.atan2(value.b, value.a) * 180 / Math.PI;
	return {
		lightness: value.lightness,
		chroma: Math.hypot(value.a, value.b),
		hue: (hue + 360) % 360
	};
}
function mix(left, right, amount) {
	const first = oklabOf(left);
	const second = oklabOf(right);
	const ratio = clamp$1(amount);
	return colorOfOklab({
		lightness: first.lightness + (second.lightness - first.lightness) * ratio,
		a: first.a + (second.a - first.a) * ratio,
		b: first.b + (second.b - first.b) * ratio
	});
}
/** Derive a readable foreground without mutating the saved palette. */
function ensureContrast(color$1, background$1, minimum) {
	const normalized = normalizeThemeColor(color$1);
	if (themeContrast(normalized, background$1) >= minimum) return normalized;
	const targets = ["#000000", "#FFFFFF"];
	let best;
	for (const target of targets) {
		if (themeContrast(target, background$1) < minimum) continue;
		let low = 0;
		let high = 1;
		for (let index = 0; index < 18; index += 1) {
			const middle = (low + high) / 2;
			if (themeContrast(mix(normalized, target, middle), background$1) >= minimum) high = middle;
			else low = middle;
		}
		const candidate = {
			color: mix(normalized, target, high),
			amount: high
		};
		if (best === void 0 || candidate.amount < best.amount) best = candidate;
	}
	return best?.color ?? (themeContrast("#000000", background$1) >= themeContrast("#FFFFFF", background$1) ? "#000000" : "#FFFFFF");
}
function hueDistance(left, right) {
	const distance = Math.abs(left - right) % 360;
	return Math.min(distance, 360 - distance);
}
function statusColor$1(colors$1, targetHue, fallback, background$1) {
	const candidate = colors$1.map((color$1) => ({
		color: color$1,
		value: oklchOf(color$1)
	})).filter((entry) => entry.value.chroma >= .035).sort((left, right) => hueDistance(left.value.hue, targetHue) - hueDistance(right.value.hue, targetHue))[0];
	return ensureContrast(candidate !== void 0 && hueDistance(candidate.value.hue, targetHue) <= 75 ? candidate.color : fallback, background$1, 3);
}
function accentColors(colors$1, background$1, foreground$1) {
	const selected = colors$1.filter((color$1) => color$1 !== background$1 && color$1 !== foreground$1).map((color$1) => ({
		color: color$1,
		value: oklchOf(color$1),
		contrast: themeContrast(color$1, background$1)
	})).sort((left, right) => right.value.chroma * Math.min(right.contrast, 7) - left.value.chroma * Math.min(left.contrast, 7)).map((entry) => ensureContrast(entry.color, background$1, 3));
	const fallbacks = [
		"#6682FF",
		"#42C99A",
		"#E5AA59",
		"#F0717F",
		"#73D0FF"
	].map((color$1) => ensureContrast(color$1, background$1, 3));
	return [...new Set([...selected, ...fallbacks])];
}
function generatedSyntax(background$1, foreground$1, muted, accents) {
	const value = (index) => accents[index % accents.length] ?? foreground$1;
	return {
		background: background$1,
		foreground: foreground$1,
		comment: ensureContrast(muted, background$1, 3),
		keyword: value(0),
		string: value(1),
		number: value(2),
		constant: value(3),
		function: value(4),
		type: value(5),
		variable: foreground$1,
		property: value(6),
		parameter: mix(foreground$1, value(0), .18),
		operator: value(0),
		punctuation: ensureContrast(muted, background$1, 3),
		tag: value(3),
		attribute: value(2),
		regexp: value(4)
	};
}
function candidateTheme(id, name, colors$1, tone) {
	const ordered = [...colors$1].sort((left, right) => luminance(left) - luminance(right));
	const canvas = tone === "dark" ? ordered[0] ?? "#000000" : ordered.at(-1) ?? "#FFFFFF";
	const text = ensureContrast(ordered.filter((color$1) => color$1 !== canvas).sort((left, right) => themeContrast(right, canvas) - themeContrast(left, canvas))[0] ?? (tone === "dark" ? "#FFFFFF" : "#000000"), canvas, 4.5);
	const accents = accentColors(colors$1, canvas, text);
	const brand = accents[0] ?? text;
	const brandHue = oklchOf(brand).hue;
	const accent = accents.find((color$1) => hueDistance(oklchOf(color$1).hue, brandHue) >= 35) ?? accents[1] ?? brand;
	const surface = mix(canvas, text, tone === "dark" ? .075 : .045);
	const selection = mix(canvas, brand, tone === "dark" ? .28 : .18);
	const muted = ensureContrast(mix(text, canvas, .42), canvas, 3);
	const border = ensureContrast(mix(text, canvas, .68), canvas, 1.5);
	const success = statusColor$1(colors$1, 150, "#2FBF8F", canvas);
	const warning = statusColor$1(colors$1, 75, "#D99B3D", canvas);
	const danger = statusColor$1(colors$1, 20, "#E66476", canvas);
	const syntaxAccents = accentColors(colors$1, surface, text);
	const theme = {
		id,
		name,
		tone,
		source: "palette",
		colors: {
			text,
			muted,
			border,
			brand,
			accent,
			success,
			warning,
			danger,
			canvas,
			surface,
			selection
		},
		syntax: generatedSyntax(surface, text, muted, syntaxAccents),
		tokenColors: []
	};
	const paletteContrast = colors$1.reduce((sum, color$1) => sum + themeContrast(color$1, canvas), 0) / colors$1.length;
	return {
		theme,
		score: themeContrast(text, canvas) * 2 + themeContrast(brand, canvas) + paletteContrast
	};
}
/**
* Parse a whitespace/comma separated HEX/RGB palette.
* @param input - pasted palette text.
* @returns 3 through 16 unique normalized colors.
*/
function parseThemePalette(input) {
	const matches = input.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)/giu) ?? [];
	const colors$1 = [...new Set(matches.map(normalizeThemeColor))];
	const residue = matches.reduce((value, match) => value.replace(match, " "), input).replace(/[\s,;|]+/gu, "");
	if (residue !== "") throw new Error(ui(`无法识别的配色内容 ${JSON.stringify(residue.slice(0, 40))}`, `Unrecognized palette text ${JSON.stringify(residue.slice(0, 40))}`));
	if (colors$1.length < 3 || colors$1.length > 16) throw new Error(ui("配色需要 3–16 个不重复的 HEX/RGB 颜色", "A palette requires 3–16 unique HEX/RGB colors"));
	return colors$1;
}
/**
* Generate both contrast directions from an unlabelled color palette.
* @param id - stable custom-theme id.
* @param name - user-visible theme name.
* @param input - pasted palette text.
* @returns dark/light candidates and the higher-scoring recommendation.
*/
function generateThemeCandidates(id, name, input) {
	const colors$1 = parseThemePalette(input);
	const dark = candidateTheme(id, name, colors$1, "dark");
	const light = candidateTheme(id, name, colors$1, "light");
	return {
		dark: dark.theme,
		light: light.theme,
		recommended: dark.score >= light.score ? "dark" : "light"
	};
}
/**
* Create a stable ASCII id from a user-visible theme name.
* @param name - display name.
* @returns lowercase slug or deterministic hash fallback.
*/
function themeIdFromName(name) {
	const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48).replace(/-+$/gu, "");
	if (slug !== "") return slug;
	let hash = 2166136261;
	for (const character of name) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return `theme-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function recordOf$1(value, label) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(ui(`${label} 必须是对象`, `${label} must be an object`));
	return value;
}
function stringOf(record, key, label) {
	const value = record[key];
	if (typeof value !== "string") throw new Error(ui(`${label}.${key} 必须是字符串`, `${label}.${key} must be a string`));
	return value;
}
function colorRecord(value, keys, label) {
	const record = recordOf$1(value, label);
	return Object.fromEntries(keys.map((key) => [key, normalizeThemeColor(stringOf(record, key, label))]));
}
const TOKEN_FONT_STYLES = new Set([
	"bold",
	"italic",
	"underline",
	"strikethrough"
]);
function textMateRules(value) {
	if (value === void 0) return [];
	if (!Array.isArray(value) || value.length > MAX_TEXTMATE_RULES) throw new Error(ui(`customThemes[].tokenColors 最多包含 ${String(MAX_TEXTMATE_RULES)} 条规则`, `customThemes[].tokenColors can contain at most ${String(MAX_TEXTMATE_RULES)} rules`));
	return value.map((entry, index) => {
		const label = `customThemes[].tokenColors[${String(index)}]`;
		const record = recordOf$1(entry, label);
		if (!Array.isArray(record.scope) || record.scope.length === 0 || record.scope.length > 64) throw new Error(ui(`${label}.scope 必须包含 1–64 个 TextMate scope`, `${label}.scope must contain 1–64 TextMate scopes`));
		const scope = [...new Set(record.scope.map((item) => {
			if (typeof item !== "string" || item === "" || item.length > 256 || /[\u0000-\u001F\u007F-\u009F]/u.test(item)) throw new Error(ui(`${label}.scope 包含无效值`, `${label}.scope contains an invalid value`));
			return item;
		}))];
		const foreground$1 = record.foreground === void 0 ? void 0 : normalizeThemeColor(stringOf(record, "foreground", label));
		const background$1 = record.background === void 0 ? void 0 : normalizeThemeColor(stringOf(record, "background", label));
		let fontStyle;
		if (record.fontStyle !== void 0) {
			if (!Array.isArray(record.fontStyle)) throw new Error(ui(`${label}.fontStyle 必须是数组`, `${label}.fontStyle must be an array`));
			fontStyle = [...new Set(record.fontStyle.map((style) => {
				if (typeof style !== "string" || !TOKEN_FONT_STYLES.has(style)) throw new Error(ui(`${label}.fontStyle 包含不支持的样式`, `${label}.fontStyle contains an unsupported style`));
				return style;
			}))];
		}
		if (foreground$1 === void 0 && background$1 === void 0 && fontStyle === void 0) throw new Error(ui(`${label} 没有颜色或代码字体样式`, `${label} has no color or code font style`));
		return {
			scope,
			...foreground$1 === void 0 ? {} : { foreground: foreground$1 },
			...background$1 === void 0 ? {} : { background: background$1 },
			...fontStyle === void 0 ? {} : { fontStyle }
		};
	});
}
/**
* Validate and normalize one custom theme crossing the Settings boundary.
* @param value - untrusted durable value.
* @returns normalized custom theme.
*/
function normalizeCustomTheme(value) {
	const record = recordOf$1(value, "customThemes[]");
	const id = stringOf(record, "id", "customThemes[]");
	const name = stringOf(record, "name", "customThemes[]").trim();
	const tone = stringOf(record, "tone", "customThemes[]");
	const source = stringOf(record, "source", "customThemes[]");
	if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u.test(id)) throw new Error(ui(`自定义主题 id ${JSON.stringify(id)} 无效`, `Custom theme id ${JSON.stringify(id)} is invalid`));
	if (name === "" || name.length > 80) throw new Error(ui("自定义主题名称必须为 1–80 个字符", "Custom theme name must contain 1–80 characters"));
	if (/[\u0000-\u001F\u007F-\u009F]/u.test(name)) throw new Error(ui("自定义主题名称不能包含终端控制字符", "Custom theme name cannot contain terminal control characters"));
	if (tone !== "dark" && tone !== "light") throw new Error(ui(`自定义主题 tone ${JSON.stringify(tone)} 无效`, `Custom theme tone ${JSON.stringify(tone)} is invalid`));
	if (source !== "manual" && source !== "palette" && source !== "vscode") throw new Error(ui(`自定义主题 source ${JSON.stringify(source)} 无效`, `Custom theme source ${JSON.stringify(source)} is invalid`));
	return {
		id,
		name,
		tone,
		source,
		colors: colorRecord(record.colors, UI_COLOR_KEYS, "customThemes[].colors"),
		syntax: colorRecord(record.syntax, SYNTAX_COLOR_KEYS, "customThemes[].syntax"),
		tokenColors: textMateRules(record.tokenColors)
	};
}
/**
* Validate one complete appearance value, accepting legacy values without customThemes.
* @param value - untrusted Harness Settings value.
* @returns normalized appearance settings.
*/
function normalizeAppearance(value) {
	const record = recordOf$1(value, "SeekTTY appearance");
	const backgroundMode = normalizeBackgroundMode(record.backgroundMode);
	const rawTheme = stringOf(record, "theme", "SeekTTY appearance");
	if (!/^(?:dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u.test(rawTheme)) throw new Error(ui(`SeekTTY 主题 ${JSON.stringify(rawTheme)} 不受支持`, `SeekTTY theme ${JSON.stringify(rawTheme)} is not supported`));
	const rawThemes = record.customThemes ?? [];
	if (!Array.isArray(rawThemes) || rawThemes.length > MAX_CUSTOM_THEMES) throw new Error(ui(`SeekTTY 最多保存 ${String(MAX_CUSTOM_THEMES)} 个自定义主题`, `SeekTTY can store at most ${String(MAX_CUSTOM_THEMES)} custom themes`));
	const customThemes = rawThemes.map(normalizeCustomTheme);
	const ids = /* @__PURE__ */ new Set();
	const names = /* @__PURE__ */ new Set();
	for (const theme$1 of customThemes) {
		const foldedName = theme$1.name.toLowerCase();
		if (ids.has(theme$1.id)) throw new Error(ui(`自定义主题 id ${JSON.stringify(theme$1.id)} 重复`, `Custom theme id ${JSON.stringify(theme$1.id)} is duplicated`));
		if (names.has(foldedName)) throw new Error(ui(`自定义主题名称 ${JSON.stringify(theme$1.name)} 重复`, `Custom theme name ${JSON.stringify(theme$1.name)} is duplicated`));
		ids.add(theme$1.id);
		names.add(foldedName);
	}
	const theme = rawTheme;
	if (theme.startsWith("custom:") && !ids.has(theme.slice(7))) throw new Error(ui(`当前自定义主题 ${JSON.stringify(theme)} 不存在`, `The current custom theme ${JSON.stringify(theme)} does not exist`));
	const rawCodeTheme = record.codeTheme === void 0 ? DEFAULT_TUI_CODE_THEME : stringOf(record, "codeTheme", "SeekTTY appearance");
	if (!/^(?:auto|dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u.test(rawCodeTheme)) throw new Error(ui(`SeekTTY 代码主题 ${JSON.stringify(rawCodeTheme)} 不受支持`, `SeekTTY code theme ${JSON.stringify(rawCodeTheme)} is not supported`));
	const codeTheme = rawCodeTheme;
	if (codeTheme.startsWith("custom:") && !ids.has(codeTheme.slice(7))) throw new Error(ui(`当前自定义代码主题 ${JSON.stringify(codeTheme)} 不存在`, `The current custom code theme ${JSON.stringify(codeTheme)} does not exist`));
	return {
		theme,
		codeTheme,
		backgroundMode,
		customThemes,
		...renderingOverrides(record)
	};
}
/** Validate the independent canvas policy, including legacy settings without it. */
function normalizeBackgroundMode(value) {
	if (value === void 0) return DEFAULT_TUI_BACKGROUND_MODE;
	if (value === "theme" || value === "terminal" || value === "explicit" || value === "foreground") return value;
	throw new Error(ui(`SeekTTY 背景模式 ${JSON.stringify(value)} 不受支持`, `SeekTTY background mode ${JSON.stringify(value)} is not supported`));
}
/**
* Resolve the active or requested theme definition.
* @param appearance - validated appearance value.
* @param requested - optional selection override.
* @returns complete renderer-ready theme.
*/
function resolveTheme(appearance, requested = appearance.theme) {
	if (requested === "dark" || requested === "light") return BUILT_IN_THEMES[requested];
	const id = requested.slice(7);
	const theme = appearance.customThemes.find((candidate) => candidate.id === id);
	if (theme === void 0) throw new Error(ui(`自定义主题 ${JSON.stringify(id)} 不存在`, `Custom theme ${JSON.stringify(id)} does not exist`));
	return {
		...theme,
		id: requested,
		syntaxTone: theme.tone
	};
}
/**
* Resolve the independent code theme, including automatic interface-theme pairing.
* @param appearance - validated appearance value.
* @param requested - optional code-theme override.
* @param interfaceTheme - interface selection used when requested is auto.
* @returns complete source theme whose syntax fields should render code regions.
*/
function resolveCodeTheme(appearance, requested = appearance.codeTheme, interfaceTheme = appearance.theme) {
	return resolveTheme(appearance, requested === "auto" ? interfaceTheme : requested);
}
/**
* Combine interface colors with an independently resolved code theme.
* @param interfaceTheme - source of terminal chrome colors.
* @param codeTheme - source of syntax colors and TextMate rules.
* @returns renderer-ready theme containing both selections.
*/
function composeResolvedTheme(interfaceTheme, codeTheme) {
	return {
		...interfaceTheme,
		syntaxTone: codeTheme.syntaxTone,
		syntax: codeTheme.syntax,
		tokenColors: codeTheme.tokenColors
	};
}
/**
* Resolve the active interface and code selections into one renderer value.
* @param appearance - validated appearance value.
* @returns renderer-ready theme with independent interface and code colors.
*/
function resolveAppearanceTheme(appearance) {
	return composeResolvedTheme(resolveTheme(appearance), resolveCodeTheme(appearance));
}
/**
* Report legibility concerns without silently altering manual colors.
* @param theme - complete theme to inspect.
* @returns concise warnings shown before applying.
*/
function themeContrastWarnings(theme) {
	const warnings = [];
	if (themeContrast(theme.colors.text, theme.colors.canvas) < 4.5) warnings.push(ui("正文与画布对比度低于 4.5:1", "Text-to-canvas contrast is below 4.5:1"));
	if (themeContrast(theme.colors.muted, theme.colors.canvas) < 3) warnings.push(ui("弱化文字与画布对比度低于 3:1", "Muted-text-to-canvas contrast is below 3:1"));
	if (themeContrast(theme.syntax.foreground, theme.syntax.background) < 4.5) warnings.push(ui("代码正文与代码背景对比度低于 4.5:1", "Code-text-to-background contrast is below 4.5:1"));
	const lowTokens = SYNTAX_COLOR_KEYS.filter((key) => key !== "background" && key !== "foreground").filter((key) => themeContrast(theme.syntax[key], theme.syntax.background) < 3);
	if (lowTokens.length > 0) warnings.push(ui(`代码颜色对比度偏低：${lowTokens.join("、")}`, `Low code-color contrast: ${lowTokens.join(", ")}`));
	const lowImported = theme.tokenColors.filter((rule) => rule.foreground !== void 0 && themeContrast(rule.foreground, rule.background ?? theme.syntax.background) < 3).length;
	if (lowImported > 0) warnings.push(ui(`${String(lowImported)} 条导入的 TextMate 规则对比度低于 3:1`, `${String(lowImported)} imported TextMate rule(s) have contrast below 3:1`));
	return warnings;
}
/**
* Copy a built-in or custom resolved theme into an editable custom definition.
* @param theme - source theme.
* @param id - new custom id.
* @param name - new display name.
* @returns independent manual theme value.
*/
function editableTheme(theme, id, name) {
	return {
		id,
		name,
		tone: theme.tone,
		source: theme.source === "vscode" ? "vscode" : "manual",
		colors: { ...theme.colors },
		syntax: { ...theme.syntax },
		tokenColors: theme.tokenColors.map((rule) => ({
			...rule,
			scope: [...rule.scope],
			...rule.fontStyle === void 0 ? {} : { fontStyle: [...rule.fontStyle] }
		}))
	};
}

const DEFAULT_FG = "\x1B[39m";
const SGR = /\u001B\[([0-9;:]*)m/gu;
let cachedBackground;
const colors = /* @__PURE__ */ new Map();
function readableForeground(rgb$1, background$1) {
	if (rgb$1 === void 0 || background$1 === void 0) return DEFAULT_FG;
	if (background$1 !== cachedBackground) {
		colors.clear();
		cachedBackground = background$1;
	}
	const cached = colors.get(rgb$1);
	if (cached !== void 0) return cached;
	const hex = ensureContrast(rgb$1, background$1, 4.5);
	const sequence = `\u001B[38;2;${[
		1,
		3,
		5
	].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(";")}m`;
	if (colors.size >= 256) colors.clear();
	colors.set(rgb$1, sequence);
	return sequence;
}
/**
* Adapt already-styled canvas rows, including cached Markdown foregrounds.
* Track explicit background islands so code, panels and selections retain their
* original foregrounds. Only SGR is interpreted; all text and geometry survive.
*/
function readableCanvas(text, background$1) {
	let explicitBackground = false;
	let foreground$1 = DEFAULT_FG;
	let rgb$1;
	return text.replace(SGR, (sequence, parameters) => {
		const fields = parameters === "" ? ["0"] : parameters.split(";");
		let changed = false;
		for (let index = 0; index < fields.length; index += 1) {
			const field = fields[index] ?? "0";
			const parts = field.split(":");
			const code = Number(parts[0]);
			if (code === 0) {
				foreground$1 = DEFAULT_FG;
				rgb$1 = void 0;
				explicitBackground = false;
				changed = true;
			} else if (code === 38 || code === 48 || code === 58) {
				const colon = parts.length > 1;
				const mode = Number(colon ? parts[1] : fields[index + 1]);
				const count = mode === 2 ? 3 : mode === 5 ? 1 : 0;
				const values = colon ? parts.slice(-count) : fields.slice(index + 2, index + 2 + count);
				const colorFields = colon ? field : fields.slice(index, index + 2 + count).join(";");
				if (!colon) index += 1 + count;
				if (code === 38) {
					foreground$1 = `\u001B[${colorFields}m`;
					rgb$1 = mode === 2 && values.length === 3 && values.every((value) => /^\d+$/u.test(value) && Number(value) <= 255) ? `#${values.map((value) => Number(value).toString(16).padStart(2, "0")).join("")}` : void 0;
					changed = true;
				} else if (code === 48) {
					explicitBackground = true;
					changed = true;
				}
			} else if (code === 39 || code >= 30 && code <= 37 || code >= 90 && code <= 97) {
				foreground$1 = `\u001B[${field}m`;
				rgb$1 = void 0;
				changed = true;
			} else if (code === 49 || code >= 40 && code <= 47 || code >= 100 && code <= 107) {
				explicitBackground = code !== 49;
				changed = true;
			}
		}
		return changed ? sequence + (explicitBackground ? foreground$1 : readableForeground(rgb$1, background$1)) : sequence;
	});
}

const RESET = "\x1B[0m";
const ESC = 27;
const CSI$1 = 155;
const ST = 156;
const OSC$1 = 157;
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
	OSC$1,
	158,
	159
]);
const SGR_PARAMETERS = /^[0-9;:]*$/u;
const STATUS_COLORS = {
	dark: {
		running: semanticColor("#22D3EE"),
		waiting: semanticColor("#FACC15"),
		failed: semanticColor("#F87171")
	},
	light: {
		running: semanticColor("#0C6478"),
		waiting: semanticColor("#854D0E"),
		failed: semanticColor("#B91C1C")
	}
};
function semanticColor(value) {
	const match = /^#([0-9A-Fa-f]{6})$/u.exec(value);
	if (match === null) throw new Error(ui(`主题颜色 ${JSON.stringify(value)} 无效`, `Theme color ${JSON.stringify(value)} is invalid`));
	const digits = match[1] ?? "";
	return { rgb: [
		Number.parseInt(digits.slice(0, 2), 16),
		Number.parseInt(digits.slice(2, 4), 16),
		Number.parseInt(digits.slice(4, 6), 16)
	] };
}
function mixColor(left, right, amount) {
	const value = (index) => Math.round((left.rgb[index] ?? 0) + ((right.rgb[index] ?? 0) - (left.rgb[index] ?? 0)) * amount);
	return { rgb: [
		value(0),
		value(1),
		value(2)
	] };
}
function runtimePalette(theme) {
	const brand = semanticColor(theme.colors.brand);
	const accent = semanticColor(theme.colors.accent);
	const border = semanticColor(theme.colors.border);
	const pulse = [
		border,
		mixColor(border, brand, .3),
		mixColor(border, brand, .62),
		brand,
		accent,
		brand,
		mixColor(border, brand, .62),
		mixColor(border, brand, .3)
	];
	const statuses = STATUS_COLORS[theme.tone];
	return {
		text: semanticColor(theme.colors.text),
		brand,
		accent,
		pulse,
		muted: semanticColor(theme.colors.muted),
		border,
		success: semanticColor(theme.colors.success),
		warning: semanticColor(theme.colors.warning),
		danger: semanticColor(theme.colors.danger),
		statusRunning: statuses.running,
		statusWaiting: statuses.waiting,
		statusFailed: statuses.failed,
		canvas: semanticColor(theme.colors.canvas),
		surface: semanticColor(theme.colors.surface),
		selection: semanticColor(theme.colors.selection),
		codeBackground: semanticColor(theme.syntax.background),
		codeForeground: semanticColor(theme.syntax.foreground)
	};
}
let selectedTheme = BUILT_IN_THEMES.dark;
let rendering = resolveRendering({});
let palette = runtimePalette(selectedTheme);
let codeHighlighter;
let codeStreamFactory;
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
	let keptStart = 0;
	const controls = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/gu;
	for (let match = controls.exec(text); match !== null; match = controls.exec(text)) {
		let index = match.index;
		const code = text.charCodeAt(index);
		let end = index + 1;
		if (code === ESC) {
			const next = text.charCodeAt(index + 1);
			if (next === 91) {
				end = csiEnd(text, index + 2);
				const final = text.charCodeAt(end - 1);
				const parameters = text.slice(index + 2, Math.max(index + 2, end - 1));
				if (final === 109 && SGR_PARAMETERS.test(parameters)) {
					controls.lastIndex = end;
					continue;
				}
			} else if (CONTROL_STRING_INTRODUCERS.has(next)) end = controlStringEnd(text, index + 2);
			else if (next >= 32 && next <= 47) {
				end = index + 2;
				while (text.charCodeAt(end) >= 32 && text.charCodeAt(end) <= 47) end += 1;
				if (text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 126) end += 1;
			} else end = index + (Number.isNaN(next) ? 1 : 2);
		} else if (code === CSI$1) end = csiEnd(text, index + 1);
		else if (C1_CONTROL_STRING_INTRODUCERS.has(code)) end = controlStringEnd(text, index + 1);
		escaped += text.slice(keptStart, index);
		keptStart = end;
		controls.lastIndex = end;
	}
	return escaped + text.slice(keptStart);
}
/**
* Detect terminal foreground-color depth without changing the terminal background.
* @param env - environment to inspect; injectable for platform-neutral tests.
* @returns 0 for plain text, 1 for ANSI-16, 2 for xterm-256, or 3 for truecolor.
*/
function terminalColorLevel(env = process.env) {
	if (env === process.env && workerColorLevel !== void 0) return workerColorLevel;
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
/** Rendering policy is independent of capability detection (notably OSC 11 support). */
function renderingColorLevel(env = process.env) {
	const detected = terminalColorLevel(env);
	return detected === 0 || rendering.colorMode !== "rgb" ? detected : 3;
}
function rgb(red, green, blue) {
	return { rgb: [
		red,
		green,
		blue
	] };
}
const ANSI_COLORS = [
	rgb(0, 0, 0),
	rgb(205, 49, 49),
	rgb(13, 188, 121),
	rgb(229, 229, 16),
	rgb(36, 114, 200),
	rgb(188, 63, 188),
	rgb(17, 168, 205),
	rgb(229, 229, 229),
	rgb(102, 102, 102),
	rgb(241, 76, 76),
	rgb(35, 209, 139),
	rgb(245, 245, 67),
	rgb(59, 142, 234),
	rgb(214, 112, 214),
	rgb(41, 184, 219),
	rgb(255, 255, 255)
];
function xtermColors() {
	const output = [...ANSI_COLORS];
	const levels = [
		0,
		95,
		135,
		175,
		215,
		255
	];
	for (const red of levels) for (const green of levels) for (const blue of levels) output.push(rgb(red, green, blue));
	for (let index = 0; index < 24; index += 1) {
		const channel = 8 + index * 10;
		output.push(rgb(channel, channel, channel));
	}
	return output;
}
const XTERM_COLORS = xtermColors();
function nearestColor(entry, candidates) {
	let selected = 0;
	let selectedDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < candidates.length; index += 1) {
		const candidate = candidates[index];
		if (candidate === void 0) continue;
		const red = (entry.rgb[0] - candidate.rgb[0]) * .3;
		const green = (entry.rgb[1] - candidate.rgb[1]) * .59;
		const blue = (entry.rgb[2] - candidate.rgb[2]) * .11;
		const distance = red * red + green * green + blue * blue;
		if (distance >= selectedDistance) continue;
		selected = index;
		selectedDistance = distance;
	}
	return selected;
}
function foregroundSequence(entry, level) {
	if (level === 1) {
		const index = nearestColor(entry, ANSI_COLORS);
		return `\u001B[${String(index < 8 ? 30 + index : 90 + index - 8)}m`;
	}
	if (level === 2) return `\u001B[38;5;${String(nearestColor(entry, XTERM_COLORS))}m`;
	const [red, green, blue] = entry.rgb;
	return `\u001B[38;2;${String(red)};${String(green)};${String(blue)}m`;
}
function backgroundSequence(entry, level) {
	if (level === 1) {
		const index = nearestColor(entry, ANSI_COLORS);
		return `\u001B[${String(index < 8 ? 40 + index : 100 + index - 8)}m`;
	}
	if (level === 2) return `\u001B[48;5;${String(nearestColor(entry, XTERM_COLORS))}m`;
	const [red, green, blue] = entry.rgb;
	return `\u001B[48;2;${String(red)};${String(green)};${String(blue)}m`;
}
function paint(entry, text) {
	const safeText = escapeTerminalText(text);
	const level = renderingColorLevel();
	if (level === 0) return safeText;
	return `${foregroundSequence(entry, level)}${safeText}${RESET}`;
}
function layer(background$1, text, foreground$1 = palette.text) {
	const level = renderingColorLevel();
	if (level === 0) return text;
	const prefix = `${background$1 === void 0 ? "\x1B[49m" : backgroundSequence(background$1, level)}${foregroundSequence(foreground$1, level)}`;
	return `${prefix}${text.replace(/\u001B\[(?:0)?m/gu, `${RESET}${prefix}`)}${RESET}`;
}
function ansi(code, text) {
	const safeText = escapeTerminalText(text);
	return terminalColorLevel() === 0 ? safeText : `\u001B[${String(code)}m${safeText}${RESET}`;
}
const tokenStylePrefixes = /* @__PURE__ */ new Map();
/**
* Paint untrusted token text using arbitrary theme colors.
* @param text - raw token content.
* @param style - foreground/background colors and portable code-token styles.
* @returns escaped terminal text with capability-aware SGR sequences.
*/
function styleTerminalText(text, style) {
	const safeText = escapeTerminalText(text);
	const level = renderingColorLevel();
	if (level === 0 || safeText === "") return safeText;
	const flags = (style.bold === true ? 1 : 0) | (style.italic === true ? 2 : 0) | (style.underline === true ? 4 : 0) | (style.strikethrough === true ? 8 : 0);
	const key = JSON.stringify([
		level,
		style.foreground,
		style.background,
		flags
	]);
	const cached = tokenStylePrefixes.get(key);
	if (cached !== void 0) return cached === "" ? safeText : `${cached}${safeText}${RESET}`;
	const sequences = [];
	if (style.foreground !== void 0) sequences.push(foregroundSequence(semanticColor(style.foreground), level));
	if (style.background !== void 0) sequences.push(backgroundSequence(semanticColor(style.background), level));
	if (style.bold === true) sequences.push("\x1B[1m");
	if (style.italic === true) sequences.push("\x1B[3m");
	if (style.underline === true) sequences.push("\x1B[4m");
	if (style.strikethrough === true) sequences.push("\x1B[9m");
	const prefix = sequences.join("");
	tokenStylePrefixes.set(key, prefix);
	if (tokenStylePrefixes.size > 512) tokenStylePrefixes.delete(tokenStylePrefixes.keys().next().value);
	return prefix === "" ? safeText : `${prefix}${safeText}${RESET}`;
}
/**
* Switch every dynamic renderer to one complete theme definition.
* @param theme - resolved built-in or custom theme.
*/
function setTheme(theme) {
	canvasRevision += 1;
	selectedTheme = theme;
	palette = runtimePalette(theme);
}
/** Return the complete theme currently used by renderers. */
function currentTheme() {
	return selectedTheme;
}
let workerColorLevel;
function markdownPresentation() {
	return {
		theme: selectedTheme,
		rendering: { ...rendering },
		colorLevel: terminalColorLevel()
	};
}
function applyMarkdownPresentation(value) {
	workerColorLevel = value.colorLevel;
	setTheme(value.theme);
	setRendering(value.rendering);
}
/** Encoding and canvas fill are independent of terminal background synchronization. */
function setRendering(settings) {
	canvasRevision += 1;
	rendering = { ...settings };
}
let canvasRevision = 0;
function canvasStyleRevision() {
	return canvasRevision;
}
let terminalCanvasBackground;
/** Actual background reported by the managed terminal, never persisted as a theme. */
function setTerminalCanvasBackground(color$1) {
	canvasRevision += 1;
	terminalCanvasBackground = color$1;
}
/**
* Connect the asynchronously prepared syntax highlighter to Markdown rendering.
* @param highlighter - synchronous cached renderer, or undefined during teardown.
*/
function setCodeHighlighter(highlighter, streamFactory) {
	canvasRevision += 1;
	codeHighlighter = highlighter;
	codeStreamFactory = streamFactory;
}
function createCodeStream(language) {
	const codeBackground = rendering.backgroundFill === "theme" ? "explicit" : "inherit";
	return codeStreamFactory?.(language, codeBackground) ?? {
		append: (code) => highlightCodeLines(code, language).slice(0, -1),
		preview: (code) => highlightCodeLines(code, language)
	};
}
/**
* Highlight a code region through the active cached renderer.
* @param code - raw code text.
* @param language - optional grammar id or alias.
* @returns one safely styled entry per source line.
*/
function highlightCodeLines(code, language) {
	const codeBackground = rendering.backgroundFill === "theme" ? "explicit" : "inherit";
	return codeHighlighter?.(code, language, codeBackground) ?? code.split("\n").map((line) => styleTerminalText(line, {
		foreground: selectedTheme.syntax.foreground,
		...codeBackground === "explicit" ? { background: selectedTheme.syntax.background } : {}
	}));
}
/** Product semantic foregrounds; no component owns raw color values. */
const color = {
	brand: (text) => paint(palette.brand, text),
	accent: (text) => paint(palette.accent, text),
	pulse: (text, frame) => {
		const values = palette.pulse;
		return paint(values[(Math.floor(frame) % values.length + values.length) % values.length] ?? palette.brand, text);
	},
	muted: (text) => paint(palette.muted, text),
	border: (text) => paint(palette.border, text),
	success: (text) => paint(palette.success, text),
	warning: (text) => paint(palette.warning, text),
	danger: (text) => paint(palette.danger, text),
	logoSlot: (slot, text) => paint([
		palette.brand,
		palette.accent,
		palette.success,
		palette.warning,
		palette.danger,
		palette.text,
		palette.muted,
		palette.border,
		palette.codeForeground
	][Math.max(0, Math.min(8, Math.floor(slot) - 1))] ?? palette.brand, text),
	logoCell: (foregroundSlot, backgroundSlot, text) => {
		const slots = [
			palette.brand,
			palette.accent,
			palette.success,
			palette.warning,
			palette.danger,
			palette.text,
			palette.muted,
			palette.border,
			palette.codeForeground
		];
		const foreground$1 = slots[Math.max(0, Math.min(8, Math.floor(foregroundSlot) - 1))] ?? palette.brand;
		const background$1 = backgroundSlot === void 0 ? void 0 : slots[Math.max(0, Math.min(8, Math.floor(backgroundSlot) - 1))] ?? palette.brand;
		const safeText = escapeTerminalText(text);
		const level = renderingColorLevel();
		if (level === 0 || safeText === "") return safeText;
		return `${foregroundSequence(foreground$1, level)}${background$1 === void 0 ? "" : backgroundSequence(background$1, level)}${safeText}${RESET}`;
	}
};
/** Agent lifecycle foregrounds with independent dark/light contrast. */
const statusColor = {
	running: (text) => paint(palette.statusRunning, text),
	waiting: (text) => paint(palette.statusWaiting, text),
	failed: (text) => paint(palette.statusFailed, text)
};
/** Foreground-only interaction states; never introduce a background or text decoration. */
const interaction = {
	hover: (text) => paint(palette.brand, text),
	hoverThenMuted: (text, remainder) => {
		const safeText = escapeTerminalText(text);
		const safeRemainder = escapeTerminalText(remainder);
		const level = renderingColorLevel();
		if (level === 0) return `${safeText}${safeRemainder}`;
		return `${foregroundSequence(palette.brand, level)}${safeText}${foregroundSequence(palette.muted, level)}${safeRemainder}`;
	}
};
/** Background layers shared by the full frame, panels, and selected rows. */
const background = {
	canvas: (text) => {
		const row = layer(rendering.backgroundFill === "theme" ? palette.canvas : void 0, text);
		if (terminalColorLevel() === 0 || rendering.backgroundFill === "theme" || rendering.colorMode === "rgb" || terminalCanvasBackground?.toLowerCase() === selectedTheme.colors.canvas.toLowerCase()) return row;
		return readableCanvas(row, terminalColorLevel() === 3 ? terminalCanvasBackground : void 0);
	},
	surface: (text) => layer(rendering.backgroundFill === "theme" ? palette.surface : void 0, text),
	selection: (text) => layer(palette.selection, text),
	code: (text) => layer(rendering.backgroundFill === "theme" ? palette.codeBackground : void 0, text, palette.codeForeground)
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
/** Markdown/GFM theme using semantic colors and a continuous code background. */
const markdownTheme = {
	cacheKey: () => `${canvasRevision}:${terminalColorLevel()}`,
	heading: color.brand,
	link: (text) => ansi(4, color.accent(text)),
	linkUrl: color.muted,
	code: (text) => background.code(color.accent(text)),
	codeBlock: background.code,
	codeBlockBorder: color.muted,
	quote: color.muted,
	quoteBorder: color.brand,
	hr: color.muted,
	listBullet: color.accent,
	bold: (text) => ansi(1, text),
	italic: (text) => ansi(3, text),
	strikethrough: (text) => ansi(9, text),
	underline: (text) => ansi(4, text),
	highlightCode: highlightCodeLines
};

/** Instance-owned, bounded memoization of a pure string transformation. */
var StringTransformCache = class {
	entries = /* @__PURE__ */ new Map();
	characters = 0;
	constructor(transform) {
		this.transform = transform;
	}
	clear() {
		this.entries.clear();
		this.characters = 0;
	}
	get(source) {
		const cached = this.entries.get(source);
		if (cached !== void 0) {
			this.entries.delete(source);
			this.entries.set(source, cached);
			return cached;
		}
		const result = this.transform(source);
		const size = source.length + result.length;
		if (size <= 8e6) {
			this.entries.set(source, result);
			this.characters += size;
			while (this.entries.size > 2e4 || this.characters > 8e6) {
				const oldest = this.entries.keys().next().value;
				this.characters -= oldest.length + this.entries.get(oldest).length;
				this.entries.delete(oldest);
			}
		}
		return result;
	}
};

/**
* Return unique produced paths that settled before the closing assistant message.
* @param data - Harness turn-scoped deliverable facts.
* @param seq - Closing assistant sequence number.
* @returns First-seen paths available to the closing response.
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

/** Incremental search over already-rendered transcript lines. */
const ANSI = /\u001B\[[0-9;:]*m/gu;
/**
* Remove SGR sequences so search can match what the user sees.
* @param value - possibly colorized terminal text.
* @returns the printable text without SGR.
*/
function stripAnsi(value) {
	return value.replace(ANSI, "");
}
/**
* Find rendered lines that contain the query, ignoring color and case.
* @param lines - full transcript lines before viewport clipping.
* @param query - user-typed needle; blank queries match nothing.
* @returns matching line indexes in document order.
*/
function findLineMatches(lines, query) {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [];
	return lines.flatMap((line, index) => stripAnsi(line).toLowerCase().includes(needle) ? [index] : []);
}
/**
* Compute match indexes once per query so highlight can use Set lookup.
* @param lines - full transcript lines before viewport clipping.
* @param query - user-typed needle; blank queries match nothing.
*/
function planLineSearch(lines, query) {
	const matches = findLineMatches(lines, query);
	return {
		matches,
		hit: new Set(matches)
	};
}
/**
* Move to the next or previous match, wrapping at the ends.
* @param matches - document-order line indexes.
* @param current - current line index, which may be absent from matches.
* @param direction - +1 for next, -1 for previous.
* @returns the selected line index, or -1 when there are no matches.
*/
function nextMatchIndex(matches, current, direction) {
	if (matches.length === 0) return -1;
	const index = matches.indexOf(current);
	if (index === -1) return matches[0] ?? -1;
	return matches[(index + direction + matches.length) % matches.length] ?? -1;
}
/**
* Highlight the first case-insensitive occurrence of the query on a stripped line.
* @param line - a rendered line, possibly with SGR.
* @param query - needle already known to occur on this line.
* @param paint - wrap the matched substring.
* @returns a stripped line with the first match painted.
*/
function highlightQuery(line, query, paint$1) {
	const needle = query.trim();
	if (needle === "") return line;
	const index = stripAnsi(line).toLowerCase().indexOf(needle.toLowerCase());
	if (index < 0) return line;
	const start = visibleOffset(line, index);
	const end = visibleOffset(line, index + needle.length);
	if (start < 0 || end < 0) return line;
	return `${line.slice(0, start)}${paint$1(line.slice(start, end))}${line.slice(end)}`;
}
function visibleOffset(line, visibleIndex) {
	if (visibleIndex === 0) return 0;
	const token = /^\u001B\[[0-9;:]*m/u;
	let visible = 0;
	for (let index = 0; index < line.length;) {
		const match = token.exec(line.slice(index));
		if (match !== null) {
			index += match[0].length;
			continue;
		}
		visible += 1;
		index += 1;
		if (visible === visibleIndex) return index;
	}
	return visibleIndex === visible ? line.length : -1;
}

/** Reuse a failed forward search only where native RegExp semantics prove it safe. */
function cacheFailedRegexSearch(regex) {
	if (Object.getPrototypeOf(regex) !== RegExp.prototype || !regex.global || regex.sticky || regex.exec !== RegExp.prototype.exec) return regex;
	const execute = regex.exec;
	let failedText;
	let failedStart = 0;
	regex.exec = function(text) {
		const start = this.lastIndex;
		if (this !== regex || typeof text !== "string" || !Number.isInteger(start) || start < 0) {
			failedText = void 0;
			return execute.call(this, text);
		}
		const low = text.charCodeAt(start);
		const cacheable = text.length <= 4096 && !(low >= 56320 && low <= 57343);
		if (cacheable && text === failedText && start >= failedStart) {
			this.lastIndex = 0;
			return null;
		}
		const match = execute.call(this, text);
		if (cacheable && match === null) {
			failedText = text;
			failedStart = start;
		} else failedText = void 0;
		return match;
	};
	return regex;
}

const syntaxStreamMetrics = {
	characters: 0,
	lines: 0
};
const LANGUAGE_LOADERS = {
	typescript: () => import("@shikijs/langs/typescript"),
	javascript: () => import("@shikijs/langs/javascript"),
	tsx: () => import("@shikijs/langs/tsx"),
	jsx: () => import("@shikijs/langs/jsx"),
	bash: () => import("@shikijs/langs/bash"),
	json: () => import("@shikijs/langs/json"),
	jsonc: () => import("@shikijs/langs/jsonc"),
	python: () => import("@shikijs/langs/python"),
	ruby: () => import("@shikijs/langs/ruby"),
	go: () => import("@shikijs/langs/go"),
	rust: () => import("@shikijs/langs/rust"),
	java: () => import("@shikijs/langs/java"),
	c: () => import("@shikijs/langs/c"),
	cpp: () => import("@shikijs/langs/cpp"),
	csharp: () => import("@shikijs/langs/csharp"),
	kotlin: () => import("@shikijs/langs/kotlin"),
	swift: () => import("@shikijs/langs/swift"),
	php: () => import("@shikijs/langs/php"),
	yaml: () => import("@shikijs/langs/yaml"),
	toml: () => import("@shikijs/langs/toml"),
	ini: () => import("@shikijs/langs/ini"),
	markdown: () => import("@shikijs/langs/markdown"),
	mdx: () => import("@shikijs/langs/mdx"),
	html: () => import("@shikijs/langs/html"),
	css: () => import("@shikijs/langs/css"),
	scss: () => import("@shikijs/langs/scss"),
	less: () => import("@shikijs/langs/less"),
	sql: () => import("@shikijs/langs/sql"),
	xml: () => import("@shikijs/langs/xml"),
	lua: () => import("@shikijs/langs/lua"),
	diff: () => import("@shikijs/langs/diff")
};
const LANGUAGE_ALIASES = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	typescript: "typescript",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	javascript: "javascript",
	tsx: "tsx",
	jsx: "jsx",
	sh: "bash",
	shell: "bash",
	shellscript: "bash",
	zsh: "bash",
	bash: "bash",
	json: "json",
	json5: "jsonc",
	jsonc: "jsonc",
	py: "python",
	python: "python",
	rb: "ruby",
	ruby: "ruby",
	golang: "go",
	go: "go",
	rs: "rust",
	rust: "rust",
	java: "java",
	c: "c",
	h: "c",
	cpp: "cpp",
	"c++": "cpp",
	cc: "cpp",
	hpp: "cpp",
	cs: "csharp",
	csharp: "csharp",
	kt: "kotlin",
	kotlin: "kotlin",
	swift: "swift",
	php: "php",
	yml: "yaml",
	yaml: "yaml",
	toml: "toml",
	ini: "ini",
	properties: "ini",
	md: "markdown",
	markdown: "markdown",
	mdx: "mdx",
	html: "html",
	htm: "html",
	css: "css",
	scss: "scss",
	less: "less",
	sql: "sql",
	xml: "xml",
	svg: "xml",
	lua: "lua",
	diff: "diff",
	patch: "diff"
};
const EXTENSION_LANGUAGES = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	tsx: "tsx",
	jsx: "jsx",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	json: "json",
	jsonc: "jsonc",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	c: "c",
	h: "c",
	cc: "cpp",
	cpp: "cpp",
	cxx: "cpp",
	hpp: "cpp",
	cs: "csharp",
	kt: "kotlin",
	kts: "kotlin",
	swift: "swift",
	php: "php",
	yml: "yaml",
	yaml: "yaml",
	toml: "toml",
	ini: "ini",
	md: "markdown",
	mdx: "mdx",
	html: "html",
	htm: "html",
	css: "css",
	scss: "scss",
	less: "less",
	sql: "sql",
	xml: "xml",
	svg: "xml",
	lua: "lua",
	diff: "diff",
	patch: "diff"
};
const COMMON_LANGUAGES = [
	"typescript",
	"javascript",
	"tsx",
	"jsx",
	"bash",
	"json",
	"jsonc",
	"markdown",
	"diff"
];
const COMMON_WARMUPS = [
	{
		language: "typescript",
		code: "const answer: number = 42"
	},
	{
		language: "bash",
		code: "printf '%s\\n' \"$HOME\""
	},
	{
		language: "json",
		code: "{\"ready\":true}"
	},
	{
		language: "markdown",
		code: "# ready"
	},
	{
		language: "diff",
		code: "@@ -1 +1 @@\n-old\n+new"
	}
];
const MAX_HIGHLIGHT_CHARS = 1e5;
const MAX_HIGHLIGHT_LINE_CHARS = 2e4;
const MAX_CACHE_ENTRIES = 512;
function languageOf(value) {
	if (value === void 0) return void 0;
	return LANGUAGE_ALIASES[value.trim().toLowerCase().split(/[\s,{]/u, 1)[0] ?? ""];
}
/**
* Infer a supported syntax grammar from a path and optional explicit language.
* @param path - file path or display name.
* @param explicit - Harness-provided language id.
* @returns canonical language or undefined for plain text.
*/
function syntaxLanguageForPath(path$1, explicit) {
	const requested = languageOf(explicit);
	if (requested !== void 0) return requested;
	const filename = path$1.toLowerCase().split(/[\\/]/u).at(-1) ?? "";
	if (filename === "dockerfile") return "bash";
	if (filename === "makefile") return void 0;
	return EXTENSION_LANGUAGES[filename.includes(".") ? filename.split(".").at(-1) ?? "" : ""];
}
function themeHash(theme) {
	const value = JSON.stringify([
		theme.syntaxTone,
		theme.colors,
		theme.syntax,
		theme.tokenColors
	]);
	let hash = 2166136261;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return `seektty-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function themeRegistration(theme, name) {
	const tokenColors = theme.tokenColors.length > 0 ? theme.tokenColors : visualTextMateRules(theme.syntax, theme.colors);
	const settings = [{ settings: {
		foreground: theme.syntax.foreground,
		background: theme.syntax.background
	} }, ...tokenColors.map((rule) => ({
		scope: [...rule.scope],
		settings: {
			...rule.foreground === void 0 ? {} : { foreground: rule.foreground },
			...rule.background === void 0 ? {} : { background: rule.background },
			...rule.fontStyle === void 0 ? {} : { fontStyle: rule.fontStyle.join(" ") }
		}
	}))];
	return {
		name,
		displayName: theme.name,
		type: theme.syntaxTone,
		fg: theme.syntax.foreground,
		bg: theme.syntax.background,
		settings,
		colors: {
			"editor.foreground": theme.syntax.foreground,
			"editor.background": theme.syntax.background
		}
	};
}
function safeTokenColor(value, fallback) {
	if (value === void 0) return fallback;
	try {
		return normalizeThemeColor(value);
	} catch {
		return fallback;
	}
}
/** Resolve a token background without turning the theme's block fill into a per-token color. */
function syntaxTokenBackground(value, fallback, policy) {
	const resolved = safeTokenColor(value, fallback);
	return policy === "inherit" && resolved === normalizeThemeColor(fallback) ? void 0 : resolved;
}
function renderToken(token, theme, background$1) {
	const fontStyle = token.fontStyle ?? 0;
	const resolvedBackground = syntaxTokenBackground(token.bgColor, theme.syntax.background, background$1);
	return styleTerminalText(token.content, {
		foreground: safeTokenColor(token.color, theme.syntax.foreground),
		...resolvedBackground === void 0 ? {} : { background: resolvedBackground },
		italic: (fontStyle & 1) !== 0,
		bold: (fontStyle & 2) !== 0,
		underline: (fontStyle & 4) !== 0,
		strikethrough: (fontStyle & 8) !== 0
	});
}
function plainLines(code, theme, background$1) {
	return code.split("\n").map((line) => styleTerminalText(line, {
		foreground: theme.syntax.foreground,
		...background$1 === "explicit" ? { background: theme.syntax.background } : {}
	}));
}
function highlightable(code) {
	return code.length <= MAX_HIGHLIGHT_CHARS && code.split("\n").every((line) => line.length <= MAX_HIGHLIGHT_LINE_CHARS);
}
/**
* Apply the current theme, then hand the highlighter to the renderer.
* Call this only after construction finishes so a mid-load theme change wins.
*/
function adoptSyntaxHighlighter(created, currentTheme$1, takeOver) {
	created.setTheme(currentTheme$1);
	takeOver(created);
}
/** Synchronous render face backed by asynchronously loaded Shiki grammars. */
var SyntaxHighlighter = class SyntaxHighlighter {
	loaded = /* @__PURE__ */ new Set();
	loading = /* @__PURE__ */ new Map();
	failed = /* @__PURE__ */ new Set();
	themes = /* @__PURE__ */ new Set();
	cache = /* @__PURE__ */ new Map();
	cacheCharacters = 0;
	prefixes = /* @__PURE__ */ new Map();
	themeName = "";
	disposed = false;
	createStream(language, background$1) {
		let state;
		let plainOnly = false;
		const canonical = languageOf(language);
		const themeName = this.themeName;
		const render = (code, commit) => {
			syntaxStreamMetrics.characters += code.length;
			let lines;
			if (commit && !code.endsWith("\n")) throw new Error("Code stream append requires complete source lines");
			if (this.themeName !== themeName) throw new Error("Code stream theme changed; reconstruct state before reuse");
			if (plainOnly || this.disposed || !canonical || !this.loaded.has(canonical) || renderingColorLevel() === 0 || !highlightable(code)) {
				if (canonical && !this.loaded.has(canonical)) this.load(canonical);
				if (commit) plainOnly = true;
				lines = plainLines(code, this.theme, background$1);
			} else try {
				const tokens = this.highlighter.codeToTokensBase(code, {
					lang: canonical,
					theme: themeName,
					tokenizeTimeLimit: 0,
					...state === void 0 ? {} : { grammarState: state }
				});
				if (commit) {
					state = this.highlighter.getLastGrammarState(tokens);
					if (state === void 0) plainOnly = true;
				}
				lines = tokens.map((line) => line.map((token) => renderToken(token, this.theme, background$1)).join(""));
			} catch {
				plainOnly = true;
				lines = plainLines(code, this.theme, background$1);
			}
			if (commit) lines = lines.slice(0, -1);
			syntaxStreamMetrics.lines += lines.length;
			return lines;
		};
		return {
			append: (code) => render(code, true),
			preview: (code) => render(code, false)
		};
	}
	constructor(highlighter, theme, invalidate) {
		this.highlighter = highlighter;
		this.theme = theme;
		this.invalidate = invalidate;
	}
	/**
	* Prepare the JavaScript-regex engine and common Harness grammars.
	* @param theme - initial resolved theme.
	* @param invalidate - called after a lazy grammar becomes usable.
	* @returns ready syntax renderer.
	*/
	static async create(theme, invalidate) {
		return measureStartup("shiki", async () => {
			const highlighter = await createHighlighterCore({
				engine: createJavaScriptRegexEngine({
					forgiving: true,
					regexConstructor: (pattern) => cacheFailedRegexSearch(defaultJavaScriptRegexConstructor(pattern, { target: "auto" }))
				}),
				langs: COMMON_LANGUAGES.map((language) => LANGUAGE_LOADERS[language]),
				themes: [],
				warnings: false
			});
			const service = new SyntaxHighlighter(highlighter, theme, invalidate);
			for (const language of COMMON_LANGUAGES) service.loaded.add(language);
			service.setTheme(theme);
			for (const sample of COMMON_WARMUPS) highlighter.codeToTokens(sample.code, {
				lang: sample.language,
				theme: service.themeName,
				tokenizeTimeLimit: 0
			});
			return service;
		});
	}
	/**
	* Replace the active token theme and invalidate bounded render caches.
	* @param theme - complete current theme.
	*/
	setTheme(theme) {
		if (this.disposed) return;
		this.theme = theme;
		this.themeName = themeHash(theme);
		if (!this.themes.has(this.themeName)) {
			this.highlighter.loadThemeSync(themeRegistration(theme, this.themeName));
			this.themes.add(this.themeName);
		}
		this.cache.clear();
		this.cacheCharacters = 0;
		this.prefixes.clear();
	}
	/**
	* Highlight one code block synchronously, loading uncommon grammars in the background.
	* @param code - raw code block.
	* @param language - Markdown or tool-provided language id.
	* @returns ANSI-styled lines or a safe plain fallback.
	*/
	highlight(code, language, background$1) {
		if (this.disposed || !highlightable(code) || renderingColorLevel() === 0) return plainLines(code, this.theme, background$1);
		const canonical = languageOf(language);
		if (canonical === void 0) return plainLines(code, this.theme, background$1);
		if (!this.loaded.has(canonical)) {
			this.load(canonical);
			return plainLines(code, this.theme, background$1);
		}
		const key = `${this.themeName}:${String(renderingColorLevel())}:${background$1}:${canonical}:${code}`;
		const cached = this.cache.get(key);
		if (cached !== void 0) {
			this.cache.delete(key);
			this.cache.set(key, cached);
			return [...cached];
		}
		let lines;
		try {
			lines = this.highlightIncremental(code, canonical, background$1);
		} catch {
			this.failed.add(canonical);
			return plainLines(code, this.theme, background$1);
		}
		this.cache.set(key, lines);
		this.cacheCharacters += key.length + lines.reduce((size, line) => size + line.length, 0);
		while (this.cache.size > MAX_CACHE_ENTRIES || this.cacheCharacters > 8e6) {
			const oldest = this.cache.keys().next().value;
			this.cacheCharacters -= oldest.length + this.cache.get(oldest).reduce((size, line) => size + line.length, 0);
			this.cache.delete(oldest);
		}
		return [...lines];
	}
	highlightIncremental(code, language, background$1) {
		const context = `${this.themeName}:${renderingColorLevel()}:${background$1}:${language}`;
		const tokenize = (text, state$1) => this.highlighter.codeToTokensBase(text, {
			lang: language,
			theme: this.themeName,
			tokenizeTimeLimit: 0,
			...state$1 === void 0 ? {} : { grammarState: state$1 }
		});
		const paint$1 = (tokens) => tokens.map((line) => line.map((token) => renderToken(token, this.theme, background$1)).join(""));
		if (code.includes("\r")) return paint$1(tokenize(code));
		const previous = this.prefixes.get(context);
		const reusable = previous !== void 0 && code.startsWith(previous.prefix);
		let prefix = reusable ? previous.prefix : "";
		let lines = reusable ? previous.lines : [];
		let state = reusable ? previous.state : void 0;
		const boundary = code.lastIndexOf("\n") + 1;
		if (boundary > prefix.length) {
			const completed = tokenize(code.slice(prefix.length, boundary), state);
			const nextState = this.highlighter.getLastGrammarState(completed);
			if (nextState === void 0) return paint$1(tokenize(code));
			lines = [...lines, ...paint$1(completed).slice(0, -1)];
			prefix = code.slice(0, boundary);
			state = nextState;
		}
		this.prefixes.delete(context);
		this.prefixes.set(context, {
			prefix,
			lines,
			state
		});
		while (this.prefixes.size > 4) this.prefixes.delete(this.prefixes.keys().next().value);
		return [...lines, ...paint$1(tokenize(code.slice(boundary), state))];
	}
	/** Release Shiki registries and ignore pending lazy-load invalidations. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.cache.clear();
		this.cacheCharacters = 0;
		this.prefixes.clear();
		this.highlighter.dispose();
	}
	load(language) {
		if (this.loading.has(language) || this.failed.has(language) || this.disposed) return;
		const task = this.highlighter.loadLanguage(LANGUAGE_LOADERS[language]).then(() => {
			if (this.disposed) return;
			this.loaded.add(language);
			this.invalidate();
		}).catch(() => {
			this.failed.add(language);
		}).finally(() => {
			this.loading.delete(language);
		});
		this.loading.set(language, task);
	}
	/** Worker preparation can await grammars discovered by the shared renderer before delivery. */
	async finishPendingLanguages() {
		if (!this.loading.size) return false;
		await Promise.all(this.loading.values());
		return true;
	}
};

/**
* Keep the first `limit` lines and append a remaining-count footer.
* @param text - one tool-output block.
* @param limit - line cap; 0 or negative means unlimited.
*/
function toolOutputLines(text) {
	const eofNewline = text.endsWith("\n");
	return {
		lines: (eofNewline ? text.slice(0, -1) : text).split("\n"),
		eofNewline
	};
}
function foldLineBlock(text, limit) {
	if (!Number.isFinite(limit) || limit <= 0) return {
		text,
		omitted: 0
	};
	const cap = Math.floor(limit);
	const { lines, eofNewline } = toolOutputLines(text);
	if (lines.length <= cap) return {
		text,
		omitted: 0
	};
	const omitted = lines.length - cap;
	return {
		text: `${lines.slice(0, cap).join("\n")}${eofNewline || omitted > 0 ? "\n" : ""}${ui(`还有 ${String(omitted)} 行`, `${String(omitted)} more line(s)`)}`,
		omitted
	};
}

/** Context-bounded unified hunks for transcript file diffs. Linear-space LCS. */
const MAX_LCS_CELLS = 2e6;
const NO_NEWLINE = "\0NO_NL";
const NO_NEWLINE_MARK = "\\ No newline at end of file";
function splitFileLines(text) {
	if (text === "") return {
		lines: [],
		eofNewline: false
	};
	const eofNewline = text.endsWith("\n");
	return {
		lines: (eofNewline ? text.slice(0, -1) : text).split("\n"),
		eofNewline
	};
}
function keyedLines(file) {
	if (file.lines.length === 0) return [];
	if (file.eofNewline) return [...file.lines];
	return [...file.lines.slice(0, -1), `${file.lines.at(-1) ?? ""}${NO_NEWLINE}`];
}
function decodeLine(token) {
	if (token.endsWith(NO_NEWLINE)) return {
		line: token.slice(0, -6),
		noNewline: true
	};
	return {
		line: token,
		noNewline: false
	};
}
function lcsRow(left, right) {
	const current = new Uint32Array(right.length + 1);
	for (const token of left) {
		let last = 0;
		for (let j = 0; j < right.length; j += 1) {
			const next = current[j + 1] ?? 0;
			current[j + 1] = token === right[j] ? last + 1 : Math.max(next, current[j] ?? 0);
			last = next;
		}
	}
	return current;
}
function greedyAlign(left, right) {
	const ops = [];
	const used = /* @__PURE__ */ new Set();
	for (const token of left) {
		const index = right.findIndex((candidate, j) => !used.has(j) && candidate === token);
		if (index === -1) {
			ops.push({
				kind: "del",
				...decodeLine(token)
			});
			continue;
		}
		for (let j = 0; j < index; j += 1) {
			if (used.has(j)) continue;
			ops.push({
				kind: "add",
				...decodeLine(right[j] ?? "")
			});
			used.add(j);
		}
		ops.push({
			kind: "eq",
			...decodeLine(token)
		});
		used.add(index);
	}
	for (let j = 0; j < right.length; j += 1) if (!used.has(j)) ops.push({
		kind: "add",
		...decodeLine(right[j] ?? "")
	});
	return ops;
}
function align(left, right) {
	if (left.length === 0) return right.map((token) => ({
		kind: "add",
		...decodeLine(token)
	}));
	if (right.length === 0) return left.map((token) => ({
		kind: "del",
		...decodeLine(token)
	}));
	if (left.length === 1 || right.length === 1) return greedyAlign(left, right);
	const mid = Math.floor(left.length / 2);
	const leftPart = left.slice(0, mid);
	const rightPart = left.slice(mid);
	const leftScore = lcsRow(leftPart, right);
	const rightScore = lcsRow([...rightPart].reverse(), [...right].reverse());
	let split = 0;
	let best = -1;
	for (let k = 0; k <= right.length; k += 1) {
		const score = (leftScore[k] ?? 0) + (rightScore[right.length - k] ?? 0);
		if (score > best) {
			best = score;
			split = k;
		}
	}
	return [...align(leftPart, right.slice(0, split)), ...align(rightPart, right.slice(split))];
}
function numberEdits(ops) {
	let oldLine = 0;
	let newLine = 0;
	return ops.map((op) => {
		if (op.kind === "eq") {
			oldLine += 1;
			newLine += 1;
			return {
				...op,
				oldLine,
				newLine
			};
		}
		if (op.kind === "del") {
			oldLine += 1;
			return {
				...op,
				oldLine,
				newLine
			};
		}
		newLine += 1;
		return {
			...op,
			oldLine,
			newLine
		};
	});
}
function fallbackEdits(oldTokens, newTokens) {
	return numberEdits([...oldTokens.map((token) => ({
		kind: "del",
		...decodeLine(token)
	})), ...newTokens.map((token) => ({
		kind: "add",
		...decodeLine(token)
	}))]);
}
function lcsEdits(oldTokens, newTokens) {
	if (oldTokens.length * newTokens.length > MAX_LCS_CELLS) return fallbackEdits(oldTokens, newTokens);
	return numberEdits(align(oldTokens, newTokens));
}
function hunkHeader(oldStart, oldCount, newStart, newCount) {
	return `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@`;
}
function formatEdit(edit$1) {
	const prefix = edit$1.kind === "eq" ? " " : edit$1.kind === "del" ? "-" : "+";
	if (edit$1.kind !== "eq" && edit$1.noNewline) return [`${prefix}${edit$1.line}`, NO_NEWLINE_MARK];
	return [`${prefix}${edit$1.line}`];
}
/**
* Emit unified hunks for one file, keeping `context` unchanged lines around each change.
* @param oldText - previous file body, or null when the file is created.
* @param newText - current file body.
* @param context - unchanged lines to keep on each side of a change.
*/
function unifiedHunks(oldText, newText, context) {
	const bounded = Math.max(0, Math.floor(context));
	const oldFile = oldText === null ? {
		lines: [],
		eofNewline: true
	} : splitFileLines(oldText);
	const newFile = splitFileLines(newText);
	const edits = lcsEdits(keyedLines(oldFile), keyedLines(newFile));
	const changeIndexes = edits.flatMap((edit$1, index) => edit$1.kind === "eq" ? [] : [index]);
	if (changeIndexes.length === 0) return [];
	const windows = [];
	for (const index of changeIndexes) {
		const start = Math.max(0, index - bounded);
		const end = Math.min(edits.length, index + bounded + 1);
		const last = windows.at(-1);
		if (last !== void 0 && start <= last.end) last.end = Math.max(last.end, end);
		else windows.push({
			start,
			end
		});
	}
	return windows.flatMap(({ start, end }) => {
		const slice = edits.slice(start, end);
		const oldRows = slice.filter((edit$1) => edit$1.kind !== "add");
		const newRows = slice.filter((edit$1) => edit$1.kind !== "del");
		const oldStart = oldRows[0]?.oldLine ?? slice[0]?.oldLine ?? 0;
		const newStart = newRows[0]?.newLine ?? slice[0]?.newLine ?? 0;
		return [hunkHeader(oldStart, oldRows.length, newStart, newRows.length), ...slice.flatMap(formatEdit)];
	});
}

/** Width-aware virtual block heights with O(log n) prefix queries. */
const INITIAL_CAPACITY = 64;
/**
* Fenwick (binary indexed) tree over 0-based heights.
* Point updates and prefix sums are O(log n). Capacity doubles on growth so a
* streaming tail append does not rewrite every later prefix entry.
*/
var FenwickTree = class {
	tree = new Array(INITIAL_CAPACITY + 1).fill(0);
	size = 0;
	/** Fenwick node writes; a tail push must stay O(log n), not O(n). */
	touches = 0;
	get length() {
		return this.size;
	}
	/** Replace the stored sequence. Used for session switch and prepend. */
	rebuild(values) {
		this.size = values.length;
		this.tree = new Array(capacityFor(values.length) + 1).fill(0);
		for (let index = 0; index < values.length; index += 1) this.add(index, values[index] ?? 0);
	}
	/** Append one height without touching earlier prefix nodes linearly. */
	push(value) {
		this.ensure(this.size + 1);
		this.size += 1;
		this.add(this.size - 1, value);
	}
	/** Add `delta` to height `index`. */
	add(index, delta) {
		if (delta === 0) return;
		for (let fenwick = index + 1; fenwick < this.tree.length; fenwick += fenwick & -fenwick) {
			this.tree[fenwick] = (this.tree[fenwick] ?? 0) + delta;
			this.touches += 1;
		}
	}
	/** Sum of the first `count` heights. */
	prefix(count) {
		const limit = Math.max(0, Math.min(count, this.size));
		let sum = 0;
		for (let fenwick = limit; fenwick > 0; fenwick -= fenwick & -fenwick) sum += this.tree[fenwick] ?? 0;
		return sum;
	}
	total() {
		return this.prefix(this.size);
	}
	/**
	* Smallest 0-based index whose prefix sum is greater than `offset`.
	* @returns `size` when `offset` is at or past the total.
	*/
	indexAt(offset) {
		if (this.size === 0 || offset < 0) return 0;
		let remaining = offset;
		let index = 0;
		let bit = 1;
		while (bit << 1 < this.tree.length) bit <<= 1;
		for (; bit > 0; bit >>= 1) {
			const next = index + bit;
			const value = this.tree[next] ?? 0;
			if (next <= this.size && remaining >= value) {
				remaining -= value;
				index = next;
			}
		}
		return Math.min(index, this.size);
	}
	ensure(size) {
		if (size + 1 <= this.tree.length) return;
		const grown = new Array(capacityFor(size) + 1).fill(0);
		for (let index = 0; index < this.tree.length; index += 1) grown[index] = this.tree[index] ?? 0;
		this.tree = grown;
	}
};
function capacityFor(size) {
	let capacity = INITIAL_CAPACITY;
	while (capacity < size) capacity *= 2;
	return capacity;
}
/** Block-key height map used by the resident scrollbar and virtual search. */
var HeightIndex = class {
	keys = [];
	heights = [];
	exactFlags = [];
	byKey = /* @__PURE__ */ new Map();
	fenwick = new FenwickTree();
	width = 0;
	exactEntries = 0;
	estimatedEntries = 0;
	get blockCount() {
		return this.keys.length;
	}
	get contentWidth() {
		return this.width;
	}
	/** Sum of exact and estimated heights. */
	total() {
		return this.fenwick.total();
	}
	/** Prefix sum before `key`. */
	offsetOf(key, lineOffset = 0) {
		const index = this.byKey.get(key);
		if (index === void 0) return 0;
		return this.fenwick.prefix(index) + Math.max(0, lineOffset);
	}
	/** Block containing `offset` in the concatenated height space. */
	atOffset(offset) {
		if (this.keys.length === 0) return void 0;
		const total = this.total();
		const clamped = Math.max(0, Math.min(offset, Math.max(0, total - 1)));
		const index = Math.min(this.fenwick.indexAt(clamped), this.keys.length - 1);
		const prefix = this.fenwick.prefix(index);
		const height = this.heights[index] ?? 1;
		const key = this.keys[index];
		if (key === void 0) return void 0;
		return {
			key,
			lineOffset: Math.max(0, Math.min(clamped - prefix, Math.max(0, height - 1)))
		};
	}
	/**
	* Reconcile to the current block order without rendering.
	* Append-only tail growth is O(log n) per new block; prepend/reorder rebuilds.
	*/
	reconcile(keys, estimateFor, width) {
		if (width !== this.width && this.keys.length > 0) {
			for (let index = 0; index < this.exactFlags.length; index += 1) this.exactFlags[index] = false;
			this.recount();
		}
		this.width = width;
		if (keys.length >= this.keys.length && this.keys.every((key, index) => keys[index] === key) && keys.length >= this.keys.length && width === this.width) {
			for (let index = this.keys.length; index < keys.length; index += 1) {
				const key = keys[index];
				if (key === void 0) continue;
				const estimated = Math.max(1, estimateFor(key));
				this.keys.push(key);
				this.heights.push(estimated);
				this.exactFlags.push(false);
				this.byKey.set(key, index);
				this.fenwick.push(estimated);
				this.estimatedEntries += 1;
			}
			return;
		}
		const previousHeights = /* @__PURE__ */ new Map();
		for (const [index, key] of this.keys.entries()) previousHeights.set(key, {
			height: this.heights[index] ?? estimateFor(key),
			exact: this.exactFlags[index] === true && width === this.width
		});
		this.keys = [...keys];
		this.heights = keys.map((key) => {
			return previousHeights.get(key)?.height ?? Math.max(1, estimateFor(key));
		});
		this.exactFlags = keys.map((key) => previousHeights.get(key)?.exact === true);
		this.byKey.clear();
		for (const [index, key] of this.keys.entries()) this.byKey.set(key, index);
		this.fenwick.rebuild(this.heights);
		this.recount();
	}
	/** Record an exact rendered height for one visited block. */
	setExact(key, height) {
		const index = this.byKey.get(key);
		if (index === void 0) return;
		const next = Math.max(0, Math.floor(height));
		const previous = this.heights[index] ?? 0;
		if (next !== previous) {
			this.heights[index] = next;
			this.fenwick.add(index, next - previous);
		}
		if (this.exactFlags[index] !== true) {
			this.exactFlags[index] = true;
			this.exactEntries += 1;
			this.estimatedEntries = Math.max(0, this.estimatedEntries - 1);
		}
	}
	isExact(key) {
		const index = this.byKey.get(key);
		return index !== void 0 && this.exactFlags[index] === true;
	}
	heightOf(key) {
		const index = this.byKey.get(key);
		return index === void 0 ? 0 : this.heights[index] ?? 0;
	}
	snapshot() {
		return this.keys.map((key, index) => ({
			key,
			height: this.heights[index] ?? 0,
			exact: this.exactFlags[index] === true
		}));
	}
	clear() {
		this.keys = [];
		this.heights = [];
		this.exactFlags = [];
		this.byKey.clear();
		this.fenwick.rebuild([]);
		this.width = 0;
		this.exactEntries = 0;
		this.estimatedEntries = 0;
	}
	recount() {
		this.exactEntries = this.exactFlags.filter((flag) => flag).length;
		this.estimatedEntries = this.keys.length - this.exactEntries;
	}
};

function structuralToken(value) {
	const strings = [];
	return [JSON.stringify(value, (_key, item) => {
		if (typeof item !== "string") return item;
		strings.push(item);
		return "";
	}) ?? "", ...strings];
}
function sameStructuralToken(left, right) {
	if (left === right) return true;
	if (typeof left === "string" || typeof right === "string" || left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

/** Open composer and transcript borders, optionally labelled at the right edge. */
function horizontalRule(label, width, paint$1, paintLabel) {
	if (width <= 1) return paint$1("─".repeat(Math.max(1, width)));
	const labelWidth = Math.max(0, width - 2);
	const safeLabel = labelWidth === 0 ? "" : truncateToWidth(label, labelWidth, "…");
	const suffix = safeLabel === "" ? "" : ` ${safeLabel}`;
	const rule = "─".repeat(Math.max(1, width - visibleWidth(suffix)));
	return paintLabel === void 0 || safeLabel === "" ? paint$1(`${rule}${suffix}`) : `${paint$1(rule)} ${paintLabel(safeLabel)}`;
}

const SCROLLBAR_MIN_WIDTH = 12;
const TRACK = "│";
const THUMB = "▐";
const OLDER = "▴";
const OLDER_LOADING = "⇡";
const NEWER = "▾";
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
/**
* Derive thumb geometry from the height-index snapshot.
* Unknown history (`hasMore` or estimated entries) never places the thumb in a
* fake unloaded absolute range: offsets are clamped to the loaded total.
*/
function scrollbarModel(options$1) {
	const rows = Math.max(1, Math.floor(options$1.rows));
	const loadedTotal = Math.max(0, options$1.loadedTotal);
	const overflow = loadedTotal > rows || options$1.hasMore || options$1.hasNewer;
	const span = Math.max(loadedTotal, rows);
	const startOffset = clamp(options$1.startOffset, 0, Math.max(0, span - rows));
	const thumbSize = overflow ? clamp(Math.round(rows / span * rows), 1, rows) : rows;
	const maxTop = Math.max(0, rows - thumbSize);
	const travel = Math.max(1, span - rows);
	const thumbTop = overflow && maxTop > 0 ? clamp(Math.round(startOffset / travel * maxTop), 0, maxTop) : 0;
	return {
		rows,
		contentWidth: options$1.contentWidth,
		startOffset,
		viewportRows: rows,
		loadedTotal,
		estimated: options$1.estimated,
		hasMore: options$1.hasMore,
		hasNewer: options$1.hasNewer,
		loadingOlder: options$1.loadingOlder,
		overflow,
		thumbTop,
		thumbSize
	};
}
/** One cell per viewport row. End-caps replace the first/last track cells. */
function paintScrollbar(model, hoveredPart) {
	const cells = Array.from({ length: model.rows }, (_, row) => {
		const inThumb = row >= model.thumbTop && row < model.thumbTop + model.thumbSize;
		const glyph = inThumb ? THUMB : TRACK;
		const olderTrack = row > 0 && row < Math.max(1, model.thumbTop);
		const newerTrack = row >= model.thumbTop + model.thumbSize && row < model.rows - 1;
		return hoveredPart === "thumb" && inThumb || hoveredPart === "track-older" && olderTrack || hoveredPart === "track-newer" && newerTrack ? color.brand(glyph) : color.muted(glyph);
	});
	if (model.rows === 0) return cells;
	const older = model.loadingOlder ? OLDER_LOADING : model.hasMore ? OLDER : model.overflow ? TRACK : THUMB;
	cells[0] = hoveredPart === "cap-older" ? color.brand(older) : color.muted(older);
	const last = model.rows - 1;
	if (last > 0) {
		const newer = model.hasNewer ? NEWER : model.overflow ? TRACK : THUMB;
		cells[last] = hoveredPart === "cap-newer" ? color.brand(newer) : color.muted(newer);
	}
	return cells;
}
function padToWidth(line, width) {
	const current = visibleWidth(line);
	if (current >= width) return line;
	return `${line}${" ".repeat(width - current)}`;
}
function appendScrollbarColumn(lines, cells, width) {
	return lines.map((line, index) => `${padToWidth(line, Math.max(0, width - 1))}${cells[index] ?? color.muted(TRACK)}`);
}
function scrollbarHitRegions(origin, model) {
	if (origin.width <= 0 || origin.height <= 0 || model.rows <= 0) return [];
	const col = origin.col + Math.max(0, origin.width - 1);
	const regions = [];
	const add = (id, row, height, command) => {
		if (height <= 0) return;
		regions.push({
			id: `transcript:scrollbar:${id}`,
			rect: {
				col,
				row: origin.row + row,
				width: 1,
				height
			},
			zIndex: 11,
			role: "scrollbar",
			enabled: true,
			activation: command === "drag-thumb" ? "drag" : "direct",
			hover: "highlight",
			action: {
				kind: "transcript",
				command,
				targetKey: id
			}
		});
	};
	add("cap-older", 0, 1, model.hasMore ? "page-older" : "jump");
	const thumbStart = Math.max(1, model.thumbTop);
	const thumbEnd = Math.min(model.rows - 1, model.thumbTop + model.thumbSize);
	const trackOlder = Math.max(0, thumbStart - 1);
	if (trackOlder > 1) add("track-older", 1, trackOlder - 1, "jump");
	add("thumb", thumbStart, Math.max(1, thumbEnd - thumbStart), "drag-thumb");
	const afterThumb = thumbEnd;
	const newerCap = model.rows - 1;
	if (afterThumb < newerCap) add("track-newer", afterThumb, newerCap - afterThumb, "jump");
	if (model.rows > 1) add("cap-newer", newerCap, 1, "jump");
	return regions;
}
/** Offset in the loaded height space for a click on the track or thumb. */
function offsetForTrackRow(model, row) {
	const span = Math.max(model.loadedTotal, model.viewportRows);
	const travel = Math.max(1, span - model.viewportRows);
	const maxTop = Math.max(0, model.rows - model.thumbSize);
	const clampedRow = clamp(row, 0, Math.max(0, model.rows - 1));
	if (maxTop === 0) return 0;
	return Math.round(clampedRow / maxTop * travel);
}

const OSC = /\u001B\][\s\S]*?(?:\u0007|\u001B\\)/gu;
const CSI = /\u001B\[[0-9;:]*[ -/]*[@-~]/gu;
const C1_OSC = /\u009D[\s\S]*?(?:\u0007|\u001B\\|\u009C)/gu;
let graphemeSegmenter;
let wordSegmenter;
function graphemesOf(text) {
	graphemeSegmenter ??= new Intl.Segmenter(void 0, { granularity: "grapheme" });
	return graphemeSegmenter;
}
function wordsOf(text) {
	wordSegmenter ??= new Intl.Segmenter(void 0, { granularity: "word" });
	return wordSegmenter;
}
/** Strip SGR, OSC (including OSC 8), and leftover CSI so copy matches visible text. */
function stripCopyDecorations(value) {
	return value.replace(OSC, "").replace(C1_OSC, "").replace(CSI, "");
}
function compareAnchors(left, right, order) {
	if (left.surface !== right.surface) return left.surface === "transcript" ? -1 : 1;
	if (left.ownerKey !== right.ownerKey) return order.indexOf(left.ownerKey) - order.indexOf(right.ownerKey);
	if (left.textOffset !== right.textOffset) return left.textOffset - right.textOffset;
	if (left.affinity === right.affinity) return 0;
	return left.affinity === "before" ? -1 : 1;
}
function orderedSelection(selection, order) {
	return compareAnchors(selection.anchor, selection.focus, order) > 0 ? {
		start: selection.focus,
		end: selection.anchor
	} : {
		start: selection.anchor,
		end: selection.focus
	};
}
function sameSurface(selection) {
	return selection.anchor.surface === selection.focus.surface;
}
function graphemeRangeAt(text, offset) {
	const clamped = Math.max(0, Math.min(offset, text.length));
	for (const segment of graphemesOf(text).segment(text)) {
		const start = segment.index;
		const end = start + segment.segment.length;
		if (clamped >= start && clamped < end) return {
			start,
			end
		};
	}
	return {
		start: clamped,
		end: Math.min(text.length, clamped + 1)
	};
}
function wordRangeAt(text, offset) {
	const clamped = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
	for (const segment of wordsOf(text).segment(text)) {
		const start = segment.index;
		const end = start + segment.segment.length;
		if (clamped >= start && clamped < end) {
			if (segment.isWordLike === true) return {
				start,
				end
			};
			return graphemeRangeAt(text, clamped);
		}
	}
	return graphemeRangeAt(text, clamped);
}
function lineRangeAt(text, offset) {
	const clamped = Math.max(0, Math.min(offset, text.length));
	const start = text.lastIndexOf("\n", Math.max(0, clamped - 1)) + 1;
	const next = text.indexOf("\n", clamped);
	return {
		start,
		end: next < 0 ? text.length : next
	};
}
function expandSelection(selection, text, granularity) {
	const range = granularity === "word" ? wordRangeAt(text, selection.focus.textOffset) : granularity === "line" ? lineRangeAt(text, selection.focus.textOffset) : graphemeRangeAt(text, selection.focus.textOffset);
	return {
		anchor: {
			...selection.anchor,
			textOffset: range.start,
			affinity: "before"
		},
		focus: {
			...selection.focus,
			textOffset: range.end,
			affinity: "before"
		},
		granularity
	};
}
/**
* Copy selected owner text. Soft wraps are already absent from owner text;
* real newlines inside owner text are kept. Surrounding whitespace is not trimmed.
*/
function extractSelectedText(selection, owners) {
	if (!sameSurface(selection)) return "";
	const { start, end } = orderedSelection(selection, owners.map((owner) => owner.key));
	const parts = [];
	let started = false;
	for (const owner of owners) {
		if (owner.key === start.ownerKey) started = true;
		if (!started) continue;
		const from = owner.key === start.ownerKey ? start.textOffset : 0;
		const to = owner.key === end.ownerKey ? end.textOffset : owner.text.length;
		parts.push(owner.text.slice(Math.max(0, from), Math.max(from, to)));
		if (owner.key === end.ownerKey) break;
		if (owner.key !== end.ownerKey) parts.push("\n");
	}
	return parts.join("");
}
/** Map only semantic text cells; presentation columns and renderer padding stay inert. */
function mapSelectionProjectionLine(projection, startOffset, contentWidth) {
	const cellOffsets = Array.from({ length: contentWidth }, () => void 0);
	let offset = startOffset;
	let col = Math.max(0, projection.displayStartCell);
	for (const segment of graphemesOf(projection.text).segment(projection.text)) {
		const grapheme = segment.segment;
		const width = Math.max(1, visibleWidth(grapheme));
		for (let cell = 0; cell < width && col + cell < contentWidth; cell += 1) cellOffsets[col + cell] = offset;
		col += width;
		offset += grapheme.length;
	}
	return {
		text: projection.text + projection.joinerAfter,
		endOffset: offset,
		cellOffsets,
		hardBreakAfter: projection.joinerAfter === "\n"
	};
}
/** Build one stable owner string from semantic visual-line projections. */
function ownerTextFromProjections(projections) {
	let text = "";
	const lineStarts = [];
	for (const projection of projections) {
		lineStarts.push(text.length);
		text += projection.text;
		text += projection.joinerAfter;
	}
	return {
		text,
		lineStarts
	};
}
/**
* Map one already-rendered visual line to copyable cells.
* ANSI/OSC and the scrollbar column are skipped; graphemes stay atomic.
*/
function mapCopyableLine(line, startOffset, contentWidth, options$1 = {}) {
	const skipLeading = options$1.skipLeading ?? 0;
	const skipTrailing = options$1.skipTrailing ?? 0;
	const stripped = stripCopyDecorations(line);
	const cellOffsets = Array.from({ length: contentWidth }, () => void 0);
	let offset = startOffset;
	let col = 0;
	let visible = 0;
	for (const segment of graphemesOf(stripped).segment(stripped)) {
		const grapheme = segment.segment;
		const width = Math.max(1, visibleWidth(grapheme));
		if (visible >= skipLeading && visible + width <= contentWidth - skipTrailing) for (let cell = 0; cell < width && col + cell < contentWidth; cell += 1) cellOffsets[col + cell] = offset;
		col += width;
		visible += width;
		offset += grapheme.length;
	}
	const hardBreakAfter = Math.min(visibleWidth(stripped) - skipLeading - skipTrailing, contentWidth) < contentWidth - skipLeading - skipTrailing;
	return {
		text: stripped.slice(skipLeading) + (hardBreakAfter ? "\n" : ""),
		endOffset: offset,
		cellOffsets,
		hardBreakAfter
	};
}
function anchorAtCell(map, col, affinity = "before") {
	if (col < 0 || col >= map.cellOffsets.length) return void 0;
	const offset = map.cellOffsets[col];
	if (offset === void 0) {
		const nearbyIndex = map.cellOffsets.findLastIndex((value, index) => index <= col && value !== void 0);
		const fallbackIndex = map.cellOffsets.findIndex((value) => value !== void 0);
		const resolvedIndex = nearbyIndex >= 0 ? nearbyIndex : fallbackIndex;
		const nearby = resolvedIndex < 0 ? void 0 : map.cellOffsets[resolvedIndex];
		if (nearby === void 0) return void 0;
		const textOffset$1 = affinity === "after" ? offsetAfterCell(map, resolvedIndex, nearby) : nearby;
		return {
			surface: map.surface,
			ownerKey: map.ownerKey,
			textOffset: textOffset$1,
			affinity
		};
	}
	const textOffset = affinity === "after" ? offsetAfterCell(map, col, offset) : offset;
	return {
		surface: map.surface,
		ownerKey: map.ownerKey,
		textOffset,
		affinity
	};
}
function offsetAfterCell(map, col, offset) {
	for (let index = col + 1; index < map.cellOffsets.length; index += 1) {
		const candidate = map.cellOffsets[index];
		if (candidate !== void 0 && candidate !== offset) return candidate;
	}
	return map.endOffset;
}
function selectionCellsOnLine(map, selection, order) {
	if (selection.anchor.surface !== map.surface) return void 0;
	const { start, end } = orderedSelection(selection, order);
	const ownerIndex = order.indexOf(map.ownerKey);
	const startIndex = order.indexOf(start.ownerKey);
	const endIndex = order.indexOf(end.ownerKey);
	if (ownerIndex < startIndex || ownerIndex > endIndex) return void 0;
	let startCol = 0;
	let endCol = map.cellOffsets.length;
	if (map.ownerKey === start.ownerKey) {
		const index = map.cellOffsets.findIndex((offset) => offset !== void 0 && offset >= start.textOffset);
		if (index < 0) return void 0;
		startCol = index;
	}
	if (map.ownerKey === end.ownerKey) {
		const index = map.cellOffsets.findLastIndex((offset) => offset !== void 0 && offset < end.textOffset);
		endCol = index < 0 ? startCol : index + 1;
	}
	if (endCol <= startCol) return void 0;
	return {
		start: startCol,
		end: endCol
	};
}
/** Invert already-generated visible cells. Does not re-render the owner. */
function invertLineCells(line, startCol, endCol) {
	if (endCol <= startCol) return line;
	let result = "";
	let col = 0;
	let index = 0;
	let open = false;
	while (index < line.length) {
		if (line.charCodeAt(index) === 27) {
			const end = consumeEscape(line, index);
			const escape$1 = line.slice(index, end);
			result += escape$1;
			if (open && escape$1.startsWith("\x1B[") && escape$1.endsWith("m")) result += "\x1B[7m";
			index = end;
			continue;
		}
		const next = nextGrapheme(line, index);
		const width = Math.max(1, visibleWidth(stripCopyDecorations(next)));
		const selected = col >= startCol && col < endCol;
		if (selected && !open) {
			result += "\x1B[7m";
			open = true;
		} else if (!selected && open) {
			result += "\x1B[27m";
			open = false;
		}
		result += next;
		col += width;
		index += next.length;
	}
	if (open) result += "\x1B[27m";
	return result;
}
function nextGrapheme(text, index) {
	const slice = text.slice(index);
	for (const segment of graphemesOf(slice).segment(slice)) return segment.segment;
	return text.charAt(index);
}
function consumeEscape(text, index) {
	if (text.startsWith("\x1B]", index) || text.charCodeAt(index) === 157) {
		const bel = text.indexOf("\x07", index + 1);
		const st = text.indexOf("\x1B\\", index + 1);
		const ends = [bel, st].filter((value) => value >= 0);
		if (ends.length === 0) return text.length;
		const end = Math.min(...ends);
		return end === st ? st + 2 : end + 1;
	}
	if (text.startsWith("\x1B[", index)) {
		let cursor = index + 2;
		while (cursor < text.length) {
			const code = text.charCodeAt(cursor);
			cursor += 1;
			if (code >= 64 && code <= 126) break;
		}
		return cursor;
	}
	return Math.min(text.length, index + 2);
}
function paintSelection(lines, maps, selection, order) {
	if (selection === void 0 || !sameSurface(selection)) return [...lines];
	return lines.map((line, row) => {
		const map = maps.find((candidate) => candidate.row === row);
		if (map === void 0) return line;
		const range = selectionCellsOnLine(map, selection, order);
		return range === void 0 ? line : invertLineCells(line, range.start, range.end);
	});
}
function selectionClearedForOwner(selection, keys) {
	if (selection === void 0) return void 0;
	if (!keys.has(selection.anchor.ownerKey) || !keys.has(selection.focus.ownerKey)) return void 0;
	return selection;
}

function editorMouseApi(editor) {
	return editor;
}
/** Stable current-generation target id used by render, hit-test, and hover. */
function autocompleteTargetId(generation, absoluteIndex) {
	return `composer:autocomplete:${generation}:${absoluteIndex}`;
}
function tuiFrameApi(tui) {
	return tui;
}
/**
* Read the narrow, optional projection added to Markdown by SeekTTY's patch for
* official dsh 0.1.1-rc.2 and @mariozechner/pi-tui 0.73.1. Components without
* the additive API safely keep the legacy visual-line copy path.
*/
function componentSelectionLines(component) {
	const lines = component.getSelectionLines?.();
	if (!Array.isArray(lines)) return void 0;
	return lines.every((line) => typeof line?.text === "string" && Number.isSafeInteger(line.displayStartCell) && line.displayStartCell >= 0 && typeof line.joinerAfter === "string") ? lines : void 0;
}
function emptyFrameGeometry(width, height) {
	return {
		terminalWidth: width,
		terminalHeight: height,
		rootScreenOrigin: {
			col: 0,
			row: 0
		},
		rootSliceOffset: 0,
		overlays: []
	};
}

/** Display-only ledger. Source offsets are UTF-16 offsets into Harness text. */
var NativeHistory = class {
	generation = 0;
	committed = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	delivered = /* @__PURE__ */ new Map();
	reset() {
		this.generation++;
		this.committed.clear();
		this.pending.clear();
		this.delivered.clear();
	}
	get(key) {
		return this.committed.get(key);
	}
	/** Partial physical delivery is not complete source-range coverage. */
	deliveredFor(key) {
		return this.delivered.get(key);
	}
	deliver(receipt, lines) {
		if (receipt.epoch !== this.generation || this.committed.get(receipt.key) === receipt || lines <= 0) return;
		const previous = this.delivered.get(receipt.key);
		this.delivered.set(receipt.key, {
			receipt,
			lines: (previous?.receipt === receipt ? previous.lines : 0) + lines
		});
	}
	isCommitted(key, token) {
		const entry = this.committed.get(key);
		return entry?.settled === true && sameStructuralToken(entry.token, token);
	}
	reserve(key, token, from, to, source, settled) {
		if (this.pending.has(key)) throw new Error("Native history transaction already pending");
		const receipt = {
			epoch: this.generation,
			key,
			token,
			from,
			to,
			source,
			settled
		};
		this.pending.set(key, receipt);
		return receipt;
	}
	acknowledge(receipt) {
		if (this.pending.get(receipt.key) !== receipt || receipt.epoch !== this.generation) return false;
		this.committed.set(receipt.key, receipt);
		this.pending.delete(receipt.key);
		this.delivered.delete(receipt.key);
		return true;
	}
	busy() {
		return this.pending.size > 0;
	}
	reserved(key) {
		return this.pending.has(key);
	}
	pendingFor(key) {
		return this.pending.get(key);
	}
	discardPending() {
		this.pending.clear();
	}
	discard(key) {
		this.pending.delete(key);
	}
};
/** Conservative paragraph boundary: uncertain Markdown stays mutable in full. */
function stableParagraphEnd(text) {
	if (/[`~*_[\]<>|\\\r\x1b]/u.test(text) || /^(?: {4}|\t|\s*[-+>#]|\s*\d+[.)])/mu.test(text)) return 0;
	const end = text.lastIndexOf("\n\n");
	return end < 0 ? 0 : end + 2;
}
/** Top-level fenced code only. Indented/nested fences stay with Markdown. */
function fencedCodeRange(text) {
	if (text.includes("\r") || text.includes("\x1B")) return void 0;
	const opening = /^(`{3,}|~{3,})([^\n`]*)\n/u.exec(text);
	if (!opening) return void 0;
	const bodyStart = opening[0].length;
	const fence = opening[1];
	const match = new RegExp(`^${fence[0]}{${fence.length},}[ \\t]*(?:\\n|$)`, "mu").exec(text.slice(bodyStart));
	const bodyEnd = match ? bodyStart + match.index : text.length;
	const closeEnd = match ? bodyEnd + match[0].length : void 0;
	return {
		bodyStart,
		bodyEnd,
		stableEnd: closeEnd ?? Math.max(bodyStart, text.lastIndexOf("\n") + 1),
		closeEnd,
		language: opening[2].trim().split(/\s/u)[0] ?? ""
	};
}

/** Large indivisible Markdown stays authoritative; only its preparation leaves the UI thread. */
const NATIVE_MARKDOWN_THRESHOLD = 32768;
const queued = /* @__PURE__ */ new Set();
let activeWorkers = 0;
function schedule() {
	while (activeWorkers < 2 && queued.size) {
		const start = queued.values().next().value;
		queued.delete(start);
		start();
	}
}
/** One document, one requested page. No speculative queue of obsolete snapshots. */
var NativeMarkdownPreparation = class {
	worker;
	ready;
	failure;
	waiting;
	wake;
	disposed = false;
	holdsSlot = false;
	closingWorker = false;
	start;
	constructor(source, width, revision, tailRows, changed, factory = () => new Worker(new URL("./native-markdown-worker.js", import.meta.url)), row, rows, first = true) {
		this.source = source;
		this.width = width;
		this.revision = revision;
		this.tailRows = tailRows;
		this.changed = changed;
		this.expectPage();
		const presentation = markdownPresentation();
		const capabilities = getCapabilities();
		this.start = () => {
			if (this.disposed) return;
			activeWorkers++;
			this.holdsSlot = true;
			try {
				const worker = this.worker = factory();
				worker.on("message", (message) => {
					if (this.disposed) return;
					if ("error" in message) this.fail(new Error(message.error));
					else {
						this.ready = message;
						if (message.done) this.closeWorker();
						this.signal();
					}
				});
				worker.on("error", (error) => {
					if (this.worker === worker) this.fail(error);
				});
				worker.on("exit", (code) => {
					if (!this.disposed && this.worker === worker) this.fail(/* @__PURE__ */ new Error(`Markdown worker exited before disposal (${code})`));
				});
				worker.unref();
				worker.postMessage({
					source,
					row,
					rows,
					first,
					width,
					tailRows,
					presentation,
					capabilities
				});
			} catch (error) {
				this.fail(error instanceof Error ? error : new Error(String(error)));
			}
		};
		queued.add(this.start);
		schedule();
	}
	page() {
		if (this.failure) throw this.failure;
		return this.ready;
	}
	/** Called only after successful terminal delivery, never when merely taking a page. */
	advance() {
		if (!this.ready || this.ready.done) return;
		this.ready = void 0;
		this.expectPage();
		this.worker?.postMessage({ next: true });
	}
	async wait() {
		await this.waiting;
		if (this.failure) throw this.failure;
	}
	dispose() {
		this.disposed = true;
		queued.delete(this.start);
		this.ready = void 0;
		this.wake?.();
		this.wake = void 0;
		this.closeWorker();
	}
	expectPage() {
		this.waiting = new Promise((resolve$1) => {
			this.wake = resolve$1;
		});
	}
	signal() {
		this.wake?.();
		this.wake = void 0;
		this.changed();
	}
	fail(error) {
		if (this.disposed || this.failure) return;
		this.failure = error;
		this.closeWorker();
		this.signal();
	}
	closeWorker() {
		if (this.closingWorker) return;
		this.closingWorker = true;
		const worker = this.worker;
		this.worker = void 0;
		const release = () => {
			if (!this.holdsSlot) return;
			this.holdsSlot = false;
			activeWorkers--;
			schedule();
		};
		if (worker) worker.terminate().then(release, release);
		else queueMicrotask(release);
	}
};

const PULSE_FRAME_MS = 160;
/** Replaceable counters used by incremental-render tests. */
const internals = {
	markdownCreated: 0,
	markdownUpdated: 0,
	componentRenders: 0,
	blocksVisited: 0,
	linesEscaped: 0,
	lastFullLinesCopied: 0,
	fingerprintsComputed: 0,
	nativeSnapshotBlocksChecked: 0,
	nativeTailBlocksVisited: 0,
	nativeHistoryLinesPrepared: 0,
	imageBlocksUpdated: 0,
	activePulseTimers: 0,
	heightIndexExact: 0,
	heightIndexEstimated: 0,
	selectionCellsProjected: 0
};
/** Preserve source newlines that would otherwise be indistinguishable from exact-width wraps. */
function explicitHardBreakIndexes(row, width) {
	if (row === void 0) return [];
	const safeWidth = Math.max(1, width);
	if (row.format === "plain" && row.pulse === void 0) {
		const logicalLines = escapeTerminalText(row.text).replace(/\t/gu, "   ").split("\n");
		const breaks$1 = [];
		let renderedIndex$1 = 0;
		for (const [index, logicalLine] of logicalLines.entries()) {
			renderedIndex$1 += Math.max(1, wrapTextWithAnsi(logicalLine, safeWidth).length);
			if (index < logicalLines.length - 1) breaks$1.push(renderedIndex$1 - 1);
		}
		return breaks$1;
	}
	if (row.format !== "code") return [];
	const requestedPrefix = escapeTerminalText(row.prefix ?? "");
	const prefix = visibleWidth(requestedPrefix) < safeWidth ? requestedPrefix : "";
	const prefixWidth = visibleWidth(prefix);
	const highest = row.lineNumbers?.reduce((value, number) => Math.max(value, number), 0) ?? 0;
	const numberWidth = row.lineNumbers !== void 0 && safeWidth - prefixWidth >= 8 ? String(highest).length + 2 : 0;
	const codeWidth = Math.max(1, safeWidth - prefixWidth - numberWidth);
	const highlighted = highlightCodeLines(row.text, row.language);
	const breaks = [];
	let renderedIndex = 0;
	if (row.caption !== void 0) {
		renderedIndex += new Text(`${color.muted(prefix)}${color.muted(escapeTerminalText(row.caption))}`, 0, 0).render(safeWidth).length;
		if (highlighted.length > 0) breaks.push(renderedIndex - 1);
	}
	for (const [index, sourceLine] of highlighted.entries()) {
		renderedIndex += Math.max(1, wrapTextWithAnsi(sourceLine, codeWidth).length);
		if (index < highlighted.length - 1) breaks.push(renderedIndex - 1);
	}
	return breaks;
}
function thinkingRow(key, expanded) {
	return {
		format: "plain",
		text: expanded ? ui("正在思考… ▾", "Thinking… ▾") : ui("正在思考…（已折叠） ▸", "Thinking… (collapsed) ▸"),
		pulse: "thinking",
		reasoningKey: key
	};
}
function reasoningHeaderRow(key, expanded) {
	return {
		format: "plain",
		text: color.muted(expanded ? ui("▾ 思考", "▾ Reasoning") : ui("▸ 思考（已折叠）", "▸ Reasoning (collapsed)")),
		reasoningKey: key
	};
}
/** Highlight only the reasoning disclosure glyph while retaining the row's muted foreground and selection background. */
function hoverReasoningChevron(content) {
	const collapsed = content.indexOf("▸");
	const expanded = content.indexOf("▾");
	const index = collapsed < 0 ? expanded : expanded < 0 ? collapsed : Math.min(collapsed, expanded);
	if (index < 0) return interaction.hover(content);
	return `${content.slice(0, index)}${interaction.hoverThenMuted(content[index] ?? "", content.slice(index + 1))}`;
}
var PulsingRow = class {
	constructor(text, mode, frame, liveDurationSince) {
		this.text = text;
		this.mode = mode;
		this.frame = frame;
		this.liveDurationSince = liveDurationSince;
	}
	render(width) {
		const marker = color.pulse("◆", this.frame());
		const liveDuration = this.liveDurationSince === void 0 ? "" : ` · ${durationText(Math.max(0, Date.now() - this.liveDurationSince))}`;
		const safeText = escapeTerminalText(`${this.text}${liveDuration}`);
		return new Text(this.mode === "thinking" ? `${marker} ${color.muted(safeText)}` : safeText.replace("◆", marker), 0, 0).render(width);
	}
	invalidate() {}
};
function wrappedSourceProjections(source, visualLines, displayStartCell, finalJoiner) {
	const semanticSource = stripCopyDecorations(source);
	const projections = [];
	let cursor = 0;
	for (const visualLine of visualLines) {
		const visibleText = stripCopyDecorations(visualLine).trimEnd();
		const found = visibleText === "" ? cursor : semanticSource.indexOf(visibleText, cursor);
		const start = found >= cursor ? found : cursor;
		if (projections.length > 0) {
			const previous = projections[projections.length - 1];
			if (previous !== void 0) projections[projections.length - 1] = {
				...previous,
				joinerAfter: semanticSource.slice(cursor, start)
			};
		}
		projections.push({
			text: visibleText,
			displayStartCell,
			joinerAfter: ""
		});
		cursor = start + visibleText.length;
	}
	const last = projections[projections.length - 1];
	if (last !== void 0) {
		const trailing = semanticSource.slice(cursor);
		projections[projections.length - 1] = {
			...last,
			text: last.text + trailing,
			joinerAfter: finalJoiner
		};
	}
	return projections;
}
function plainSelectionLines(text, width) {
	const logicalLines = escapeTerminalText(text).replace(/\t/gu, "   ").split("\n");
	return logicalLines.flatMap((logicalLine, index) => {
		const visualLines = wrapTextWithAnsi(logicalLine, Math.max(1, width));
		return wrappedSourceProjections(logicalLine, visualLines.length === 0 ? [""] : visualLines, 0, index < logicalLines.length - 1 ? "\n" : "");
	});
}
function fallbackSelectionLines(lines, width) {
	return lines.map((line, index) => {
		const text = stripCopyDecorations(line).trimEnd();
		return {
			text,
			displayStartCell: 0,
			joinerAfter: index < lines.length - 1 && visibleWidth(text) < Math.max(1, width) ? "\n" : ""
		};
	});
}
var CodeRow = class {
	selectionLines = [];
	constructor(row) {
		this.row = row;
	}
	getSelectionLines() {
		return this.selectionLines;
	}
	render(width) {
		const safeWidth = Math.max(1, width);
		const requestedPrefix = escapeTerminalText(this.row.prefix ?? "");
		const prefix = visibleWidth(requestedPrefix) < safeWidth ? requestedPrefix : "";
		const prefixWidth = visibleWidth(prefix);
		const numbers = this.row.lineNumbers;
		const highest = numbers?.reduce((value, number) => Math.max(value, number), 0) ?? 0;
		const numberWidth = numbers !== void 0 && safeWidth - prefixWidth >= 8 ? String(highest).length + 2 : 0;
		const codeWidth = Math.max(1, safeWidth - prefixWidth - numberWidth);
		const highlighted = highlightCodeLines(this.row.text, this.row.language);
		const rows = [];
		const projections = [];
		if (this.row.caption !== void 0) {
			const safeCaption = escapeTerminalText(this.row.caption);
			const captionRows = new Text(`${color.muted(prefix)}${color.muted(safeCaption)}`, 0, 0).render(safeWidth);
			rows.push(...captionRows);
			const captionProjections = wrappedSourceProjections(`${requestedPrefix}${safeCaption}`, captionRows, 0, highlighted.length > 0 ? "\n" : "");
			const firstCaption = captionProjections[0];
			if (firstCaption !== void 0 && firstCaption.text.startsWith(requestedPrefix)) captionProjections[0] = {
				...firstCaption,
				text: firstCaption.text.slice(requestedPrefix.length),
				displayStartCell: prefixWidth
			};
			projections.push(...captionProjections);
		}
		for (const [index, sourceLine] of highlighted.entries()) {
			const wrapped = wrapTextWithAnsi(sourceLine, codeWidth);
			const parts = wrapped.length === 0 ? [""] : wrapped;
			projections.push(...wrappedSourceProjections(sourceLine, parts, prefixWidth + numberWidth, index < highlighted.length - 1 ? "\n" : ""));
			for (const [partIndex, part] of parts.entries()) {
				const number = numbers?.[index];
				const gutter = numberWidth === 0 ? "" : color.muted(partIndex === 0 && number !== void 0 ? `${String(number).padStart(numberWidth - 1)} ` : " ".repeat(numberWidth));
				const padded = `${part}${" ".repeat(Math.max(0, codeWidth - visibleWidth(part)))}`;
				const connector = prefix === "" ? "" : this.row.caption === void 0 && index === 0 && partIndex === 0 ? color.muted(prefix) : " ".repeat(prefixWidth);
				rows.push(`${connector}${gutter}${background.code(padded)}`);
			}
		}
		this.selectionLines = projections;
		return rows;
	}
	invalidate() {}
};
/** Shared code layout used by the native worker, including source-only padding removal. */
function renderNativeCode(row, width) {
	const component = new CodeRow(row);
	const lines = component.render(width);
	const projections = component.getSelectionLines();
	return lines.map((line, index) => {
		const projection = projections[index];
		return projection?.text ? truncateToWidth(line, projection.displayStartCell + visibleWidth(projection.text), "", false) : line;
	});
}
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
	const name = attachment.name ?? String(attachment.attachmentId);
	return ui(`[图片 · ${name} · ${attachment.width}×${attachment.height} · ${attachment.mediaType} · ${attachment.bytes} 字节]`, `[Image · ${name} · ${attachment.width}×${attachment.height} · ${attachment.mediaType} · ${attachment.bytes} bytes]`);
}
function jsonText(value) {
	if (value === void 0 || typeof value === "function" || typeof value === "symbol") return String(value);
	try {
		const rendered = JSON.stringify(value, null, 2);
		return rendered.length > 8e3 ? `${rendered.slice(0, 8e3)}\n${ui("…（终端显示已截断）", "… (terminal display truncated)")}` : rendered;
	} catch {
		return typeof value === "bigint" ? value.toString() : ui("[内容无法序列化]", "[content cannot be serialized]");
	}
}
function contentBlockText(block$1) {
	if (typeof block$1 !== "object" || block$1 === null) return String(block$1);
	const value = block$1;
	if (value.type === "text" || value.type === "reasoning") return typeof value.text === "string" ? value.text : `[${value.type}]`;
	if (value.type === "image") return ui("[图片附件]", "[image attachment]");
	if (value.type === "tool-result") return ui("[工具结果]", "[tool result]");
	return `[${typeof value.type === "string" ? value.type : ui("内容", "content")}]`;
}
function permissionCommandText(node) {
	if (node.name !== "permission" || node.outcome?.kind !== "success") return void 0;
	const preset = /^preset\s+(\S+)/u.exec(node.outcome.text ?? "")?.[1] ?? node.args?.trim();
	if (preset === void 0 || preset === "") return color.success(ui("权限已切换", "Permission changed"));
	const label = preset === "read-only" ? ui("只读", "Read only") : preset === "workspace-write" ? ui("工作区", "Workspace") : preset === "danger-full-access" ? ui("完全访问", "Full access") : preset;
	return color.success(ui(`权限已切换为${label}`, `Permission changed to ${label}`));
}
function planCommandText(node) {
	if (node.name !== "plan") return void 0;
	if (node.outcome === null) return color.warning(ui("正在切换计划模式", "Switching plan mode"));
	if (node.outcome.kind !== "success") return color.danger(ui(`计划模式切换失败${node.outcome.text === void 0 ? "" : `\n${node.outcome.text}`}`, `Failed to switch plan mode${node.outcome.text === void 0 ? "" : `\n${node.outcome.text}`}`));
	const text = node.outcome.text ?? "";
	if (node.args?.trim() === "off") {
		if (text.includes("entry cancelled")) return color.success(ui("已取消进入计划模式", "Plan-mode entry cancelled"));
		if (text.includes("already inactive")) return color.muted(ui("计划模式未开启", "Plan mode is not active"));
		if (text.startsWith("Leaving ")) return color.success(ui("计划模式将在下一步关闭", "Plan mode will stop on the next step"));
		return color.success(ui("计划模式已关闭", "Plan mode disabled"));
	}
	return color.success(text.startsWith("Entering ") ? ui("计划模式将在下一步开启", "Plan mode will start on the next step") : ui("计划模式已开启", "Plan mode enabled"));
}
function goalCommandText(node) {
	if (node.name !== "goal") return void 0;
	if (node.outcome === null) return color.warning(ui("正在处理目标", "Processing goal"));
	const args = node.args?.trim() ?? "";
	const action = args.toLowerCase();
	if (node.outcome.kind !== "success") {
		if (node.outcome.text?.startsWith("A goal is already ") === true) return color.danger(ui("已有进行中的目标；可编辑或清除后重新创建", "A goal is already active; edit or clear it before creating another"));
		if (action === "edit") return color.danger(ui("请提供新的目标内容", "Provide the new goal text"));
		if (node.outcome.text?.startsWith("No goal is currently set") === true) return color.danger(ui("当前没有目标", "No active goal"));
		return color.danger(ui("当前状态不能执行此目标操作", "This goal action is not valid in the current state"));
	}
	if (action === "clear") return color.success(node.outcome.text === "No goal to clear." ? ui("当前没有目标", "No active goal") : ui("目标已清除", "Goal cleared"));
	if (action === "pause") return color.success(ui("目标已暂停", "Goal paused"));
	if (action === "resume") return color.success(ui("目标已继续", "Goal resumed"));
	if (action.startsWith("edit ")) return color.success(ui(`目标已更新：${args.slice(5).trim()}`, `Goal updated: ${args.slice(5).trim()}`));
	if (args !== "") return color.success(ui(`目标已创建：${args}`, `Goal created: ${args}`));
	if (node.outcome.text?.startsWith("No goal is currently set.") === true) return color.muted(ui("当前没有目标", "No active goal"));
	const objective = /^Objective: (.*)$/mu.exec(node.outcome.text ?? "")?.[1];
	const phase = /^Status: (\S+)$/mu.exec(node.outcome.text ?? "")?.[1];
	const blocker = /^Blocker: (.*)$/mu.exec(node.outcome.text ?? "")?.[1];
	const phaseLabel = phase === "active" ? ui("进行中", "In progress") : phase === "paused" ? ui("已暂停", "Paused") : phase === "blocked" ? ui("受阻", "Blocked") : phase === "complete" ? ui("已完成", "Completed") : void 0;
	return [
		objective === void 0 ? ui("当前目标", "Current goal") : ui(`目标：${objective}`, `Goal: ${objective}`),
		...phaseLabel === void 0 ? [] : [ui(`状态：${phaseLabel}`, `Status: ${phaseLabel}`)],
		...blocker === void 0 ? [] : [ui(`阻塞原因：${blocker}`, `Blocked by: ${blocker}`)]
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
				text: color.warning(ui("[图片附件元数据无效]", "[invalid image attachment metadata]"))
			}] : [imageRow(attachment)];
		}
		return [{
			format: "plain",
			text: contentBlockText(block$1)
		}];
	});
}
function userContentRows(content, steering = false) {
	const rows = contentRows(content).map((row) => row.format === "markdown" ? {
		...row,
		format: "plain"
	} : row);
	const prefix = steering ? `${color.brand(">")} ${color.muted(ui("引导", "Steering"))} ` : `${color.brand(">")} `;
	const first = rows[0];
	return [
		{
			format: "rule",
			text: "",
			userTurn: true
		},
		...first === void 0 || first.format === "image" ? [{
			format: "plain",
			text: prefix.trimEnd()
		}, ...rows] : [{
			...first,
			text: `${prefix}${first.text}`
		}, ...rows.slice(1)],
		{
			format: "rule",
			text: ""
		}
	];
}
function assistantBlockText(block$1, preferences) {
	switch (block$1.kind) {
		case "text": return block$1.text;
		case "reasoning": return preferences.reasoning ? color.muted(`${ui("思考", "Reasoning")}\n${block$1.text}`) : "";
		case "image": return color.muted(ui("[图片附件]", "[image attachment]"));
		case "tool-call":
			if (preferences.tools === "hidden") return "";
			return color.accent(`◆ ${block$1.name}${preferences.tools === "expanded" ? `\n${prettyArgs(block$1.argsRaw)}` : ""}`);
		case "other": return color.muted(ui("模型扩展内容 · /trajectory 查看详情", "Extended model content · use /trajectory for details"));
	}
}
function assistantBlockRows(block$1, preferences, liveReasoning = false, reasoning) {
	switch (block$1.kind) {
		case "text": return block$1.text === "" ? [] : [{
			format: "markdown",
			text: block$1.text
		}];
		case "reasoning": {
			if (block$1.text === "") return [];
			if (reasoning !== void 0 && !reasoning.expanded) return [];
			if (reasoning === void 0 && !preferences.reasoning && !liveReasoning) return [];
			if (liveReasoning) return [{
				format: "plain",
				text: color.muted(block$1.text)
			}];
			const quoted = block$1.text.split("\n").map((line) => `> ${line}`).join("\n");
			return [{
				format: "markdown",
				text: reasoning === void 0 ? `> **${ui("思考", "Reasoning")}**\n>\n${quoted}` : quoted
			}];
		}
		case "image": return [imageRow(block$1.attachment)];
		case "tool-call":
			if (preferences.tools === "hidden") return [];
			return [{
				format: "plain",
				text: color.accent(`◆ ${block$1.name}`)
			}, ...preferences.tools === "expanded" ? [{
				format: "code",
				text: prettyArgs(block$1.argsRaw),
				language: "json"
			}] : []];
		case "other": return [{
			format: "plain",
			text: color.muted(ui("模型扩展内容 · /trajectory 查看详情", "Extended model content · use /trajectory for details"))
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
function diffText(value, context = DEFAULT_TUI_BEHAVIOR.diffContextLines) {
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
		rows.push(`diff -- ${path$1}`);
		rows.push(oldText === null ? "--- /dev/null" : `--- a/${path$1}`);
		rows.push(`+++ b/${path$1}`);
		const hunks = unifiedHunks(oldText, newText, context);
		for (const line of hunks) {
			if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
			if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
			rows.push(line);
		}
	}
	const visible = rows.length <= 80 ? rows : [
		...rows.slice(0, 40),
		ui(`@@ … 省略 ${rows.length - 80} 行 … @@`, `@@ … ${rows.length - 80} lines omitted … @@`),
		...rows.slice(-40)
	];
	visible.push(ui(`# +${added} -${removed} · ${paths.size} 个文件`, `# +${added} -${removed} · ${paths.size} file(s)`));
	return visible.join("\n");
}
const PRODUCT_TOOL_TITLES = {
	ask_user_question: {
		zh: "向用户提问",
		en: "Ask user"
	},
	create_goal: {
		zh: "创建目标",
		en: "Create goal"
	},
	exit_plan_mode: {
		zh: "计划审查",
		en: "Plan review"
	},
	get_goal: {
		zh: "查看目标",
		en: "View goal"
	},
	job_kill: {
		zh: "停止后台任务",
		en: "Stop background job"
	},
	job_list: {
		zh: "查看后台任务",
		en: "View background jobs"
	},
	job_output: {
		zh: "读取后台任务",
		en: "Read background job"
	},
	subagent: {
		zh: "子 Agent",
		en: "Subagent"
	},
	todo_write: {
		zh: "更新任务清单",
		en: "Update task list"
	},
	update_goal: {
		zh: "更新目标",
		en: "Update goal"
	},
	workflow: {
		zh: "工作流",
		en: "Workflow"
	}
};
function toolTitle(node) {
	const name = "kind" in node ? node.call?.name : node.name;
	const productTitle = name === void 0 ? void 0 : PRODUCT_TOOL_TITLES[name];
	if (productTitle !== void 0) return ui(productTitle.zh, productTitle.en);
	const callView = node.callView;
	if (callView?.card === "terminal") {
		const description = callView.description?.trim();
		return description === void 0 || description === "" ? ui("执行 Shell 指令", "Run shell command") : description;
	}
	if ("kind" in node) return node.resultView?.title ?? node.callView?.title ?? node.call?.name ?? node.callId;
	return node.callView?.title ?? node.name;
}
function settledToolFailed(node) {
	if (node.isError) return true;
	const result = node.resultView;
	return result?.card === "terminal" && (result.exitCode !== void 0 && result.exitCode !== 0 || result.signal !== void 0);
}
function contentDetails(content) {
	return content.flatMap((block$1) => {
		if (typeof block$1 !== "object" || block$1 === null) return [{
			kind: "plain",
			text: String(block$1)
		}];
		const value = block$1;
		if ((value.type === "text" || value.type === "reasoning") && typeof value.text === "string") return value.text === "" ? [] : [{
			kind: "markdown",
			text: value.text
		}];
		return [{
			kind: "plain",
			text: contentBlockText(block$1)
		}];
	});
}
function invocationCode(name, value) {
	return {
		kind: "code",
		text: `${name}(${typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0 ? "" : jsonText(value)})`,
		language: "typescript"
	};
}
function toolInvocationDetail(name, argsRaw) {
	try {
		return invocationCode(name, JSON.parse(argsRaw));
	} catch {
		return {
			kind: "code",
			text: `${name}(${argsRaw})`,
			language: "typescript"
		};
	}
}
function fallbackInvocationDetail(value) {
	return invocationCode("tool", value);
}
function terminalCommandDetail(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const view = value;
	if (view.card !== "terminal" || typeof view.title !== "string" || view.title === "") return void 0;
	return {
		kind: "code",
		text: `$ ${view.title}`,
		language: "bash"
	};
}
function readInvocationFallback(node) {
	const result = node.resultView;
	if (result?.card === "read") return invocationCode("read", { file_path: String(result.path) });
	const call = node.callView;
	if (call?.card !== "generic" || call.kind !== "read") return void 0;
	const location = (Array.isArray(call.locations) ? call.locations : []).find((candidate) => typeof candidate === "object" && candidate !== null && "path" in candidate && typeof candidate.path === "string" && candidate.path !== "");
	return location === void 0 ? void 0 : invocationCode("read", { file_path: location.path });
}
function settledInvocationDetails(node, context) {
	const call = node.callView;
	const details = [];
	if (call?.card === "terminal") {
		const command = terminalCommandDetail(call);
		if (command !== void 0) details.push(command);
	} else if (call?.card === "diff") details.push({
		kind: "code",
		text: diffText(call.diffs, context),
		language: "diff"
	});
	else if (node.call !== null) details.push(toolInvocationDetail(node.call.name, node.call.argsRaw));
	else if (call?.card === "generic" && call.rawInput !== void 0) details.push(fallbackInvocationDetail(call.rawInput));
	const readFallback = details.length === 0 ? readInvocationFallback(node) : void 0;
	if (readFallback !== void 0) details.push(readFallback);
	return details;
}
function viewDetails(node, context) {
	const result = node.resultView;
	const details = settledInvocationDetails(node, context);
	if (result?.card === "terminal") {
		if (result.output !== void 0) details.push({
			kind: "plain",
			text: result.output
		});
		if (result.exitCode !== void 0) details.push({
			kind: "plain",
			text: ui(`退出码 ${result.exitCode}`, `Exit code ${result.exitCode}`)
		});
		if (result.signal !== void 0) details.push({
			kind: "plain",
			text: ui(`信号 ${result.signal}`, `Signal ${result.signal}`)
		});
	} else if (result?.card === "diff") details.push({
		kind: "code",
		text: diffText(result.diffs, context),
		language: "diff"
	});
	else if (result?.card === "generic" && result.content !== void 0) details.push(...contentDetails(result.content));
	else if (result?.card === "read") {
		const lines = result.lines;
		const path$1 = String(result.path);
		const language = syntaxLanguageForPath(path$1, typeof result.lang === "string" ? result.lang : void 0);
		const first = lines[0]?.number ?? Number(result.offset);
		const last = lines.at(-1)?.number ?? first;
		details.push({
			kind: "code",
			text: lines.map((line) => line.text).join("\n"),
			...language === void 0 ? {} : { language },
			caption: `${path$1} · ${String(first)}–${String(last)} / ${String(result.totalLines)}`,
			lineNumbers: lines.map((line) => line.number)
		});
	} else if (result?.card === "search" && result.shape === "matches") {
		const files = result.files;
		for (const file of files) {
			const language = syntaxLanguageForPath(file.path);
			details.push({
				kind: "code",
				text: file.matches.map((match) => match.line).join("\n"),
				...language === void 0 ? {} : { language },
				caption: file.path,
				lineNumbers: file.matches.map((match) => match.lineNumber)
			});
		}
		if (result.truncated) details.push({
			kind: "plain",
			text: ui(`只显示部分结果 · 共 ${String(result.total)} 项`, `Partial results · ${String(result.total)} item(s) total`)
		});
	} else if (result?.card === "search") {
		details.push({
			kind: "plain",
			text: result.paths.join("\n")
		});
		if (result.truncated) details.push({
			kind: "plain",
			text: ui(`只显示部分结果 · 共 ${String(result.total)} 项`, `Partial results · ${String(result.total)} item(s) total`)
		});
	} else if (result?.card === "web" && result.kind === "search") {
		if (result.answer !== void 0) details.push({
			kind: "markdown",
			text: result.answer
		});
		const sources = result.sources;
		details.push(...sources.map((source) => ({
			kind: "plain",
			text: `${source.title ?? source.url}\n${source.url}${source.snippet === void 0 ? "" : `\n${source.snippet}`}`
		})));
		if (result.truncated) details.push({
			kind: "plain",
			text: ui("来源列表已截断", "Source list truncated")
		});
	} else if (result?.card === "web") {
		details.push({
			kind: "plain",
			text: `${result.statusCode} · ${result.url}${result.truncated ? ui(" · 内容已截断", " · content truncated") : ""}`
		});
		details.push(...contentDetails(node.content));
	} else if (result?.card === "generic") details.push(...contentDetails(node.content));
	else details.push(...contentDetails(node.content));
	if (node.meta !== void 0) details.push({
		kind: "code",
		text: jsonText(node.meta),
		language: "json",
		caption: ui("元数据", "Metadata")
	});
	return details.filter((value) => value.text !== "");
}
function runningViewDetails(node, context) {
	const view = node.callView;
	if (view?.card === "terminal") {
		const command = terminalCommandDetail(view);
		return command === void 0 ? [] : [command];
	}
	if (view?.card === "diff") return [{
		kind: "code",
		text: diffText(view.diffs, context),
		language: "diff"
	}];
	return [toolInvocationDetail(node.name, node.argsRaw)];
}
/** Flatten the same tool preview the transcript uses so approval overlays are not blind. */
function toolApprovalPreview(call, context = DEFAULT_TUI_BEHAVIOR.diffContextLines) {
	if (call === void 0) return "";
	return runningViewDetails(call, context).map((detail) => detail.text).filter((text) => text !== "").join("\n");
}
function foldDetail(detail, limit) {
	const folded = foldLineBlock(detail.text, limit);
	return folded.omitted === 0 ? detail : {
		...detail,
		text: folded.text
	};
}
function detailRow(detail, depth) {
	if (detail.kind === "plain") return {
		format: "plain",
		text: detail.text
	};
	if (detail.kind === "markdown") return {
		format: "markdown",
		text: detail.text
	};
	return {
		format: "code",
		text: detail.text,
		...detail.language === void 0 ? {} : { language: detail.language },
		...detail.caption === void 0 ? {} : { caption: detail.caption },
		...detail.lineNumbers === void 0 ? {} : { lineNumbers: detail.lineNumbers },
		prefix: `${"  ".repeat(depth + 1)}⎿  `
	};
}
function toolFocusMark(preferences, key) {
	return key !== void 0 && preferences.focusedTool === key ? color.accent("› ") : "";
}
function toolCardExpanded(preferences, key) {
	if (preferences.tools === "hidden") return false;
	if (key !== void 0) {
		if (preferences.expandedTools.has(key)) return true;
		if (preferences.collapsedTools.has(key)) return false;
	}
	return preferences.tools === "expanded";
}
function callKey(block$1, fallback) {
	if ("callId" in block$1 && typeof block$1.callId === "string" && block$1.callId !== "") return block$1.callId;
	return fallback;
}
function toolBlockRows(block$1, preferences, depth, cardKey) {
	const prefix = depth === 0 ? "◆ " : `${"  ".repeat(depth)}↳ `;
	const key = callKey(block$1, cardKey);
	const expanded = toolCardExpanded(preferences, key);
	if ("kind" in block$1) {
		const duration = block$1.callTime === null ? "" : ` · ${toolDurationText(Math.max(0, block$1.time - block$1.callTime))}`;
		const failed = settledToolFailed(block$1);
		const details$1 = expanded ? viewDetails(block$1, preferences.diffContextLines) : [];
		return [
			{
				format: "plain",
				text: `${toolFocusMark(preferences, key)}${prefix}${color.accent(toolTitle(block$1))}${failed ? ` · ${color.danger(ui("失败", "Failed"))}` : ""}${duration}`,
				...depth === 0 && key !== void 0 ? { toolKey: key } : {}
			},
			...details$1.map((detail) => detailRow(foldDetail(detail, preferences.toolOutputLineLimit), depth)),
			...block$1.subCalls.flatMap((child) => toolBlockRows(child, preferences, depth + 1))
		];
	}
	const details = expanded ? runningViewDetails(block$1, preferences.diffContextLines) : [];
	return [
		{
			format: "plain",
			text: `${toolFocusMark(preferences, key)}${prefix}${color.accent(toolTitle(block$1))}`,
			pulse: "marker",
			liveDurationSince: block$1.time,
			...depth === 0 && key !== void 0 ? { toolKey: key } : {}
		},
		...details.map((detail) => detailRow(foldDetail(detail, preferences.toolOutputLineLimit), depth)),
		...block$1.subCalls.flatMap((child) => toolBlockRows(child, preferences, depth + 1))
	];
}
function toolBlockText(block$1, preferences, depth) {
	return toolBlockRows(block$1, preferences, depth).map((row) => row.format === "image" ? imageLabel(row.attachment) : row.text).join("\n");
}
function nodeText(node, preferences) {
	switch (node.kind) {
		case "user": return `${color.brand(">")} ${contentText(node.content)}`;
		case "steering": return `${color.brand(">")} ${color.muted(ui("引导", "Steering"))} ${contentText(node.content)}`;
		case "context": return `${color.muted(`${node.provenance.role === "recall" ? ui("召回", "Recall") : ui("上下文", "Context")}${node.provenance.label === null ? "" : ` · ${node.provenance.label}`}${node.form === null ? ui(" · 未知格式", " · unknown format") : ` · ${node.form}`}`)}\n${contentText(node.content)}`;
		case "assistant": return `${node.blocks.map((block$1) => assistantBlockText(block$1, preferences)).filter(Boolean).join("\n")}${node.interrupted === true ? color.warning(ui("\n已停止", "\nStopped")) : ""}`;
		case "command": return permissionCommandText(node) ?? planCommandText(node) ?? goalCommandText(node) ?? (node.outcome === null ? color.warning(ui(`命令 /${node.name ?? "unknown"}${node.args ?? ""} · 执行中`, `Command /${node.name ?? "unknown"}${node.args ?? ""} · running`)) : `${node.outcome.kind === "success" ? color.success(ui("命令完成", "Command completed")) : color.danger(ui("命令失败", "Command failed"))} /${node.name ?? "unknown"}${node.args ?? ""}${node.outcome.text === void 0 ? "" : `\n${node.outcome.text}`}`);
		case "tool-result": return preferences.tools === "hidden" ? "" : toolBlockText(node, preferences, 0);
		case "compaction": return color.muted(ui(`上下文已压缩${node.shadowedItemCount === null ? "" : ` · ${node.shadowedItemCount} 项`}${node.shadowedTokenCount === null ? "" : ` · 约 ${node.shadowedTokenCount} Token`}${node.summary === null ? "" : `\n${node.summary}`}`, `Context compacted${node.shadowedItemCount === null ? "" : ` · ${node.shadowedItemCount} item(s)`}${node.shadowedTokenCount === null ? "" : ` · about ${node.shadowedTokenCount} tokens`}${node.summary === null ? "" : `\n${node.summary}`}`));
		case "model-retry": return color.warning(ui(`模型请求${node.retryState === "scheduled" ? "等待重试" : node.retryState === "started" ? "正在重试" : "重试已取消"} · ${node.provider} · 第 ${node.retry} 次${node.mode === "normal" ? `/${node.maxRetries}` : ""} · ${node.delayMs} ms`, `Model request ${node.retryState === "scheduled" ? "waiting to retry" : node.retryState === "started" ? "retrying" : "retry cancelled"} · ${node.provider} · attempt ${node.retry}${node.mode === "normal" ? `/${node.maxRetries}` : ""} · ${node.delayMs} ms`));
		case "turn-error": return color.danger(ui(`本轮执行失败${node.code === void 0 ? "" : ` [${node.code}]`}\n${node.message}`, `Turn failed${node.code === void 0 ? "" : ` [${node.code}]`}\n${node.message}`));
		case "turn-max-tokens": return color.warning(ui("本轮已达到最大 Token 数", "This turn reached the token limit"));
		case "unknown": return color.muted(ui(`未知事件 ${node.type} · /trajectory 查看详情`, `Unknown event ${node.type} · use /trajectory for details`));
		default: return color.muted(ui("未知会话事件 · /trajectory 查看详情", "Unknown session event · use /trajectory for details"));
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
		case "running": return ui("运行中", "Running");
		case "completed": return ui("已完成", "Completed");
		case "failed": return ui("失败", "Failed");
		case "cancelled": return ui("已取消", "Cancelled");
		case "interrupted": return ui("已中断", "Interrupted");
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
	if (safe === "") return ui(`成员 ${member.seq}`, `Member ${member.seq}`);
	const generated = /^agent-([a-z0-9]+)$/iu.exec(safe);
	return generated === null ? safe : `Agent ${generated[1] ?? String(member.seq)}`;
}
function workflowText(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const workflow = value;
	if (typeof workflow.name !== "string" || typeof workflow.status !== "string" || !Array.isArray(workflow.phases)) return;
	const rows = workflow.phases.flatMap((phase) => {
		const phaseLabel = phase.phase === null ? void 0 : escapeTerminalText(phase.phase.trim()) || ui("未命名阶段", "Unnamed phase");
		const members = phase.members.map((member) => `    ${workflowStatusText(member.status)} · ${workflowMemberLabel(member)}`);
		return phaseLabel === void 0 ? members.map((row) => row.slice(2)) : [`  ${color.muted(phaseLabel)}`, ...members];
	});
	const name = escapeTerminalText(workflow.name);
	return `${color.accent(ui(`工作流 · ${name}`, `Workflow · ${name}`))} · ${workflowStatusText(workflow.status)}${rows.length === 0 ? "" : `\n${rows.join("\n")}`}`;
}
function deliverablesText(node, data) {
	if (!isConversationNode(data) || data.kind !== "assistant") return "";
	const location = node.location;
	if (location.kind !== "turn" && location.kind !== "step") return "";
	const produced = producedForClosing(location.turn.data.get("deliverables"), data.seq);
	return produced.length === 0 ? "" : `\n${color.success(ui(`生成文件 · ${produced.join(" · ")}`, `Produced files · ${produced.join(" · ")}`))}`;
}
function grouped(rows) {
	return rows.map((row, index) => index === 0 ? {
		...row,
		gapBefore: true
	} : row);
}
function deliverablesFingerprint(node) {
	if (!isConversationNode(node.data) || node.data.kind !== "assistant") return [];
	const location = node.location;
	if (location.kind !== "turn" && location.kind !== "step") return [];
	return producedForClosing(location.turn.data.get("deliverables"), node.data.seq);
}
function nodeFingerprint(node, preferences, source = structuralToken({
	kind: node.kind,
	data: node.data,
	deliverables: deliverablesFingerprint(node)
})) {
	const tool = node.kind === "tool-call" ? toolChatData(node.data)?.root : void 0;
	const toolKey = tool === void 0 ? node.key : callKey(tool, node.key) ?? node.key;
	const presentation = structuralToken({
		tools: preferences.tools,
		reasoning: preferences.reasoning,
		toolOutputLineLimit: preferences.toolOutputLineLimit,
		diffContextLines: preferences.diffContextLines,
		expanded: preferences.expandedTools.has(toolKey),
		collapsed: preferences.collapsedTools.has(toolKey),
		reasoningExpanded: preferences.expandedReasoning.has(node.key),
		reasoningCollapsed: preferences.collapsedReasoning.has(node.key),
		focusedTool: preferences.focusedTool
	});
	return [
		String(source.length),
		...source,
		...presentation
	];
}
function reasoningExpanded(preferences, key, defaultExpanded) {
	if (preferences.collapsedReasoning.has(key)) return false;
	if (preferences.expandedReasoning.has(key)) return true;
	return preferences.reasoning || defaultExpanded;
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
function toolDurationText(milliseconds) {
	if (milliseconds <= 0) return "<1ms";
	if (milliseconds < 1e3) return `${String(Math.round(milliseconds))}ms`;
	return durationText(milliseconds);
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
	if (steps !== void 0 && steps > 0) groups.push(ui(`1 轮 · ${tokenText(steps)} 步`, `1 turn · ${tokenText(steps)} steps`));
	const llmMs = nonnegativeNumber(statistics?.llmMs);
	const toolMs = nonnegativeNumber(statistics?.toolMs);
	const durations = [...llmMs === void 0 || llmMs === 0 ? [] : [`LLM ${durationText(llmMs)}`], ...toolMs === void 0 || toolMs === 0 ? [] : [ui(`工具调用 ${durationText(toolMs)}`, `Tools ${durationText(toolMs)}`)]];
	if (durations.length > 0) groups.push(durations.join(" · "));
	const ttftMs = nonnegativeNumber(statistics?.ttftMs);
	const ttftSteps = nonnegativeNumber(statistics?.ttftSteps);
	const decodeMs = nonnegativeNumber(statistics?.decodeMs);
	const decodeTokens = nonnegativeNumber(statistics?.decodeTokens);
	const performance$1 = [...ttftMs === void 0 || ttftSteps === void 0 || ttftSteps === 0 ? [] : [ui(`首 token 平均 ${durationText(ttftMs / ttftSteps)}`, `Average first token ${durationText(ttftMs / ttftSteps)}`)], ...decodeMs === void 0 || decodeTokens === void 0 || decodeMs === 0 ? [] : [`${String(Math.round(decodeTokens / (decodeMs / 1e3) * 10) / 10)} tok/s`]];
	if (performance$1.length > 0) groups.push(performance$1.join(" · "));
	const uncached = nonnegativeNumber(usage?.uncachedInputTokens);
	const cacheRead = nonnegativeNumber(usage?.cacheReadTokens);
	const cacheWrite = nonnegativeNumber(usage?.cacheWriteTokens);
	const output = nonnegativeNumber(usage?.outputTokens);
	if (uncached !== void 0 && cacheRead !== void 0 && cacheWrite !== void 0 && output !== void 0) {
		const input = uncached + cacheRead + cacheWrite;
		if (input > 0) groups.push(ui(`缓存命中 ${String(Math.round(cacheRead / input * 100))}%`, `Cache hit ${String(Math.round(cacheRead / input * 100))}%`));
		if (input > 0 || output > 0) groups.push(ui(`输入 ${tokenText(input)} tok · 输出 ${tokenText(output)} tok`, `Input ${tokenText(input)} tok · output ${tokenText(output)} tok`));
	}
	if (groups.length > 0) return color.muted(groups.join("  |  "));
	const legacy = [...nonnegativeNumber(value.ttftMs) === void 0 ? [] : [ui(`首 token ${durationText(nonnegativeNumber(value.ttftMs) ?? 0)}`, `First token ${durationText(nonnegativeNumber(value.ttftMs) ?? 0)}`)], ...nonnegativeNumber(value.tokensPerSecond) === void 0 ? [] : [`${String(Math.round((nonnegativeNumber(value.tokensPerSecond) ?? 0) * 10) / 10)} tok/s`]];
	return legacy.length === 0 ? "" : color.muted(legacy.join(" · "));
}
function assistantStepData(data) {
	if (typeof data !== "object" || data === null) return void 0;
	const value = data;
	return (value.status === "running" || value.status === "settled" || value.status === "interrupted") && Array.isArray(value.blocks) ? value : void 0;
}
function assistantStepRows(data, preferences, fallbackKey) {
	const step = assistantStepData(data);
	if (step === void 0) return [];
	const hasReasoning = step.blocks.some((block$1) => block$1.kind === "reasoning" && block$1.text !== "");
	const thinking = !step.blocks.some((block$1) => block$1.kind === "text" && block$1.text !== "") && step.status === "running";
	const key = fallbackKey;
	const expanded = reasoningExpanded(preferences, key, thinking);
	const content = step.blocks.flatMap((block$1) => block$1.kind === "tool-call" ? [] : assistantBlockRows(block$1, preferences, thinking, {
		key,
		expanded
	}));
	if (content.length === 0 && step.status === "settled" && !hasReasoning) return [];
	const rows = [];
	if (hasReasoning) rows.push(thinking ? thinkingRow(key, expanded) : reasoningHeaderRow(key, expanded));
	rows.push(...content);
	if (step.status === "interrupted") rows.push({
		format: "plain",
		text: color.warning(ui("已停止", "Stopped"))
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
		text: color.muted(ui("◆ 后台任务已结束", "◆ Background job finished"))
	}]);
	if (node.provenance.role === "recall") {
		const source = node.provenance.label === null ? "" : ` · ${node.provenance.label}`;
		return grouped([{
			format: "plain",
			text: color.muted(ui(`跨会话召回${source} · /trajectory 查看`, `Cross-session recall${source} · view with /trajectory`))
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
		text: color.muted(ui("◆ 子 Agent 已结束", "◆ Subagent finished")),
		userTurn: true
	}]);
	if (node.source.kind !== "subagent-report") return void 0;
	return grouped([{
		format: "plain",
		text: `${color.brand(">")} ${color.muted(ui("子 Agent 报告", "Subagent report"))}`,
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
	if (node.kind === "assistant-step") return assistantStepRows(node.data, preferences, node.key);
	if (node.kind === "tool-call") {
		if (preferences.tools === "hidden") return [];
		const data = toolChatData(node.data);
		return data === void 0 ? [] : grouped(toolBlockRows(data.root, preferences, 0, node.key));
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
			const rows = [...node.data.blocks.flatMap((block$1) => assistantBlockRows(block$1, preferences))];
			if (node.data.interrupted === true) rows.push({
				format: "plain",
				text: color.warning(ui("已停止", "Stopped"))
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
	if (commandInputText !== void 0) return grouped(userContentRows([{
		type: "text",
		text: commandInputText
	}]));
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
		text: color.muted(ui(`扩展节点 ${node.kind} · /trajectory 查看详情`, `Extended node ${node.kind} · use /trajectory for details`))
	}]);
}
function transcriptBlockMetadata(rows, sourceMayChange = false) {
	return {
		userTurnRows: rows.flatMap((row, index) => row.userTurn === true ? [index] : []),
		toolKeys: [...new Set(rows.flatMap((row) => row.toolKey === void 0 ? [] : [row.toolKey]))],
		dynamic: sourceMayChange || rows.some((row) => row.pulse !== void 0 || row.liveDurationSince !== void 0)
	};
}
/** Mutable pi-tui component backed only by the official conversation snapshot. */
var Transcript = class Transcript {
	/** Package-internal worker adapter: display rows only, no Session or persistence. */
	static prepareNativeRows(rows, width, first) {
		const transcript = new Transcript();
		try {
			transcript.setNativeMode(true);
			const rendered = transcript.renderBlock(first ? 0 : 1, width, {
				key: "prepared",
				rows: [...rows],
				components: rows.map((row) => transcript.component(row)),
				sourceToken: "",
				linesByWidth: /* @__PURE__ */ new Map(),
				metadata: transcriptBlockMetadata(rows, false),
				dirty: false
			});
			return rendered.lines.map((line, index) => {
				const projection = rendered.projections[index];
				return projection?.text ? truncateToWidth(line, projection.displayStartCell + visibleWidth(projection.text), "", false) : line;
			});
		} finally {
			transcript.dispose();
		}
	}
	blocks = [];
	imageComponents = /* @__PURE__ */ new Map();
	imageBlockOwners = /* @__PURE__ */ new Map();
	pendingImages = /* @__PURE__ */ new Set();
	imageGeneration = 0;
	imageLoader;
	snapshot;
	emptyMessage;
	sessionId;
	toolVisibility = "collapsed";
	reasoningVisible = false;
	toolOutputLineLimit = DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit;
	diffContextLines = DEFAULT_TUI_BEHAVIOR.diffContextLines;
	emptyState = true;
	hasMore = false;
	loadingOlder = false;
	scrollOffset = 0;
	viewportAnchor = {
		blockKey: "",
		lineOffset: 0,
		followLatest: true
	};
	viewportState;
	renderedLineCount = 0;
	turnAnchors = [];
	turnCursor;
	pulseFrame = 0;
	pulseTimer;
	lastFullLines = [];
	blockGeneration = 0;
	searchIndex;
	search;
	exampleCursor = 0;
	toolCursor = 0;
	toolFocus = false;
	expandedTools = /* @__PURE__ */ new Set();
	collapsedTools = /* @__PURE__ */ new Set();
	expandedReasoning = /* @__PURE__ */ new Set();
	collapsedReasoning = /* @__PURE__ */ new Set();
	reasoningStates = /* @__PURE__ */ new Map();
	nodeCache = /* @__PURE__ */ new Map();
	lineCache = /* @__PURE__ */ new WeakMap();
	focused = false;
	heightIndex = new HeightIndex();
	scrollbarVisible = DEFAULT_TUI_BEHAVIOR.scrollbarVisibility;
	pendingOlderAnchor;
	lastScrollbar;
	ownerCopy = /* @__PURE__ */ new Map();
	lastViewportMaps = [];
	selection;
	lineControls = /* @__PURE__ */ new Map();
	lastPointerControls = [];
	hoveredRegionId;
	emptyScrollPrimed = false;
	nativeMode = false;
	nativeTailEnabled = false;
	nativeHistoryPaused = false;
	nativeClosing = false;
	nativeHistory = new NativeHistory();
	nativeCodeStreams = /* @__PURE__ */ new Map();
	nativePreparations = /* @__PURE__ */ new Map();
	nativeSourceTokens = /* @__PURE__ */ new Map();
	nativeSourceOrder = [];
	nativeNotices = [];
	nativeRemoved = /* @__PURE__ */ new Set();
	nativePartCounts = /* @__PURE__ */ new Map();
	nativeSkipped = /* @__PURE__ */ new Map();
	nativeBlocks = [];
	nativeProjection = /* @__PURE__ */ new Map();
	nativeCandidates = /* @__PURE__ */ new Set();
	nativeIndexes = /* @__PURE__ */ new Map();
	nativeBatch;
	nativeBatchInFlight = false;
	/** Experimental display-only path; not a Harness setting. */
	setNativeTailEnabled(enabled) {
		this.nativeTailEnabled = enabled;
		this.resetNativeHistory();
	}
	resetNativeHistory() {
		this.clearNativePreparations();
		this.nativeHistory.reset();
		this.nativeSourceOrder = [];
		this.nativeNotices = [];
		this.nativeRemoved.clear();
		this.nativePartCounts.clear();
		this.nativeCodeStreams.clear();
		this.nativeSkipped.clear();
		this.nativeBatch = void 0;
		this.nativeBatchInFlight = false;
		this.indexNativeCandidates();
	}
	pauseNativeHistory(paused) {
		this.nativeHistoryPaused = paused;
	}
	finishNativeHistory() {
		this.nativeClosing = true;
	}
	cancelNativeReplay() {
		this.clearNativePreparations();
		for (const index of this.nativeCandidates) {
			const block$1 = this.nativeBlocks[index];
			if (!block$1.metadata.dynamic) this.nativeSkipped.set(block$1.key, this.nativeToken(block$1));
		}
		this.nativeBatch = void 0;
		this.nativeBatchInFlight = false;
		this.nativeHistory.discardPending();
		this.nativeHistoryPaused = false;
		this.nativeCodeStreams.clear();
		this.indexNativeCandidates();
	}
	clearNativePreparations() {
		for (const { job } of this.nativePreparations.values()) job.dispose();
		this.nativePreparations.clear();
	}
	/** Normal exit waits for asynchronous preparation before deciding the queue is empty. */
	async waitNativePreparation() {
		const waiting = [...this.nativePreparations.values()].filter(({ job }) => !job.page());
		if (!waiting.length) return false;
		await Promise.race(waiting.map(({ job }) => job.wait()));
		return true;
	}
	nativeHistoryPending() {
		if (!this.nativeMode || this.nativeHistoryPaused) return false;
		if (this.nativeNotices.length) return true;
		if (this.emptyState && !this.nativeBatch) return false;
		if (this.nativeBatch !== void 0) return true;
		for (const index of this.nativeCandidates) if (!this.nativeBlocks[index].metadata.dynamic) return true;
		return false;
	}
	nativeToken(block$1) {
		if (this.nativeProjection.has(block$1.key)) return block$1.sourceToken;
		return this.nativeSourceTokens.get(block$1.key) ?? block$1.sourceToken;
	}
	indexNativeCandidates() {
		if (!this.nativeTailEnabled) return;
		this.nativeBlocks = this.blocks.flatMap((block$1) => this.nativeProjection.get(block$1.key) ?? [block$1]);
		this.nativeCandidates.clear();
		this.nativeIndexes.clear();
		for (const [index, block$1] of this.nativeBlocks.entries()) {
			internals.nativeSnapshotBlocksChecked++;
			this.nativeIndexes.set(block$1.key, index);
			const token = this.nativeToken(block$1);
			const skipped = this.nativeSkipped.get(block$1.key);
			if (skipped !== void 0 && sameStructuralToken(skipped, token)) continue;
			if (!this.nativeHistory.isCommitted(block$1.key, token)) this.nativeCandidates.add(index);
		}
		for (const [key, state] of this.nativePreparations) {
			if (this.nativeIndexes.has(key)) continue;
			state.job.dispose();
			this.nativePreparations.delete(key);
			this.nativeHistory.discard(key);
		}
	}
	/** One bounded output batch; receipts become committed only after sink success. */
	takeNativeHistoryBatch() {
		const batch = this.nativeBatch;
		if (!batch || this.nativeBatchInFlight) return void 0;
		this.nativeBatchInFlight = true;
		const lines = batch.lines.slice(batch.offset, batch.offset + 256);
		const offset = batch.offset;
		let acknowledged = false;
		return {
			lines,
			acknowledge: () => {
				if (acknowledged) return;
				acknowledged = true;
				for (let i = 0; i < batch.receipts.length; i++) {
					const start = i === 0 ? 0 : batch.ends[i - 1];
					const delivered = Math.max(0, Math.min(offset + lines.length, batch.ends[i]) - Math.max(offset, start));
					this.nativeHistory.deliver(batch.receipts[i], delivered);
				}
				if (this.nativeBatch !== batch) return;
				batch.offset += lines.length;
				this.nativeBatchInFlight = false;
				if (batch.offset >= batch.lines.length) {
					for (const receipt of batch.deferCommit ? [] : batch.receipts) {
						this.nativeHistory.acknowledge(receipt);
						if (receipt.settled) this.nativeCodeStreams.delete(receipt.key);
						const index = this.nativeIndexes.get(receipt.key);
						const block$1 = index === void 0 ? void 0 : this.nativeBlocks[index];
						if (block$1 && this.nativeHistory.isCommitted(block$1.key, this.nativeToken(block$1))) this.nativeCandidates.delete(index);
					}
					this.nativeBatch = void 0;
					batch.complete?.();
				}
				this.requestRender();
			}
		};
	}
	renderNativeTail(width) {
		if (this.nativeHistoryPaused) return [];
		const inset = width >= 12 ? 2 : 0;
		const contentWidth = Math.max(1, width - inset * 2);
		const present = (lines) => lines.map((line) => line === "" ? "" : " ".repeat(inset) + line);
		const renderWhole = (index, block$1) => {
			const rendered = this.renderBlock(index, contentWidth, block$1);
			return present(rendered.lines.map((line, row) => {
				const projection = rendered.projections[row];
				return projection?.text ? truncateToWidth(line, projection.displayStartCell + visibleWidth(projection.text), "", false) : line;
			}));
		};
		const tail = [];
		const history = this.nativeBatch === void 0 ? this.nativeNotices.splice(0, 256).flatMap((line) => wrapTextWithAnsi(line, width)) : [];
		const receipts = [];
		const ends = [];
		let canCommit = this.nativeBatch === void 0;
		let historyBudgetReached = this.nativeBatch !== void 0;
		for (const index of this.nativeCandidates) {
			const block$1 = this.nativeBlocks[index];
			let dynamic = block$1.metadata.dynamic && !this.nativeClosing;
			const pending = this.nativeHistory.pendingFor(block$1.key);
			const only = block$1.rows.length === 1 && block$1.rows[0]?.format === "markdown" ? block$1.rows[0] : void 0;
			const preparedRow = block$1.rows.length === 1 && [
				"markdown",
				"plain",
				"code"
			].includes(block$1.rows[0].format) ? block$1.rows[0] : void 0;
			const largeMixed = preparedRow === void 0 && block$1.rows.reduce((size, row) => size + ("text" in row ? row.text.length : 0), 0) > NATIVE_MARKDOWN_THRESHOLD;
			let source = preparedRow?.text;
			const fence = only === void 0 ? void 0 : fencedCodeRange(only.text);
			let longLine = false;
			if (source && source.length > NATIVE_MARKDOWN_THRESHOLD && fence) for (let start = 0; start < source.length;) {
				const end = source.indexOf("\n", start);
				if ((end < 0 ? source.length : end) - start > 8192) {
					longLine = true;
					break;
				}
				if (end < 0) break;
				start = end + 1;
			}
			if (largeMixed || this.nativePreparations.get(block$1.key)?.receipt || source !== void 0 && source.length > NATIVE_MARKDOWN_THRESHOLD && (!fence || longLine || source.length - (fence.closeEnd ?? source.length) > 8192)) {
				if (this.nativeBatch || history.length || receipts.length) break;
				const revision = canvasStyleRevision();
				const tailRows = dynamic ? Math.max(1, Math.min(256, this.viewportRows())) : void 0;
				let state = this.nativePreparations.get(block$1.key);
				let preview = state?.preview;
				if (state?.receipt) dynamic = false;
				if (state && (state.job.width !== contentWidth || state.job.revision !== revision || state.job.tailRows !== tailRows || !sameStructuralToken(state.token, this.nativeToken(block$1)) && state.job.page() !== void 0)) {
					if (!state.receipt) {
						if (dynamic && state.job.width === contentWidth && state.job.revision === revision) preview = state.job.page()?.lines ?? state.preview;
						else preview = void 0;
						state.job.dispose();
						this.nativePreparations.delete(block$1.key);
						state = void 0;
					}
				}
				if (!state) {
					state = {
						job: new NativeMarkdownPreparation(source ?? "", contentWidth, revision, tailRows, this.requestRender, this.nativeMarkdownWorkerFactory, preparedRow, largeMixed ? block$1.rows : void 0, index === 0),
						token: this.nativeToken(block$1)
					};
					if (preview && dynamic) state.preview = preview;
					this.nativePreparations.set(block$1.key, state);
				}
				const page = state.job.page();
				if (!page) {
					if (state.preview && dynamic) tail.push(...present(state.preview));
					else tail.push(color.muted(ui("正在准备长段内容…", "Preparing long content…")));
					canCommit = false;
					if (!dynamic) break;
					continue;
				}
				if (dynamic) {
					tail.push(...present(page.lines));
					canCommit = false;
					continue;
				}
				if (!canCommit) continue;
				const token$1 = this.nativeToken(block$1);
				if (!state.receipt) {
					if (this.nativeHistory.get(block$1.key) || this.nativeHistory.deliveredFor(block$1.key) || this.nativeSkipped.has(block$1.key)) history.push(color.muted(ui(`── 更新 · ${escapeTerminalText(block$1.key)} ──`, `── Update · ${escapeTerminalText(block$1.key)} ──`)));
					if (index > 0 && preparedRow?.gapBefore) history.push("");
					state.receipt = this.nativeHistory.reserve(block$1.key, token$1, 0, source?.length ?? 0, source, true);
				}
				const deliveredLines = state.job.width === contentWidth ? page.lines : page.lines.flatMap((line) => wrapTextWithAnsi(line, contentWidth));
				history.push(...present(deliveredLines));
				const prepared = state;
				this.nativeBatch = {
					lines: [...history],
					receipts: [prepared.receipt],
					ends: [history.length],
					offset: 0,
					deferCommit: !page.done,
					complete: () => {
						if (page.done) {
							prepared.job.dispose();
							this.nativePreparations.delete(block$1.key);
						} else prepared.job.advance();
					}
				};
				internals.nativeHistoryLinesPrepared += history.length;
				history.length = 0;
				break;
			}
			source = only?.text;
			if (pending?.settled || this.nativeBatch && !dynamic) continue;
			if (historyBudgetReached && !dynamic) continue;
			internals.nativeTailBlocksVisited++;
			const token = this.nativeToken(block$1);
			const previous = pending ?? this.nativeHistory.get(block$1.key);
			const prefixMatches = previous?.source !== void 0 && source !== void 0 && source.startsWith(previous.source);
			const from = prefixMatches ? previous.to : 0;
			const correction = previous !== void 0 && !prefixMatches || this.nativeSkipped.has(block$1.key) || pending === void 0 && this.nativeHistory.deliveredFor(block$1.key) !== void 0;
			const text = only?.text.slice(from);
			const stable = block$1.key === "__partial__" && dynamic || text === void 0 ? 0 : !dynamic ? text.length : fence && from < (fence.closeEnd ?? Number.POSITIVE_INFINITY) ? Math.max(0, fence.stableEnd - from) : stableParagraphEnd(text);
			const stableTo = from + stable;
			let to = stableTo;
			if (fence && from < fence.bodyEnd) {
				let boundary = Math.max(from, fence.bodyStart);
				for (let count = 0; count < 128 && boundary < stableTo; count++) {
					const next = source.indexOf("\n", boundary);
					if (next < 0 || next >= stableTo) {
						boundary = stableTo;
						break;
					}
					boundary = next + 1;
				}
				to = Math.min(to, boundary);
			}
			const renderText = (value) => {
				return present(new Markdown(escapeTerminalText(value), 0, 0, markdownTheme).renderUnpadded(contentWidth));
			};
			const renderRange = (start, end, commitCode = false) => {
				if (!source || !fence) return renderText(source?.slice(start, end) ?? "");
				const lines = [];
				const bodyEnd = Math.min(end, fence.bodyEnd);
				const bodyFrom = Math.max(start, fence.bodyStart);
				if (bodyEnd > bodyFrom) {
					const context = `${canvasStyleRevision()}:${fence.language}:${fence.bodyStart}`;
					let prepared = this.nativeCodeStreams.get(block$1.key);
					if (!prepared || prepared.context !== context || prepared.offset > bodyFrom || correction && start === from) {
						prepared = {
							offset: fence.bodyStart,
							context,
							stream: createCodeStream(fence.language)
						};
						this.nativeCodeStreams.set(block$1.key, prepared);
					}
					if (prepared.offset < bodyFrom) {
						prepared.stream.append(escapeTerminalText(source.slice(prepared.offset, bodyFrom)).replace(/\t/gu, "   "));
						prepared.offset = bodyFrom;
					}
					const code = escapeTerminalText(source.slice(bodyFrom, bodyEnd)).replace(/\t/gu, "   ");
					const complete = commitCode && code.endsWith("\n");
					const highlighted = complete ? prepared.stream.append(code) : prepared.stream.preview(code);
					if (complete) prepared.offset = bodyEnd;
					const indent = markdownTheme.codeBlockIndent ?? "  ";
					const codeWidth = Math.max(1, contentWidth - visibleWidth(indent));
					for (const line of highlighted) for (const wrapped of wrapTextWithAnsi(line, codeWidth)) lines.push(indent + markdownTheme.codeBlock(wrapped));
				}
				const result = present(lines);
				if (fence.closeEnd !== void 0 && end > fence.closeEnd) {
					if (start < fence.closeEnd) result.push("");
					result.push(...renderText(source.slice(Math.max(start, fence.closeEnd), end)));
				}
				return result;
			};
			if (canCommit && (!dynamic || stable > 0)) {
				if (correction) history.push(...wrapTextWithAnsi(color.muted(ui(`── 更新 · ${escapeTerminalText(block$1.key)} ──`, `── Update · ${escapeTerminalText(block$1.key)} ──`)), width));
				if (source !== void 0) {
					if (from === 0 && index > 0 && only?.gapBefore) history.push("");
					history.push(...renderRange(from, to, true));
					if (dynamic && !fence) history.push("");
				} else history.push(...renderWhole(index, block$1));
				receipts.push(this.nativeHistory.reserve(block$1.key, token, from, to, source?.slice(0, to), !dynamic && to === stableTo));
				ends.push(history.length);
				if (source !== void 0 && to === stableTo && stableTo < source.length) tail.push(...renderRange(stableTo, source.length));
				if (dynamic || to < stableTo || history.length >= 256) canCommit = false;
				if (to < stableTo || history.length >= 256) historyBudgetReached = true;
			} else {
				canCommit = false;
				if (source !== void 0 && from > 0) {
					if (!fence || from >= fence.stableEnd) tail.push(...renderRange(from, source.length));
				} else tail.push(...renderWhole(index, block$1));
			}
		}
		if (receipts.length || history.length) {
			internals.nativeHistoryLinesPrepared += history.length;
			this.nativeBatch = {
				lines: history,
				receipts,
				ends,
				offset: 0
			};
		}
		this.scrollOffset = 0;
		this.lastScrollbar = void 0;
		this.lastViewportMaps = [];
		this.lastPointerControls = [];
		return tail;
	}
	nativeFrozenBlocks = /* @__PURE__ */ new Map();
	safeRenderedLines = new StringTransformCache(escapeTerminalText);
	nativeInsetLines = /* @__PURE__ */ new WeakMap();
	/**
	* @param viewportRows - current terminal-dependent transcript height.
	* @param requestRender - schedule a TUI frame after local presentation state changes.
	* @param requestOlder - ask Harness for the preceding durable history page.
	*/
	constructor(viewportRows = () => Number.POSITIVE_INFINITY, requestRender = () => void 0, requestOlder = () => void 0, welcome, nativeMarkdownWorkerFactory) {
		this.viewportRows = viewportRows;
		this.requestRender = requestRender;
		this.requestOlder = requestOlder;
		this.welcome = welcome;
		this.nativeMarkdownWorkerFactory = nativeMarkdownWorkerFactory;
	}
	/** Use terminal-native scrollback and freeze committed blocks once printed. */
	setNativeMode(enabled) {
		if (this.nativeMode === enabled) return;
		if (!enabled) {
			if (this.nativeBatch?.receipts.some((receipt) => this.nativePreparations.has(receipt.key))) {
				this.nativeBatch = void 0;
				this.nativeBatchInFlight = false;
			}
			for (const key of this.nativePreparations.keys()) this.nativeHistory.discard(key);
			this.clearNativePreparations();
		}
		this.nativeMode = enabled;
		this.viewportAnchor = {
			blockKey: "",
			lineOffset: 0,
			followLatest: true
		};
		this.scrollOffset = 0;
		this.requestRender();
	}
	isNativeMode() {
		return this.nativeMode;
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
	/**
	* Restore the Settings-owned startup presentation without mutating the Harness log.
	* @param tools - default tool-card shape.
	* @param reasoning - whether reasoning blocks are visible at session open.
	*/
	applyPresentationDefaults(tools, reasoning, toolOutputLineLimit = DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit, diffContextLines = DEFAULT_TUI_BEHAVIOR.diffContextLines) {
		this.toolVisibility = tools;
		this.reasoningVisible = reasoning;
		this.toolOutputLineLimit = toolOutputLineLimit;
		this.diffContextLines = diffContextLines;
	}
	/** Follow new transcript output after the user submits from a historical viewport. */
	followLatest() {
		this.turnCursor = void 0;
		this.scrollOffset = 0;
		this.pendingOlderAnchor = void 0;
		this.viewportAnchor = {
			blockKey: "",
			lineOffset: 0,
			followLatest: true
		};
		this.requestRender();
	}
	/** Whether the viewport is pinned to the latest output. */
	isFollowingLatest() {
		return this.viewportAnchor.followLatest;
	}
	/** Freeze semantic presentation state without retaining rendered rows. */
	snapshotPresentation() {
		return {
			...this.sessionId === void 0 ? {} : { sessionId: this.sessionId },
			viewportAnchor: { ...this.viewportAnchor },
			scrollOffset: this.scrollOffset,
			...this.turnCursor === void 0 ? {} : { turnCursor: { ...this.turnCursor } },
			...this.selection === void 0 ? {} : { selection: {
				...this.selection,
				anchor: { ...this.selection.anchor },
				focus: { ...this.selection.focus }
			} },
			toolFocus: this.toolFocus,
			...this.toolFocus ? { focusedTool: this.toolKeys()[this.toolCursor] } : {},
			expandedTools: [...this.expandedTools],
			collapsedTools: [...this.collapsedTools],
			expandedReasoning: [...this.expandedReasoning],
			collapsedReasoning: [...this.collapsedReasoning]
		};
	}
	/** Restore a frozen parent view against the latest parent node set. */
	restorePresentation(snapshot) {
		if (snapshot.sessionId !== void 0 && this.sessionId !== snapshot.sessionId) return "session-mismatch";
		this.expandedTools.clear();
		this.collapsedTools.clear();
		this.expandedReasoning.clear();
		this.collapsedReasoning.clear();
		for (const key of snapshot.expandedTools) this.expandedTools.add(key);
		for (const key of snapshot.collapsedTools) this.collapsedTools.add(key);
		for (const key of snapshot.expandedReasoning) this.expandedReasoning.add(key);
		for (const key of snapshot.collapsedReasoning) this.collapsedReasoning.add(key);
		const keys = this.blocks.map((block$1) => block$1.key);
		const exact = snapshot.viewportAnchor.blockKey === "" || keys.includes(snapshot.viewportAnchor.blockKey);
		this.viewportAnchor = exact ? { ...snapshot.viewportAnchor } : this.blocks[0] === void 0 ? {
			blockKey: "",
			lineOffset: 0,
			followLatest: true
		} : {
			blockKey: this.blocks[0].key,
			lineOffset: 0,
			followLatest: false
		};
		this.scrollOffset = exact ? snapshot.scrollOffset : Math.max(1, snapshot.scrollOffset);
		this.turnCursor = snapshot.turnCursor !== void 0 && keys.includes(snapshot.turnCursor.blockKey) ? { ...snapshot.turnCursor } : void 0;
		this.selection = snapshot.selection === void 0 ? void 0 : selectionClearedForOwner(snapshot.selection, new Set(keys));
		this.toolFocus = snapshot.toolFocus;
		const focusedIndex = snapshot.focusedTool === void 0 ? -1 : this.toolKeys().indexOf(snapshot.focusedTool);
		if (focusedIndex >= 0) this.toolCursor = focusedIndex;
		this.requestRender();
		return exact ? "exact" : "nearest";
	}
	/** Apply the Settings-owned scrollbar chrome without changing viewport coordinates. */
	setScrollbarVisibility(visibility) {
		this.scrollbarVisible = visibility;
		this.requestRender();
	}
	/**
	* Detach follow, keep `anchor` as the visible start, and request one older page.
	* Home, wheel, scrollbar track/end-cap, and later thumb/edge-scroll share this path.
	*/
	requestOlderFromStart(anchor) {
		if (!this.hasMore || this.loadingOlder) return false;
		const start = anchor ?? this.pendingOlderAnchor ?? this.viewportState?.start ?? (this.viewportAnchor.blockKey === "" ? void 0 : this.viewportAnchor);
		if (start !== void 0 && start.blockKey !== "") {
			this.pendingOlderAnchor = {
				blockKey: start.blockKey,
				lineOffset: start.lineOffset
			};
			this.viewportAnchor = {
				...this.pendingOlderAnchor,
				followLatest: false
			};
		} else this.viewportAnchor = {
			...this.viewportAnchor,
			followLatest: false
		};
		this.requestOlder();
		this.requestRender();
		return true;
	}
	/** Jump within the loaded/estimated height range. Unknown history never targets fake unloaded offsets. */
	scrollToEstimatedOffset(offset) {
		const at = this.heightIndex.atOffset(offset);
		if (at === void 0) return false;
		if (this.blocks[0]?.key === at.key && at.lineOffset === 0 && this.hasMore && offset <= 0) return this.requestOlderFromStart({
			blockKey: at.key,
			lineOffset: at.lineOffset
		});
		this.viewportAnchor = {
			blockKey: at.key,
			lineOffset: at.lineOffset,
			followLatest: false
		};
		this.scrollOffset = Math.max(1, this.scrollOffset);
		this.requestRender();
		return true;
	}
	/** Last scrollbar geometry derived from the same viewport snapshot as Home/wheel. */
	scrollbar() {
		return this.lastScrollbar;
	}
	/** Hit regions for the resident scrollbar column, in transcript-local coordinates. */
	scrollbarHitRegions(origin) {
		if (this.lastScrollbar === void 0 || this.emptyState) return [];
		if (this.scrollbarVisible === "hidden" || origin.width < SCROLLBAR_MIN_WIDTH) return [];
		return scrollbarHitRegions(origin, this.lastScrollbar);
	}
	/** Visible tool titles and empty-session examples from the last viewport. */
	controlHitRegions(origin) {
		const inset = origin.width >= SCROLLBAR_MIN_WIDTH ? 2 : 0;
		const bar = this.showsScrollbar(origin.width) ? 1 : 0;
		const width = Math.max(1, origin.width - inset - bar);
		return this.lastPointerControls.map((control) => ({
			id: `transcript:${control.kind}:${control.id}`,
			rect: {
				col: origin.col + inset,
				row: origin.row + control.row,
				width,
				height: 1
			},
			zIndex: 11,
			role: control.kind === "example" ? "option" : "button",
			enabled: true,
			activation: control.kind === "example" ? "arm" : "direct",
			hover: "highlight",
			action: {
				kind: "transcript",
				command: control.kind === "tool" ? "toggle" : control.kind === "reasoning" ? "toggle-reasoning" : "example",
				targetKey: control.id
			}
		}));
	}
	/** Set a visual-only transcript target hover without changing keyboard focus or card state. */
	setHoveredRegion(id) {
		const next = id?.startsWith("transcript:") === true ? id : void 0;
		if (this.hoveredRegionId === next) return false;
		this.hoveredRegionId = next;
		return true;
	}
	/**
	* Focus an empty-session example using the existing cursor path.
	* @param id - EMPTY_SESSION_EXAMPLES id.
	*/
	focusExample(id) {
		return false;
	}
	/**
	* Focus a tool card and toggle it through the existing expand path.
	* @param key - tool-card identity.
	*/
	pointerToggleTool(key) {
		const index = this.toolKeys().indexOf(key);
		if (index < 0 || this.snapshot === void 0) return void 0;
		this.toolCursor = index;
		this.toolFocus = true;
		this.toggleToolCard(key);
		this.update(this.snapshot, this.imageLoader);
		this.requestRender();
		return {
			kind: "tool",
			key
		};
	}
	/** Toggle one visible reasoning region without mutating the Session log. */
	pointerToggleReasoning(key) {
		if (!this.reasoningStates.has(key) || this.snapshot === void 0) return false;
		if (this.reasoningStates.get(key) === true) {
			this.expandedReasoning.delete(key);
			this.collapsedReasoning.add(key);
		} else {
			this.collapsedReasoning.delete(key);
			this.expandedReasoning.add(key);
		}
		this.update(this.snapshot, this.imageLoader);
		this.requestRender();
		return true;
	}
	/** Track/end-cap click. A thumb press without movement does not jump. */
	handleScrollbarClick(region, point, origin) {
		if (region.role !== "scrollbar" || region.action.kind !== "transcript") return false;
		const command = region.action.command;
		if (command === "drag-thumb") return false;
		const localRow = point.row - origin.row;
		if (command === "page-older" || localRow <= 0 && this.hasMore) return this.requestOlderFromStart(this.viewportState?.start);
		if (this.lastScrollbar === void 0) return false;
		return this.scrollToEstimatedOffset(offsetForTrackRow(this.lastScrollbar, localRow));
	}
	/** Thumb drag uses the same height-index snapshot as Home/wheel. */
	dragThumb(localRow, grabOffset) {
		if (this.lastScrollbar === void 0) return false;
		const row = localRow - grabOffset;
		if (row <= 0 && this.hasMore) this.requestOlderFromStart(this.viewportState?.start);
		return this.scrollToEstimatedOffset(offsetForTrackRow(this.lastScrollbar, Math.max(0, row)));
	}
	setSelection(selection) {
		this.selection = selection;
	}
	currentSelection() {
		return this.selection;
	}
	viewportMaps() {
		return this.lastViewportMaps;
	}
	hitAnchor(col, row, width, affinity = "before") {
		const inset = width >= 12 ? 2 : 0;
		if (this.showsScrollbar(width) && col >= width - 1) return void 0;
		const map = this.lastViewportMaps.find((candidate) => candidate.row === row);
		if (map === void 0) return void 0;
		return anchorAtCell(map, col - inset, affinity);
	}
	/** Resolve the nearest selectable cell on the visible edge during auto-scroll. */
	hitViewportEdgeAnchor(col, width, edge, affinity = "before") {
		const maps = [...this.lastViewportMaps].sort((left, right) => left.row - right.row);
		const map = edge === "older" ? maps.find((candidate) => candidate.cellOffsets.some((offset) => offset !== void 0)) : maps.findLast((candidate) => candidate.cellOffsets.some((offset) => offset !== void 0));
		if (map === void 0) return void 0;
		const inset = width >= 12 ? 2 : 0;
		return anchorAtCell(map, Math.max(0, Math.min(col - inset, map.cellOffsets.length - 1)), affinity);
	}
	/** Compare two durable transcript anchors independently of viewport coordinates. */
	selectionRunsForward(anchor, focus) {
		return compareAnchors(anchor, focus, this.blocks.map((block$1) => block$1.key)) <= 0;
	}
	/** Whether a durable pointer anchor still belongs to the current transcript. */
	containsSelectionAnchor(anchor) {
		return anchor.surface === "transcript" && this.blocks.some((block$1) => block$1.key === anchor.ownerKey);
	}
	copySelectionText() {
		if (this.selection === void 0) return "";
		const keys = new Set(this.blocks.map((block$1) => block$1.key));
		const selection = selectionClearedForOwner(this.selection, keys);
		if (selection === void 0) return "";
		return extractSelectedText(selection, this.blocks.flatMap((block$1) => {
			const copy = this.ownerCopy.get(block$1.key);
			return copy === void 0 ? [] : [{
				key: block$1.key,
				text: copy.text
			}];
		}));
	}
	clearSelection() {
		this.selection = void 0;
	}
	applyPointerSelection(anchor, focus, granularity) {
		if (anchor.surface !== focus.surface) return;
		let next = {
			anchor,
			focus,
			granularity
		};
		if (granularity !== "character") {
			const text = this.ownerCopy.get(focus.ownerKey)?.text ?? "";
			next = expandSelection(next, text, granularity);
		}
		this.selection = next;
		this.requestRender();
	}
	/**
	* Report whether the transcript is showing non-durable empty-session guidance.
	* @returns true while the conversation has no visible durable content.
	*/
	isEmptyState() {
		return this.emptyState;
	}
	/**
	* Replace the transcript with non-durable empty-selection guidance.
	* @param message - guidance rendered when no Session is active.
	*/
	empty(message) {
		this.imageGeneration += 1;
		this.imageLoader = void 0;
		this.snapshot = void 0;
		this.emptyMessage = message;
		this.sessionId = void 0;
		this.pendingImages.clear();
		this.imageComponents.clear();
		this.imageBlockOwners.clear();
		this.nativeFrozenBlocks.clear();
		this.safeRenderedLines.clear();
		this.nodeCache.clear();
		this.search = void 0;
		this.searchIndex = void 0;
		this.lastFullLines = [];
		this.viewportAnchor = {
			blockKey: "",
			lineOffset: 0,
			followLatest: true
		};
		this.viewportState = void 0;
		this.emptyState = true;
		this.hasMore = false;
		this.loadingOlder = false;
		this.pendingOlderAnchor = void 0;
		this.lastScrollbar = void 0;
		this.heightIndex.clear();
		this.ownerCopy.clear();
		this.lineControls.clear();
		this.lastViewportMaps = [];
		this.lastPointerControls = [];
		this.reasoningStates.clear();
		this.selection = void 0;
		this.emptyScrollPrimed = false;
		this.syncHeightIndexCounters();
		this.replace(this.emptySessionRows());
	}
	emptyCopy() {
		return this.emptyMessage === void 0 ? ui("在下方输入消息，或用 /help 查看命令。", "Enter a message below, or use /help to view commands.") : translateUiText(this.emptyMessage);
	}
	/**
	* Replace the rendered snapshot after a Harness observable notification.
	* @param snapshot - authoritative Session conversation projection.
	* @param imageLoader - authenticated reader for references in this Session.
	*/
	update(snapshot, imageLoader) {
		this.snapshot = snapshot;
		const sessionId = String(snapshot.sessionId);
		if (sessionId !== this.sessionId) {
			this.nativeSourceTokens.clear();
			this.nativeProjection.clear();
			this.resetNativeHistory();
			this.imageGeneration += 1;
			this.pendingImages.clear();
			this.imageComponents.clear();
			this.imageBlockOwners.clear();
			this.sessionId = sessionId;
			this.expandedTools.clear();
			this.collapsedTools.clear();
			this.expandedReasoning.clear();
			this.collapsedReasoning.clear();
			this.reasoningStates.clear();
			this.toolCursor = 0;
			this.nodeCache.clear();
			this.viewportAnchor = {
				blockKey: "",
				lineOffset: 0,
				followLatest: true
			};
			this.viewportState = void 0;
			this.search = void 0;
			this.searchIndex = void 0;
			this.lastFullLines = [];
			this.pendingOlderAnchor = void 0;
			this.lastScrollbar = void 0;
			this.heightIndex.clear();
			this.ownerCopy.clear();
			this.lastViewportMaps = [];
			this.selection = void 0;
			this.emptyScrollPrimed = false;
			this.nativeFrozenBlocks.clear();
			this.safeRenderedLines.clear();
			this.syncHeightIndexCounters();
		}
		this.imageLoader = imageLoader;
		this.blockGeneration += 1;
		if (this.search === void 0) this.searchIndex = void 0;
		this.hasMore = snapshot.hasMore;
		this.loadingOlder = snapshot.loadingOlder;
		const preferences = {
			tools: this.toolVisibility,
			reasoning: this.reasoningVisible,
			toolOutputLineLimit: this.toolOutputLineLimit,
			diffContextLines: this.diffContextLines,
			expandedTools: this.expandedTools,
			collapsedTools: this.collapsedTools,
			expandedReasoning: this.expandedReasoning,
			collapsedReasoning: this.collapsedReasoning,
			...this.toolFocus ? { focusedTool: this.toolKeys()[this.toolCursor] } : {}
		};
		const visibleNodes = snapshot.chat.order.flatMap((key) => {
			const node = snapshot.chat.nodes.get(key);
			return node === void 0 || node.visibility !== "visible" ? [] : [node];
		});
		if (this.nativeTailEnabled) {
			const order = visibleNodes.map((node) => node.key);
			const current = new Set(order);
			const previous = new Set(this.nativeSourceOrder);
			const removed = this.nativeSourceOrder.filter((key) => !current.has(key));
			const oldCommon = this.nativeSourceOrder.filter((key) => current.has(key));
			const newCommon = order.filter((key) => previous.has(key));
			if (!this.nativeHistoryPaused) {
				for (const key of removed) this.nativeNotices.push(color.muted(ui(`── 来源已移除或隐藏 · ${escapeTerminalText(key)}；/transcript replay 查看当前历史 ──`, `── Source removed or hidden · ${escapeTerminalText(key)}; /transcript replay for current history ──`)));
				if (oldCommon.some((key, index) => key !== newCommon[index])) this.nativeNotices.push(color.muted(ui("── 历史顺序已更新；/transcript replay 查看当前顺序 ──", "── History order updated; /transcript replay for current order ──")));
				for (const node of visibleNodes) {
					const count = assistantStepData(node.data)?.blocks.length ?? 0;
					if (this.nativeRemoved.has(node.key) || count < (this.nativePartCounts.get(node.key) ?? 0)) this.nativeNotices.push(color.muted(ui(`── 来源结构已更新 · ${escapeTerminalText(node.key)}；/transcript replay 查看当前内容 ──`, `── Source structure updated · ${escapeTerminalText(node.key)}; /transcript replay for current content ──`)));
				}
			}
			for (const key of removed) {
				this.nativeSourceTokens.delete(key);
				this.nativeProjection.delete(key);
				this.nativeRemoved.add(key);
				this.nativePartCounts.delete(key);
			}
			for (const node of visibleNodes) {
				this.nativeRemoved.delete(node.key);
				this.nativePartCounts.set(node.key, assistantStepData(node.data)?.blocks.length ?? 0);
			}
			this.nativeSourceOrder = order;
		}
		this.reasoningStates.clear();
		for (const node of visibleNodes) {
			const step = assistantStepData(node.data);
			if (step?.blocks.some((block$1) => block$1.kind === "reasoning" && block$1.text !== "") !== true) continue;
			const key = node.key;
			const thinking = step.status === "running" && !step.blocks.some((block$1) => block$1.kind === "text" && block$1.text !== "");
			this.reasoningStates.set(key, reasoningExpanded(preferences, key, thinking));
		}
		const blocks = [];
		const keep = /* @__PURE__ */ new Set();
		let hasVisibleRows = false;
		const take = (key, fingerprint, build, sourceMayChange = false) => {
			keep.add(key);
			const hit = this.nodeCache.get(key);
			if (hit !== void 0 && sameStructuralToken(hit.sourceToken, fingerprint)) {
				if (hit.rows.length > 0) {
					hasVisibleRows = true;
					blocks.push(hit);
				}
				return;
			}
			const built = build();
			const block$1 = {
				key,
				sourceToken: fingerprint,
				rows: built,
				components: built.map((row, index) => {
					const previous = hit?.components[index];
					if (row.format === "markdown" && hit?.rows[index]?.format === "markdown" && previous instanceof Markdown) {
						internals.markdownUpdated += 1;
						previous.setText(escapeTerminalText(row.text));
						this.lineCache.delete(previous);
						return previous;
					}
					return this.component(row);
				}),
				linesByWidth: /* @__PURE__ */ new Map(),
				metadata: transcriptBlockMetadata(built, sourceMayChange),
				dirty: false
			};
			this.nodeCache.set(key, block$1);
			if (built.length > 0) {
				hasVisibleRows = true;
				blocks.push(block$1);
			}
		};
		for (const node of visibleNodes) {
			const step = assistantStepData(node.data);
			const sourceToken = structuralToken({
				kind: node.kind,
				data: node.data,
				deliverables: deliverablesFingerprint(node)
			});
			const fingerprint = nodeFingerprint(node, preferences, sourceToken);
			const reusableProjection = this.nativeProjection.has(node.key) && sameStructuralToken(this.nodeCache.get(node.key)?.sourceToken ?? "", fingerprint);
			if (!(this.nativeTailEnabled && step && step.blocks.length > 1)) this.nativeProjection.delete(node.key);
			if (this.nativeTailEnabled && step && step.blocks.length > 1 && !reusableProjection) {
				if (step.blocks.some((part) => part.kind === "text" && part.text !== "") || step.status !== "running") {
					const units = [];
					const expanded = reasoningExpanded(preferences, node.key, false);
					const add = (key, rows, value, dynamic) => {
						if (!rows.length) return;
						units.push({
							key,
							rows,
							components: rows.map((row) => this.component(row)),
							sourceToken: structuralToken(value),
							linesByWidth: /* @__PURE__ */ new Map(),
							metadata: transcriptBlockMetadata(rows, dynamic),
							dirty: false
						});
					};
					if (step.blocks.some((part) => part.kind === "reasoning" && part.text !== "")) add(`${node.key}/header`, [reasoningHeaderRow(node.key, expanded)], "reasoning-header", false);
					for (const [partIndex, part] of step.blocks.entries()) {
						if (part.kind === "tool-call") continue;
						const dynamic = step.status === "running" && partIndex === step.blocks.length - 1;
						add(partIndex === 0 ? node.key : `${node.key}/source/${partIndex}`, assistantBlockRows(part, preferences, false, {
							key: node.key,
							expanded
						}), {
							part,
							dynamic
						}, dynamic);
					}
					if (step.status === "interrupted") add(`${node.key}/stopped`, [{
						format: "plain",
						text: color.warning(ui("已停止", "Stopped"))
					}], "interrupted", false);
					if (units[0]) units[0].rows[0] = {
						...units[0].rows[0],
						gapBefore: true
					};
					this.nativeProjection.set(node.key, units);
				}
			}
			internals.fingerprintsComputed += 1;
			if (this.nativeTailEnabled) this.nativeSourceTokens.set(node.key, sourceToken);
			take(node.key, fingerprint, () => chatNodeRows(node, preferences), assistantStepData(node.data)?.status === "running");
		}
		if (snapshot.partial !== null && !visibleNodes.some((node) => node.kind === "assistant-step")) {
			const partial = snapshot.partial;
			const key = "__partial__";
			const thinking = !partial.blocks.some((block$1) => block$1.kind === "text" && block$1.text !== "");
			const hasReasoning = partial.blocks.some((block$1) => block$1.kind === "reasoning" && block$1.text !== "");
			const expanded = reasoningExpanded(preferences, key, thinking);
			if (hasReasoning) this.reasoningStates.set(key, expanded);
			take("__partial__", JSON.stringify({
				partial,
				tools: preferences.tools,
				reasoning: preferences.reasoning,
				reasoningExpanded: preferences.expandedReasoning.has(key),
				reasoningCollapsed: preferences.collapsedReasoning.has(key),
				toolOutputLineLimit: preferences.toolOutputLineLimit,
				diffContextLines: preferences.diffContextLines
			}), () => {
				const partialRows = partial.blocks.flatMap((block$1) => assistantBlockRows(block$1, preferences, thinking, {
					key,
					expanded
				}));
				return grouped([...hasReasoning ? [thinking ? thinkingRow(key, expanded) : reasoningHeaderRow(key, expanded)] : [], ...partialRows]);
			}, true);
		}
		if (preferences.tools !== "hidden" && !visibleNodes.some((node) => node.kind === "tool-call")) for (const call of snapshot.runningCalls) take(`__running__:${call.callId}`, JSON.stringify({
			call,
			tools: preferences.tools,
			reasoning: preferences.reasoning,
			toolOutputLineLimit: preferences.toolOutputLineLimit,
			diffContextLines: preferences.diffContextLines,
			expanded: preferences.expandedTools.has(call.callId),
			collapsed: preferences.collapsedTools.has(call.callId)
		}), () => grouped(toolBlockRows(call, preferences, 0, call.callId)), true);
		this.emptyState = !hasVisibleRows;
		if (this.emptyState) take("__empty__", JSON.stringify({
			session: this.sessionId,
			welcome: this.welcome?.fingerprint() ?? 0
		}), () => this.emptySessionRows());
		for (const key of [...this.nodeCache.keys()]) if (!keep.has(key)) this.nodeCache.delete(key);
		this.commit(blocks);
		this.imageBlockOwners.clear();
		for (const block$1 of blocks) for (const row of block$1.rows) {
			if (row.format !== "image") continue;
			const cacheKey = `${this.sessionId ?? "none"}:${row.key}`;
			const owners = this.imageBlockOwners.get(cacheKey) ?? /* @__PURE__ */ new Set();
			owners.add(block$1.key);
			this.imageBlockOwners.set(cacheKey, owners);
		}
		const keys = this.toolKeys();
		if (this.toolCursor >= keys.length) this.toolCursor = Math.max(0, keys.length - 1);
	}
	/**
	* Submit the focused empty-session example when the transcript has browse focus.
	* @returns the prompt to send, or undefined when Enter has no local action.
	*/
	activateFocused() {
		if (this.emptyState) return void 0;
		if (!this.toolFocus) {
			this.enterToolFocus();
			return;
		}
		const key = this.toolKeys()[this.toolCursor];
		if (key === void 0 || this.snapshot === void 0) return void 0;
		this.toggleToolCard(key);
		this.update(this.snapshot, this.imageLoader);
		return {
			kind: "tool",
			key
		};
	}
	/**
	* Enter tool-card focus so ↑↓ move among cards instead of scrolling.
	* @returns true when at least one tool card can be focused.
	*/
	enterToolFocus() {
		const keys = this.toolKeys();
		if (keys.length === 0 || this.snapshot === void 0) return false;
		this.toolFocus = true;
		this.toolCursor = Math.min(this.toolCursor, keys.length - 1);
		this.update(this.snapshot, this.imageLoader);
		this.requestRender();
		return true;
	}
	/**
	* Leave tool-card focus and restore ordinary transcript scrolling.
	* @returns true when focus mode was active.
	*/
	exitToolFocus() {
		if (!this.toolFocus) return false;
		this.toolFocus = false;
		if (this.snapshot !== void 0) this.update(this.snapshot, this.imageLoader);
		this.requestRender();
		return true;
	}
	/**
	* Invalidate only the visible welcome page, including no-Session guidance.
	* A late welcome resource must not rebuild or disturb an active conversation.
	* @returns whether a welcome frame needs repainting.
	*/
	refreshWelcomePresentation() {
		if (!this.emptyState || this.welcome === void 0) return false;
		let changed = false;
		for (const block$1 of this.blocks) {
			if (!block$1.rows.some((row) => row.welcome === true)) continue;
			block$1.linesByWidth.clear();
			for (const [index, component] of block$1.components.entries()) if (block$1.rows[index]?.welcome === true) this.lineCache.delete(component);
			changed = true;
		}
		if (!changed) return false;
		this.blockGeneration += 1;
		this.heightIndex.clear();
		this.syncHeightIndexCounters();
		this.searchIndex = void 0;
		this.lastFullLines = [];
		this.ownerCopy.clear();
		this.lineControls.clear();
		this.lastViewportMaps = [];
		this.lastPointerControls = [];
		this.requestRender();
		return true;
	}
	/**
	* Rebuild colorized rows after a live theme or lazy grammar change.
	* The current viewport and durable turn cursor remain unchanged.
	*/
	refreshPresentation() {
		this.safeRenderedLines.clear();
		this.nativeCodeStreams.clear();
		const scrollOffset = this.scrollOffset;
		const turnCursor = this.turnCursor;
		const viewportAnchor = this.viewportAnchor;
		const snapshot = this.snapshot;
		this.nodeCache.clear();
		if (snapshot === void 0) this.replace(this.emptySessionRows());
		else this.update(snapshot, this.imageLoader);
		this.scrollOffset = scrollOffset;
		this.turnCursor = turnCursor;
		this.viewportAnchor = viewportAnchor;
		this.requestRender();
	}
	invalidate() {
		for (const block$1 of this.blocks) {
			if (!block$1.metadata.dynamic) continue;
			for (const [index, component] of block$1.components.entries()) {
				const row = block$1.rows[index];
				if (row?.pulse !== void 0 || row?.liveDurationSince !== void 0) component.invalidate();
			}
		}
	}
	/** Stop pending attachment presentation updates during terminal teardown. */
	dispose() {
		this.clearNativePreparations();
		this.safeRenderedLines.clear();
		this.stopPulseAnimation();
		this.imageGeneration += 1;
		this.imageLoader = void 0;
		this.pendingImages.clear();
		this.imageComponents.clear();
		this.imageBlockOwners.clear();
		this.nativeFrozenBlocks.clear();
		this.search = void 0;
		this.searchIndex = void 0;
		this.lastFullLines = [];
		this.pendingOlderAnchor = void 0;
		this.lastScrollbar = void 0;
		this.heightIndex.clear();
		this.ownerCopy.clear();
		this.lineControls.clear();
		this.lastViewportMaps = [];
		this.lastPointerControls = [];
		this.selection = void 0;
		this.syncHeightIndexCounters();
	}
	renderBlock(blockIndex, contentWidth, projected) {
		const block$1 = projected ?? this.blocks[blockIndex];
		if (block$1 === void 0) return {
			lines: [],
			projections: [],
			borderLines: [],
			hardBreaks: [],
			turnAnchors: [],
			controls: []
		};
		internals.blocksVisited += 1;
		const cacheKey = (blockIndex === 0 ? -contentWidth : contentWidth) + (this.nativeMode ? 1e6 : 0);
		if (block$1.dirty) {
			block$1.linesByWidth.clear();
			block$1.dirty = false;
		}
		const clockDriven = block$1.rows.some((row) => row.pulse !== void 0 || row.liveDurationSince !== void 0);
		const cachedBlock = clockDriven ? void 0 : block$1.linesByWidth.get(cacheKey);
		if (cachedBlock !== void 0) {
			this.heightIndex.setExact(block$1.key, cachedBlock.lines.length);
			this.rememberOwnerCopy(block$1.key, cachedBlock);
			this.lineControls.set(block$1.key, cachedBlock.controls);
			this.syncHeightIndexCounters();
			return cachedBlock;
		}
		const lines = [];
		const projections = [];
		const borderLines = [];
		const hardBreaks = [];
		const turnAnchors = [];
		const controls = [];
		for (const [index, component] of block$1.components.entries()) {
			const row = block$1.rows[index];
			if ((blockIndex > 0 || lines.length > 0) && row?.gapBefore === true) {
				lines.push("");
				projections.push({
					text: "",
					displayStartCell: 0,
					joinerAfter: "\n"
				});
				hardBreaks.push(true);
				controls.push(void 0);
			}
			if (row?.userTurn === true) turnAnchors.push(lines.length);
			const pulsing = row?.pulse !== void 0 || row?.liveDurationSince !== void 0;
			const cached = pulsing ? void 0 : this.lineCache.get(component);
			const rendered = row?.format === "image" && this.nativeMode ? [color.muted(imageLabel(row.attachment))] : cached !== void 0 && cached.width === contentWidth ? cached.lines : (() => {
				internals.componentRenders += 1;
				const output = component.render(contentWidth);
				if (!pulsing) this.lineCache.set(component, {
					width: contentWidth,
					lines: output
				});
				return output;
			})();
			const start = lines.length;
			const control = row?.toolKey !== void 0 ? {
				kind: "tool",
				id: row.toolKey
			} : row?.reasoningKey !== void 0 ? {
				kind: "reasoning",
				id: row.reasoningKey
			} : row?.exampleId !== void 0 ? {
				kind: "example",
				id: row.exampleId
			} : void 0;
			if (row?.format === "image") lines.push(...rendered);
			else for (const line of rendered) {
				internals.linesEscaped += 1;
				lines.push(this.safeRenderedLines.get(line));
			}
			const projected$1 = row?.format === "rule" || row?.format === "image" ? rendered.map(() => ({
				text: "",
				displayStartCell: 0,
				joinerAfter: ""
			})) : row?.format === "plain" && row.pulse === void 0 && row.welcome !== true ? plainSelectionLines(row.text, contentWidth) : componentSelectionLines(component) ?? fallbackSelectionLines(rendered, contentWidth);
			for (const projection of projected$1.length === rendered.length ? projected$1 : fallbackSelectionLines(rendered, contentWidth)) projections.push(projection);
			for (const hardBreakIndex of explicitHardBreakIndexes(row, contentWidth)) {
				const target = start + hardBreakIndex;
				if (target >= start && target < lines.length) hardBreaks[target] = true;
			}
			if (row?.format === "rule") borderLines.push(start);
			if (lines.length > start) {
				if (row?.format === "rule" || block$1.rows[index + 1]?.format === "rule") hardBreaks[lines.length - 1] = false;
				else if (index < block$1.components.length - 1) hardBreaks[lines.length - 1] = true;
			}
			for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) controls[lineIndex] = control;
		}
		const result = {
			lines,
			projections: projections.map((projection, index) => ({
				...projection,
				...hardBreaks[index] === true ? { joinerAfter: "\n" } : hardBreaks[index] === false ? { joinerAfter: "" } : {}
			})),
			borderLines,
			hardBreaks,
			turnAnchors,
			controls
		};
		if (!clockDriven) {
			block$1.linesByWidth.set(cacheKey, result);
			while (block$1.linesByWidth.size > 4) {
				const oldest = block$1.linesByWidth.keys().next().value;
				if (oldest === void 0) break;
				block$1.linesByWidth.delete(oldest);
			}
		}
		this.heightIndex.setExact(block$1.key, result.lines.length);
		this.rememberOwnerCopy(block$1.key, result);
		this.lineControls.set(block$1.key, result.controls);
		this.syncHeightIndexCounters();
		return result;
	}
	rememberOwnerCopy(key, block$1) {
		const projections = block$1.projections.map((projection, index) => block$1.borderLines.includes(index) ? {
			text: "",
			displayStartCell: 0,
			joinerAfter: projection.joinerAfter
		} : projection);
		const next = {
			...ownerTextFromProjections(projections),
			projections,
			borderLines: block$1.borderLines
		};
		const previous = this.ownerCopy.get(key);
		if (previous !== void 0 && previous.text !== next.text && (this.selection?.anchor.ownerKey === key || this.selection?.focus.ownerKey === key)) this.selection = void 0;
		this.ownerCopy.set(key, next);
	}
	fillFrom(startIndex, startOffset, rows, contentWidth) {
		const visible = [];
		let index = startIndex;
		let offset = startOffset;
		while (index < this.blocks.length && visible.length < rows) {
			const blockLines = this.renderBlock(index, contentWidth).lines;
			const available = blockLines.slice(offset, offset + rows - visible.length);
			visible.push(...available);
			if (offset + available.length < blockLines.length) {
				offset += available.length;
				break;
			}
			index += 1;
			offset = 0;
		}
		return {
			visible,
			index,
			offset
		};
	}
	finiteViewportLines(contentWidth, rows) {
		if (this.blocks.length === 0) return {
			lines: Array.from({ length: rows }, () => ""),
			leadingPadding: rows
		};
		let startIndex;
		let startOffset;
		if (this.viewportAnchor.followLatest) {
			const parts = [];
			let remaining = rows;
			startIndex = this.blocks.length - 1;
			startOffset = 0;
			for (let index = this.blocks.length - 1; index >= 0 && remaining > 0; index -= 1) {
				const rendered = this.renderBlock(index, contentWidth);
				if (rendered.lines.length === 0) continue;
				const offset = Math.max(0, rendered.lines.length - remaining);
				parts.unshift({
					blockIndex: index,
					offset,
					lines: [...rendered.lines.slice(offset)],
					turnAnchors: rendered.turnAnchors
				});
				startIndex = index;
				startOffset = offset;
				remaining -= rendered.lines.length - offset;
			}
			let visible = parts.flatMap((part) => part.lines);
			let leadingPadding = 0;
			const hasOlder$1 = startIndex > 0 || startOffset > 0 || this.hasMore;
			if (hasOlder$1 && visible.length > 0) {
				let lineBase = 0;
				let latestTurn;
				for (const part of parts) {
					for (const anchor of part.turnAnchors) {
						if (anchor < part.offset || anchor >= part.offset + part.lines.length) continue;
						latestTurn = {
							blockIndex: part.blockIndex,
							lineOffset: anchor,
							visibleOffset: lineBase + anchor - part.offset
						};
					}
					lineBase += part.lines.length;
				}
				if (latestTurn !== void 0 && visible.length - latestTurn.visibleOffset <= rows) {
					leadingPadding = rows - (visible.length - latestTurn.visibleOffset);
					visible = [...Array.from({ length: leadingPadding }, () => ""), ...visible.slice(latestTurn.visibleOffset)];
					startIndex = latestTurn.blockIndex;
					startOffset = latestTurn.lineOffset;
				}
			}
			const padding$1 = Math.max(0, rows - visible.length);
			const result = [...Array.from({ length: padding$1 }, () => ""), ...visible.slice(-rows)];
			const start$1 = {
				blockKey: this.blocks[startIndex]?.key ?? "",
				lineOffset: startOffset
			};
			this.viewportAnchor = {
				...start$1,
				followLatest: true
			};
			this.viewportState = {
				contentWidth,
				rows,
				start: start$1,
				hasOlder: hasOlder$1,
				hasNewer: false
			};
			this.scrollOffset = 0;
			return {
				lines: result,
				leadingPadding: leadingPadding + padding$1
			};
		}
		startIndex = this.blocks.findIndex((block$1) => block$1.key === this.viewportAnchor.blockKey);
		if (startIndex < 0) {
			this.viewportAnchor = {
				blockKey: "",
				lineOffset: 0,
				followLatest: true
			};
			return this.finiteViewportLines(contentWidth, rows);
		}
		const firstLines = this.renderBlock(startIndex, contentWidth).lines;
		startOffset = Math.max(0, Math.min(this.viewportAnchor.lineOffset, Math.max(0, firstLines.length - 1)));
		let filled = this.fillFrom(startIndex, startOffset, rows, contentWidth);
		if (filled.visible.length < rows && (startIndex > 0 || startOffset > 0)) {
			const need = rows - filled.visible.length;
			const moved = this.moveViewportStart({
				blockKey: this.blocks[startIndex]?.key ?? "",
				lineOffset: startOffset
			}, need, contentWidth);
			const nextIndex = this.blocks.findIndex((block$1) => block$1.key === moved.coordinate.blockKey);
			if (nextIndex >= 0) {
				startIndex = nextIndex;
				startOffset = moved.coordinate.lineOffset;
				filled = this.fillFrom(startIndex, startOffset, rows, contentWidth);
			}
		}
		const hasOlder = startIndex > 0 || startOffset > 0 || this.hasMore;
		const hasNewer = filled.index < this.blocks.length;
		const start = {
			blockKey: this.blocks[startIndex]?.key ?? "",
			lineOffset: startOffset
		};
		this.viewportAnchor = {
			...start,
			followLatest: false
		};
		this.viewportState = {
			contentWidth,
			rows,
			start,
			hasOlder,
			hasNewer
		};
		const padding = Math.max(0, rows - filled.visible.length);
		return {
			lines: [...filled.visible, ...Array.from({ length: padding }, () => "")].slice(0, rows),
			leadingPadding: 0
		};
	}
	logicalRowLines(row) {
		if (row.format === "rule") return [];
		if (row.format === "image") return [imageLabel(row.attachment)];
		if (row.welcome === true) return [];
		return row.text.split("\n");
	}
	/** Incremental logical-source index. Never calls renderBlock/Markdown. */
	ensureSearchIndex() {
		const current = this.searchIndex;
		if (current !== void 0 && current.generation === this.blockGeneration) return current;
		const lines = [];
		const spans = [];
		for (const block$1 of this.blocks) {
			const start = lines.length;
			for (const row of block$1.rows) lines.push(...this.logicalRowLines(row));
			spans.push({
				blockKey: block$1.key,
				start,
				end: lines.length
			});
		}
		const index = {
			width: 0,
			generation: this.blockGeneration,
			lines,
			spans
		};
		this.searchIndex = index;
		this.lastFullLines = lines;
		return index;
	}
	highlightVisible(lines, query) {
		if (query.trim() === "") return [...lines];
		const plan = planLineSearch(lines, query);
		const current = plan.matches[this.search?.matchIndex ?? 0];
		return lines.map((line, index) => {
			if (!plan.hit.has(index)) return line;
			return highlightQuery(line, query, (matched) => index === current ? `\u001B[7m${matched}\u001B[0m` : color.accent(matched));
		});
	}
	showsScrollbar(width) {
		return this.scrollbarVisible !== "hidden" && width >= SCROLLBAR_MIN_WIDTH && !this.emptyState;
	}
	presentLines(lines, width, inset, contentWidth) {
		if (this.emptyState) this.lastPointerControls = [];
		const totalRows = Math.max(1, Math.floor(this.viewportRows()));
		const body = lines.map((line, row) => {
			const content = line === "" ? "" : `${" ".repeat(inset)}${line}`;
			const control = this.lastPointerControls.find((candidate) => candidate.row === row);
			const controlId = control === void 0 ? void 0 : `transcript:${control.kind}:${control.id}`;
			return controlId !== void 0 && controlId === this.hoveredRegionId ? control?.kind === "reasoning" ? hoverReasoningChevron(content) : interaction.hover(content) : content;
		});
		const withSearch = this.search === void 0 ? body : (() => {
			const label = `${" ".repeat(inset)}${color.accent(this.searchLabel())}`;
			if (!Number.isFinite(totalRows)) return [...body, label];
			return [...body.slice(0, Math.max(0, totalRows - 1)), label];
		})();
		if (!this.showsScrollbar(width) || !Number.isFinite(totalRows)) {
			this.lastScrollbar = void 0;
			return withSearch;
		}
		const start = this.viewportState?.start;
		const model = scrollbarModel({
			rows: totalRows,
			contentWidth,
			startOffset: start === void 0 ? 0 : this.heightIndex.offsetOf(start.blockKey, start.lineOffset),
			loadedTotal: this.heightIndex.total(),
			estimated: this.heightIndex.estimatedEntries > 0,
			hasMore: this.hasMore,
			hasNewer: this.viewportState?.hasNewer === true,
			loadingOlder: this.loadingOlder
		});
		this.lastScrollbar = model;
		return appendScrollbarColumn(withSearch, paintScrollbar(model, this.hoveredRegionId?.startsWith("transcript:scrollbar:") === true ? this.hoveredRegionId.slice(21) : void 0), width);
	}
	captureViewportMaps(lines, contentWidth, leadingPadding) {
		const start = this.viewportState?.start;
		const maps = [];
		const pointerControls = [];
		if (start === void 0) {
			this.lastViewportMaps = maps;
			this.lastPointerControls = pointerControls;
			return {
				lines,
				maps
			};
		}
		let blockIndex = this.blocks.findIndex((block$1) => block$1.key === start.blockKey);
		let lineOffset = start.lineOffset;
		for (let row = 0; row < lines.length; row += 1) {
			if (row < leadingPadding) continue;
			const block$1 = this.blocks[blockIndex];
			if (block$1 === void 0) break;
			const copy = this.ownerCopy.get(block$1.key);
			if (copy?.borderLines.includes(lineOffset) !== true) {
				const startOffset = copy?.lineStarts[lineOffset] ?? 0;
				const projection = copy?.projections[lineOffset];
				const mapped = projection === void 0 ? mapCopyableLine(lines[row] ?? "", startOffset, contentWidth) : mapSelectionProjectionLine(projection, startOffset, contentWidth);
				maps.push({
					row,
					ownerKey: block$1.key,
					surface: "transcript",
					startOffset,
					endOffset: mapped.endOffset,
					cellOffsets: mapped.cellOffsets,
					hardBreakAfter: mapped.hardBreakAfter
				});
			}
			const control = this.lineControls.get(block$1.key)?.[lineOffset];
			if (control !== void 0) pointerControls.push({
				row,
				kind: control.kind,
				id: control.id
			});
			lineOffset += 1;
			if (lineOffset >= (copy?.lineStarts.length ?? 1)) {
				blockIndex += 1;
				lineOffset = 0;
			}
		}
		this.lastViewportMaps = maps;
		this.lastPointerControls = pointerControls;
		return {
			lines,
			maps
		};
	}
	paintEmptySelection(lines, leadingPadding, sourceStart, contentWidth) {
		const block$1 = this.blocks[0];
		const copy = block$1 === void 0 ? void 0 : this.ownerCopy.get(block$1.key);
		if (block$1 === void 0 || copy === void 0) {
			this.lastViewportMaps = [];
			return [...lines];
		}
		const maps = [];
		for (let row = leadingPadding; row < lines.length; row += 1) {
			const lineOffset = sourceStart + row - leadingPadding;
			if (lineOffset >= copy.lineStarts.length) break;
			const line = lines[row] ?? "";
			const leading = /^ */u.exec(line)?.[0].length ?? 0;
			const startOffset = copy.lineStarts[lineOffset] ?? 0;
			const mapped = mapCopyableLine(line, startOffset - leading, contentWidth, { skipLeading: leading });
			maps.push({
				row,
				ownerKey: block$1.key,
				surface: "transcript",
				startOffset,
				endOffset: mapped.endOffset,
				cellOffsets: mapped.cellOffsets,
				hardBreakAfter: mapped.hardBreakAfter
			});
		}
		this.lastViewportMaps = maps;
		return paintSelection(lines, maps, this.selection, [block$1.key]);
	}
	render(width) {
		if (this.nativeTailEnabled && this.nativeMode && (!this.emptyState || this.nativeNotices.length || this.nativeBatch)) return this.renderNativeTail(width);
		const inset = width >= 12 ? 2 : 0;
		const contentWidth = Math.max(1, width - inset * 2);
		this.heightIndex.reconcile(this.blocks.map((block$1) => block$1.key), (key) => {
			const block$1 = this.blocks.find((candidate) => candidate.key === key);
			return Math.max(1, block$1?.rows.length ?? 1);
		}, contentWidth);
		this.syncHeightIndexCounters();
		if (this.nativeMode && !this.emptyState) {
			const lines$1 = [];
			for (const [index, block$1] of this.blocks.entries()) {
				const frozen = this.nativeFrozenBlocks.get(block$1.key);
				const rendered = frozen ?? this.renderBlock(index, contentWidth);
				let presented = this.nativeInsetLines.get(rendered);
				if (presented === void 0 || presented.inset !== inset) {
					presented = {
						inset,
						lines: rendered.lines.map((line) => line === "" ? "" : `${" ".repeat(inset)}${line}`)
					};
					this.nativeInsetLines.set(rendered, presented);
				}
				lines$1.push(...presented.lines);
				if (!block$1.metadata.dynamic && frozen === void 0) this.nativeFrozenBlocks.set(block$1.key, rendered);
			}
			this.scrollOffset = 0;
			this.lastScrollbar = void 0;
			this.lastViewportMaps = [];
			this.lastPointerControls = [];
			return lines$1;
		}
		const totalRows = Math.max(1, Math.floor(this.viewportRows()));
		if (Number.isFinite(totalRows) && !this.emptyState) {
			const rows$1 = this.search === void 0 ? totalRows : Math.max(1, totalRows - 1);
			const visible$1 = this.finiteViewportLines(contentWidth, rows$1);
			const mapped = this.captureViewportMaps(visible$1.lines, contentWidth, visible$1.leadingPadding);
			const selected$1 = paintSelection(this.search === void 0 ? mapped.lines : this.highlightVisible(mapped.lines, this.search.query), mapped.maps, this.selection, this.blocks.map((block$1) => block$1.key));
			internals.selectionCellsProjected += mapped.maps.reduce((count, map) => count + map.cellOffsets.filter((offset) => offset !== void 0).length, 0);
			return this.presentLines(selected$1, width, inset, contentWidth);
		}
		const lines = [];
		const anchors = [];
		for (const blockIndex of this.blocks.keys()) {
			const rendered = this.renderBlock(blockIndex, contentWidth);
			anchors.push(...rendered.turnAnchors.map((anchor) => lines.length + anchor));
			lines.push(...rendered.lines);
		}
		if (this.emptyState) {
			const blockWidth = lines.reduce((maximum, line) => Math.max(maximum, visibleWidth(line.trimEnd())), 0);
			const before = Math.max(0, Math.floor((contentWidth - blockWidth) / 2));
			for (const [index, line] of lines.entries()) lines[index] = line === "" ? "" : `${" ".repeat(before)}${line.trimEnd()}`;
		}
		const previousRenderedLineCount = this.renderedLineCount;
		if (this.scrollOffset > 0 && previousRenderedLineCount > 0) this.scrollOffset = Math.max(0, this.scrollOffset + lines.length - previousRenderedLineCount);
		this.renderedLineCount = lines.length;
		this.turnAnchors = anchors;
		const painted = this.search === void 0 ? lines : this.highlightVisible(lines, this.search.query);
		if (!Number.isFinite(totalRows)) {
			this.scrollOffset = 0;
			this.lastScrollbar = void 0;
			return this.presentLines(painted, width, inset, contentWidth);
		}
		const rows = this.search !== void 0 ? Math.max(1, totalRows - 1) : totalRows;
		if (painted.length <= rows) {
			this.scrollOffset = 0;
			const remaining = rows - painted.length;
			const before = this.emptyState ? Math.floor(remaining / 2) : remaining;
			const visible$1 = [
				...Array.from({ length: before }, () => ""),
				...painted,
				...Array.from({ length: remaining - before }, () => "")
			];
			const selected$1 = this.emptyState ? this.paintEmptySelection(visible$1, before, 0, contentWidth) : visible$1;
			return this.presentLines(selected$1, width, inset, contentWidth);
		}
		const maxOffset = Math.max(0, painted.length - rows);
		if (this.emptyState) if (!this.emptyScrollPrimed) {
			this.scrollOffset = maxOffset;
			this.emptyScrollPrimed = true;
		} else this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		else this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const end = painted.length - this.scrollOffset;
		const start = Math.max(0, end - rows);
		const visible = painted.slice(start, end);
		const selected = this.emptyState ? this.paintEmptySelection(visible, 0, start, contentWidth) : visible;
		return this.presentLines(selected, width, inset, contentWidth);
	}
	handleInput(data) {
		if (this.search !== void 0) {
			this.handleSearchInput(data);
			return;
		}
		if (data === "/") {
			this.beginSearch();
			return;
		}
		if (this.toolFocus && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
			const keys = this.toolKeys();
			const delta = matchesKey(data, Key.up) ? -1 : 1;
			const next = this.toolCursor + delta;
			if (next >= 0 && next < keys.length) {
				this.toolCursor = next;
				if (this.snapshot !== void 0) this.update(this.snapshot, this.imageLoader);
				this.requestRender();
			}
			return;
		}
		this.turnCursor = void 0;
		const rows = Math.max(1, Math.floor(this.viewportRows()));
		if (matchesKey(data, Key.up)) this.scrollBy(1);
		else if (matchesKey(data, Key.down)) this.scrollBy(-1);
		else if (matchesKey(data, Key.pageUp)) this.scrollBy(Math.max(1, rows - 1));
		else if (matchesKey(data, Key.pageDown)) this.scrollBy(-Math.max(1, rows - 1));
		else if (matchesKey(data, Key.home)) this.scrollToStart();
		else if (matchesKey(data, Key.end)) this.followLatest();
	}
	/**
	* Leave incremental search and restore the ordinary transcript chrome.
	* @returns true when a search session was closed.
	*/
	cancelSearch() {
		if (this.search === void 0) return false;
		this.search = void 0;
		this.searchIndex = void 0;
		this.lastFullLines = [];
		this.requestRender();
		return true;
	}
	beginSearch() {
		this.search = {
			input: new Input(),
			query: "",
			composing: true,
			matchIndex: 0
		};
		this.ensureSearchIndex();
		this.requestRender();
	}
	searchLabel() {
		const query = this.search?.query ?? "";
		const matches = findLineMatches(this.ensureSearchIndex().lines, query);
		if (query.trim() === "") return ui("查找：", "Find:");
		if (matches.length === 0) return ui(`查找 ${query} · 无匹配 · Esc 取消`, `Find ${query} · no matches · Esc cancel`);
		if (this.search?.composing === true) return ui(`查找 ${query} · ${String(matches.length)} 处 · Enter 确认 · Esc 取消`, `Find ${query} · ${String(matches.length)} match(es) · Enter confirm · Esc cancel`);
		const current = Math.min((this.search?.matchIndex ?? 0) + 1, matches.length);
		return ui(`查找 ${query} · ${String(current)}/${String(matches.length)} · n 下一个 · N 上一个 · Esc 取消`, `Find ${query} · ${String(current)}/${String(matches.length)} · n next · N previous · Esc cancel`);
	}
	handleSearchInput(data) {
		if (matchesKey(data, Key.escape)) {
			this.cancelSearch();
			return;
		}
		if (matchesKey(data, Key.enter) || data === "\r" || data === "\n") {
			if ((this.search?.query.trim() ?? "") === "") this.cancelSearch();
			else {
				this.search = {
					...this.search,
					composing: false
				};
				this.revealCurrentMatch();
				this.requestRender();
			}
			return;
		}
		if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown) || matchesKey(data, Key.home) || matchesKey(data, Key.end)) {
			this.turnCursor = void 0;
			const rows = Math.max(1, Math.floor(this.viewportRows()) - 1);
			if (matchesKey(data, Key.up)) this.scrollBy(1);
			else if (matchesKey(data, Key.down)) this.scrollBy(-1);
			else if (matchesKey(data, Key.pageUp)) this.scrollBy(Math.max(1, rows - 1));
			else if (matchesKey(data, Key.pageDown)) this.scrollBy(-Math.max(1, rows - 1));
			else if (matchesKey(data, Key.home)) this.scrollToStart();
			else this.followLatest();
			return;
		}
		if (this.search?.composing === false) {
			if (data === "n") {
				this.stepSearch(1);
				return;
			}
			if (data === "N") {
				this.stepSearch(-1);
				return;
			}
			if (data === "/") {
				this.beginSearch();
				return;
			}
		}
		const kb = getKeybindings();
		const paste = /^\u001B\[200~([\s\S]*)\u001B\[201~$/u.exec(data);
		if (!(!/[\u0000-\u001F\u007F-\u009F]/u.test(data) || decodeKittyPrintable(data) !== void 0) && paste === null && !kb.matches(data, "tui.editor.undo") && !kb.matches(data, "tui.editor.deleteCharBackward")) return;
		if (this.search === void 0) return;
		const before = this.search.query;
		this.search.input.handleInput(paste === null ? data : `\u001B[200~${escapeTerminalText(paste[1] ?? "")}\u001B[201~`);
		const query = this.search.input.getValue();
		if (query === before) return;
		this.search = {
			...this.search,
			query,
			composing: true,
			matchIndex: 0
		};
		this.revealCurrentMatch();
		this.requestRender();
	}
	stepSearch(direction) {
		if (this.search === void 0) return;
		const index = this.activeSearchIndex();
		if (index === void 0) return;
		const matches = findLineMatches(index.lines, this.search.query);
		const next = nextMatchIndex(matches, matches[this.search.matchIndex] ?? -1, direction);
		if (next < 0) return;
		this.search = {
			...this.search,
			matchIndex: Math.max(0, matches.indexOf(next))
		};
		this.revealCurrentMatch();
		this.requestRender();
	}
	revealCurrentMatch() {
		if (this.search === void 0) return;
		const index = this.activeSearchIndex();
		if (index === void 0) return;
		const lineIndex = findLineMatches(index.lines, this.search.query)[this.search.matchIndex];
		if (lineIndex === void 0) return;
		const span = index.spans.find((candidate) => candidate.start <= lineIndex && lineIndex < candidate.end);
		if (span === void 0) return;
		this.viewportAnchor = {
			blockKey: span.blockKey,
			lineOffset: Math.max(0, lineIndex - span.start),
			followLatest: false
		};
		this.scrollOffset = Math.max(1, this.scrollOffset);
	}
	activeSearchIndex() {
		if (this.search === void 0) return void 0;
		return this.ensureSearchIndex();
	}
	moveViewportStart(start, lines, contentWidth) {
		let blockIndex = this.blocks.findIndex((block$1) => block$1.key === start.blockKey);
		if (blockIndex < 0) return {
			coordinate: start,
			moved: 0
		};
		let lineOffset = start.lineOffset;
		let remaining = Math.abs(lines);
		let moved = 0;
		if (lines > 0) while (remaining > 0) {
			if (lineOffset > 0) {
				const step = Math.min(remaining, lineOffset);
				lineOffset -= step;
				remaining -= step;
				moved += step;
				continue;
			}
			if (blockIndex === 0) break;
			blockIndex -= 1;
			lineOffset = this.renderBlock(blockIndex, contentWidth).lines.length;
		}
		else while (remaining > 0) {
			const blockLines = this.renderBlock(blockIndex, contentWidth).lines;
			const available = Math.max(0, blockLines.length - lineOffset);
			if (remaining < available) {
				lineOffset += remaining;
				moved += remaining;
				remaining = 0;
				continue;
			}
			if (blockIndex >= this.blocks.length - 1) {
				const step = Math.max(0, available - 1);
				lineOffset += step;
				moved += step;
				break;
			}
			remaining -= available;
			moved += available;
			blockIndex += 1;
			lineOffset = 0;
		}
		return {
			coordinate: {
				blockKey: this.blocks[blockIndex]?.key ?? start.blockKey,
				lineOffset
			},
			moved
		};
	}
	scrollToStart() {
		const first = this.blocks[0];
		if (first === void 0) return false;
		if (!this.viewportAnchor.followLatest && this.viewportAnchor.blockKey === first.key && this.viewportAnchor.lineOffset === 0) return this.requestOlderFromStart({
			blockKey: first.key,
			lineOffset: 0
		});
		this.turnCursor = void 0;
		this.viewportAnchor = {
			blockKey: first.key,
			lineOffset: 0,
			followLatest: false
		};
		this.scrollOffset = Math.max(1, this.scrollOffset);
		this.requestRender();
		return true;
	}
	/**
	* Move the conversation viewport while leaving the composer focus unchanged.
	* @param lines - positive for older content, negative for newer content.
	* @returns whether the viewport moved.
	*/
	scrollBy(lines) {
		this.turnCursor = void 0;
		const delta = Math.trunc(lines);
		if (!Number.isFinite(delta) || delta === 0) return false;
		if (!this.emptyState && this.viewportState !== void 0) {
			if (delta < 0 && this.viewportAnchor.followLatest) return false;
			const start = this.viewportAnchor.followLatest ? this.viewportState.start : {
				blockKey: this.viewportAnchor.blockKey,
				lineOffset: this.viewportAnchor.lineOffset
			};
			const moved = this.moveViewportStart(start, delta, this.viewportState.contentWidth);
			if (moved.moved === 0) {
				if (delta > 0) this.requestOlderFromStart(this.viewportState.start);
				return false;
			}
			const reachesLatest = delta < 0 && this.moveViewportStart(moved.coordinate, -this.viewportState.rows, this.viewportState.contentWidth).moved < this.viewportState.rows;
			this.pendingOlderAnchor = void 0;
			this.viewportAnchor = reachesLatest ? {
				blockKey: "",
				lineOffset: 0,
				followLatest: true
			} : {
				...moved.coordinate,
				followLatest: false
			};
			this.scrollOffset = Math.max(0, this.scrollOffset + delta);
			if (reachesLatest) this.scrollOffset = 0;
			this.requestRender();
			return true;
		}
		const rows = Math.max(1, Math.floor(this.viewportRows()));
		const maxOffset = Math.max(0, this.renderedLineCount - rows);
		const nextOffset = Math.max(0, Math.min(maxOffset, this.scrollOffset + delta));
		if (nextOffset === this.scrollOffset) {
			if (delta > 0 && this.scrollOffset === maxOffset) this.requestOlderFromStart();
			return false;
		}
		this.scrollOffset = nextOffset;
		this.requestRender();
		return true;
	}
	/**
	* Move the viewport to an adjacent durable user-turn anchor.
	* @param offset - negative for an older turn, positive for a newer turn.
	* @returns whether an adjacent turn exists and was selected.
	*/
	navigateTurn(offset) {
		const viewport = this.viewportState;
		if (offset === 0 || viewport === void 0) return false;
		const turns = [];
		for (const [blockIndex, block$1] of this.blocks.entries()) {
			if (block$1.metadata.userTurnRows.length === 0) continue;
			const rendered = this.renderBlock(blockIndex, viewport.contentWidth);
			for (const lineOffset of rendered.turnAnchors) turns.push({
				blockIndex,
				blockKey: block$1.key,
				lineOffset
			});
		}
		if (turns.length === 0) return false;
		const topBlockIndex = this.blocks.findIndex((block$1) => block$1.key === viewport.start.blockKey);
		const beforeTop = (turn) => turn.blockIndex < topBlockIndex || turn.blockIndex === topBlockIndex && turn.lineOffset < viewport.start.lineOffset;
		const afterTop = (turn) => turn.blockIndex > topBlockIndex || turn.blockIndex === topBlockIndex && turn.lineOffset > viewport.start.lineOffset;
		const cursorIndex = this.turnCursor === void 0 ? -1 : turns.findIndex((turn) => turn.blockKey === this.turnCursor?.blockKey && turn.lineOffset === this.turnCursor.lineOffset);
		const anchor = turns[cursorIndex < 0 ? offset < 0 ? turns.findLastIndex(beforeTop) : turns.findIndex(afterTop) : cursorIndex + Math.sign(offset)];
		if (anchor === void 0) return false;
		this.turnCursor = {
			blockKey: anchor.blockKey,
			lineOffset: anchor.lineOffset
		};
		this.viewportAnchor = {
			blockKey: anchor.blockKey,
			lineOffset: anchor.lineOffset,
			followLatest: false
		};
		this.scrollOffset = Math.max(1, this.scrollOffset);
		this.requestRender();
		return true;
	}
	toolKeys() {
		return [...new Set(this.blocks.flatMap((block$1) => block$1.metadata.toolKeys))];
	}
	toggleToolCard(key) {
		if (toolCardExpanded({
			tools: this.toolVisibility,
			reasoning: this.reasoningVisible,
			toolOutputLineLimit: this.toolOutputLineLimit,
			diffContextLines: this.diffContextLines,
			expandedTools: this.expandedTools,
			collapsedTools: this.collapsedTools,
			expandedReasoning: this.expandedReasoning,
			collapsedReasoning: this.collapsedReasoning
		}, key)) {
			this.expandedTools.delete(key);
			if (this.toolVisibility === "expanded") this.collapsedTools.add(key);
		} else {
			this.collapsedTools.delete(key);
			this.expandedTools.add(key);
		}
	}
	emptySessionRows() {
		return this.welcome === void 0 ? [{
			format: "plain",
			text: color.muted(this.emptyCopy())
		}] : [{
			format: "plain",
			text: "",
			welcome: true
		}];
	}
	replace(rows) {
		const components = rows.map((row) => this.component(row));
		const block$1 = {
			key: "__replacement__",
			sourceToken: "",
			rows: [...rows],
			components,
			linesByWidth: /* @__PURE__ */ new Map(),
			metadata: transcriptBlockMetadata(rows),
			dirty: false
		};
		this.commit(rows.length === 0 ? [] : [block$1]);
	}
	commit(blocks) {
		this.blocks = blocks;
		this.indexNativeCandidates();
		if (this.pendingOlderAnchor !== void 0 && blocks.some((block$1) => block$1.key === this.pendingOlderAnchor?.blockKey)) this.viewportAnchor = {
			...this.pendingOlderAnchor,
			followLatest: false
		};
		else if (!this.viewportAnchor.followLatest && !blocks.some((block$1) => block$1.key === this.viewportAnchor.blockKey)) this.viewportAnchor = {
			blockKey: "",
			lineOffset: 0,
			followLatest: true
		};
		const keyedBlocks = new Map(blocks.map((block$1) => [block$1.key, block$1]));
		this.heightIndex.reconcile([...keyedBlocks.keys()], (key) => {
			const block$1 = keyedBlocks.get(key);
			return Math.max(1, block$1?.rows.length ?? 1);
		}, this.viewportState?.contentWidth ?? this.heightIndex.contentWidth);
		if (this.search !== void 0) this.ensureSearchIndex();
		const keys = new Set(blocks.map((block$1) => block$1.key));
		this.selection = selectionClearedForOwner(this.selection, keys);
		this.syncHeightIndexCounters();
		this.syncPulseAnimation(blocks.some((block$1) => block$1.rows.some((row) => row.liveDurationSince !== void 0 || row.pulse !== void 0 && terminalColorLevel() !== 0)));
	}
	syncHeightIndexCounters() {
		internals.heightIndexExact = this.heightIndex.exactEntries;
		internals.heightIndexEstimated = this.heightIndex.estimatedEntries;
	}
	component(row) {
		if (row.welcome === true) return {
			render: (width) => [...this.welcome?.render(width, this.snapshot !== void 0) ?? []],
			invalidate: () => void 0
		};
		if (row.format === "rule") return {
			render: (width) => [horizontalRule(row.text, width, color.brand)],
			invalidate: () => void 0
		};
		if (row.format === "markdown") {
			internals.markdownCreated += 1;
			return new Markdown(escapeTerminalText(row.text), 0, 0, markdownTheme);
		}
		if (row.format === "plain") return row.pulse === void 0 ? new Text(escapeTerminalText(row.text), 0, 0) : new PulsingRow(row.text, row.pulse, () => this.pulseFrame, row.liveDurationSince);
		if (row.format === "code") return new CodeRow(row);
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
			this.imageComponents.set(cacheKey, new Text(color.danger(ui(`${imageLabel(row.attachment)} · 读取失败：${message}`, `${imageLabel(row.attachment)} · failed to load: ${message}`)), 0, 0));
		}).finally(() => {
			if (generation !== this.imageGeneration) return;
			this.pendingImages.delete(cacheKey);
			const image = this.imageComponents.get(cacheKey);
			if (image === void 0) {
				this.requestRender();
				return;
			}
			for (const owner of this.imageBlockOwners.get(cacheKey) ?? []) {
				const entry = this.nodeCache.get(owner);
				if (entry === void 0) continue;
				for (const [index, current] of entry.rows.entries()) if (current.format === "image" && `${this.sessionId ?? "none"}:${current.key}` === cacheKey) {
					entry.components[index] = image;
					entry.linesByWidth.clear();
					entry.dirty = true;
					internals.imageBlocksUpdated += 1;
				}
			}
			this.requestRender();
		});
		return fallback;
	}
	syncPulseAnimation(active) {
		if (!active) {
			this.stopPulseAnimation();
			return;
		}
		if (this.pulseTimer !== void 0) return;
		this.pulseFrame = 0;
		this.pulseTimer = setInterval(() => {
			this.pulseFrame = this.pulseFrame === Number.MAX_SAFE_INTEGER ? 0 : this.pulseFrame + 1;
			this.requestRender();
		}, PULSE_FRAME_MS);
		internals.activePulseTimers += 1;
		this.pulseTimer.unref();
	}
	stopPulseAnimation() {
		if (this.pulseTimer !== void 0) {
			clearInterval(this.pulseTimer);
			internals.activePulseTimers = Math.max(0, internals.activePulseTimers - 1);
		}
		this.pulseTimer = void 0;
		this.pulseFrame = 0;
	}
};

export { DEFAULT_TUI_BEHAVIOR as $, statusColor as A, wrapTextWithAnsi as At, normalizeCustomTheme as B, highlightCodeLines as C, getImageDimensions as Ct, setRendering as D, Box as Dt, setCodeHighlighter as E, matchesKey as Et, composeResolvedTheme as F, resolveTheme as G, normalizeThemeColorOn as H, editableTheme as I, backgroundSyncMode as J, themeContrastWarnings as K, generateThemeCandidates as L, surfaceRow as M, fuzzyFilter as Mt, terminalColorLevel as N, setTerminalCanvasBackground as O, truncateToWidth as Ot, BUILT_IN_THEMES as P, DEFAULT_TUI_BACKGROUND_MODE as Q, normalizeAppearance as R, escapeTerminalText as S, TUI as St, markdownTheme as T, Key as Tt, resolveAppearanceTheme as U, normalizeThemeColor as V, resolveCodeTheme as W, resolveRendering as X, renderingOverrides as Y, SYNTAX_ROLE_SCOPES as Z, background as _, Markdown as _t, editorMouseApi as a, MAX_DIFF_CONTEXT_LINES as at, currentTheme as b, SelectList as bt, graphemeRangeAt as c, MAX_WELCOME_ROWS as ct, wordRangeAt as d, TUI_APPEARANCE_SETTINGS_NAMESPACE as dt, DEFAULT_TUI_CODE_THEME as et, horizontalRule as f, TUI_BEHAVIOR_SETTINGS_NAMESPACE as ft, applyMarkdownPresentation as g, ProcessTerminal as gt, StringTransformCache as h, TuiSettingsConflictError as ht, autocompleteTargetId as i, MAX_CUSTOM_THEMES as it, styleTerminalText as j, CombinedAutocompleteProvider as jt, setTheme as k, visibleWidth as kt, invertLineCells as l, MAX_WELCOME_TEXT_LENGTH as lt, adoptSyntaxHighlighter as m, TUI_WELCOME_SETTINGS_NAMESPACE as mt, renderNativeCode as n, DEFAULT_TUI_WELCOME as nt, emptyFrameGeometry as o, MAX_TEXTMATE_RULES as ot, SyntaxHighlighter as p, TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE as pt, themeIdFromName as q, toolApprovalPreview as r, MAX_COMPOSER_HISTORY as rt, tuiFrameApi as s, MAX_TOOL_OUTPUT_LINE_LIMIT as st, Transcript as t, DEFAULT_TUI_THEME as tt, stripCopyDecorations as u, MAX_WHEEL_SCROLL_LINES as ut, canvasStyleRevision as v, Input as vt, interaction as w, setCapabilities as wt, editorTheme as x, CURSOR_MARKER as xt, color as y, Editor as yt, normalizeBackgroundMode as z };