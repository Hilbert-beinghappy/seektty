import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "child_process";
import { readdirSync as readdirSync$1, statSync as statSync$1 } from "fs";
import { homedir as homedir$1 } from "os";
import { basename as basename$1, dirname as dirname$1, join as join$1 } from "path";
import { performance } from "node:perf_hooks";
import { EventEmitter } from "events";

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
			const expandedPath = join$1(homedir$1(), path$1.slice(2));
			return path$1.endsWith("/") && !expandedPath.endsWith("/") ? `${expandedPath}/` : expandedPath;
		} else if (path$1 === "~") return homedir$1();
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
		else baseDir = join$1(this.basePath, displayBase);
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
				else searchDir = join$1(this.basePath, expandedPrefix);
				searchPrefix = "";
			} else if (rawPrefix.endsWith("/")) {
				if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) searchDir = expandedPrefix;
				else searchDir = join$1(this.basePath, expandedPrefix);
				searchPrefix = "";
			} else {
				const dir = dirname$1(expandedPrefix);
				const file = basename$1(expandedPrefix);
				if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) searchDir = dir;
				else searchDir = join$1(this.basePath, dir);
				searchPrefix = file;
			}
			const entries = readdirSync$1(searchDir, { withFileTypes: true });
			const suggestions = [];
			for (const entry of entries) {
				if (!entry.name.toLowerCase().startsWith(searchPrefix.toLowerCase())) continue;
				let isDirectory = entry.isDirectory();
				if (!isDirectory && entry.isSymbolicLink()) try {
					isDirectory = statSync$1(join$1(searchDir, entry.name)).isDirectory();
				} catch {}
				let relativePath;
				const name = entry.name;
				const displayPrefix = rawPrefix;
				if (displayPrefix.endsWith("/")) relativePath = displayPrefix + name;
				else if (displayPrefix.includes("/") || displayPrefix.includes("\\")) if (displayPrefix.startsWith("~/")) {
					const dir = dirname$1(displayPrefix.slice(2));
					relativePath = `~/${dir === "." ? name : join$1(dir, name)}`;
				} else if (displayPrefix.startsWith("/")) {
					const dir = dirname$1(displayPrefix);
					if (dir === "/") relativePath = `/${name}`;
					else relativePath = `${dir}/${name}`;
				} else {
					relativePath = join$1(dirname$1(displayPrefix), name);
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
		const lowerFileName = basename$1(filePath).toLowerCase();
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
				const entryName = basename$1(pathWithoutSlash);
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
		const ansi = extractAnsiCode(text, i);
		if (ansi) {
			pendingAnsi += ansi.code;
			i += ansi.length;
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
			const ansi = extractAnsiCode(clean, i);
			if (ansi) {
				i += ansi.length;
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
		const ansi = extractAnsiCode(text, index);
		if (ansi) {
			index += ansi.length;
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
			const ansi = extractAnsiCode(text, i);
			if (ansi) {
				pendingAnsi += ansi.code;
				i += ansi.length;
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
		const ansi = extractAnsiCode(line, i);
		if (ansi) {
			if (currentCol >= startCol && currentCol < endCol) result += ansi.code;
			else if (currentCol < startCol) pendingAnsi += ansi.code;
			i += ansi.length;
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
		const ansi = extractAnsiCode(line, i);
		if (ansi) {
			pooledStyleTracker.process(ansi.code);
			if (currentCol < beforeEnd) pendingAnsiBefore += ansi.code;
			else if (currentCol >= afterStart && currentCol < afterEnd && afterStarted) after += ansi.code;
			i += ansi.length;
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
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
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
		this.scrollOffset = clamp(Math.trunc(offset), 0, Math.max(0, this.filteredItems.length - this.maxVisible));
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
function stripAnsi(text) {
	let result = "";
	let index = 0;
	while (index < text.length) {
		const ansi = extractAnsiCode(text, index);
		if (ansi) {
			index += ansi.length;
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
		const ansi = extractAnsiCode(line, index);
		if (ansi) {
			if (ansi.code === COPY_START) {
				marked$1 = true;
				mode = "selected";
			} else if (ansi.code === COPY_END) mode = "after";
			else if (ansi.code === COPY_SKIP) skipped = true;
			else if (ansi.code.startsWith(COPY_JOIN_PREFIX)) {
				const encoded = ansi.code.slice(20, -1);
				if (encoded === "hard") joinerAfter = "\n";
				else if (encoded === "none") joinerAfter = "";
				else if (encoded.startsWith("spaces:")) {
					const count = Number.parseInt(encoded.slice(7), 10);
					joinerAfter = " ".repeat(Number.isFinite(count) ? Math.max(0, count) : 0);
				}
			} else if (mode === "selected") selected += ansi.code;
			else if (mode === "before") before += ansi.code;
			index += ansi.length;
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
		text: marked$1 ? stripAnsi(selected) : stripAnsi(line).trimEnd(),
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

const ESC = "\x1B";
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
	if (!data.startsWith(ESC)) return "not-escape";
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
	if (!data.startsWith(`${ESC}[`)) return "complete";
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
	if (!data.startsWith(`${ESC}]`)) return "complete";
	if (data.endsWith(`${ESC}\\`) || data.endsWith("\x07")) return "complete";
	return "incomplete";
}
/**
* Check if DCS (Device Control String) sequence is complete
* DCS sequences: ESC P ... ST (where ST is ESC \)
* Used for XTVersion responses like ESC P >| ... ESC \
*/
function isCompleteDcsSequence(data) {
	if (!data.startsWith(`${ESC}P`)) return "complete";
	if (data.endsWith(`${ESC}\\`)) return "complete";
	return "incomplete";
}
/**
* Check if APC (Application Program Command) sequence is complete
* APC sequences: ESC _ ... ST (where ST is ESC \)
* Used for Kitty graphics responses like ESC _ G ... ESC \
*/
function isCompleteApcSequence(data) {
	if (!data.startsWith(`${ESC}_`)) return "complete";
	if (data.endsWith(`${ESC}\\`)) return "complete";
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
		if (remaining.startsWith(ESC + ESC)) {
			sequences.push(ESC);
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
				if (remaining[index] === ESC) {
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
			const restart = remaining.indexOf(ESC, 3);
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
		if (remaining.startsWith(ESC)) {
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
				if (result$1.remainder === ESC) this.emitDataSequence(ESC);
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
			if (this.buffer.length > MAX_OSC_SEQUENCE) this.buffer = OSC_PREFIX + "!" + (this.buffer.endsWith(ESC) ? ESC : "");
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

export { Text as A, fuzzyFilter as B, Editor as C, getCapabilities as D, TUI as E, Box as F, truncateToWidth as I, visibleWidth as L, Key as M, decodeKittyPrintable as N, getImageDimensions as O, matchesKey as P, wrapTextWithAnsi as R, Image as S, CURSOR_MARKER as T, TUI_WELCOME_SETTINGS_NAMESPACE as _, DEFAULT_TUI_WELCOME as a, Markdown as b, MAX_DIFF_CONTEXT_LINES as c, MAX_WELCOME_ROWS as d, MAX_WELCOME_TEXT_LENGTH as f, TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE as g, TUI_BEHAVIOR_SETTINGS_NAMESPACE as h, DEFAULT_TUI_THEME as i, getKeybindings as j, setCapabilities as k, MAX_TEXTMATE_RULES as l, TUI_APPEARANCE_SETTINGS_NAMESPACE as m, DEFAULT_TUI_BEHAVIOR as n, MAX_COMPOSER_HISTORY as o, MAX_WHEEL_SCROLL_LINES as p, DEFAULT_TUI_CODE_THEME as r, MAX_CUSTOM_THEMES as s, DEFAULT_TUI_BACKGROUND_MODE as t, MAX_TOOL_OUTPUT_LINE_LIMIT as u, TuiSettingsConflictError as v, SelectList as w, Input as x, ProcessTerminal as y, CombinedAutocompleteProvider as z };