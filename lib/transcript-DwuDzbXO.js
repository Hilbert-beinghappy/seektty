import { C as MAX_TEXTMATE_RULES, F as Input, G as getKeybindings, I as Image, J as matchesKey, K as Key, P as Markdown, Q as wrapTextWithAnsi, V as getCapabilities, W as Text, X as truncateToWidth, Z as visibleWidth, _ as DEFAULT_TUI_CODE_THEME, a as hostFileCleanupUnconfirmed, c as HostFileController, d as strictFileConfinementReason, g as DEFAULT_TUI_BEHAVIOR, h as DEFAULT_TUI_BACKGROUND_MODE, i as closeHostFileStream, k as TUI_BEHAVIOR_SETTINGS_NAMESPACE, m as observeManagement, p as linkedManagementSignal, q as decodeKittyPrintable, s as HOST_FILE_READ_NOTICE, t as RemoteOperationScope, u as hostFileScopeKey, x as MAX_CUSTOM_THEMES } from "./remote-operation-ZujH2Lvf.js";
import { c as ui, s as translateUiText } from "./locale-Ds9YSjyq.js";
import { t as measureStartup } from "./startup-trace-C9EmgAGe.js";
import { posix, win32 } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor } from "@shikijs/engine-javascript";
import { Worker } from "node:worker_threads";

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
	const channels = commaSeparated ? channelPart.split(",").map((part$1) => part$1.trim()) : channelPart.split(/\s+/u).filter(Boolean);
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
function stringOf(record$1, key, label) {
	const value = record$1[key];
	if (typeof value !== "string") throw new Error(ui(`${label}.${key} 必须是字符串`, `${label}.${key} must be a string`));
	return value;
}
function colorRecord(value, keys, label) {
	const record$1 = recordOf$1(value, label);
	return Object.fromEntries(keys.map((key) => [key, normalizeThemeColor(stringOf(record$1, key, label))]));
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
		const record$1 = recordOf$1(entry, label);
		if (!Array.isArray(record$1.scope) || record$1.scope.length === 0 || record$1.scope.length > 64) throw new Error(ui(`${label}.scope 必须包含 1–64 个 TextMate scope`, `${label}.scope must contain 1–64 TextMate scopes`));
		const scope = [...new Set(record$1.scope.map((item) => {
			if (typeof item !== "string" || item === "" || item.length > 256 || /[\u0000-\u001F\u007F-\u009F]/u.test(item)) throw new Error(ui(`${label}.scope 包含无效值`, `${label}.scope contains an invalid value`));
			return item;
		}))];
		const foreground$1 = record$1.foreground === void 0 ? void 0 : normalizeThemeColor(stringOf(record$1, "foreground", label));
		const background$1 = record$1.background === void 0 ? void 0 : normalizeThemeColor(stringOf(record$1, "background", label));
		let fontStyle;
		if (record$1.fontStyle !== void 0) {
			if (!Array.isArray(record$1.fontStyle)) throw new Error(ui(`${label}.fontStyle 必须是数组`, `${label}.fontStyle must be an array`));
			fontStyle = [...new Set(record$1.fontStyle.map((style) => {
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
	const record$1 = recordOf$1(value, "customThemes[]");
	const id = stringOf(record$1, "id", "customThemes[]");
	const name = stringOf(record$1, "name", "customThemes[]").trim();
	const tone = stringOf(record$1, "tone", "customThemes[]");
	const source = stringOf(record$1, "source", "customThemes[]");
	if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u.test(id)) throw new Error(ui(`自定义主题 id ${JSON.stringify(id)} 无效`, `Custom theme id ${JSON.stringify(id)} is invalid`));
	if (name === "" || name.length > 80) throw new Error(ui("自定义主题名称必须为 1–80 个字符", "Custom theme name must contain 1–80 characters"));
	if (/[\u0000-\u001F\u007F-\u009F]/u.test(name)) throw new Error(ui("自定义主题名称不能包含终端控制字符", "Custom theme name cannot contain terminal control characters"));
	if (tone !== "dark" && tone !== "light") throw new Error(ui(`自定义主题 tone ${JSON.stringify(tone)} 无效`, `Custom theme tone ${JSON.stringify(tone)} is invalid`));
	if (source !== "manual" && source !== "palette" && source !== "vscode") throw new Error(ui(`自定义主题 source ${JSON.stringify(source)} 无效`, `Custom theme source ${JSON.stringify(source)} is invalid`));
	let remoteSource;
	if (record$1.remoteSource !== void 0) {
		const remote = recordOf$1(record$1.remoteSource, "customThemes[].remoteSource");
		if (Object.keys(remote).length !== 0) {
			const url = stringOf(remote, "url", "customThemes[].remoteSource");
			let parsed;
			try {
				parsed = new URL(url);
			} catch {
				throw new Error(ui("自定义主题远程来源 URL 无效", "Custom theme remote source URL is invalid"));
			}
			if (url.length > 2048 || parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") throw new Error(ui("自定义主题远程来源必须是不含凭据和片段的 HTTPS URL", "Custom theme remote source must be an HTTPS URL without credentials or a fragment"));
			if (source !== "vscode") throw new Error(ui("只有 VS Code 导入主题可以保存远程来源", "Only VS Code imported themes can keep a remote source"));
			remoteSource = { url: parsed.href };
		}
	}
	return {
		id,
		name,
		tone,
		source,
		...remoteSource === void 0 ? {} : { remoteSource },
		colors: colorRecord(record$1.colors, UI_COLOR_KEYS, "customThemes[].colors"),
		syntax: colorRecord(record$1.syntax, SYNTAX_COLOR_KEYS, "customThemes[].syntax"),
		tokenColors: textMateRules(record$1.tokenColors)
	};
}
/**
* Validate one complete appearance value, accepting legacy values without customThemes.
* @param value - untrusted Harness Settings value.
* @returns normalized appearance settings.
*/
function normalizeAppearance(value) {
	const record$1 = recordOf$1(value, "SeekTTY appearance");
	const backgroundMode = normalizeBackgroundMode(record$1.backgroundMode);
	const rawTheme = stringOf(record$1, "theme", "SeekTTY appearance");
	if (!/^(?:dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u.test(rawTheme)) throw new Error(ui(`SeekTTY 主题 ${JSON.stringify(rawTheme)} 不受支持`, `SeekTTY theme ${JSON.stringify(rawTheme)} is not supported`));
	const rawThemes = record$1.customThemes ?? [];
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
	const rawCodeTheme = record$1.codeTheme === void 0 ? DEFAULT_TUI_CODE_THEME : stringOf(record$1, "codeTheme", "SeekTTY appearance");
	if (!/^(?:auto|dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u.test(rawCodeTheme)) throw new Error(ui(`SeekTTY 代码主题 ${JSON.stringify(rawCodeTheme)} 不受支持`, `SeekTTY code theme ${JSON.stringify(rawCodeTheme)} is not supported`));
	const codeTheme = rawCodeTheme;
	if (codeTheme.startsWith("custom:") && !ids.has(codeTheme.slice(7))) throw new Error(ui(`当前自定义代码主题 ${JSON.stringify(codeTheme)} 不存在`, `The current custom code theme ${JSON.stringify(codeTheme)} does not exist`));
	return {
		theme,
		codeTheme,
		backgroundMode,
		customThemes,
		...renderingOverrides(record$1)
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
const SGR$1 = /\u001B\[([0-9;:]*)m/gu;
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
	return text.replace(SGR$1, (sequence, parameters) => {
		const fields = parameters === "" ? ["0"] : parameters.split(";");
		let changed = false;
		for (let index = 0; index < fields.length; index += 1) {
			const field$1 = fields[index] ?? "0";
			const parts = field$1.split(":");
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
				const colorFields = colon ? field$1 : fields.slice(index, index + 2 + count).join(";");
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
				foreground$1 = `\u001B[${field$1}m`;
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
* Test whether a Tool root has settled.
* @param block - Tool root lifecycle value.
* @returns whether the root carries its final result.
*/
function isSettledTool(block) {
	return "kind" in block;
}
/**
* Test whether a Tool root is still running.
* @param block - Tool root lifecycle value.
* @returns whether the root lacks a final result.
*/
function isRunningTool(block) {
	return !isSettledTool(block);
}

/**
* Test whether Assistant blocks contain a user-facing reply rather than only
* reasoning or Tool-call protocol material.
* @param blocks - Assistant content blocks.
* @returns whether the blocks contain visible reply content.
*/
function hasAssistantReplyContent(blocks) {
	return blocks.some((block) => {
		if (block.kind === "reasoning" || block.kind === "tool-call") return false;
		if (block.kind === "text") return block.text.trim() !== "";
		return true;
	});
}

/**
* Exclude system prompts, ordinary Context, and permission commands from visible Chat rows.
* Context containing tool changes retains its notice row.
* @param node - projected Chat node.
* @returns whether the node contributes a visible Chat row.
*/
function isVisibleChatNode(node) {
	return node.visibility === "visible" && node.kind !== "system-prompt" && (node.kind !== "context" || node.data.content.some((block) => block.type === "tool-addition" || block.type === "tool-removal")) && !(node.kind === "command" && node.data.name === "permission");
}

function activity(name) {
	if (name === "read") return "read";
	if (name === "read_image") return "readImage";
	if (name === "grep" || name === "glob" || name.endsWith("_inspect")) return "search";
	if (name === "write") return "write";
	if (name === "edit" || name === "apply_patch") return "edit";
	if ([
		"bash",
		"pwsh",
		"exec_command",
		"write_stdin"
	].includes(name) || name.startsWith("terminal_")) return "commands";
	if (name === "run_code") return "code";
	if (name === "web_search") return "webSearch";
	if (name === "web_fetch") return "webFetch";
	if (name === "subagent" || name.startsWith("subagent_")) return "subagents";
	if ([
		"todo_write",
		"create_goal",
		"update_goal",
		"get_goal"
	].includes(name)) return "plan";
	if (name === "ask_user_question" || name === "request_user_input") return "questions";
	return "tools";
}
const LIVE_TOOL_DETAIL_MAX_CHARS = 160;
const LIVE_TOOL_DETAIL_SEGMENTER = new Intl.Segmenter(void 0, { granularity: "grapheme" });
const LIVE_TOOL_DETAIL_KEYS = [
	"title",
	"description",
	"objective",
	"task",
	"task_name",
	"name",
	"question",
	"questions",
	"prompt",
	"message",
	"command",
	"cmd",
	"queries",
	"query",
	"pattern",
	"url",
	"uri",
	"file_path",
	"path",
	"target",
	"action",
	"status"
];
function normalizeLiveToolDetail(value) {
	const normalized = (typeof value === "string" ? value : Array.isArray(value) && value.every((item) => typeof item === "string") ? value.join(", ") : "").replace(/\s+/g, " ").trim();
	const chars = Array.from(LIVE_TOOL_DETAIL_SEGMENTER.segment(normalized), (part$1) => part$1.segment);
	return chars.length <= LIVE_TOOL_DETAIL_MAX_CHARS ? normalized : `${chars.slice(0, LIVE_TOOL_DETAIL_MAX_CHARS - 1).join("").trimEnd()}…`;
}
function questionDetail(value) {
	if (!Array.isArray(value)) return "";
	for (const item of value) {
		if (item === null || typeof item !== "object") continue;
		const detail = normalizeLiveToolDetail(Reflect.get(item, "question"));
		if (detail !== "") return detail;
	}
	return "";
}
function liveReasoningDetail(nodes) {
	for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
		const node = nodes[nodeIndex];
		if (node?.kind !== "assistant-step" || node.data.status !== "running") continue;
		for (let blockIndex = node.data.blocks.length - 1; blockIndex >= 0; blockIndex--) {
			const block = node.data.blocks[blockIndex];
			if (block?.kind !== "reasoning") continue;
			const paragraphs = block.text.split(/\r?\n[\t ]*\r?\n/);
			for (let paragraphIndex = paragraphs.length - 1; paragraphIndex >= 0; paragraphIndex--) {
				const detail = normalizeLiveToolDetail(paragraphs[paragraphIndex]?.replaceAll("**", ""));
				if (detail !== "") return detail;
			}
		}
	}
	return "";
}
function liveToolDetail(name, argsRaw) {
	let args;
	try {
		args = JSON.parse(argsRaw);
	} catch (_error) {
		return normalizeLiveToolDetail(name);
	}
	if (args === null || typeof args !== "object") return normalizeLiveToolDetail(name);
	for (const key of LIVE_TOOL_DETAIL_KEYS) if (key in args) {
		const value = Reflect.get(args, key);
		const detail = key === "questions" ? questionDetail(value) : normalizeLiveToolDetail(value);
		if (detail !== "") return detail;
	}
	return normalizeLiveToolDetail(name);
}
/**
* Rank categories by distinct call count, breaking ties by first appearance.
* @param nodes - process members, including recursive tools.
* @returns all ranked categories and the latest running tool category and bounded task detail.
*/
function processActivity(nodes) {
	const counts = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	let running;
	let runningDetail = "";
	let runningTime = -Infinity;
	let preparing;
	const visit = (tool) => {
		if (seen.has(tool.callId)) return;
		seen.add(tool.callId);
		const call = isRunningTool(tool) ? tool : tool.call;
		if (call !== null) {
			const kind = activity(call.name);
			if (isRunningTool(tool) && tool.time >= runningTime) {
				running = kind;
				preparing = tool.phase === "preparing";
				runningDetail = tool.phase === "preparing" ? kind === "tools" ? tool.name : "" : liveToolDetail(tool.name, tool.argsRaw);
				runningTime = tool.time;
			}
			counts.set(kind, (counts.get(kind) ?? 0) + 1);
		}
		for (const child of tool.subCalls) visit(child);
	};
	for (const node of nodes) if (node.kind === "tool-call") visit(node.data.root);
	if (running === void 0) runningDetail = liveReasoningDetail(nodes);
	return {
		counts: [...counts].map(([kind, count]) => ({
			kind,
			count
		})).sort((a, b) => b.count - a.count),
		running,
		runningDetail,
		...preparing ? { preparing: true } : {}
	};
}

function brandString(value) {
	return value;
}
/** Chat-owned segmentation and incremental summaries over materialized Node inputs. */
const INDEPENDENT = new Set([
	"user",
	"steering",
	"turn-trigger",
	"model-retry",
	"turn-error",
	"turn-max-tokens",
	"turn-tail"
]);
function turnOf(node) {
	const location = node.location;
	return location.kind === "turn" || location.kind === "step" ? location.turn.turn : void 0;
}
function reasoning(node) {
	return node.kind === "assistant-step" && node.data.blocks.some((block) => block.kind === "reasoning" && block.text.trim() !== "");
}
function reply(node) {
	return node.kind === "assistant-step" && hasAssistantReplyContent(node.data.blocks);
}
function sameSummary(left, right) {
	return left.running === right.running && left.runningDetail === right.runningDetail && left.preparing === right.preparing && left.counts.length === right.counts.length && left.counts.every((value, index) => value.kind === right.counts[index]?.kind && value.count === right.counts[index].count);
}
function sameMembers(left, right) {
	return left.length === right.length && left.every((value, index) => value.key === right[index]?.key && value.groupPart === right[index].groupPart);
}
function structureChanged(previous, current) {
	if (!isVisibleChatNode(current) && (previous === void 0 || !isVisibleChatNode(previous))) return false;
	return previous === void 0 || previous.kind !== current.kind || turnOf(previous) !== turnOf(current) || isVisibleChatNode(previous) !== isVisibleChatNode(current) || reasoning(previous) !== reasoning(current) || reply(previous) !== reply(current);
}
function readNode(input, key) {
	const node = input.readNode(key);
	if (node === void 0) throw new Error(`Chat grouping input is missing Node ${key}`);
	return node;
}
function questionReplyIds(input, keys) {
	const ids = /* @__PURE__ */ new Set();
	for (const key of keys) {
		const node = readNode(input, key);
		if (node.kind === "question-reply") ids.add(node.id);
	}
	return ids;
}
/** One group's members and cached summary, refreshed together when its content changes. */
var ProcessGroup = class {
	key;
	turn;
	members;
	nodes = [];
	snapshot;
	constructor(key, turn, members) {
		this.key = key;
		this.turn = turn;
		this.members = members;
		this.snapshot = {
			key,
			members,
			data: {
				turn,
				closed: false,
				summary: {
					counts: [],
					running: void 0,
					runningDetail: ""
				}
			}
		};
	}
	refresh(input, closed) {
		const nodes = this.members.map((member) => readNode(input, member.key));
		const unchanged = nodes.length === this.nodes.length && nodes.every((node, index) => node === this.nodes[index]);
		const previous = this.snapshot.data;
		const activity$1 = unchanged && previous.closed === closed ? previous.summary : processActivity(nodes);
		const summary = closed ? {
			counts: activity$1.counts,
			running: void 0,
			runningDetail: ""
		} : activity$1;
		this.nodes = nodes;
		if (previous.closed !== closed || !sameSummary(previous.summary, summary)) this.snapshot = {
			key: this.key,
			members: this.members,
			data: {
				turn: this.turn,
				closed,
				summary
			}
		};
	}
};
/** One Turn's grouping result and member lookup; summaries stay with their groups. */
var TurnGroups = class {
	turn;
	groups = /* @__PURE__ */ new Map();
	membership = /* @__PURE__ */ new Map();
	roots = /* @__PURE__ */ new Map();
	constructor(turn) {
		this.turn = turn;
	}
	references(key) {
		return this.roots.get(key) ?? [];
	}
	snapshots() {
		return [...this.groups.values()].map((group) => group.snapshot);
	}
	refresh(input, changed) {
		const dirty = /* @__PURE__ */ new Set();
		for (const node of changed) {
			const group = this.membership.get(node);
			if (group !== void 0) dirty.add(group);
		}
		const ended = input.timeline.turns.get(this.turn)?.status === "closed";
		if (ended) {
			for (const group of this.groups.values()) if (!group.snapshot.data.closed) dirty.add(group.key);
		}
		const upserts = [];
		for (const key of dirty) {
			const group = this.groups.get(key);
			const previous = group.snapshot;
			group.refresh(input, previous.data.closed || ended);
			if (group.snapshot !== previous) upserts.push(group.snapshot);
		}
		return upserts;
	}
	rebuild(input, added) {
		const roots = /* @__PURE__ */ new Map();
		const groups = /* @__PURE__ */ new Map();
		const membership = /* @__PURE__ */ new Map();
		let pending = [];
		const upserts = [];
		const emit = (key, entry) => {
			roots.set(key, [...roots.get(key) ?? [], entry]);
		};
		const flush = (closed) => {
			const first = pending[0];
			if (first === void 0) return;
			const key = this.extendedGroup(pending, added)?.key ?? brandString(JSON.stringify([
				"process",
				first.key,
				first.groupPart ?? null
			]));
			const previous$1 = this.groups.get(key);
			const before = previous$1?.snapshot;
			const group = previous$1 !== void 0 && sameMembers(previous$1.members, pending) ? previous$1 : new ProcessGroup(key, this.turn, pending);
			group.refresh(input, closed || input.timeline.turns.get(this.turn)?.status === "closed");
			groups.set(group.key, group);
			emit(first.key, {
				kind: "group",
				key: group.key
			});
			for (const member of pending) membership.set(member.key, group.key);
			if (group.snapshot !== before) upserts.push(group.snapshot);
			pending = [];
		};
		let previous;
		let followed = false;
		const keys = input.readTurn(this.turn);
		const replies = questionReplyIds(input, keys);
		for (const key of keys) {
			const position = readPosition(input, key);
			if (previous !== void 0 && position.previous !== previous) flush(true);
			previous = key;
			followed = position.next !== void 0;
			const node = readNode(input, key);
			if (node.kind === "turn-trigger" && replies.has(node.id)) continue;
			if (INDEPENDENT.has(node.kind)) {
				flush(true);
				emit(key, {
					kind: "node",
					key
				});
			} else if (node.kind === "turn-process") emit(pending[0]?.key ?? key, {
				kind: "node",
				key
			});
			else if (node.kind === "assistant-step") {
				if (reasoning(node)) pending.push({
					kind: "node",
					key,
					groupPart: "reasoning"
				});
				if (reply(node)) {
					flush(true);
					emit(key, {
						kind: "node",
						key,
						groupPart: "response"
					});
				}
			} else pending.push({
				kind: "node",
				key
			});
		}
		flush(followed);
		const removes = [...this.groups.keys()].filter((key) => !groups.has(key));
		this.groups = groups;
		this.membership = membership;
		this.roots = roots;
		return {
			upserts,
			removes
		};
	}
	extendedGroup(members, added) {
		const offset = members.findIndex((member) => !added.has(member.key));
		const first = members[offset];
		if (first === void 0) return void 0;
		const key = this.membership.get(first.key);
		const previous = key === void 0 ? void 0 : this.groups.get(key);
		if (previous === void 0 || offset + previous.members.length > members.length) return void 0;
		for (let index = 0; index < previous.members.length; index++) {
			const before = previous.members[index];
			const after = members[offset + index];
			if (before.key !== after.key || before.groupPart !== after.groupPart) return void 0;
		}
		for (let index = offset + previous.members.length; index < members.length; index++) if (!added.has(members[index].key)) return void 0;
		return previous;
	}
};
function readPosition(input, key) {
	const position = input.readPosition(key);
	if (position === void 0) throw new Error(`Chat grouping order is missing position for Node ${key}`);
	return position;
}
/** Session-local Turn results; ordinary updates never read other Turns' Node contents. */
var ProcessState = class {
	turns = /* @__PURE__ */ new Map();
	order = [];
	pending = null;
	/**
	* Consume one synchronous Builder input without retaining its readers.
	* @param input - projected Node changes, indexed positions, and Turn lifecycle.
	*/
	accept(input) {
		if (input.kind === "replace") {
			const previousKeys = new Set(this.order);
			const added$1 = new Set(input.order.filter((key) => !previousKeys.has(key)));
			const turns = /* @__PURE__ */ new Map();
			for (const key of input.order) {
				const turn = readPosition(input, key).turn;
				if (turn === void 0 || turns.has(turn)) continue;
				const groups = this.turns.get(turn) ?? new TurnGroups(turn);
				groups.rebuild(input, added$1);
				turns.set(turn, groups);
			}
			this.turns = turns;
			this.order = input.order;
			this.pending = {
				entries: this.rootEntries(input),
				groups: {
					kind: "replace",
					snapshots: [...turns.values()].flatMap((turn) => turn.snapshots())
				}
			};
			return;
		}
		const regroup = new Set(input.changedTurnOrders);
		const added = /* @__PURE__ */ new Set();
		const changed = /* @__PURE__ */ new Map();
		const touch = (turn) => {
			let keys = changed.get(turn);
			if (keys === void 0) {
				keys = /* @__PURE__ */ new Set();
				changed.set(turn, keys);
			}
			return keys;
		};
		for (const change of input.changes) {
			const before = change.previous;
			const after = change.current;
			const turn = turnOf(after);
			if (before === void 0 || !isVisibleChatNode(before)) added.add(after.key);
			if (structureChanged(before, after)) {
				const previousTurn = before === void 0 ? void 0 : turnOf(before);
				if (previousTurn !== void 0) regroup.add(previousTurn);
				if (turn !== void 0) regroup.add(turn);
			}
			if (turn !== void 0) touch(turn).add(after.key);
		}
		for (const turn of input.changedTurns) touch(turn);
		const upserts = [];
		const removes = [];
		for (const turn of regroup) {
			const groups = this.turns.get(turn) ?? new TurnGroups(turn);
			const update = groups.rebuild(input, added);
			upserts.push(...update.upserts);
			removes.push(...update.removes);
			if (input.readTurn(turn).length === 0) this.turns.delete(turn);
			else this.turns.set(turn, groups);
		}
		for (const [turn, keys] of changed) if (!regroup.has(turn)) upserts.push(...this.turns.get(turn)?.refresh(input, keys) ?? []);
		const reordered = input.order !== this.order || regroup.size > 0;
		this.order = input.order;
		const installed = new Set(upserts.map((group) => group.key));
		this.pending = reordered || upserts.length > 0 || removes.length > 0 ? {
			...reordered ? { entries: this.rootEntries(input) } : {},
			groups: {
				kind: "apply",
				upserts,
				removes: removes.filter((key) => !installed.has(key))
			}
		} : null;
	}
	rootEntries(input) {
		const replies = questionReplyIds(input, input.order.filter((key) => readPosition(input, key).turn === void 0));
		return input.order.flatMap((key) => {
			const turn = readPosition(input, key).turn;
			if (turn === void 0) {
				const node = readNode(input, key);
				return node.kind === "turn-trigger" && replies.has(node.id) ? [] : [{
					kind: "node",
					key
				}];
			}
			const groups = this.turns.get(turn);
			if (groups === void 0) throw new Error(`Chat grouping order is missing Turn ${turn}`);
			return groups.references(key);
		});
	}
	/**
	* Read pending output without advancing State.
	* @returns the repeatable update for the last input batch.
	*/
	output() {
		return this.pending;
	}
};

const TURN_PROCESS_INDEPENDENT_KINDS = new Set([
	"system-prompt",
	"user",
	"steering",
	"turn-trigger",
	"turn-process",
	"turn-error",
	"turn-max-tokens",
	"turn-tail"
]);
/**
* Compare immutable Turn-process specifications by their published fields.
* @param left - previous specification.
* @param right - next specification.
* @returns whether both values describe the same process presentation.
*/
function sameTurnProcessSpec(left, right) {
	return left.turn === right.turn && left.controlAnchorSeq === right.controlAnchorSeq && left.processStartSeq === right.processStartSeq && left.answerAnchorSeq === right.answerAnchorSeq && left.answerStep === right.answerStep && left.inlineReasoning === right.inlineReasoning && left.messageCount === right.messageCount && left.toolCallCount === right.toolCallCount && left.subagentCount === right.subagentCount;
}
/**
* Recognize the shipped subagent delegation name and its configured variants.
* Control tools use distinct names such as `send_message` and `list_agents`.
* @param name - durable Tool-call name.
* @returns whether the call creates or forks a subagent.
*/
function isSubagentDelegationTool(name) {
	return name === "subagent" || name.startsWith("subagent_");
}

function nodeTurn(node) {
	const location = node?.location;
	return location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : void 0;
}
function samePresentation(left, right) {
	return left === right || left !== void 0 && right !== void 0 && left.spec === right.spec && left.turn === right.turn && left.turnStarted === right.turnStarted && left.turnClosed === right.turnClosed && left.hasExternalProcess === right.hasExternalProcess && left.hasInterleavedInput === right.hasInterleavedInput && left.compactAnswer === right.compactAnswer;
}
function derivePresentation(turn, locations, nodes) {
	const keys = locations.getTurn(turn);
	const control = keys.map((key) => nodes.get(key)).find((node) => node?.kind === "turn-process");
	if (control === void 0) return void 0;
	const spec = control.data;
	const location = control.location;
	if (location.kind !== "turn" && location.kind !== "step") return void 0;
	let openingHumanAnchor;
	for (const key of keys) {
		const node = nodes.get(key);
		if ((node?.kind === "user" || node?.kind === "steering" || node?.kind === "turn-trigger") && (spec.controlAnchorSeq === location.turn.start?.seq || node.anchorSeq < spec.controlAnchorSeq)) openingHumanAnchor = Math.max(openingHumanAnchor ?? node.anchorSeq, node.anchorSeq);
	}
	let hasExternalProcess = false;
	let hasInterleavedInput = false;
	let compactAnswer = true;
	for (const key of keys) {
		const node = nodes.get(key);
		if (node === void 0 || !isVisibleChatNode(node) || node.kind === "turn-process") continue;
		if ((node.kind === "user" || node.kind === "steering" || node.kind === "turn-trigger") && (openingHumanAnchor === void 0 || node.anchorSeq > openingHumanAnchor)) {
			hasInterleavedInput = true;
			if (spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq) compactAnswer = false;
		}
		if (TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind) || node.anchorSeq < spec.processStartSeq || spec.answerAnchorSeq !== null && node.anchorSeq >= spec.answerAnchorSeq) continue;
		if (node.kind !== "assistant-step" || spec.answerStep === null || node.data.step !== spec.answerStep) hasExternalProcess = true;
	}
	return {
		turn,
		spec,
		turnStarted: location.turn.start !== void 0,
		turnClosed: location.turn.status === "closed",
		hasExternalProcess,
		hasInterleavedInput,
		compactAnswer
	};
}
/** Mutable projection of cross-Node process layout facts by Turn. */
var ChatTurnProcessProjector = class {
	presentations = /* @__PURE__ */ new Map();
	/**
	* Read the retained process presentation for a Node's Turn.
	* @param node - Current Chat Node.
	* @returns The Turn's process presentation, when present.
	*/
	get(node) {
		const turn = nodeTurn(node);
		return turn === void 0 ? void 0 : this.presentations.get(turn);
	}
	/**
	* Replace every projected Turn.
	* @param order - visible Chat Node order.
	* @param locations - current Chat Location index.
	* @param nodes - current Chat Node store.
	* @returns Turns whose process presentation changed.
	*/
	replace(order, locations, nodes) {
		const turns = /* @__PURE__ */ new Set();
		for (const key of order) {
			const turn = nodeTurn(nodes.get(key));
			if (turn !== void 0) turns.add(turn);
		}
		const changed = /* @__PURE__ */ new Set();
		for (const turn of new Set([...this.presentations.keys(), ...turns])) if (this.set(turn, turns.has(turn) ? derivePresentation(turn, locations, nodes) : void 0)) changed.add(turn);
		return changed;
	}
	/**
	* Recompute selected Turns after incremental Node changes.
	* @param turns - affected Turn numbers.
	* @param locations - current Chat Location index.
	* @param nodes - current Chat Node store.
	* @returns Turns whose process presentation changed.
	*/
	update(turns, locations, nodes) {
		const changed = /* @__PURE__ */ new Set();
		for (const turn of turns) if (this.set(turn, derivePresentation(turn, locations, nodes))) changed.add(turn);
		return changed;
	}
	set(turn, next) {
		if (samePresentation(this.presentations.get(turn), next)) return false;
		if (next === void 0) this.presentations.delete(turn);
		else this.presentations.set(turn, next);
		return true;
	}
};

const projected = /* @__PURE__ */ new WeakSet();
function nativeProcessSnapshot(chat) {
	return projected.has(chat.workProcess) ? chat.workProcess : void 0;
}
var NativeProcessSnapshotAdapter = class {
	groups = new ProcessState();
	turns = new ChatTurnProcessProjector();
	positions = /* @__PURE__ */ new Map();
	order = void 0;
	nodeInputs = /* @__PURE__ */ new Map();
	timeline = void 0;
	previous = void 0;
	replace(chat) {
		return this.consume(chat);
	}
	apply(chat, upserts) {
		return this.consume(chat, upserts);
	}
	consume(chat, upserts) {
		const reordered = this.order !== chat.order;
		if (reordered) this.positions.clear();
		for (const [index, key] of reordered ? chat.order.entries() : []) {
			const location = chat.nodes.get(key)?.location;
			this.positions.set(key, {
				previous: chat.order[index - 1],
				next: chat.order[index + 1],
				turn: location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : void 0
			});
		}
		const turnOf$1 = (node) => node?.location.kind === "turn" || node?.location.kind === "step" ? node.location.turn.turn : void 0;
		const changedTurns = /* @__PURE__ */ new Set();
		const changedTurnOrders = /* @__PURE__ */ new Set();
		const changes = (upserts ?? []).map((current) => {
			const previous = this.nodeInputs.get(current.key);
			const turn = turnOf$1(current), before = turnOf$1(previous);
			if (turn !== void 0) changedTurns.add(turn);
			if (before !== void 0) changedTurns.add(before);
			if (previous === void 0 || previous.anchorSeq !== current.anchorSeq || before !== turn || previous.visibility !== current.visibility) {
				if (turn !== void 0) changedTurnOrders.add(turn);
				if (before !== void 0) changedTurnOrders.add(before);
			}
			this.nodeInputs.set(current.key, current);
			const position = this.positions.get(current.key);
			if (position !== void 0 && position.turn !== turn) this.positions.set(current.key, {
				...position,
				turn
			});
			return {
				previous,
				current
			};
		});
		for (const [turn, location] of chat.timeline.turns) if (this.timeline?.turns.get(turn) !== location) changedTurns.add(turn);
		const replace = upserts === void 0 || this.previous === void 0;
		if (replace) this.nodeInputs = new Map(chat.order.map((key) => [key, chat.nodes.get(key)]));
		this.groups.accept({
			...replace ? { kind: "replace" } : {
				kind: "apply",
				changes,
				changedTurns,
				changedTurnOrders
			},
			order: chat.order,
			timeline: chat.timeline,
			readNode: (key) => chat.nodes.get(key),
			readTurn: (turn) => chat.locations.getTurn(turn),
			readPosition: (key) => this.positions.get(key)
		});
		if (replace) this.turns.replace(chat.order, chat.locations, chat.nodes);
		else this.turns.update(changedTurns, chat.locations, chat.nodes);
		const output = this.groups.output();
		const evidence = new Map(replace ? [] : this.previous?.evidence);
		for (const turn of changedTurns) evidence.delete(turn);
		const evidenceKeys = replace ? chat.order : [...changedTurns].flatMap((turn) => chat.locations.getTurn(turn));
		for (const key of evidenceKeys) {
			const node = chat.nodes.get(key);
			const presentation = this.turns.get(node);
			const location = node?.location;
			if (presentation === void 0 || location?.kind !== "turn" && location?.kind !== "step") continue;
			evidence.set(presentation.turn, {
				turn: presentation.turn,
				status: location.turn.status,
				endReason: location.turn.end?.data.reason?.kind,
				hasInterleavedInput: presentation.hasInterleavedInput,
				hasExternalProcess: presentation.hasExternalProcess,
				inlineReasoning: presentation.spec.inlineReasoning,
				spec: presentation.spec
			});
		}
		const groups = new Map(replace ? (output?.groups?.snapshots ?? []).map((group) => [group.key, group]) : this.previous?.groups);
		if (!replace) {
			for (const key of output?.groups?.removes ?? []) groups.delete(key);
			for (const group of output?.groups?.upserts ?? []) groups.set(group.key, group);
		}
		const result = {
			entries: output?.entries ?? this.previous?.entries ?? [],
			groups,
			evidence
		};
		this.previous = result;
		this.order = chat.order;
		this.timeline = chat.timeline;
		projected.add(result);
		return result;
	}
};

/** Presentation contract tested against published dsh 0.2.0-rc.2. */
function autoReviewDenial(block) {
	if (block.isError !== true || block.error?.name !== "AutoReviewDeniedError" || block.error.code !== "AUTO_REVIEW_DENIED") return void 0;
	return typeof block.error.reason === "string" ? { reason: block.error.reason } : {};
}
/** Auto is advertised only by the live Host catalog, never inserted by this helper. */
function autoPermissionPresentation(option, locale) {
	if (option.value !== "auto") return {
		label: option.name,
		...option.description === void 0 ? {} : { description: option.description }
	};
	const risk = locale === "zh" ? "实验性：LLM 审查可直接允许工具执行，可能放行不安全操作或拒绝有效操作；每次审查消耗额外 token。" : "Experimental: LLM review can allow tools to execute directly, may allow unsafe actions or deny useful ones, and consumes additional tokens per review.";
	return {
		label: `${option.name} · ${locale === "zh" ? "实验性" : "Experimental"}`,
		description: option.description === void 0 ? risk : `${option.description}\n${risk}`
	};
}

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

function record(value) {
	return value !== null && typeof value === "object" ? value : void 0;
}
var WorkspaceFileObserver = class {
	files;
	listeners = /* @__PURE__ */ new Set();
	owner;
	unsubscribe;
	state = {
		mode: "starting",
		loading: false,
		stale: true
	};
	generation = 0;
	lifetime = new AbortController();
	watch;
	read;
	activeWatch = Promise.resolve();
	restart = Promise.resolve();
	revision = 0;
	observedVersion;
	watchedPath;
	draining = false;
	requested = false;
	disposed = false;
	cleanupFailure;
	key = "";
	ready = false;
	timeoutMs;
	constructor(path, options, parent) {
		this.path = path;
		this.options = options;
		this.files = new HostFileController(options);
		this.owner = options.source.getSnapshot().sessionId;
		this.timeoutMs = options.timeoutMs ?? 1e4;
		this.unsubscribe = options.source.subscribe(() => this.sync());
		if (parent !== void 0) {
			parent.addEventListener("abort", this.close, { once: true });
			this.lifetime.signal.addEventListener("abort", () => parent.removeEventListener("abort", this.close), { once: true });
		}
		if (parent?.aborted) this.dispose();
		else this.sync();
	}
	close = () => {
		this.dispose();
	};
	getSnapshot() {
		return this.state;
	}
	refreshReason() {
		const reason = this.files.reason("stat") ?? this.files.reason("read");
		if (reason !== void 0) return reason;
		try {
			this.files.path(this.path);
			return;
		} catch (error) {
			return message(error);
		}
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	publish(state) {
		if (this.disposed && state.mode !== "closed") return;
		this.state = state;
		for (const listener of this.listeners) listener();
	}
	sync() {
		if (this.disposed) return;
		const scope = this.options.source.getSnapshot();
		if (scope.sessionId !== this.owner) {
			this.dispose();
			return;
		}
		const key = hostFileScopeKey(scope);
		if (this.key === key && this.ready === scope.ready) return;
		this.key = key;
		this.ready = scope.ready;
		const generation = ++this.generation;
		this.observedVersion = void 0;
		this.watchedPath = void 0;
		this.revision++;
		this.requested = false;
		this.watch?.abort();
		this.read?.abort();
		this.publish({
			...this.state,
			mode: scope.ready ? "starting" : "disconnected",
			loading: false,
			stale: true,
			...scope.ready ? {
				reason: "Initializing Host file observation",
				error: void 0
			} : {
				reason: "Host disconnected; reconnect will reread from start",
				error: void 0
			}
		});
		this.restart = this.restart.then(async () => {
			await this.activeWatch;
			if (this.disposed || generation !== this.generation || !this.ready) return;
			if (this.cleanupFailure !== void 0) throw this.cleanupFailure;
			this.watch = new AbortController();
			this.activeWatch = this.follow(generation, this.watch);
		}).catch((error) => {
			if (generation === this.generation && !this.disposed) this.publish({
				...this.state,
				mode: "manual",
				reason: `Watch cleanup failed: ${message(error)}; reopen the viewer`,
				loading: false,
				stale: true
			});
		});
	}
	current(generation) {
		return !this.disposed && generation === this.generation && this.options.source.getSnapshot().ready;
	}
	async follow(generation, controller) {
		let iterator;
		let stream;
		let opening = false;
		let openResolved = false;
		let initialized = false;
		let timer;
		try {
			const reason = this.files.reason("changes");
			if (reason !== void 0) {
				this.publish({
					...this.state,
					mode: "manual",
					reason: `${reason}; manual refresh available`
				});
				this.requestRefresh();
				return;
			}
			const path = this.files.path(this.path);
			timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("Host watcher did not confirm ready")), this.timeoutMs);
			const identity = await this.files.stat(path, controller.signal);
			if (!this.current(generation)) return;
			this.watchedPath = identity.absolutePath;
			opening = true;
			stream = await observeManagement(this.options.files.changes(this.options.source.getSnapshot().sessionId, identity.absolutePath, controller.signal).then(async (value) => {
				openResolved = true;
				if (controller.signal.aborted) try {
					await closeHostFileStream(value, void 0, this.timeoutMs);
					this.cleanupFailure = void 0;
				} catch (error) {
					this.cleanupFailure = error;
				}
				return value;
			}, (error) => {
				openResolved = true;
				throw error;
			}), controller.signal);
			iterator = stream[Symbol.asyncIterator]();
			for (;;) {
				const next = await observeManagement(iterator.next(), controller.signal);
				if (!this.current(generation)) break;
				const currentReason = this.files.reason("changes");
				if (currentReason !== void 0) throw new Error(currentReason);
				if (next.done) throw new Error("Host watch ended; refresh manually or reopen");
				const frame = record(next.value);
				if (!initialized) {
					if (frame?.kind !== "ready") throw new Error("Host watch did not begin with ready");
					initialized = true;
					clearTimeout(timer);
					timer = void 0;
					this.publish({
						...this.state,
						mode: "watching",
						reason: void 0,
						error: void 0
					});
					this.requestRefresh();
					continue;
				}
				if (frame?.kind !== "change") throw new Error("Invalid Host watch frame");
				const change = record(frame.change);
				if (typeof change?.absolutePath !== "string" || (typeof change.version !== "string" || change.version.length === 0) && change.absent !== true) throw new Error("Invalid Host file invalidation");
				const identity$1 = this.watchedPath;
				if (identity$1 !== void 0 && change.absolutePath !== identity$1) throw new Error("Host watch invalidation belongs to another file");
				this.files.path(change.absolutePath);
				if (change.absent === true) {
					this.observedVersion = void 0;
					this.revision++;
					this.requested = false;
					this.read?.abort();
					this.publish({
						...this.state,
						page: void 0,
						loading: false,
						stale: true,
						error: "workspace-file/not-found: Host observed this file was removed"
					});
				} else if (this.observedVersion !== change.version) {
					this.observedVersion = change.version;
					if (this.state.page?.version !== change.version || this.state.stale) this.requestRefresh();
				}
			}
		} catch (error) {
			if (hostFileCleanupUnconfirmed(error)) this.cleanupFailure = error;
			if (this.current(generation)) {
				this.publish({
					...this.state,
					mode: "manual",
					reason: `${message(controller.signal.reason ?? error)}; manual refresh available`,
					stale: true
				});
				if (!initialized) this.requestRefresh();
			}
		} finally {
			clearTimeout(timer);
			controller.abort();
			if (opening && !openResolved) this.cleanupFailure = /* @__PURE__ */ new Error("Host watch opening outcome is unknown; no successor watch will be opened until cleanup is confirmed");
			if (stream !== void 0) try {
				await closeHostFileStream(stream, iterator, this.timeoutMs);
			} catch (error) {
				this.cleanupFailure = error;
				if (this.current(generation)) this.publish({
					...this.state,
					mode: "manual",
					reason: `Host watch cleanup is unconfirmed: ${message(error)}; reopen the viewer`,
					stale: true
				});
			}
		}
	}
	requestRefresh() {
		if (this.disposed || !this.ready) return;
		this.revision++;
		this.requested = true;
		this.read?.abort();
		if (!this.draining) this.drain();
	}
	async drain() {
		this.draining = true;
		try {
			while (this.requested && !this.disposed && this.ready) {
				this.requested = false;
				const revision = this.revision, generation = this.generation;
				const controller = new AbortController();
				this.read = controller;
				this.publish({
					...this.state,
					loading: true,
					stale: true,
					error: void 0
				});
				try {
					const stat = await this.files.stat(this.watchedPath ?? this.path, controller.signal);
					const page = await this.files.read(stat.absolutePath, controller.signal, {}, stat.version);
					if (this.current(generation) && revision === this.revision) this.publish({
						...this.state,
						page,
						loading: false,
						stale: false,
						error: void 0
					});
				} catch (error) {
					if (this.current(generation) && revision === this.revision) this.publish({
						...this.state,
						loading: false,
						stale: true,
						error: message(error)
					});
				}
			}
		} finally {
			this.draining = false;
		}
	}
	/** Explicit user action; no automatic retries on errors or unknown responses. */
	refresh() {
		this.requestRefresh();
	}
	async nextPage() {
		const page = this.state.page;
		if (page === void 0 || page.eof || this.state.stale || this.state.loading || this.disposed) return;
		const revision = ++this.revision, generation = this.generation;
		this.read?.abort();
		const controller = new AbortController();
		this.read = controller;
		this.publish({
			...this.state,
			loading: true
		});
		try {
			const next = await this.files.read(page.absolutePath, controller.signal, { offset: page.offset + page.lines }, page.version);
			if (this.current(generation) && revision === this.revision) this.publish({
				...this.state,
				page: next,
				loading: false,
				error: void 0
			});
		} catch (error) {
			if (this.current(generation) && revision === this.revision) this.publish({
				...this.state,
				loading: false,
				stale: true,
				error: message(error)
			});
		}
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.generation++;
		this.revision++;
		this.unsubscribe();
		this.lifetime.abort();
		this.watch?.abort();
		this.read?.abort();
		this.files.dispose();
		this.publish({
			...this.state,
			mode: "closed",
			loading: false,
			stale: true
		});
		this.listeners.clear();
	}
	/** Join native cleanup before the surface owner destroys its carrier. */
	async closed() {
		await this.restart;
		await this.activeWatch;
		if (this.cleanupFailure !== void 0) throw this.cleanupFailure;
	}
};
function message(error) {
	const code = record(error)?.code;
	const detail = error instanceof Error ? error.message : String(error);
	return typeof code === "string" ? `${code}: ${detail}` : detail;
}

const fileLabel = (text) => escapeTerminalText(stripVTControlCharacters(text));
async function workspaceFileView(observer, title, navigation) {
	let active = false;
	const choices = () => {
		const state = observer.getSnapshot();
		const unavailable = observer.refreshReason();
		return [
			{
				id: "__refresh__",
				label: "Refresh from start",
				...unavailable === void 0 ? {} : { disabledReason: unavailable }
			},
			...state.page !== void 0 && !state.page.eof ? [{
				id: "__next__",
				label: "Next page",
				...state.loading || state.stale ? { disabledReason: "Wait for a current file version" } : {}
			}] : [],
			...state.page?.text.split("\n").slice(0, state.page.lines).map((text, index) => ({
				id: `line:${state.page.offset + index}`,
				label: `${state.page.offset + index}  ${fileLabel(text)}`
			})) ?? []
		];
	};
	const update = () => {
		if (!active || navigation.signal.aborted) return;
		const state = observer.getSnapshot();
		navigation.updateChoices(choices(), [
			state.mode,
			state.loading ? "reading" : "",
			state.stale ? "stale" : "",
			state.reason,
			state.error,
			state.page?.version
		].filter(Boolean).join(" · "));
	};
	const stop = observer.subscribe(update);
	try {
		active = true;
		const page = navigation.selectPage({
			title,
			detail: `${HOST_FILE_READ_NOTICE}\nChanges refresh from the first page. Back closes observation.`,
			choices: choices(),
			searchable: false
		}, async (choice) => {
			if (choice.id === "__refresh__") observer.refresh();
			else if (choice.id === "__next__") await observer.nextPage();
		});
		update();
		await page;
	} finally {
		active = false;
		stop();
		observer.dispose();
		await observer.closed();
	}
}
/** E can call this from /files or an explicit Host-reference action; uploads keep their existing intake. */
async function hostWorkspaceFilesView(options, navigation) {
	const files = new HostFileController(options);
	const scope = hostFileScopeKey(options.source.getSnapshot());
	const ensureScope = () => {
		if (!options.source.getSnapshot().ready || hostFileScopeKey(options.source.getSnapshot()) !== scope) throw new Error("Host file browser scope changed; reopen after reconnecting");
	};
	const browse = async (path) => {
		ensureScope();
		const initial = await navigation.progress({
			title: "Host workspace files",
			work: (_report, signal) => files.list(path, signal)
		});
		if (initial === void 0 || navigation.signal.aborted) return;
		let listing = initial;
		const choices = () => [{
			id: "__refresh__",
			label: "Refresh directory"
		}, ...listing.entries.map((entry) => ({
			id: `entry:${entry.name}`,
			label: fileLabel(entry.name),
			description: entry.type,
			...entry.type === "other" ? { disabledReason: "Host entry is not a regular file or directory" } : {}
		}))];
		await navigation.selectPage({
			title: `Host files /${listing.path}`,
			detail: `${HOST_FILE_READ_NOTICE}\n${listing.truncated ? "Host entry cap reached; only this listing window is available." : "Directories and file references belong to the Host execution world."}`,
			choices: choices()
		}, async (choice) => {
			ensureScope();
			if (choice.id === "__refresh__") {
				const fresh = await navigation.progress({
					title: "Refresh Host directory",
					work: (_report, signal) => files.list(path, signal)
				});
				if (fresh !== void 0) {
					listing = fresh;
					navigation.updateChoices(choices(), fresh.truncated ? "Host entry cap reached" : "Host directory refreshed");
				}
				return;
			}
			const entry = listing.entries.find((entry$1) => `entry:${entry$1.name}` === choice.id);
			if (entry === void 0) return;
			const child = [listing.path, entry.name].filter(Boolean).join("/");
			if (entry.type === "directory") {
				await browse(child);
				return;
			}
			if (entry.type !== "file") return;
			await navigation.selectPage({
				title: fileLabel(entry.name),
				choices: [{
					id: "text",
					label: "Read text and observe changes",
					...disabled(files.reason("read") ?? files.reason("stat"))
				}, {
					id: "bytes",
					label: "View binary bytes (Host read)",
					...disabled(files.reason("readBytes"))
				}]
			}, async (action) => {
				ensureScope();
				if (action.id === "text") await workspaceFileView(new WorkspaceFileObserver(child, options, navigation.signal), fileLabel(entry.name), navigation);
				else if (action.id === "bytes") {
					let offset = 0, version;
					for (;;) {
						ensureScope();
						const page = await navigation.progress({
							title: entry.name,
							work: (_report, signal) => files.readBytes(child, signal, { range: {
								offset,
								length: 4096
							} }, version)
						});
						if (page === void 0) return;
						await navigation.detail({
							title: `${fileLabel(entry.name)} · byte ${offset}`,
							content: Array.from(page.data, (byte$1) => byte$1.toString(16).padStart(2, "0")).join(" "),
							footer: `Host version ${page.version}. ${HOST_FILE_READ_NOTICE}`
						});
						if (page.eof) return;
						const next = await navigation.select({
							title: entry.name,
							choices: [{
								id: "next",
								label: "Next byte page"
							}, {
								id: "refresh",
								label: "Refresh from start"
							}]
						});
						if (next === void 0) return;
						offset = next.id === "refresh" ? 0 : page.offset + page.data.length;
						version = next.id === "refresh" ? void 0 : page.version;
					}
				}
			});
		});
	};
	try {
		await browse("");
	} finally {
		files.dispose();
	}
}
function disabled(reason) {
	return reason === void 0 ? {} : { disabledReason: reason };
}

function artifactRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function artifactJson(value) {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return "[Unserializable recorded value]";
	}
}
function argsOf(value) {
	if (typeof value !== "string") return artifactRecord(value);
	try {
		return artifactRecord(JSON.parse(value));
	} catch {
		return;
	}
}
function attachments(content, seq, prefix) {
	if (!Array.isArray(content)) return [];
	return content.flatMap((value, index) => {
		const block = artifactRecord(value);
		if (block === void 0 || block.type === "text" || block.type === "reasoning") return [];
		const ref = artifactRecord(block.attachment);
		const attachmentId = typeof ref?.attachmentId === "string" ? ref.attachmentId : void 0;
		return [{
			id: `${prefix}:${seq}:${index}`,
			seq,
			kind: attachmentId === void 0 ? "unknown" : "attachment",
			title: typeof ref?.name === "string" ? ref.name : `Recorded ${String(block.type ?? "unknown")} block`,
			detail: artifactJson(block),
			...attachmentId === void 0 ? {} : { attachmentId }
		}];
	});
}
/** A pure view index, not a Session state fold; cold and live input use the same B-owned journal. */
function sessionArtifacts(events) {
	const rows = [];
	const seen = /* @__PURE__ */ new Set();
	for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
		if (!Number.isSafeInteger(event.seq) || event.seq < 0 || seen.has(event.seq)) continue;
		seen.add(event.seq);
		const decorated = artifactRecord(event.view);
		const presenter = decorated?.for === "result" ? artifactRecord(decorated.view) : void 0;
		if (presenter?.card === "web") (presenter.kind === "fetch" ? [{
			url: presenter.url,
			title: presenter.title
		}] : presenter.kind === "search" && Array.isArray(presenter.sources) ? presenter.sources : []).forEach((value, index) => {
			const source = artifactRecord(value);
			if (typeof source?.url !== "string") return;
			rows.push({
				seq: event.seq,
				id: `link:${event.seq}:${index}`,
				kind: "link",
				url: source.url,
				title: typeof source.title === "string" ? source.title : source.url,
				detail: artifactJson(source)
			});
		});
		const data = artifactRecord(event.data);
		if (data === void 0) continue;
		const turn = Number.isSafeInteger(data.turn) ? data.turn : void 0;
		const base = {
			seq: event.seq,
			...turn === void 0 ? {} : { turn }
		};
		if (event.type === "tool/call" || event.type === "tool/ptc-dispatch-start") {
			if (data.name !== "exit_plan_mode") continue;
			const args = argsOf(data.arguments);
			const callId = typeof data.callId === "string" ? data.callId : typeof data.subCallId === "string" ? data.subCallId : void 0;
			rows.push({
				...base,
				id: `plan:${event.seq}`,
				kind: typeof args?.plan === "string" ? "plan" : "unknown",
				title: "Recorded plan review",
				detail: typeof args?.plan === "string" ? args.plan : artifactJson(data),
				...callId === void 0 ? {} : { callId }
			});
		} else if (event.type === "deliverables/presented") {
			if (!Array.isArray(data.files)) {
				rows.push({
					...base,
					id: `unknown:${event.seq}`,
					kind: "unknown",
					title: "Invalid delivery record",
					detail: artifactJson(data)
				});
				continue;
			}
			data.files.forEach((value, index) => {
				const file = artifactRecord(value);
				const path = typeof file?.path === "string" && file.path !== "" ? file.path : void 0;
				rows.push({
					...base,
					id: `delivery:${event.seq}:${index}`,
					index,
					kind: path === void 0 ? "unknown" : "delivery",
					title: path ?? "Unknown delivery",
					detail: artifactJson(file ?? value),
					...path === void 0 ? {} : { path }
				});
			});
		} else if (event.type === "workspace/changes") rows.push({
			...base,
			id: `changes:${event.seq}`,
			kind: turn === void 0 ? "unknown" : "changes",
			title: turn === void 0 ? "Invalid Review announcement" : `Review · turn ${turn}`,
			detail: artifactJson(data)
		});
		else if (event.type === "tool/result" || event.type === "tool/ptc-dispatch") {
			const result = event.type === "tool/result" ? artifactRecord(data.message) : data;
			const callId = typeof data.subCallId === "string" ? data.subCallId : artifactRecord(result?.source)?.callId;
			const isError = result?.isError;
			rows.push({
				...base,
				id: `result:${event.seq}`,
				kind: Array.isArray(result?.content) ? "result" : "unknown",
				title: `${event.type === "tool/ptc-dispatch" ? "PTC" : "Tool"} result · ${isError === true ? "error" : isError === false ? "success" : "status unknown"}`,
				detail: artifactJson(result ?? data),
				...typeof callId === "string" ? { callId } : {},
				...typeof isError === "boolean" ? { isError } : {}
			});
			rows.push(...attachments(result?.content, event.seq, "result-attachment"));
		} else if (event.type === "user/message" || event.type === "assistant/message") {
			const content = event.type === "user/message" ? data.content : artifactRecord(data.message)?.content;
			rows.push(...attachments(content, event.seq, "message-attachment"));
		} else if (event.type.startsWith("artifact/")) rows.push({
			...base,
			id: `unknown:${event.seq}`,
			kind: "unknown",
			title: event.type,
			detail: artifactJson(data)
		});
	}
	return rows.map((row) => {
		if (row.kind !== "plan" || row.callId === void 0) return row;
		const outcome = rows.findLast((candidate) => candidate.kind === "result" && candidate.callId === row.callId && candidate.seq > row.seq);
		return outcome === void 0 ? {
			...row,
			title: `${row.title} · no recorded settlement in loaded history`
		} : {
			...row,
			title: `${row.title} · ${outcome.isError === true ? "error/cancelled" : outcome.isError === false ? "completed" : "outcome unknown"}`,
			detail: `${row.detail}\n\n--- Recorded tool outcome (seq ${outcome.seq}) ---\n${outcome.detail}`,
			...outcome.isError === void 0 ? {} : { isError: outcome.isError }
		};
	});
}
/** Host-owned persisted mode/todo values. undefined/null/invalid remain distinguishable. */
function persistedPlanDetail(projections) {
	const plan = artifactRecord(projections.plan);
	const lines = [plan === void 0 ? "Plan projection absent: plan-mode is not composed or its baseline has not arrived." : typeof plan.active !== "boolean" || typeof plan.pending !== "boolean" ? `Invalid Plan projection: ${artifactJson(plan)}` : `Plan mode: ${plan.active ? "active" : "inactive"}${plan.pending ? " · selection pending" : ""}`];
	const todos = projections.todos;
	lines.push(todos === void 0 ? "Todo projection absent: todo plugin is not composed or its baseline has not arrived." : todos === null ? "No todo snapshot has been written." : artifactJson(todos));
	return lines.join("\n\n");
}

var ArtifactViewController = class {
	pending = /* @__PURE__ */ new Set();
	selected = /* @__PURE__ */ new Map();
	fileObservers = /* @__PURE__ */ new Set();
	stopObserving;
	disposed = false;
	scope;
	constructor(options) {
		this.options = options;
		this.scope = this.scopeOf(options.source.getSnapshot());
		this.stopObserving = options.source.subscribe(() => {
			const snapshot = options.source.getSnapshot();
			const scope = this.scopeOf(snapshot);
			if (!snapshot.ready || scope !== this.scope) {
				for (const controller of this.pending) controller.abort();
				this.scope = scope;
			}
		});
	}
	scopeOf(snapshot) {
		return `${snapshot.sessionId}:${snapshot.generation}`;
	}
	snapshot() {
		if (this.disposed) throw new Error("Artifact viewer has been disposed");
		const snapshot = this.options.source.getSnapshot();
		if (!snapshot.ready) throw new Error("Session/Host baseline is unavailable; refresh after reconnecting");
		return snapshot;
	}
	scopeId() {
		return this.scopeOf(this.snapshot());
	}
	stateDetail() {
		return this.snapshot().hasMoreHistory ? "Only the loaded history window is shown; load older history to see earlier references." : "All loaded Session references are shown.";
	}
	plan() {
		return persistedPlanDetail(this.snapshot().projections);
	}
	rows(kind) {
		return sessionArtifacts(this.snapshot().events).filter((row) => kind === "trajectory" || row.kind === "unknown" || kind === "files" && (row.kind === "delivery" || row.kind === "attachment") || kind === "plan" && row.kind === "plan" || kind === "review" && row.kind === "changes");
	}
	selection(kind) {
		return this.selected.get(`${this.snapshot().sessionId}:${kind}`);
	}
	select(kind, id) {
		this.selected.set(`${this.snapshot().sessionId}:${kind}`, id);
	}
	reason(name) {
		if (name.startsWith("workspaceFiles/")) {
			const confinement = strictFileConfinementReason(this.options.strictConfined);
			if (confinement !== void 0) return confinement;
		}
		const capability = this.options.capability(name);
		return capability?.available === true ? void 0 : capability?.reason ?? `${name} is absent, disabled, or its Host capability is not confirmed`;
	}
	linkReason(action, id) {
		const row = this.requireRow(id);
		try {
			safeArtifactUrl(row.url ?? "");
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
		return this.options.links?.[action] === void 0 ? `No ${action} action is attached to this terminal surface` : void 0;
	}
	async link(action, id, signal) {
		signal.throwIfAborted();
		const row = this.requireRow(id);
		const reason = this.linkReason(action, id);
		if (reason !== void 0) throw new Error(reason);
		const url = safeArtifactUrl(row.url);
		if (action === "copy") this.options.links.copy(url);
		else await this.run(signal, (inner) => this.options.links.open(url, inner));
	}
	async readFile(id, parent, offset = 1, expectedVersion) {
		const row = this.requireRow(id);
		if (row.path === void 0) throw new Error("This is an opaque attachment/reference, not a workspace file path");
		const path = artifactHostPath(row.path, this.snapshot().hostWorkspacePath);
		const reason = this.reason("workspaceFiles/read");
		if (reason !== void 0 || this.options.files === void 0) throw new Error(reason ?? "No authenticated workspaceFiles reader is attached");
		if (!Number.isSafeInteger(offset) || offset < 1) throw new Error("Invalid file page offset");
		const files = this.options.files;
		return this.run(parent, async (signal, snapshot) => {
			const result = await files.read(snapshot.sessionId, path, {
				offset,
				limit: 200
			}, signal);
			if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
			const value = result.value;
			if (typeof value.text !== "string" || typeof value.version !== "string" || typeof value.absolutePath !== "string" || value.offset !== offset || !Number.isSafeInteger(value.lines) || value.lines < 0 || value.lines > 200 || typeof value.eof !== "boolean" || !value.eof && value.lines === 0) throw new Error("Invalid workspaceFiles/read page; the Host read is not confirmed");
			if (expectedVersion !== void 0 && value.version !== expectedVersion) throw new Error("File changed between pages; refresh from the first page");
			return {
				content: value.text,
				version: value.version,
				...value.eof ? {} : { nextOffset: offset + value.lines }
			};
		});
	}
	/** The existing read-only port keeps its manual viewer; complete Host ports enable live observation. */
	canObserveFile() {
		return this.options.files?.stat !== void 0;
	}
	observeFile(id, signal) {
		const row = this.requireRow(id);
		if (row.path === void 0 || this.options.files === void 0) throw new Error("No Host file reference/port is attached");
		const observer = new WorkspaceFileObserver(row.path, {
			source: this.options.source,
			files: this.options.files,
			capability: (name) => this.options.capability(name),
			...this.options.timeoutMs === void 0 ? {} : { timeoutMs: this.options.timeoutMs },
			...this.options.strictConfined === void 0 ? {} : { strictConfined: this.options.strictConfined }
		}, signal);
		this.fileObservers.add(observer);
		const stop = observer.subscribe(() => {
			if (observer.getSnapshot().mode === "closed") {
				this.fileObservers.delete(observer);
				stop();
			}
		});
		return observer;
	}
	async reviewSummary(id, parent) {
		const row = this.requireRow(id);
		if (row.kind !== "changes") throw new Error("This reference is not a workspace/changes announcement");
		const reason = this.reason("workspaceChanges/summary");
		if (reason !== void 0 || this.options.review === void 0) throw new Error(reason ?? "No authenticated Review bridge is attached");
		const review = this.options.review;
		return this.run(parent, async (_signal, snapshot) => {
			const value = artifactRecord(review.summary(snapshot.sessionId, row.seq));
			if (value === void 0) throw new Error("Review is no longer retained on this Host (disposed Session, cold history, or recorder absent)");
			if (!Array.isArray(value.files) || value.turn !== row.turn || !Number.isSafeInteger(value.total) || value.files.some((file) => !validChangedFile(file))) throw new Error("Invalid Review summary from Host");
			return { content: artifactJson(value) };
		});
	}
	async reviewDiff(id, index, parent) {
		const row = this.requireRow(id);
		if (row.kind !== "changes") throw new Error("This reference is not a Review announcement");
		const reason = this.reason("workspaceChanges/diff");
		if (reason !== void 0 || this.options.review === void 0) throw new Error(reason ?? "No authenticated Review bridge is attached");
		if (!Number.isSafeInteger(index) || index < 0) throw new Error("Invalid Review file index");
		const review = this.options.review;
		return this.run(parent, async (signal, snapshot) => {
			const summary = artifactRecord(review.summary(snapshot.sessionId, row.seq));
			if (!Array.isArray(summary?.files) || summary.turn !== row.turn || !validChangedFile(summary.files[index])) throw new Error("Review file is unavailable; refresh the summary");
			const value = artifactRecord(await review.diff(snapshot.sessionId, row.seq, index, signal));
			if (value === void 0) throw new Error("Review comparison is no longer retained on this Host");
			if (typeof value.path !== "string" || typeof value.display !== "string" || value.path !== artifactRecord(summary.files[index])?.path) throw new Error("Invalid Review comparison");
			if (value.kind === "binary" || value.kind === "oversized") return { content: `${value.display}: ${value.kind}; Host provides no text comparison.` };
			if (value.kind !== "text" || typeof value.before !== "boolean" || typeof value.after !== "boolean" || typeof value.coarse !== "boolean" || !Array.isArray(value.hunks) || value.hunks.some((hunk) => !validHunk(hunk))) throw new Error("Invalid Review comparison");
			return { content: `${value.display}${value.coarse ? " · coarse comparison" : ""}\n\n${value.hunks.map((hunk) => {
				const item = artifactRecord(hunk);
				return `@@ -${item.oldStart},${item.oldLines} +${item.newStart},${item.newLines} @@\n${item.lines.join("\n")}`;
			}).join("\n\n")}` };
		});
	}
	requireRow(id) {
		const row = sessionArtifacts(this.snapshot().events).find((row$1) => row$1.id === id);
		if (row === void 0) throw new Error("Reference is no longer in the current Session window; refresh");
		return row;
	}
	async run(parent, work) {
		parent.throwIfAborted();
		const snapshot = this.snapshot();
		const controller = new AbortController();
		this.pending.add(controller);
		const lifetime = linkedManagementSignal(AbortSignal.any([parent, controller.signal]), this.options.timeoutMs ?? 1e4);
		try {
			const value = await observeManagement(work(lifetime.signal, snapshot), lifetime.signal);
			if (this.disposed || !this.options.source.getSnapshot().ready || this.scopeOf(this.options.source.getSnapshot()) !== this.scopeOf(snapshot)) throw new Error("Session/Host changed; stale artifact read discarded");
			return value;
		} finally {
			lifetime.dispose();
			this.pending.delete(controller);
		}
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.stopObserving();
		for (const observer of this.fileObservers) observer.dispose();
		this.fileObservers.clear();
		for (const controller of this.pending) controller.abort();
		this.pending.clear();
	}
};
function artifactHostPath(path, hostWorkspacePath) {
	if (/[\u0000-\u001f\u007f]/u.test(path)) throw new Error("File reference contains control characters");
	if (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path)) return path;
	if (hostWorkspacePath === void 0 || !/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(hostWorkspacePath)) throw new Error("Relative file reference requires the authoritative Host workspace path");
	return (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(hostWorkspacePath) ? win32 : posix).resolve(hostWorkspacePath, path);
}
function safeArtifactUrl(value) {
	if (/[\u0000-\u0020\u007f]/u.test(value)) throw new Error("Presenter URL contains whitespace or control characters");
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error("Presenter URL is invalid");
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "") throw new Error("Presenter URL requires HTTP(S) without embedded credentials");
	return parsed.href;
}
function validChangedFile(value) {
	const file = artifactRecord(value);
	return file !== void 0 && typeof file.path === "string" && typeof file.display === "string" && Number.isSafeInteger(file.added) && Number.isSafeInteger(file.deleted) && file.added >= 0 && file.deleted >= 0;
}
function validHunk(value) {
	const hunk = artifactRecord(value);
	return hunk !== void 0 && [
		"oldStart",
		"oldLines",
		"newStart",
		"newLines"
	].every((key) => Number.isSafeInteger(hunk[key]) && hunk[key] >= 0) && Array.isArray(hunk.lines) && hunk.lines.every((line) => typeof line === "string" && /^[ +\-]/.test(line));
}
/** Integration owns controller lifetime, so display selection survives closing/reopening an overlay. */
async function artifactViewCommand(controller, kind, overlays) {
	const choices = () => [
		...kind === "plan" ? [{
			id: "__plan_state__",
			label: ui("持久计划状态与待办", "Persisted Plan state and todos")
		}] : [],
		{
			id: "__refresh__",
			label: ui("刷新会话引用", "Refresh Session references")
		},
		...controller.rows(kind).map((row) => ({
			id: row.id,
			label: row.title,
			description: `seq ${row.seq}${row.turn === void 0 ? "" : ` · turn ${row.turn}`}`
		}))
	];
	for (;;) {
		const scope = controller.scopeId();
		const ensureScope = () => {
			if (controller.scopeId() !== scope) throw new Error("Session/Host changed while the artifact menu was open; reopen the viewer");
		};
		const selectedId = controller.selection(kind);
		const selected = await overlays.select({
			title: kind,
			detail: controller.stateDetail(),
			choices: choices(),
			...selectedId === void 0 ? {} : { initialChoiceId: selectedId },
			refreshChoices: async () => ({ choices: choices() })
		});
		if (selected === void 0) return;
		ensureScope();
		if (selected.id === "__refresh__") continue;
		if (selected.id === "__plan_state__") {
			await overlays.detail({
				title: selected.label,
				content: controller.plan()
			});
			continue;
		}
		controller.select(kind, selected.id);
		const row = controller.rows(kind).find((row$1) => row$1.id === selected.id);
		if (row === void 0) throw new Error("Reference changed; refresh the viewer");
		if (row.kind === "link") {
			const action$1 = await overlays.select({
				title: row.title,
				choices: [
					{
						id: "record",
						label: "View presenter URL"
					},
					{
						id: "copy",
						label: "Copy URL",
						...disabledReason(controller.linkReason("copy", row.id))
					},
					{
						id: "open",
						label: "Open URL",
						...disabledReason(controller.linkReason("open", row.id))
					}
				]
			});
			if (action$1 === void 0 || action$1.disabledReason !== void 0) continue;
			ensureScope();
			if (action$1.id === "record") await overlays.detail({
				title: row.title,
				content: row.detail
			});
			else if (action$1.id === "copy" || action$1.id === "open") {
				const linkAction = action$1.id;
				await overlays.progress({
					title: action$1.label,
					work: (_report, signal) => controller.link(linkAction, row.id, signal)
				});
			}
			continue;
		}
		if (row.kind !== "delivery" && row.kind !== "changes" && !(row.kind === "attachment" && row.path !== void 0)) {
			await overlays.detail({
				title: row.title,
				content: row.detail,
				footer: row.kind === "attachment" ? "Opaque Host attachment reference; this view does not download bytes." : "Recorded content; approvals are handled by the existing question/approval surface."
			});
			continue;
		}
		const actions = [{
			id: "record",
			label: ui("查看持久记录", "View durable record")
		}, {
			id: "read",
			label: row.kind === "changes" ? ui("读取官方 Review", "Read official Review") : ui("读取 Host 文件", "Read Host file"),
			...disabledReason(controller.reason(row.kind === "changes" ? "workspaceChanges/summary" : "workspaceFiles/read") ?? (row.kind !== "changes" && controller.canObserveFile() ? controller.reason("workspaceFiles/stat") : void 0))
		}];
		const action = await overlays.select({
			title: row.title,
			choices: actions
		});
		if (action === void 0 || action.disabledReason !== void 0) continue;
		ensureScope();
		if (action.id === "record") {
			await overlays.detail({
				title: row.title,
				content: row.detail
			});
			continue;
		}
		if (action.id !== "read") continue;
		if (row.kind === "changes") {
			const page = await overlays.progress({
				title: row.title,
				work: (_report, signal) => controller.reviewSummary(row.id, signal)
			});
			if (page === void 0) continue;
			await overlays.detail({
				title: row.title,
				content: page.content
			});
			const summary = artifactRecord(JSON.parse(page.content));
			const files = Array.isArray(summary?.files) ? summary.files : [];
			const file = await overlays.select({
				title: "Review comparisons",
				choices: files.map((value, index) => ({
					id: String(index),
					label: String(artifactRecord(value)?.display ?? index),
					...disabledReason(controller.reason("workspaceChanges/diff"))
				}))
			});
			if (file === void 0 || file.disabledReason !== void 0) continue;
			ensureScope();
			const diff = await overlays.progress({
				title: file.label,
				work: (_report, signal) => controller.reviewDiff(row.id, Number(file.id), signal)
			});
			if (diff !== void 0) await overlays.detail({
				title: file.label,
				content: diff.content
			});
		} else {
			if (controller.canObserveFile() && fileNavigation(overlays)) {
				await workspaceFileView(controller.observeFile(row.id, overlays.signal), row.title, overlays);
				continue;
			}
			if (controller.canObserveFile() && navigatedFiles(overlays)) {
				await overlays.navigate(async (navigation) => {
					await workspaceFileView(controller.observeFile(row.id, navigation.signal), row.title, navigation);
				});
				continue;
			}
			let offset = 1;
			let version;
			for (;;) {
				const page = await overlays.progress({
					title: row.title,
					work: (_report, signal) => controller.readFile(row.id, signal, offset, version)
				});
				if (page === void 0) break;
				await overlays.detail({
					title: `${row.title} · line ${offset}`,
					content: page.content
				});
				if (page.nextOffset === void 0) break;
				const next = await overlays.select({
					title: row.title,
					choices: [{
						id: "next",
						label: "Next page"
					}, {
						id: "refresh",
						label: "Refresh from start"
					}]
				});
				if (next === void 0) break;
				ensureScope();
				offset = next.id === "refresh" ? 1 : page.nextOffset;
				version = next.id === "refresh" ? void 0 : page.version;
			}
		}
	}
}
function navigatedFiles(overlays) {
	return "navigate" in overlays && typeof overlays.navigate === "function";
}
function fileNavigation(overlays) {
	return "selectPage" in overlays && typeof overlays.selectPage === "function" && "updateChoices" in overlays && typeof overlays.updateChoices === "function" && "signal" in overlays && overlays.signal instanceof AbortSignal;
}
function disabledReason(reason) {
	return reason === void 0 ? {} : { disabledReason: reason };
}

const WORK_PROCESS_MODES = [
	"compact",
	"standard",
	"detailed",
	"verbose"
];
/** SeekTTY field. Absence preserves the pre-existing terminal preferences; it is not a fifth official mode. */
const WORK_PROCESS_DISPLAY_FIELD = "workProcessDisplay";
const policies = Object.freeze({
	compact: Object.freeze({
		mode: "compact",
		foldCompletedTurns: true,
		stepGrouping: "collapsed",
		liveProcessDetail: false,
		settledReasoningPreview: false
	}),
	standard: Object.freeze({
		mode: "standard",
		foldCompletedTurns: true,
		stepGrouping: "collapsed",
		liveProcessDetail: true,
		settledReasoningPreview: true
	}),
	detailed: Object.freeze({
		mode: "detailed",
		foldCompletedTurns: true,
		stepGrouping: "history",
		liveProcessDetail: true,
		settledReasoningPreview: true
	}),
	verbose: Object.freeze({
		mode: "verbose",
		foldCompletedTurns: false,
		stepGrouping: "none",
		liveProcessDetail: false,
		settledReasoningPreview: true
	})
});
function workProcessPolicy(mode) {
	return policies[mode];
}
function isWorkProcessMode(value) {
	return typeof value === "string" && WORK_PROCESS_MODES.some((mode) => mode === value);
}
/** Official old normal/expanded aliases; adopting them never requests a migration write. */
function normalizeWorkProcessMode(value) {
	if (value === "normal" || value === "expanded") return "detailed";
	return isWorkProcessMode(value) ? value : void 0;
}
/** Explicit keyboard action only. Unconfigured forward/backward starts at Compact/Verbose. */
function cycleWorkProcessMode(value, direction = 1) {
	if (direction !== 1 && direction !== -1) throw new Error("Display cycle direction must be +1 or -1");
	const mode = normalizeWorkProcessMode(value);
	if (mode === void 0) return direction === 1 ? WORK_PROCESS_MODES[0] : WORK_PROCESS_MODES[3];
	return WORK_PROCESS_MODES[(WORK_PROCESS_MODES.indexOf(mode) + direction + WORK_PROCESS_MODES.length) % WORK_PROCESS_MODES.length];
}
function validSpec(turn) {
	const spec = turn.spec;
	return spec !== void 0 && spec.turn === turn.turn && Number.isSafeInteger(turn.turn) && turn.turn > 0 && Number.isSafeInteger(spec.processStartSeq) && spec.processStartSeq >= 0 && (spec.answerAnchorSeq === null || Number.isSafeInteger(spec.answerAnchorSeq) && spec.answerAnchorSeq >= spec.processStartSeq) && (spec.answerStep === null || Number.isSafeInteger(spec.answerStep) && spec.answerStep >= 0);
}
function workProcessTurnPresentation(policy, turn, disclosure) {
	if (policy === void 0 || !policy.foldCompletedTurns) return {
		foldable: false,
		open: true
	};
	if (turn === void 0 || turn.status === "unknown" || !validSpec(turn) || turn.hasInterleavedInput === void 0 || turn.status === "closed" && !turn.endReason) return {
		foldable: false,
		open: true,
		unavailableReason: "Native Turn/process evidence is incomplete; retain visible content"
	};
	if (turn.status === "open" || turn.hasInterleavedInput || turn.endReason === "aborted" || turn.endReason === "error") return {
		foldable: false,
		open: true
	};
	return {
		foldable: true,
		open: disclosure?.turn === turn.turn && disclosure.answerStep === (turn.spec.answerStep ?? 0)
	};
}
/** Consume already projected group membership unchanged. Unknown Turn/group evidence cannot hide members. */
function workProcessGroupPresentation(policy, turn, groupClosed, groupOpen = false, disclosure) {
	const outer = workProcessTurnPresentation(policy, turn, disclosure);
	const known = turn !== void 0 && turn.status !== "unknown" && groupClosed !== void 0 && outer.unavailableReason === void 0;
	const grouped$1 = known && policy !== void 0 && (policy.stepGrouping === "collapsed" || policy.stepGrouping === "history" && turn.status === "closed");
	const outerHidden = known && outer.foldable && !outer.open;
	return {
		grouped: grouped$1,
		outerHidden,
		headerVisible: grouped$1 && !outerHidden,
		bodyVisible: !outerHidden && (!grouped$1 || groupOpen),
		showRunningDetail: grouped$1 && groupClosed === false && policy?.liveProcessDetail === true,
		showSettledReasoningPreview: policy?.settledReasoningPreview === true,
		openingEdge: groupClosed === false ? "bottom" : "top"
	};
}
const independentKinds = new Set([
	"system-prompt",
	"user",
	"steering",
	"turn-trigger",
	"turn-process",
	"turn-error",
	"turn-max-tokens",
	"turn-tail"
]);
/** Whole-Turn visibility over the source node/part. Final answer and independent input/status never disappear. */
function workProcessNodeHidden(policy, turn, node, disclosure) {
	const outer = workProcessTurnPresentation(policy, turn, disclosure);
	if (!outer.foldable || outer.open || turn?.spec === void 0 || node.knownProcessMember !== true || independentKinds.has(node.kind) || !Number.isSafeInteger(node.anchorSeq)) return false;
	const spec = turn.spec;
	const finalStep = node.kind === "assistant-step" && node.step === spec.answerStep;
	if (finalStep && node.groupPart !== "reasoning") return false;
	return node.anchorSeq >= spec.processStartSeq && (spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq || finalStep && node.groupPart === "reasoning");
}
/** Pure CAS request for the existing settings.mutate API. No default/normalization writes, private storage, or retry. */
function workProcessSettingsMutation(document, next, fieldAvailable) {
	if (fieldAvailable !== true) throw new Error(fieldAvailable === void 0 ? "Work-process setting descriptor is unknown" : "Work-process setting is not registered");
	if (document.namespace !== TUI_BEHAVIOR_SETTINGS_NAMESPACE || !Number.isSafeInteger(document.revision) || document.revision < 0) throw new Error("Authoritative behavior Settings namespace/revision is required");
	if (next !== "terminal-default" && !isWorkProcessMode(next)) throw new Error("Only an explicit current display mode can be saved");
	return {
		namespace: document.namespace,
		expectedRevision: document.revision,
		ops: next === "terminal-default" ? [{
			op: "unset",
			path: [WORK_PROCESS_DISPLAY_FIELD]
		}] : [{
			op: "set",
			path: [WORK_PROCESS_DISPLAY_FIELD],
			value: next
		}]
	};
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
function syntaxLanguageForPath(path, explicit) {
	const requested = languageOf(explicit);
	if (requested !== void 0) return requested;
	const filename = path.toLowerCase().split(/[\\/]/u).at(-1) ?? "";
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
		const boundary$1 = code.lastIndexOf("\n") + 1;
		if (boundary$1 > prefix.length) {
			const completed = tokenize(code.slice(prefix.length, boundary$1), state);
			const nextState = this.highlighter.getLastGrammarState(completed);
			if (nextState === void 0) return paint$1(tokenize(code));
			lines = [...lines, ...paint$1(completed).slice(0, -1)];
			prefix = code.slice(0, boundary$1);
			state = nextState;
		}
		this.prefixes.delete(context);
		this.prefixes.set(context, {
			prefix,
			lines,
			state
		});
		while (this.prefixes.size > 4) this.prefixes.delete(this.prefixes.keys().next().value);
		return [...lines, ...paint$1(tokenize(code.slice(boundary$1), state))];
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
* Keep a bounded head and tail, with an exact omitted-line marker between them.
* Tail text (including Host retrieval notices) stays ordinary, untrusted text:
* this function neither recognizes spill references nor grants recovery actions.
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
	const cap = Math.max(1, Math.floor(limit));
	const { lines, eofNewline } = toolOutputLines(text);
	if (lines.length <= cap) return {
		text,
		omitted: 0
	};
	const omitted = lines.length - cap;
	const tailCount = Math.max(1, Math.floor(cap / 2));
	const headCount = cap - tailCount;
	const marker = ui(`… 省略中间 ${String(omitted)} 行 …`, `… ${String(omitted)} middle line(s) omitted …`);
	return {
		text: [
			...lines.slice(0, headCount),
			marker,
			...lines.slice(-tailCount)
		].join("\n") + (eofNewline ? "\n" : ""),
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
function formatEdit(edit) {
	const prefix = edit.kind === "eq" ? " " : edit.kind === "del" ? "-" : "+";
	if (edit.kind !== "eq" && edit.noNewline) return [`${prefix}${edit.line}`, NO_NEWLINE_MARK];
	return [`${prefix}${edit.line}`];
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
	const changeIndexes = edits.flatMap((edit, index) => edit.kind === "eq" ? [] : [index]);
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
		const oldRows = slice.filter((edit) => edit.kind !== "add");
		const newRows = slice.filter((edit) => edit.kind !== "del");
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
	/** Append one height in amortized O(log n), including capacity growth. */
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
		const capacity = this.tree.length - 1;
		for (let ancestor = capacity * 2; ancestor < grown.length; ancestor *= 2) {
			grown[ancestor] = this.tree[capacity] ?? 0;
			this.touches += 1;
		}
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
function scrollbarModel(options) {
	const rows = Math.max(1, Math.floor(options.rows));
	const loadedTotal = Math.max(0, options.loadedTotal);
	const overflow = loadedTotal > rows || options.hasMore || options.hasNewer;
	const span = Math.max(loadedTotal, rows);
	const startOffset = clamp(options.startOffset, 0, Math.max(0, span - rows));
	const thumbSize = overflow ? clamp(Math.round(rows / span * rows), 1, rows) : rows;
	const maxTop = Math.max(0, rows - thumbSize);
	const travel = Math.max(1, span - rows);
	const thumbTop = overflow && maxTop > 0 ? clamp(Math.round(startOffset / travel * maxTop), 0, maxTop) : 0;
	return {
		rows,
		contentWidth: options.contentWidth,
		startOffset,
		viewportRows: rows,
		loadedTotal,
		estimated: options.estimated,
		hasMore: options.hasMore,
		hasNewer: options.hasNewer,
		loadingOlder: options.loadingOlder,
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

function field(value, key) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const property = Object.getOwnPropertyDescriptor(value, key);
	return property !== void 0 && "value" in property ? property.value : void 0;
}
const DISPLAY_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;
const SGR = /\u001b\[[0-9;:]*m/gu;
const segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
/** Only consume views returned by the scoped registered Host presenter, never raw args. */
function fetchTitleUrl(title, presentations, safeUrl) {
	if (title === "" || DISPLAY_CONTROL.test(title)) return void 0;
	for (const presentation of presentations) {
		const view = field(presentation, "view");
		const source = field(presentation, "for");
		if (field(view, "kind") !== "fetch") continue;
		const candidate = source === "call" && field(view, "card") === "generic" && field(view, "title") === title ? field(view, "rawInput") : source === "result" && field(view, "card") === "web" && (field(view, "title") === void 0 || field(view, "title") === title) ? field(view, "url") : void 0;
		if (candidate !== title || typeof candidate !== "string") continue;
		try {
			return {
				label: title,
				href: safeUrl(candidate),
				source
			};
		} catch {}
	}
}
/** Extract exactly an already-rendered cell span; reject cuts through a wide grapheme. */
function cellText(line, start, width) {
	let col = 0, text = "";
	for (const { segment } of segmenter.segment(line)) {
		const cells = visibleWidth(segment);
		const end = col + cells;
		if (col < start + width && end > start) {
			if (cells <= 0 || col < start || end > start + width) return void 0;
			text += segment;
		}
		col = end;
	}
	return visibleWidth(text) === width ? text : void 0;
}
function boundary(text, offset) {
	return offset === 0 || [...segmenter.segment(text)].some((part$1) => part$1.index + part$1.segment.length === offset);
}
function integer(value) {
	return Number.isSafeInteger(value) && value >= 0;
}
/** Split only the visible title glyphs from the existing row-wide toggle hit.
* titleCells is measured by the renderer in the actual renderedLine, including
* its clipping ellipsis but excluding indentation, status and trailing padding.
* For a wrapped header, provide both source offsets from the renderer's title
* projection; each row must exactly match that slice, never a text-search guess.
*/
function fetchTitleLayout(options) {
	const { rect, titleCells } = options;
	if (![
		rect.col,
		rect.row,
		rect.width,
		options.generation
	].every(integer) || rect.height !== 1 || rect.width === 0) return { toggles: [] };
	const fallback = { toggles: [rect] };
	if (options.expanded || options.targetKey === "" || options.scopeId === "" || !integer(titleCells.start) || !integer(titleCells.width) || titleCells.width === 0 || titleCells.start + titleCells.width > rect.width) return fallback;
	const url = fetchTitleUrl(options.title, options.presentations, options.safeUrl);
	const line = options.renderedLine.replace(SGR, "");
	if (url === void 0 || DISPLAY_CONTROL.test(line)) return fallback;
	const visible = cellText(line, titleCells.start, titleCells.width);
	if (visible === void 0) return fallback;
	let label = visible;
	if (titleCells.sourceStart !== void 0 || titleCells.sourceEnd !== void 0) {
		const { sourceStart, sourceEnd } = titleCells;
		if (sourceStart === void 0 || sourceEnd === void 0 || !integer(sourceStart) || !integer(sourceEnd) || sourceStart >= sourceEnd || sourceEnd > url.label.length || !boundary(url.label, sourceStart) || !boundary(url.label, sourceEnd) || visible !== url.label.slice(sourceStart, sourceEnd)) return fallback;
	} else if (visible !== url.label) {
		if (!visible.endsWith("…")) return fallback;
		label = visible.slice(0, -1);
		const authority = /^https?:\/\/[^/?#]+/iu.exec(url.label)?.[0];
		if (label === "" || !url.label.startsWith(label) || !boundary(url.label, label.length) || authority === void 0 || !label.startsWith(authority)) return fallback;
	}
	const width = visibleWidth(label);
	if (width <= 0) return fallback;
	const link = {
		rect: {
			col: rect.col + titleCells.start,
			row: rect.row,
			width,
			height: 1
		},
		target: {
			...url,
			targetKey: options.targetKey,
			scopeId: options.scopeId,
			generation: options.generation
		}
	};
	const end = titleCells.start + width;
	return {
		link,
		toggles: [...titleCells.start === 0 ? [] : [{
			...rect,
			width: titleCells.start
		}], ...end === rect.width ? [] : [{
			...rect,
			col: rect.col + end,
			width: rect.width - end
		}]]
	};
}
function sameTarget(left, right) {
	return right !== void 0 && left.targetKey === right.targetKey && left.scopeId === right.scopeId && left.generation === right.generation && left.label === right.label && left.href === right.href && left.source === right.source;
}
function fetchTitleActionReason(target, action, ports, current) {
	if (!sameTarget(target, current)) return "Fetch title is no longer in the current Session/frame; refresh";
	try {
		if (ports.safeUrl(target.label) !== target.href) return "Fetch title URL changed; refresh";
	} catch (error) {
		return error instanceof Error ? error.message : "Fetch title URL is invalid";
	}
	const capability = ports.capability(action);
	if (capability?.available !== true) return capability?.reason ?? `Safe URL ${action} capability is not confirmed`;
	if (ports[action] === void 0) return `No safe URL ${action} action is attached`;
}
/** Observe a permitted UI action, with current-frame checks and a bounded wait.
* Once dispatched, an opener ignoring abort may still act; never retry it or
* claim an observation timeout revoked that effect.
*/
async function runFetchTitleAction(target, action, ports, current, signal) {
	await new RemoteOperationScope().run(async (inner) => {
		const reason = fetchTitleActionReason(target, action, ports, current());
		if (reason !== void 0) throw new Error(reason);
		inner.throwIfAborted();
		if (action === "copy") await ports.copy(target.href);
		else await ports.open(target.href, inner);
		inner.throwIfAborted();
		if (!sameTarget(target, current())) throw new Error("Fetch title changed after UI action dispatch; result not confirmed");
	}, ports.timeoutMs ?? 1e4, signal);
}
/** Intent only: integration owns focus, press/release pairing and context menus. */
function fetchTitleGestureAction(part$1, gesture) {
	if (gesture.kind === "key") {
		if (matchesKey(gesture.data, Key.enter) || gesture.data === "\n") return part$1 === "url" ? "open" : "toggle";
		if (part$1 === "url" && gesture.data === "o") return "open";
		if (part$1 === "url" && gesture.data === "c") return "copy";
		return;
	}
	if (gesture.dragged || gesture.modifiers.shift || gesture.modifiers.ctrl || gesture.modifiers.alt) return void 0;
	if (gesture.button === "right") return "context";
	if (gesture.button === "left") return part$1 === "url" ? "open" : "toggle";
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
function mapCopyableLine(line, startOffset, contentWidth, options = {}) {
	const skipLeading = options.skipLeading ?? 0;
	const skipTrailing = options.skipTrailing ?? 0;
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
			const escape = line.slice(index, end);
			result += escape;
			if (open && escape.startsWith("\x1B[") && escape.endsWith("m")) result += "\x1B[7m";
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
				worker.on("message", (message$1) => {
					if (this.disposed) return;
					if ("error" in message$1) this.fail(new Error(message$1.error));
					else {
						this.ready = message$1;
						if (message$1.done) this.closeWorker();
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
		if (worker) try {
			worker.terminate().then(release, release);
		} catch {
			release();
		} finally {
			try {
				worker.unref();
			} catch {}
		}
		else queueMicrotask(release);
	}
};

const processKinds = new Set([
	"assistant-step",
	"tool-call",
	"manual-compaction",
	"context",
	"request-prompt"
]);
function failed(node) {
	const data = node.data;
	if (typeof data !== "object" || data === null) return false;
	if (Reflect.get(data, "status") === "interrupted") return true;
	const root = Reflect.get(data, "root");
	return root !== null && typeof root === "object" && Reflect.get(root, "isError") === true;
}
function part(node, groupPart) {
	if (groupPart === void 0 || node.kind !== "assistant-step" || typeof node.data !== "object" || node.data === null) return node;
	const blocks = Reflect.get(node.data, "blocks");
	if (!Array.isArray(blocks)) return node;
	return {
		...node,
		...groupPart === "reasoning" ? { key: `${node.key}/process/reasoning` } : {},
		data: {
			...node.data,
			blocks: blocks.filter((block) => typeof block === "object" && block !== null && (groupPart === "reasoning" ? Reflect.get(block, "kind") === "reasoning" : Reflect.get(block, "kind") !== "reasoning"))
		}
	};
}
function workProcessLayout(nodes, projected$1, policy, turns, groups, searchReveal = false) {
	if (projected$1 === void 0 || policy === void 0) return {
		entries: nodes.filter((node) => node.kind !== "turn-process").map((node) => ({ node })),
		controls: []
	};
	const byKey = new Map(nodes.map((node) => [node.key, node]));
	const entries = [];
	const controls = [];
	const consumed = /* @__PURE__ */ new Set();
	const control = (value) => {
		controls.push(value);
		entries.push({ control: value });
	};
	const emit = (key, groupPart) => {
		const node = byKey.get(key);
		if (node === void 0) return;
		consumed.add(key);
		const location = node.location;
		const turn = location.kind === "turn" || location.kind === "step" ? projected$1.evidence.get(location.turn.turn) : void 0;
		const disclosure = turn === void 0 ? void 0 : turns.get(turn.turn);
		if (node.kind === "turn-process") {
			const state = workProcessTurnPresentation(policy, turn, disclosure);
			if (!state.foldable || turn === void 0 || turn.hasExternalProcess !== true && turn.inlineReasoning !== true) return;
			const data = node.data;
			control({
				id: `turn:${turn.turn}`,
				kind: "turn",
				open: searchReveal || state.open,
				label: `Turn ${turn.turn} process · ${String(data.toolCallCount ?? 0)} tools · ${String(data.messageCount ?? 0)} messages`
			});
			return;
		}
		const step = typeof node.data === "object" && node.data !== null ? Reflect.get(node.data, "step") : void 0;
		if (!searchReveal && !failed(node) && workProcessNodeHidden(policy, turn, {
			kind: node.kind,
			anchorSeq: node.anchorSeq,
			...typeof step === "number" ? { step } : {},
			...groupPart === void 0 ? {} : { groupPart },
			knownProcessMember: processKinds.has(node.kind)
		}, disclosure)) return;
		entries.push({ node: part(node, groupPart) });
	};
	for (const entry of projected$1.entries) {
		if (entry.kind === "node") {
			emit(entry.key, entry.groupPart);
			continue;
		}
		const group = projected$1.groups.get(entry.key);
		if (group === void 0) continue;
		const turn = projected$1.evidence.get(group.data.turn);
		const mandatory = group.members.some((member) => {
			const node = byKey.get(member.key);
			return node !== void 0 && (failed(node) || !processKinds.has(node.kind));
		});
		const state = workProcessGroupPresentation(policy, turn, group.data.closed, groups.has(group.key) || mandatory || searchReveal, turns.get(group.data.turn));
		if (state.headerVisible && !searchReveal) {
			const counts = group.data.summary.counts.map((row) => `${row.kind} ${row.count}`).join(" · ");
			const detail = state.showRunningDetail ? group.data.summary.runningDetail : "";
			const reasoning$1 = state.showSettledReasoningPreview && group.data.closed ? group.members.flatMap((member) => {
				const data = byKey.get(member.key)?.data;
				const blocks = data !== null && typeof data === "object" ? Reflect.get(data, "blocks") : void 0;
				if (!Array.isArray(blocks)) return [];
				return blocks.filter((block) => block?.kind === "reasoning" && typeof block.text === "string").map((block) => block.text);
			}).find((text) => text.trim() !== "")?.split(/\r?\n[\t ]*\r?\n/)[0]?.replace(/\s+/gu, " ").trim() : void 0;
			const preview = reasoning$1 === void 0 ? "" : Array.from(new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(reasoning$1), (part$1) => part$1.segment).slice(0, 160).join("");
			control({
				id: `group:${group.key}`,
				kind: "group",
				open: state.bodyVisible,
				label: `${group.data.closed ? "Process" : group.data.summary.preparing ? "Preparing" : "Working"}${counts ? ` · ${counts}` : ""}${detail ? ` · ${detail}` : ""}${preview ? ` · ${preview}` : ""}`
			});
		}
		for (const member of group.members) {
			consumed.add(member.key);
			const node = byKey.get(member.key);
			if (node !== void 0 && (state.bodyVisible || searchReveal || failed(node) || !processKinds.has(node.kind))) emit(member.key, member.groupPart);
		}
	}
	for (const node of nodes) if (!consumed.has(node.key)) emit(node.key);
	return {
		entries,
		controls
	};
}

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
function wrappedSourceProjections(source, visualLines, displayStartCell, finalJoiner, sourceRange) {
	const semanticSource = stripCopyDecorations(source);
	const projections = [];
	let cursor = 0;
	for (const visualLine of visualLines) {
		const visibleText = stripCopyDecorations(visualLine).trimEnd();
		const found = visibleText === "" ? cursor : semanticSource.indexOf(visibleText, cursor);
		const start = found >= cursor ? found : cursor;
		sourceRange?.(start, start + visibleText.length, projections.length);
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
			for (const [partIndex, part$1] of parts.entries()) {
				const number = numbers?.[index];
				const gutter = numberWidth === 0 ? "" : color.muted(partIndex === 0 && number !== void 0 ? `${String(number).padStart(numberWidth - 1)} ` : " ".repeat(numberWidth));
				const padded = `${part$1}${" ".repeat(Math.max(0, codeWidth - visibleWidth(part$1)))}`;
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
function contentBlockText(block) {
	if (typeof block !== "object" || block === null) return String(block);
	const value = block;
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
	return content.flatMap((block) => {
		if (typeof block !== "object" || block === null) return [{
			format: "plain",
			text: String(block)
		}];
		const value = block;
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
			text: contentBlockText(block)
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
function assistantBlockText(block, preferences) {
	switch (block.kind) {
		case "text": return block.text;
		case "reasoning": return preferences.reasoning ? color.muted(`${ui("思考", "Reasoning")}\n${block.text}`) : "";
		case "image": return color.muted(ui("[图片附件]", "[image attachment]"));
		case "tool-call":
			if (preferences.tools === "hidden") return "";
			return color.accent(`◆ ${block.name}${preferences.tools === "expanded" ? `\n${prettyArgs(block.argsRaw)}` : ""}`);
		case "other": return color.muted(ui("模型扩展内容 · /trajectory 查看详情", "Extended model content · use /trajectory for details"));
	}
}
function assistantBlockRows(block, preferences, liveReasoning = false, reasoning$1) {
	switch (block.kind) {
		case "text": return block.text === "" ? [] : [{
			format: "markdown",
			text: block.text
		}];
		case "reasoning": {
			if (block.text === "") return [];
			if (reasoning$1 !== void 0 && !reasoning$1.expanded) return [];
			if (reasoning$1 === void 0 && !preferences.reasoning && !liveReasoning) return [];
			if (liveReasoning) return [{
				format: "plain",
				text: color.muted(block.text)
			}];
			const quoted = block.text.split("\n").map((line) => `> ${line}`).join("\n");
			return [{
				format: "markdown",
				text: reasoning$1 === void 0 ? `> **${ui("思考", "Reasoning")}**\n>\n${quoted}` : quoted
			}];
		}
		case "image": return [imageRow(block.attachment)];
		case "tool-call":
			if (preferences.tools === "hidden") return [];
			return [{
				format: "plain",
				text: color.accent(`◆ ${block.name}`)
			}, ...preferences.tools === "expanded" ? [{
				format: "code",
				text: prettyArgs(block.argsRaw),
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
		const { path, oldText, newText } = item;
		if (typeof path !== "string" || oldText !== null && typeof oldText !== "string" || typeof newText !== "string") return jsonText(value);
		paths.add(path);
		rows.push(`diff -- ${path}`);
		rows.push(oldText === null ? "--- /dev/null" : `--- a/${path}`);
		rows.push(`+++ b/${path}`);
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
	if ("kind" in node && autoReviewDenial(node) !== void 0) return `${node.call?.name ?? node.callId} · ${ui("Auto review · 实验性 · 已拒绝", "Auto review · Experimental · Denied")}`;
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
	return content.flatMap((block) => {
		if (typeof block !== "object" || block === null) return [{
			kind: "plain",
			text: String(block)
		}];
		const value = block;
		if ((value.type === "text" || value.type === "reasoning") && typeof value.text === "string") return value.text === "" ? [] : [{
			kind: "markdown",
			text: value.text
		}];
		return [{
			kind: "plain",
			text: contentBlockText(block)
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
	const denial = autoReviewDenial(node);
	if (denial !== void 0) {
		details.push({
			kind: "plain",
			text: ui("Auto review 拒绝了此调用；工具正文未执行。", "Auto review denied this call; the tool body was not executed.")
		});
		if (denial.reason !== void 0) details.push({
			kind: "plain",
			text: denial.reason
		});
	}
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
		const path = String(result.path);
		const language = syntaxLanguageForPath(path, typeof result.lang === "string" ? result.lang : void 0);
		const first = lines[0]?.number ?? Number(result.offset);
		const last = lines.at(-1)?.number ?? first;
		details.push({
			kind: "code",
			text: lines.map((line) => line.text).join("\n"),
			...language === void 0 ? {} : { language },
			caption: `${path} · ${String(first)}–${String(last)} / ${String(result.totalLines)}`,
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
	if (node.isError) {
		for (const detail of contentDetails(node.content)) if (detail.text !== "" && !details.some((existing) => existing.text.includes(detail.text))) details.push(detail);
	}
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
function callKey(block, fallback) {
	if ("callId" in block && typeof block.callId === "string" && block.callId !== "") return block.callId;
	return fallback;
}
function toolBlockRows(block, preferences, depth, cardKey) {
	const prefix = depth === 0 ? "◆ " : `${"  ".repeat(depth)}↳ `;
	const key = callKey(block, cardKey);
	const expanded = toolCardExpanded(preferences, key);
	const title = toolTitle(block);
	const titleStart = stripCopyDecorations(`${toolFocusMark(preferences, key)}${prefix}`).length;
	const presentations = [{
		for: "call",
		view: block.callView
	}, ..."kind" in block ? [{
		for: "result",
		view: block.resultView
	}] : []];
	const titleMetadata = depth === 0 && key !== void 0 ? { fetchTitle: {
		title,
		start: titleStart,
		presentations,
		expanded
	} } : {};
	if ("kind" in block) {
		const duration = block.callTime === null ? "" : ` · ${toolDurationText(Math.max(0, block.time - block.callTime))}`;
		const failed$1 = settledToolFailed(block);
		const details$1 = expanded ? viewDetails(block, preferences.diffContextLines) : [];
		return [
			{
				format: "plain",
				text: `${toolFocusMark(preferences, key)}${prefix}${color.accent(toolTitle(block))}${failed$1 ? ` · ${color.danger(ui("失败", "Failed"))}` : ""}${duration}`,
				...depth === 0 && key !== void 0 ? { toolKey: key } : {},
				...titleMetadata
			},
			...details$1.map((detail) => detailRow(foldDetail(detail, preferences.toolOutputLineLimit), depth)),
			...block.subCalls.flatMap((child) => toolBlockRows(child, preferences, depth + 1))
		];
	}
	const details = expanded ? runningViewDetails(block, preferences.diffContextLines) : [];
	return [
		{
			format: "plain",
			text: `${toolFocusMark(preferences, key)}${prefix}${color.accent(toolTitle(block))}`,
			pulse: "marker",
			liveDurationSince: block.time,
			...depth === 0 && key !== void 0 ? { toolKey: key } : {},
			...titleMetadata
		},
		...details.map((detail) => detailRow(foldDetail(detail, preferences.toolOutputLineLimit), depth)),
		...block.subCalls.flatMap((child) => toolBlockRows(child, preferences, depth + 1))
	];
}
function toolBlockText(block, preferences, depth) {
	return toolBlockRows(block, preferences, depth).map((row) => row.format === "image" ? imageLabel(row.attachment) : row.text).join("\n");
}
function nodeText(node, preferences) {
	switch (node.kind) {
		case "user": return `${color.brand(">")} ${contentText(node.content)}`;
		case "steering": return `${color.brand(">")} ${color.muted(ui("引导", "Steering"))} ${contentText(node.content)}`;
		case "context": return `${color.muted(`${node.provenance.role === "recall" ? ui("召回", "Recall") : ui("上下文", "Context")}${node.provenance.label === null ? "" : ` · ${node.provenance.label}`}${node.form === null ? ui(" · 未知格式", " · unknown format") : ` · ${node.form}`}`)}\n${contentText(node.content)}`;
		case "assistant": return `${node.blocks.map((block) => assistantBlockText(block, preferences)).filter(Boolean).join("\n")}${node.interrupted === true ? color.warning(ui("\n已停止", "\nStopped")) : ""}`;
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
	const performance = [...ttftMs === void 0 || ttftSteps === void 0 || ttftSteps === 0 ? [] : [ui(`首 token 平均 ${durationText(ttftMs / ttftSteps)}`, `Average first token ${durationText(ttftMs / ttftSteps)}`)], ...decodeMs === void 0 || decodeTokens === void 0 || decodeMs === 0 ? [] : [`${String(Math.round(decodeTokens / (decodeMs / 1e3) * 10) / 10)} tok/s`]];
	if (performance.length > 0) groups.push(performance.join(" · "));
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
	const hasReasoning = step.blocks.some((block) => block.kind === "reasoning" && block.text !== "");
	const thinking = !step.blocks.some((block) => block.kind === "text" && block.text !== "") && step.status === "running";
	const key = fallbackKey;
	const expanded = reasoningExpanded(preferences, key, thinking);
	const content = step.blocks.flatMap((block) => block.kind === "tool-call" ? [] : assistantBlockRows(block, preferences, thinking, {
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
			const rows = [...node.data.blocks.flatMap((block) => assistantBlockRows(block, preferences))];
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
	workProcessMode;
	processTurns = /* @__PURE__ */ new Map();
	processGroups = /* @__PURE__ */ new Set();
	currentProcessControls = [];
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
	fetchSignature = "";
	fetchGeneration = 0;
	fetchViewport = "";
	fetchTargets = /* @__PURE__ */ new Map();
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
			const block = this.nativeBlocks[index];
			if (!block.metadata.dynamic) this.nativeSkipped.set(block.key, this.nativeToken(block));
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
	nativeToken(block) {
		if (this.nativeProjection.has(block.key)) return block.sourceToken;
		return this.nativeSourceTokens.get(block.key) ?? block.sourceToken;
	}
	indexNativeCandidates() {
		if (!this.nativeTailEnabled) return;
		this.nativeBlocks = this.blocks.flatMap((block) => this.nativeProjection.get(block.key) ?? [block]);
		this.nativeCandidates.clear();
		this.nativeIndexes.clear();
		for (const [index, block] of this.nativeBlocks.entries()) {
			internals.nativeSnapshotBlocksChecked++;
			this.nativeIndexes.set(block.key, index);
			const token = this.nativeToken(block);
			const skipped = this.nativeSkipped.get(block.key);
			if (skipped !== void 0 && sameStructuralToken(skipped, token)) continue;
			if (!this.nativeHistory.isCommitted(block.key, token)) this.nativeCandidates.add(index);
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
						const block = index === void 0 ? void 0 : this.nativeBlocks[index];
						if (block && this.nativeHistory.isCommitted(block.key, this.nativeToken(block))) this.nativeCandidates.delete(index);
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
		const renderWhole = (index, block) => {
			const rendered = this.renderBlock(index, contentWidth, block);
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
			const block = this.nativeBlocks[index];
			let dynamic = block.metadata.dynamic && !this.nativeClosing;
			const pending = this.nativeHistory.pendingFor(block.key);
			const only = block.rows.length === 1 && block.rows[0]?.format === "markdown" ? block.rows[0] : void 0;
			const preparedRow = block.rows.length === 1 && [
				"markdown",
				"plain",
				"code"
			].includes(block.rows[0].format) ? block.rows[0] : void 0;
			const largeMixed = preparedRow === void 0 && block.rows.reduce((size, row) => size + ("text" in row ? row.text.length : 0), 0) > NATIVE_MARKDOWN_THRESHOLD;
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
			if (largeMixed || this.nativePreparations.get(block.key)?.receipt || source !== void 0 && source.length > NATIVE_MARKDOWN_THRESHOLD && (!fence || longLine || source.length - (fence.closeEnd ?? source.length) > 8192)) {
				if (this.nativeBatch || history.length || receipts.length) break;
				const revision = canvasStyleRevision();
				const tailRows = dynamic ? Math.max(1, Math.min(256, this.viewportRows())) : void 0;
				let state = this.nativePreparations.get(block.key);
				let preview = state?.preview;
				if (state?.receipt) dynamic = false;
				if (state && (state.job.width !== contentWidth || state.job.revision !== revision || state.job.tailRows !== tailRows || !sameStructuralToken(state.token, this.nativeToken(block)) && state.job.page() !== void 0)) {
					if (!state.receipt) {
						if (dynamic && state.job.width === contentWidth && state.job.revision === revision) preview = state.job.page()?.lines ?? state.preview;
						else preview = void 0;
						state.job.dispose();
						this.nativePreparations.delete(block.key);
						state = void 0;
					}
				}
				if (!state) {
					state = {
						job: new NativeMarkdownPreparation(source ?? "", contentWidth, revision, tailRows, this.requestRender, this.nativeMarkdownWorkerFactory, preparedRow, largeMixed ? block.rows : void 0, index === 0),
						token: this.nativeToken(block)
					};
					if (preview && dynamic) state.preview = preview;
					this.nativePreparations.set(block.key, state);
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
				const token$1 = this.nativeToken(block);
				if (!state.receipt) {
					if (this.nativeHistory.get(block.key) || this.nativeHistory.deliveredFor(block.key) || this.nativeSkipped.has(block.key)) history.push(color.muted(ui(`── 更新 · ${escapeTerminalText(block.key)} ──`, `── Update · ${escapeTerminalText(block.key)} ──`)));
					if (index > 0 && preparedRow?.gapBefore) history.push("");
					state.receipt = this.nativeHistory.reserve(block.key, token$1, 0, source?.length ?? 0, source, true);
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
							this.nativePreparations.delete(block.key);
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
			const token = this.nativeToken(block);
			const previous = pending ?? this.nativeHistory.get(block.key);
			const prefixMatches = previous?.source !== void 0 && source !== void 0 && source.startsWith(previous.source);
			const from = prefixMatches ? previous.to : 0;
			const correction = previous !== void 0 && !prefixMatches || this.nativeSkipped.has(block.key) || pending === void 0 && this.nativeHistory.deliveredFor(block.key) !== void 0;
			const text = only?.text.slice(from);
			const stable = block.key === "__partial__" && dynamic || text === void 0 ? 0 : !dynamic ? text.length : fence && from < (fence.closeEnd ?? Number.POSITIVE_INFINITY) ? Math.max(0, fence.stableEnd - from) : stableParagraphEnd(text);
			const stableTo = from + stable;
			let to = stableTo;
			if (fence && from < fence.bodyEnd) {
				let boundary$1 = Math.max(from, fence.bodyStart);
				for (let count = 0; count < 128 && boundary$1 < stableTo; count++) {
					const next = source.indexOf("\n", boundary$1);
					if (next < 0 || next >= stableTo) {
						boundary$1 = stableTo;
						break;
					}
					boundary$1 = next + 1;
				}
				to = Math.min(to, boundary$1);
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
					let prepared = this.nativeCodeStreams.get(block.key);
					if (!prepared || prepared.context !== context || prepared.offset > bodyFrom || correction && start === from) {
						prepared = {
							offset: fence.bodyStart,
							context,
							stream: createCodeStream(fence.language)
						};
						this.nativeCodeStreams.set(block.key, prepared);
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
				if (correction) history.push(...wrapTextWithAnsi(color.muted(ui(`── 更新 · ${escapeTerminalText(block.key)} ──`, `── Update · ${escapeTerminalText(block.key)} ──`)), width));
				if (source !== void 0) {
					if (from === 0 && index > 0 && only?.gapBefore) history.push("");
					history.push(...renderRange(from, to, true));
					if (dynamic && !fence) history.push("");
				} else history.push(...renderWhole(index, block));
				receipts.push(this.nativeHistory.reserve(block.key, token, from, to, source?.slice(0, to), !dynamic && to === stableTo));
				ends.push(history.length);
				if (source !== void 0 && to === stableTo && stableTo < source.length) tail.push(...renderRange(stableTo, source.length));
				if (dynamic || to < stableTo || history.length >= 256) canCommit = false;
				if (to < stableTo || history.length >= 256) historyBudgetReached = true;
			} else {
				canCommit = false;
				if (source !== void 0 && from > 0) {
					if (!fence || from >= fence.stableEnd) tail.push(...renderRange(from, source.length));
				} else tail.push(...renderWhole(index, block));
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
	applyPresentationDefaults(tools, reasoning$1, toolOutputLineLimit = DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit, diffContextLines = DEFAULT_TUI_BEHAVIOR.diffContextLines, workProcessMode) {
		const nextMode = normalizeWorkProcessMode(workProcessMode);
		if (nextMode !== this.workProcessMode && this.nativeTailEnabled) this.resetNativeHistory();
		this.workProcessMode = nextMode;
		this.toolVisibility = tools;
		this.reasoningVisible = reasoning$1;
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
			collapsedReasoning: [...this.collapsedReasoning],
			processTurns: [...this.processTurns.values()],
			processGroups: [...this.processGroups]
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
		this.processTurns.clear();
		this.processGroups.clear();
		for (const value of snapshot.processTurns ?? []) this.processTurns.set(value.turn, value);
		for (const key of snapshot.processGroups ?? []) this.processGroups.add(key);
		const keys = this.blocks.map((block) => block.key);
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
	controlHitRegions(origin, fetchPorts) {
		const inset = origin.width >= SCROLLBAR_MIN_WIDTH ? 2 : 0;
		const bar = this.showsScrollbar(origin.width) ? 1 : 0;
		const width = Math.max(1, origin.width - inset - bar);
		const signature = JSON.stringify([
			this.sessionId,
			this.viewportState?.start,
			width,
			origin,
			this.lastPointerControls.map((control) => [
				control.row,
				control.id,
				control.fetch === void 0 ? void 0 : [control.fetch.title, control.fetch.cells]
			])
		]);
		if (signature !== this.fetchSignature) {
			this.fetchSignature = signature;
			this.fetchGeneration++;
		}
		this.fetchViewport = JSON.stringify(this.viewportState?.start);
		this.fetchTargets.clear();
		return this.lastPointerControls.flatMap((control) => {
			const base = {
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
					command: control.kind === "tool" ? "toggle" : control.kind === "reasoning" ? "toggle-reasoning" : control.kind === "process" ? "toggle-process" : "example",
					targetKey: control.id
				}
			};
			if (control.fetch === void 0) return [base];
			const layout = fetchTitleLayout({
				title: control.fetch.title.title,
				presentations: control.fetch.title.presentations,
				safeUrl: safeArtifactUrl,
				renderedLine: control.fetch.renderedLine,
				titleCells: control.fetch.cells,
				rect: base.rect,
				expanded: control.fetch.title.expanded,
				targetKey: control.id,
				scopeId: this.sessionId ?? "",
				generation: this.fetchGeneration
			});
			if (layout.link === void 0) return [base];
			const target = layout.link.target;
			this.fetchTargets.set(control.id, target);
			const enabled = fetchPorts !== void 0 && fetchTitleActionReason(target, "open", fetchPorts, target) === void 0;
			return [...layout.toggles.map((rect, index) => ({
				...base,
				id: `${base.id}:toggle:${control.fetch.cells.sourceStart}:${index}`,
				rect
			})), {
				...base,
				id: `transcript:fetch:${control.id}:${control.fetch.cells.sourceStart}`,
				rect: layout.link.rect,
				role: "link",
				enabled: true,
				activation: enabled ? "direct" : "none",
				action: {
					kind: "transcript",
					command: "fetch-title",
					targetKey: control.id
				}
			}];
		});
	}
	/** Current resident presenter target; no captured href survives a changed viewport. */
	fetchTitleTarget(key) {
		if (this.nativeMode && this.toolFocus && this.toolKeys()[this.toolCursor] === key) {
			const title = this.blocks.flatMap((block) => block.rows).find((row) => row.toolKey === key)?.fetchTitle;
			const url = title === void 0 ? void 0 : fetchTitleUrl(title.title, title.presentations, safeArtifactUrl);
			return url === void 0 || this.sessionId === void 0 ? void 0 : {
				...url,
				targetKey: key,
				scopeId: this.sessionId,
				generation: 1e9 + this.blockGeneration
			};
		}
		return this.fetchViewport === JSON.stringify(this.viewportState?.start) && this.lastPointerControls.some((control) => control.id === key && control.fetch !== void 0) ? this.fetchTargets.get(key) : void 0;
	}
	focusedFetchTitleTarget() {
		return this.toolFocus ? this.fetchTitleTarget(this.toolKeys()[this.toolCursor] ?? "") : void 0;
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
	processControls() {
		return this.currentProcessControls;
	}
	toggleProcess(id) {
		const control = this.currentProcessControls.find((value) => value.id === id);
		if (control === void 0 || this.snapshot === void 0) return false;
		if (control.kind === "turn") {
			const turn = Number(id.slice(5));
			const evidence = nativeProcessSnapshot(this.snapshot.chat)?.evidence.get(turn);
			if (evidence?.spec === void 0) return false;
			if (control.open) this.processTurns.delete(turn);
			else this.processTurns.set(turn, {
				turn,
				answerStep: evidence.spec.answerStep ?? 0
			});
		} else {
			const key = id.slice(6);
			if (control.open) this.processGroups.delete(key);
			else this.processGroups.add(key);
		}
		if (this.nativeTailEnabled) this.resetNativeHistory();
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
		return compareAnchors(anchor, focus, this.blocks.map((block) => block.key)) <= 0;
	}
	/** Whether a durable pointer anchor still belongs to the current transcript. */
	containsSelectionAnchor(anchor) {
		return anchor.surface === "transcript" && this.blocks.some((block) => block.key === anchor.ownerKey);
	}
	copySelectionText() {
		if (this.selection === void 0) return "";
		const keys = new Set(this.blocks.map((block) => block.key));
		const selection = selectionClearedForOwner(this.selection, keys);
		if (selection === void 0) return "";
		return extractSelectedText(selection, this.blocks.flatMap((block) => {
			const copy = this.ownerCopy.get(block.key);
			return copy === void 0 ? [] : [{
				key: block.key,
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
	empty(message$1) {
		this.imageGeneration += 1;
		this.imageLoader = void 0;
		this.snapshot = void 0;
		this.emptyMessage = message$1;
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
		this.fetchTargets.clear();
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
			this.processTurns.clear();
			this.processGroups.clear();
			this.currentProcessControls = [];
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
			const step = node?.kind === "assistant-step" ? assistantStepData(node.data) : void 0;
			const partial = snapshot.partial;
			if (node !== void 0 && step !== void 0 && partial !== null && step.turn === partial.turn && step.step === partial.step && step.status === "running") return [{
				...node,
				visibility: "visible",
				data: {
					...step,
					blocks: partial.blocks
				}
			}];
			return node === void 0 || node.visibility !== "visible" ? [] : [node];
		});
		const process$1 = workProcessLayout(visibleNodes, nativeProcessSnapshot(snapshot.chat), this.workProcessMode === void 0 ? void 0 : workProcessPolicy(this.workProcessMode), this.processTurns, this.processGroups, this.search !== void 0);
		this.currentProcessControls = process$1.controls;
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
			if (step?.blocks.some((block) => block.kind === "reasoning" && block.text !== "") !== true) continue;
			const key = node.key;
			const thinking = step.status === "running" && !step.blocks.some((block) => block.kind === "text" && block.text !== "");
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
			const block = {
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
			this.nodeCache.set(key, block);
			if (built.length > 0) {
				hasVisibleRows = true;
				blocks.push(block);
			}
		};
		for (const entry of process$1.entries) {
			if ("control" in entry) {
				const control = entry.control;
				take(`__process__:${control.id}`, JSON.stringify(control), () => [{
					format: "plain",
					text: color.muted(`${control.open ? "▾" : "▸"} ${escapeTerminalText(control.label)}`),
					processKey: control.id,
					gapBefore: true
				}]);
				continue;
			}
			const node = entry.node;
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
				if (step.blocks.some((part$1) => part$1.kind === "text" && part$1.text !== "") || step.status !== "running") {
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
					if (step.blocks.some((part$1) => part$1.kind === "reasoning" && part$1.text !== "")) add(`${node.key}/header`, [reasoningHeaderRow(node.key, expanded)], "reasoning-header", false);
					for (const [partIndex, part$1] of step.blocks.entries()) {
						if (part$1.kind === "tool-call") continue;
						const dynamic = step.status === "running" && partIndex === step.blocks.length - 1;
						add(partIndex === 0 ? node.key : `${node.key}/source/${partIndex}`, assistantBlockRows(part$1, preferences, false, {
							key: node.key,
							expanded
						}), {
							part: part$1,
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
		if (snapshot.partial !== null && !visibleNodes.some((node) => {
			const step = node.kind === "assistant-step" ? assistantStepData(node.data) : void 0;
			return step?.turn === snapshot.partial?.turn && step?.step === snapshot.partial?.step;
		})) {
			const partial = snapshot.partial;
			const key = "__partial__";
			const thinking = !partial.blocks.some((block) => block.kind === "text" && block.text !== "");
			const hasReasoning = partial.blocks.some((block) => block.kind === "reasoning" && block.text !== "");
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
				const partialRows = partial.blocks.flatMap((block) => assistantBlockRows(block, preferences, thinking, {
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
		for (const block of blocks) for (const row of block.rows) {
			if (row.format !== "image") continue;
			const cacheKey = `${this.sessionId ?? "none"}:${row.key}`;
			const owners = this.imageBlockOwners.get(cacheKey) ?? /* @__PURE__ */ new Set();
			owners.add(block.key);
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
		for (const block of this.blocks) {
			if (!block.rows.some((row) => row.welcome === true)) continue;
			block.linesByWidth.clear();
			for (const [index, component] of block.components.entries()) if (block.rows[index]?.welcome === true) this.lineCache.delete(component);
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
		for (const block of this.blocks) {
			if (!block.metadata.dynamic) continue;
			for (const [index, component] of block.components.entries()) {
				const row = block.rows[index];
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
	renderBlock(blockIndex, contentWidth, projected$1) {
		const block = projected$1 ?? this.blocks[blockIndex];
		if (block === void 0) return {
			lines: [],
			projections: [],
			borderLines: [],
			hardBreaks: [],
			turnAnchors: [],
			controls: []
		};
		internals.blocksVisited += 1;
		const cacheKey = (blockIndex === 0 ? -contentWidth : contentWidth) + (this.nativeMode ? 1e6 : 0);
		if (block.dirty) {
			block.linesByWidth.clear();
			block.dirty = false;
		}
		const clockDriven = block.rows.some((row) => row.pulse !== void 0 || row.liveDurationSince !== void 0);
		const cachedBlock = clockDriven ? void 0 : block.linesByWidth.get(cacheKey);
		if (cachedBlock !== void 0) {
			this.heightIndex.setExact(block.key, cachedBlock.lines.length);
			this.rememberOwnerCopy(block.key, cachedBlock);
			this.lineControls.set(block.key, cachedBlock.controls);
			this.syncHeightIndexCounters();
			return cachedBlock;
		}
		const lines = [];
		const projections = [];
		const borderLines = [];
		const hardBreaks = [];
		const turnAnchors = [];
		const controls = [];
		for (const [index, component] of block.components.entries()) {
			const row = block.rows[index];
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
			} : row?.processKey !== void 0 ? {
				kind: "process",
				id: row.processKey
			} : row?.exampleId !== void 0 ? {
				kind: "example",
				id: row.exampleId
			} : void 0;
			if (row?.format === "image") lines.push(...rendered);
			else for (const line of rendered) {
				internals.linesEscaped += 1;
				lines.push(this.safeRenderedLines.get(line));
			}
			const projected$2 = row?.format === "rule" || row?.format === "image" ? rendered.map(() => ({
				text: "",
				displayStartCell: 0,
				joinerAfter: ""
			})) : row?.format === "plain" && row.pulse === void 0 && row.welcome !== true ? plainSelectionLines(row.text, contentWidth) : componentSelectionLines(component) ?? fallbackSelectionLines(rendered, contentWidth);
			for (const projection of projected$2.length === rendered.length ? projected$2 : fallbackSelectionLines(rendered, contentWidth)) projections.push(projection);
			for (const hardBreakIndex of explicitHardBreakIndexes(row, contentWidth)) {
				const target = start + hardBreakIndex;
				if (target >= start && target < lines.length) hardBreaks[target] = true;
			}
			if (row?.format === "rule") borderLines.push(start);
			if (lines.length > start) {
				if (row?.format === "rule" || block.rows[index + 1]?.format === "rule") hardBreaks[lines.length - 1] = false;
				else if (index < block.components.length - 1) hardBreaks[lines.length - 1] = true;
			}
			for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) controls[lineIndex] = control;
			if (row?.format === "plain" && row.fetchTitle !== void 0 && control !== void 0) {
				const title = row.fetchTitle;
				wrappedSourceProjections(row.text, rendered, 0, "", (sourceStart, sourceEnd, lineIndex) => {
					const from = Math.max(sourceStart, title.start);
					const to = Math.min(sourceEnd, title.start + title.title.length);
					if (from >= to) return;
					const source = stripCopyDecorations(row.text);
					controls[start + lineIndex] = {
						...control,
						fetch: {
							title,
							renderedLine: rendered[lineIndex] ?? "",
							cells: {
								start: visibleWidth(source.slice(sourceStart, from)),
								width: visibleWidth(source.slice(from, to)),
								sourceStart: from - title.start,
								sourceEnd: to - title.start
							}
						}
					};
				});
			}
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
			block.linesByWidth.set(cacheKey, result);
			while (block.linesByWidth.size > 4) {
				const oldest = block.linesByWidth.keys().next().value;
				if (oldest === void 0) break;
				block.linesByWidth.delete(oldest);
			}
		}
		this.heightIndex.setExact(block.key, result.lines.length);
		this.rememberOwnerCopy(block.key, result);
		this.lineControls.set(block.key, result.controls);
		this.syncHeightIndexCounters();
		return result;
	}
	rememberOwnerCopy(key, block) {
		const projections = block.projections.map((projection, index) => block.borderLines.includes(index) ? {
			text: "",
			displayStartCell: 0,
			joinerAfter: projection.joinerAfter
		} : projection);
		const next = {
			...ownerTextFromProjections(projections),
			projections,
			borderLines: block.borderLines
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
			let visible = parts.flatMap((part$1) => part$1.lines);
			let leadingPadding = 0;
			const hasOlder$1 = startIndex > 0 || startOffset > 0 || this.hasMore;
			if (hasOlder$1 && visible.length > 0) {
				let lineBase = 0;
				let latestTurn;
				for (const part$1 of parts) {
					for (const anchor of part$1.turnAnchors) {
						if (anchor < part$1.offset || anchor >= part$1.offset + part$1.lines.length) continue;
						latestTurn = {
							blockIndex: part$1.blockIndex,
							lineOffset: anchor,
							visibleOffset: lineBase + anchor - part$1.offset
						};
					}
					lineBase += part$1.lines.length;
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
		startIndex = this.blocks.findIndex((block) => block.key === this.viewportAnchor.blockKey);
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
			const nextIndex = this.blocks.findIndex((block) => block.key === moved.coordinate.blockKey);
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
		for (const block of this.blocks) {
			const start = lines.length;
			for (const row of block.rows) lines.push(...this.logicalRowLines(row));
			spans.push({
				blockKey: block.key,
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
		let blockIndex = this.blocks.findIndex((block) => block.key === start.blockKey);
		let lineOffset = start.lineOffset;
		for (let row = 0; row < lines.length; row += 1) {
			if (row < leadingPadding) continue;
			const block = this.blocks[blockIndex];
			if (block === void 0) break;
			const copy = this.ownerCopy.get(block.key);
			if (copy?.borderLines.includes(lineOffset) !== true) {
				const startOffset = copy?.lineStarts[lineOffset] ?? 0;
				const projection = copy?.projections[lineOffset];
				const mapped = projection === void 0 ? mapCopyableLine(lines[row] ?? "", startOffset, contentWidth) : mapSelectionProjectionLine(projection, startOffset, contentWidth);
				maps.push({
					row,
					ownerKey: block.key,
					surface: "transcript",
					startOffset,
					endOffset: mapped.endOffset,
					cellOffsets: mapped.cellOffsets,
					hardBreakAfter: mapped.hardBreakAfter
				});
			}
			const control = this.lineControls.get(block.key)?.[lineOffset];
			if (control !== void 0) pointerControls.push({
				...control,
				row
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
		const block = this.blocks[0];
		const copy = block === void 0 ? void 0 : this.ownerCopy.get(block.key);
		if (block === void 0 || copy === void 0) {
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
				ownerKey: block.key,
				surface: "transcript",
				startOffset,
				endOffset: mapped.endOffset,
				cellOffsets: mapped.cellOffsets,
				hardBreakAfter: mapped.hardBreakAfter
			});
		}
		this.lastViewportMaps = maps;
		return paintSelection(lines, maps, this.selection, [block.key]);
	}
	render(width) {
		if (this.nativeTailEnabled && this.nativeMode && (!this.emptyState || this.nativeNotices.length || this.nativeBatch)) return this.renderNativeTail(width);
		const inset = width >= 12 ? 2 : 0;
		const contentWidth = Math.max(1, width - inset * 2);
		this.heightIndex.reconcile(this.blocks.map((block) => block.key), (key) => {
			const block = this.blocks.find((candidate) => candidate.key === key);
			return Math.max(1, block?.rows.length ?? 1);
		}, contentWidth);
		this.syncHeightIndexCounters();
		if (this.nativeMode && !this.emptyState) {
			const lines$1 = [];
			for (const [index, block] of this.blocks.entries()) {
				const frozen = this.nativeFrozenBlocks.get(block.key);
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
				if (!block.metadata.dynamic && frozen === void 0) this.nativeFrozenBlocks.set(block.key, rendered);
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
			const selected$1 = paintSelection(this.search === void 0 ? mapped.lines : this.highlightVisible(mapped.lines, this.search.query), mapped.maps, this.selection, this.blocks.map((block) => block.key));
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
		if (this.workProcessMode !== void 0 && this.snapshot !== void 0) this.update(this.snapshot, this.imageLoader);
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
		if (this.workProcessMode !== void 0 && this.snapshot !== void 0) this.update(this.snapshot, this.imageLoader);
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
		let blockIndex = this.blocks.findIndex((block) => block.key === start.blockKey);
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
		for (const [blockIndex, block] of this.blocks.entries()) {
			if (block.metadata.userTurnRows.length === 0) continue;
			const rendered = this.renderBlock(blockIndex, viewport.contentWidth);
			for (const lineOffset of rendered.turnAnchors) turns.push({
				blockIndex,
				blockKey: block.key,
				lineOffset
			});
		}
		if (turns.length === 0) return false;
		const topBlockIndex = this.blocks.findIndex((block) => block.key === viewport.start.blockKey);
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
		return [...new Set(this.blocks.flatMap((block) => block.metadata.toolKeys))];
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
		const block = {
			key: "__replacement__",
			sourceToken: "",
			rows: [...rows],
			components,
			linesByWidth: /* @__PURE__ */ new Map(),
			metadata: transcriptBlockMetadata(rows),
			dirty: false
		};
		this.commit(rows.length === 0 ? [] : [block]);
	}
	commit(blocks) {
		this.blocks = blocks;
		this.indexNativeCandidates();
		if (this.pendingOlderAnchor !== void 0 && blocks.some((block) => block.key === this.pendingOlderAnchor?.blockKey)) this.viewportAnchor = {
			...this.pendingOlderAnchor,
			followLatest: false
		};
		else if (!this.viewportAnchor.followLatest && !blocks.some((block) => block.key === this.viewportAnchor.blockKey)) this.viewportAnchor = {
			blockKey: "",
			lineOffset: 0,
			followLatest: true
		};
		const keyedBlocks = new Map(blocks.map((block) => [block.key, block]));
		this.heightIndex.reconcile([...keyedBlocks.keys()], (key) => {
			const block = keyedBlocks.get(key);
			return Math.max(1, block?.rows.length ?? 1);
		}, this.viewportState?.contentWidth ?? this.heightIndex.contentWidth);
		if (this.search !== void 0) this.ensureSearchIndex();
		const keys = new Set(blocks.map((block) => block.key));
		this.selection = selectionClearedForOwner(this.selection, keys);
		this.syncHeightIndexCounters();
		this.syncPulseAnimation(blocks.some((block) => block.rows.some((row) => row.liveDurationSince !== void 0 || row.pulse !== void 0 && terminalColorLevel() !== 0)));
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
			const message$1 = error instanceof Error ? error.message : String(error);
			this.imageComponents.set(cacheKey, new Text(color.danger(ui(`${imageLabel(row.attachment)} · 读取失败：${message$1}`, `${imageLabel(row.attachment)} · failed to load: ${message$1}`)), 0, 0));
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

export { terminalColorLevel as $, NativeProcessSnapshotAdapter as A, currentTheme as B, artifactViewCommand as C, workspaceFileView as D, hostWorkspaceFilesView as E, StringTransformCache as F, markdownTheme as G, escapeTerminalText as H, applyMarkdownPresentation as I, setTerminalCanvasBackground as J, setCodeHighlighter as K, background as L, sameTurnProcessSpec as M, hasAssistantReplyContent as N, WorkspaceFileObserver as O, isRunningTool as P, surfaceRow as Q, canvasStyleRevision as R, ArtifactViewController as S, artifactJson as T, highlightCodeLines as U, editorTheme as V, interaction as W, statusColor as X, setTheme as Y, styleTerminalText as Z, adoptSyntaxHighlighter as _, SYNTAX_ROLE_SCOPES as _t, editorMouseApi as a, normalizeBackgroundMode as at, normalizeWorkProcessMode as b, graphemeRangeAt as c, normalizeThemeColorOn as ct, wordRangeAt as d, resolveTheme as dt, BUILT_IN_THEMES as et, fetchTitleActionReason as f, themeContrastWarnings as ft, SyntaxHighlighter as g, resolveRendering as gt, horizontalRule as h, renderingOverrides as ht, autocompleteTargetId as i, normalizeAppearance as it, isSubagentDelegationTool as j, autoPermissionPresentation as k, invertLineCells as l, resolveAppearanceTheme as lt, runFetchTitleAction as m, backgroundSyncMode as mt, renderNativeCode as n, editableTheme as nt, emptyFrameGeometry as o, normalizeCustomTheme as ot, fetchTitleGestureAction as p, themeIdFromName as pt, setRendering as q, toolApprovalPreview as r, generateThemeCandidates as rt, tuiFrameApi as s, normalizeThemeColor as st, Transcript as t, composeResolvedTheme as tt, stripCopyDecorations as u, resolveCodeTheme as ut, WORK_PROCESS_MODES as v, safeArtifactUrl as w, workProcessSettingsMutation as x, cycleWorkProcessMode as y, color as z };