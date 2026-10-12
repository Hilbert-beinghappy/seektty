import { C as MAX_TEXTMATE_RULES, D as MAX_WHEEL_SCROLL_LINES, E as MAX_WELCOME_TEXT_LENGTH, J as matchesKey, K as Key, M as TuiSettingsConflictError, S as MAX_DIFF_CONTEXT_LINES, T as MAX_WELCOME_ROWS, _ as DEFAULT_TUI_CODE_THEME, b as MAX_COMPOSER_HISTORY, d as strictFileConfinementReason, g as DEFAULT_TUI_BEHAVIOR, h as DEFAULT_TUI_BACKGROUND_MODE, i as closeHostFileStream, l as containedHostPath, m as observeManagement, o as HOST_FILE_READ_BOUNDARY, r as HostFileStreamCleanupFailure, t as RemoteOperationScope, v as DEFAULT_TUI_THEME, w as MAX_TOOL_OUTPUT_LINE_LIMIT, x as MAX_CUSTOM_THEMES, y as DEFAULT_TUI_WELCOME } from "./remote-operation-ZujH2Lvf.js";
import { c as ui } from "./locale-Ds9YSjyq.js";
import { n as assertCredentialFreeUrl, r as redactMarketplaceUrl, t as PluginMarketplace } from "./plugin-marketplace-BsOXJgOC.js";
import { n as installerSecrets, r as redactInstallerText } from "./installer-output-C0-WCIeM.js";
import { SessionId, isAppendSurfaceEvent } from "@deepseek-ai/dsh-session";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { symbols } from "@deepseek-ai/cordis";
import { UserQuestionService } from "@deepseek-ai/dsh-user-questions";
import { ToolCallId } from "@deepseek-ai/dsh-llm/brand";
import { ToolCallId as ToolCallId$1 } from "@deepseek-ai/dsh-llm";
import z$1 from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { SettingsConflictError } from "@deepseek-ai/dsh-settings";
import crossSpawn from "cross-spawn";
import { DEFAULT_SESSION_LOG_COMPRESSION_LEVEL, flushLiveSessionLog, readSessionLogText, sessionLogExportDeps, sessionLogZipFilename, streamSessionLogZip } from "@deepseek-ai/dsh-session-log-export";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { AttachmentStore } from "@deepseek-ai/dsh-attachment";
import { TYPERT_REMOTE } from "@deepseek-ai/dsh-api-session-controller/remote";
import { TYPERT_REMOTE as TYPERT_REMOTE$1 } from "@deepseek-ai/dsh-client-file-upload/remote";

function _usingCtx() {
	var r = "function" == typeof SuppressedError ? SuppressedError : function(r$1, e$1) {
		var n$1 = Error();
		return n$1.name = "SuppressedError", n$1.error = r$1, n$1.suppressed = e$1, n$1;
	}, e = {}, n = [];
	function using(r$1, e$1) {
		if (null != e$1) {
			if (Object(e$1) !== e$1) throw new TypeError("using declarations can only be used with objects, functions, null, or undefined.");
			if (r$1) var o = e$1[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
			if (void 0 === o && (o = e$1[Symbol.dispose || Symbol["for"]("Symbol.dispose")], r$1)) var t = o;
			if ("function" != typeof o) throw new TypeError("Object is not disposable.");
			t && (o = function o$1() {
				try {
					t.call(e$1);
				} catch (r$2) {
					return Promise.reject(r$2);
				}
			}), n.push({
				v: e$1,
				d: o,
				a: r$1
			});
		} else r$1 && n.push({
			d: e$1,
			a: r$1
		});
		return e$1;
	}
	return {
		e,
		u: using.bind(null, !1),
		a: using.bind(null, !0),
		d: function d() {
			var o, t = this.e, s = 0;
			function next() {
				for (; o = n.pop();) try {
					if (!o.a && 1 === s) return s = 0, n.push(o), Promise.resolve().then(next);
					if (o.d) {
						var r$1 = o.d.call(o.v);
						if (o.a) return s |= 2, Promise.resolve(r$1).then(next, err);
					} else s |= 1;
				} catch (r$2) {
					return err(r$2);
				}
				if (1 === s) return t !== e ? Promise.reject(t) : Promise.resolve();
				if (t !== e) throw t;
			}
			function err(n$1) {
				return t = t !== e ? new r(n$1, t) : n$1, next();
			}
			return next();
		}
	};
}

/** A leased preset scope restores cold presentation without creating an Agent. */
async function toolPresenterScope(ctx, sessionId, signal) {
	try {
		var _usingCtx$1 = _usingCtx();
		signal.throwIfAborted();
		const unleased = (scope) => ({
			scope,
			async [Symbol.asyncDispose]() {}
		});
		const live = ctx.get("agents")?.get(sessionId);
		if (live !== void 0) return unleased(live);
		const presets = ctx.get("agentPresets");
		if (presets === void 0) return unleased(void 0);
		const observation = _usingCtx$1.u(await ctx.sessionQuery.observeSession(sessionId, {
			signal,
			projectionMode: "all"
		}));
		signal.throwIfAborted();
		const preset = z.string().nullable().optional().parse(observation.projections?.values.agentPreset);
		try {
			const lease = await presets.acquireScope(preset ?? void 0);
			if (signal.aborted) {
				await lease[Symbol.asyncDispose]();
				signal.throwIfAborted();
			}
			return {
				scope: lease.key,
				[Symbol.asyncDispose]: () => lease[Symbol.asyncDispose]()
			};
		} catch {
			signal.throwIfAborted();
			return unleased(void 0);
		}
	} catch (_) {
		_usingCtx$1.e = _;
	} finally {
		_usingCtx$1.d();
	}
}

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
function toAssistantBlock(block) {
	switch (block.type) {
		case "text": return {
			kind: "text",
			text: block.text
		};
		case "reasoning": return {
			kind: "reasoning",
			text: block.text
		};
		case "image": return {
			kind: "image",
			attachment: block.attachment
		};
		case "tool-call": return {
			kind: "tool-call",
			callId: String(block.id),
			name: block.name,
			argsRaw: block.arguments
		};
		default: return {
			kind: "other",
			block
		};
	}
}
const EMPTY_LIST = [];
const EMPTY_TIMELINE = {
	turnOrder: EMPTY_LIST,
	turns: /* @__PURE__ */ new Map()
};
/** Empty target store used by fixtures and Sessions without registered views. */
const EMPTY_CONVERSATION_VIEWS = { get: () => void 0 };
/** Empty Chat target used before a view builder is registered. */
const EMPTY_CHAT_SNAPSHOT = {
	order: EMPTY_LIST,
	nodes: {
		get: () => void 0,
		values: () => EMPTY_LIST
	},
	locations: {
		getTurn: () => EMPTY_LIST,
		getStep: () => EMPTY_LIST
	},
	timeline: EMPTY_TIMELINE,
	legacy: {
		nodes: EMPTY_LIST,
		turnTimings: /* @__PURE__ */ new Map(),
		turnEnds: /* @__PURE__ */ new Map(),
		partial: null,
		runningCalls: EMPTY_LIST
	}
};

function contentBlockText(block) {
	if (typeof block !== "object" || block === null) return String(block);
	const value = block;
	if (value.type === "text" || value.type === "reasoning") return typeof value.text === "string" ? value.text : `[${value.type}]`;
	if (value.type === "image") return "[image]";
	if (value.type === "tool-result") return "[tool result]";
	return `[${typeof value.type === "string" ? value.type : "content"}]`;
}
function userSection(heading, content) {
	const text = content.map(contentBlockText).join("\n").trim();
	if (text === "") return void 0;
	return `## ${heading}\n\n${text}`;
}
function assistantSection(node) {
	const parts = [];
	for (const block of node.blocks) if (block.kind === "text" && block.text !== void 0 && block.text.trim() !== "") parts.push(block.text.trimEnd());
	else if (block.kind === "tool-call" && block.name !== void 0) parts.push(`- tool \`${block.name}\``);
	else if (block.kind === "image") parts.push("[image]");
	if (parts.length === 0) return void 0;
	return `## Assistant\n\n${parts.join("\n\n")}`;
}
/**
* Render visible conversation nodes as Markdown for `/export md`.
* @param title - session display title used as the document heading.
* @param nodes - Runtime conversation nodes in display order.
* @returns Markdown with a trailing newline.
*/
function conversationMarkdown(title, nodes) {
	const sections = [`# ${title === "" ? "Session" : title}`];
	for (const node of nodes) if (node.kind === "user" && "content" in node) {
		const section = userSection("User", node.content);
		if (section !== void 0) sections.push(section);
	} else if (node.kind === "steering" && "content" in node) {
		const section = userSection("Steering", node.content);
		if (section !== void 0) sections.push(section);
	} else if (node.kind === "tool-result" && "content" in node && "isError" in node) {
		const section = userSection(node.isError ? "Tool result (error)" : "Tool result", node.content);
		if (section !== void 0) sections.push(section);
		else sections.push(`## ${node.isError ? "Tool result (error)" : "Tool result"}`);
	} else if (node.kind === "assistant" && "blocks" in node) {
		const section = assistantSection(node);
		if (section !== void 0) sections.push(section);
	}
	return `${sections.join("\n\n")}\n`;
}

const KEYMAP_GROUPS = [
	{
		id: "input",
		zh: "输入与编辑",
		en: "Input & editing"
	},
	{
		id: "commands",
		zh: "命令与弹窗",
		en: "Commands & overlays"
	},
	{
		id: "transcript",
		zh: "对话浏览",
		en: "Transcript browsing"
	},
	{
		id: "session",
		zh: "会话与运行",
		en: "Sessions & running turns"
	},
	{
		id: "selection",
		zh: "鼠标与选区",
		en: "Mouse & selection"
	}
];
/** Product shortcuts handled by the terminal Surface. */
const SURFACE_KEYMAP = [
	{
		id: "help",
		group: "commands",
		keys: ["F1"],
		zh: "打开帮助",
		en: "Open help",
		match: (data) => matchesKey(data, Key.f1)
	},
	{
		id: "commandPalette",
		group: "commands",
		keys: ["Ctrl+P"],
		zh: "打开命令面板",
		en: "Open the command palette",
		match: (data) => matchesKey(data, Key.ctrl("p"))
	},
	{
		id: "historySearch",
		group: "input",
		keys: ["Ctrl+R"],
		zh: "搜索输入历史",
		en: "Search input history",
		match: (data) => matchesKey(data, Key.ctrl("r"))
	},
	{
		id: "sessions",
		group: "session",
		keys: ["Ctrl+S"],
		zh: "打开会话列表",
		en: "Open the session list",
		match: (data) => matchesKey(data, Key.ctrl("s"))
	},
	{
		id: "model",
		group: "session",
		keys: ["Ctrl+M"],
		zh: "打开模型选择（需扩展键盘协议）",
		en: "Open model selection (extended keyboard protocol)",
		match: (data) => data !== "\r" && data !== "\n" && matchesKey(data, Key.ctrl("m"))
	},
	{
		id: "toolsDisplay",
		group: "transcript",
		keys: ["Ctrl+O"],
		zh: "循环工具卡片显示",
		en: "Cycle tool-card display",
		match: (data) => matchesKey(data, Key.ctrl("o"))
	},
	{
		id: "reasoning",
		group: "transcript",
		keys: ["Ctrl+T"],
		zh: "显示或隐藏推理",
		en: "Show or hide reasoning",
		match: (data) => matchesKey(data, Key.ctrl("t"))
	},
	{
		id: "workProcessDisplay",
		group: "transcript",
		keys: [],
		zh: "循环工作过程显示（默认未绑定）",
		en: "Cycle work-process display (unbound by default)",
		match: () => false
	},
	{
		id: "settings",
		group: "commands",
		keys: [
			"F2",
			"Ctrl+,",
			"Cmd+,"
		],
		zh: "打开设置",
		en: "Open Settings",
		match: (data) => matchesKey(data, Key.f2) || matchesKey(data, Key.ctrl(Key.comma)) || matchesKey(data, Key.super(Key.comma))
	},
	{
		id: "toggleMouseMode",
		group: "selection",
		keys: ["F3"],
		zh: "切换完整模式与终端原生模式",
		en: "Toggle full and terminal-native modes",
		match: (data) => matchesKey(data, Key.f3)
	},
	{
		id: "cyclePermission",
		group: "session",
		keys: ["Shift+Tab"],
		zh: "循环当前权限",
		en: "Cycle the current permission",
		match: (data) => matchesKey(data, Key.shift(Key.tab))
	},
	{
		id: "focusToggle",
		group: "transcript",
		keys: ["Tab"],
		zh: "空输入框进入对话浏览；浏览时返回输入框",
		en: "Browse from an empty composer; return from browsing",
		match: (data) => matchesKey(data, Key.tab)
	},
	{
		id: "previousTurn",
		group: "transcript",
		keys: ["Shift+Left"],
		zh: "跳到上一个用户轮次",
		en: "Jump to the previous user turn",
		match: (data) => matchesKey(data, Key.shift(Key.left))
	},
	{
		id: "nextTurn",
		group: "transcript",
		keys: ["Shift+Right"],
		zh: "跳到下一个用户轮次",
		en: "Jump to the next user turn",
		match: (data) => matchesKey(data, Key.shift(Key.right))
	},
	{
		id: "interrupt",
		group: "session",
		keys: ["Ctrl+C"],
		zh: "停止当前轮次、清空草稿，或再按一次退出",
		en: "Stop the active turn, clear a draft, or press again to exit",
		match: (data) => matchesKey(data, Key.ctrl("c"))
	},
	{
		id: "copySelection",
		group: "selection",
		keys: ["Ctrl+Shift+C"],
		zh: "复制当前选区",
		en: "Copy the current selection",
		match: (data) => matchesKey(data, Key.ctrlShift("c")) || matchesKey(data, Key.shiftCtrl("c"))
	},
	{
		id: "undoInput",
		group: "input",
		keys: ["Ctrl+Z", "Ctrl+-"],
		zh: "撤销当前输入框内的编辑",
		en: "Undo edits in the focused input",
		match: () => false,
		configurable: false
	},
	{
		id: "submit",
		group: "input",
		keys: ["Enter"],
		zh: "发送消息或确认；斜杠候选选中后直接执行",
		en: "Send or confirm; run the selected slash candidate",
		match: () => false,
		configurable: false
	},
	{
		id: "newline",
		group: "input",
		keys: ["Shift+Enter"],
		zh: "输入区换行；需扩展键盘协议，部分终端可用 Ctrl+Enter",
		en: "Composer newline; requires extended keyboard input, with Ctrl+Enter on some terminals",
		match: () => false,
		configurable: false
	},
	{
		id: "transcriptSearch",
		group: "transcript",
		keys: ["/"],
		zh: "对话浏览时增量查找",
		en: "Incremental search while browsing the transcript",
		match: () => false,
		configurable: false
	}
];
const CONTEXT_KEYMAP = [
	{
		group: "input",
		keys: ["Enter / Ctrl+Enter"],
		zh: "多行弹窗：换行 / 提交",
		en: "Multiline overlay: newline / submit"
	},
	{
		group: "commands",
		keys: ["/"],
		zh: "输入框：打开命令与 Skill 候选",
		en: "Composer: open command and Skill candidates"
	},
	{
		group: "commands",
		keys: ["Up / Down"],
		zh: "候选或列表：移动选择",
		en: "Candidates or lists: move selection"
	},
	{
		group: "commands",
		keys: ["Tab"],
		zh: "候选显示时：只补全，不执行",
		en: "With candidates open: complete without running"
	},
	{
		group: "commands",
		keys: ["Space"],
		zh: "多选弹窗：勾选或取消当前项",
		en: "Multi-select overlay: toggle the current item"
	},
	{
		group: "commands",
		keys: ["Esc"],
		zh: "弹窗：返回或关闭；候选：取消补全",
		en: "Overlay: back or close; candidates: dismiss"
	},
	{
		group: "transcript",
		keys: ["Up / Down"],
		zh: "浏览时：逐行滚动或移动卡片选择",
		en: "While browsing: scroll or move card selection"
	},
	{
		group: "transcript",
		keys: ["PgUp / PgDn"],
		zh: "浏览时：上一页 / 下一页",
		en: "While browsing: previous / next page"
	},
	{
		group: "transcript",
		keys: ["Home / End"],
		zh: "浏览时：最早内容 / 最新内容",
		en: "While browsing: oldest / latest content"
	},
	{
		group: "transcript",
		keys: ["n / N"],
		zh: "查找确认后：下一个 / 上一个匹配",
		en: "After confirming Find: next / previous match"
	},
	{
		group: "transcript",
		keys: ["Esc"],
		zh: "依次退出查找、卡片聚焦，再返回输入区",
		en: "Leave Find, then card focus, then return to composer"
	},
	{
		group: "selection",
		keys: ["Ctrl+X"],
		zh: "非密钥弹窗输入框：剪切选区",
		en: "Non-secret overlay input: cut selection"
	},
	{
		group: "selection",
		keys: ["Backspace / Delete"],
		zh: "可编辑输入框：删除选区",
		en: "Editable input: delete selection"
	}
];
const byId = new Map(SURFACE_KEYMAP.map((binding) => [binding.id, binding]));
const MODIFIER_ORDER = [
	"ctrl",
	"alt",
	"shift",
	"super"
];
const MODIFIERS = {
	ctrl: "ctrl",
	control: "ctrl",
	alt: "alt",
	option: "alt",
	opt: "alt",
	shift: "shift",
	super: "super",
	cmd: "super",
	command: "super",
	win: "super",
	windows: "super",
	meta: "super"
};
const NAMED_KEYS = {
	",": ",",
	comma: ",",
	"/": "/",
	slash: "/",
	tab: "tab",
	enter: "enter",
	return: "enter",
	space: "space",
	escape: "escape",
	esc: "escape",
	left: "left",
	right: "right",
	up: "up",
	down: "down",
	home: "home",
	end: "end",
	backspace: "backspace",
	delete: "delete"
};
let overrides = {};
function isConfigurable(binding) {
	return binding.configurable !== false;
}
function namedKey(token) {
	if (token === "") return void 0;
	const lower = token.toLowerCase();
	if (NAMED_KEYS[lower] !== void 0) return NAMED_KEYS[lower];
	if (/^f([1-9]|1[0-2])$/u.test(lower)) return lower;
	if (/^[a-z0-9]$/u.test(lower)) return lower;
	if (token.length === 1) return lower;
}
/**
* Normalize a typed chord such as `Ctrl+P` or `Cmd+,` into a pi-tui key id.
* @param input - user-facing shortcut text.
* @returns canonical key id, or undefined when the chord is empty or incomplete.
*/
function normalizeChord(input) {
	const tokens = input.trim().split("+").map((part) => part.trim());
	if (tokens.length === 0 || tokens.some((token) => token === "")) return void 0;
	const modifiers = /* @__PURE__ */ new Set();
	const last = tokens.at(-1);
	if (last === void 0) return void 0;
	for (const token of tokens.slice(0, -1)) {
		const modifier = MODIFIERS[token.toLowerCase()];
		if (modifier === void 0) return void 0;
		modifiers.add(modifier);
	}
	const key = namedKey(last);
	if (key === void 0 || MODIFIERS[last.toLowerCase()] !== void 0) return void 0;
	const prefix = MODIFIER_ORDER.filter((name) => modifiers.has(name)).join("+");
	return prefix === "" ? key : `${prefix}+${key}`;
}
function formatChord(chord) {
	return chord.split("+").map((part) => {
		if (part === "," || part === "/") return part;
		if (/^f\d{1,2}$/u.test(part)) return part.toUpperCase();
		return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
	}).join("+");
}
function matchChord(data, chord) {
	if (chord === "ctrl+m" && (data === "\r" || data === "\n")) return false;
	return matchesKey(data, chord);
}
function defaultChords(binding) {
	return binding.keys.flatMap((key) => {
		const chord = normalizeChord(key);
		return chord === void 0 ? [] : [chord];
	});
}
const BARE_SPECIAL_KEYS = new Set([
	"tab",
	"enter",
	"escape",
	"left",
	"right",
	"up",
	"down",
	"home",
	"end",
	"backspace",
	"delete"
]);
function isUnmodifiedPrintableChord(chord) {
	if (chord.includes("+")) return false;
	if (BARE_SPECIAL_KEYS.has(chord)) return false;
	if (/^f([1-9]|1[0-2])$/u.test(chord)) return false;
	return chord.length === 1;
}
function parsedOverrides(value) {
	if (typeof value !== "object" || value === null) return { bindings: {} };
	const bindings = {};
	for (const [id, raw] of Object.entries(value)) {
		if (typeof raw !== "string") return {
			bindings,
			issue: ui(`键位 ${id} 必须是字符串`, `Key binding ${id} must be a string`)
		};
		const binding = byId.get(id);
		if (binding === void 0 || !isConfigurable(binding)) continue;
		const chord = normalizeChord(raw);
		if (chord === void 0) return {
			bindings,
			issue: ui(`无法解析组合键 ${raw}`, `Cannot parse chord ${raw}`)
		};
		if (isUnmodifiedPrintableChord(chord)) return {
			bindings,
			issue: ui(`不能把无修饰可打印字符 ${formatChord(chord)} 设为全局快捷键`, `Cannot bind unmodified printable character ${formatChord(chord)} as a global shortcut`)
		};
		bindings[id] = chord;
	}
	return { bindings };
}
function conflictIssue(overrides$1) {
	const owners = /* @__PURE__ */ new Map();
	for (const binding of SURFACE_KEYMAP) {
		const override = overrides$1[binding.id];
		const chords = override === void 0 ? defaultChords(binding) : [override];
		for (const chord of chords) {
			const owner = owners.get(chord);
			if (owner !== void 0 && owner !== binding.id) {
				const reported = overrides$1[owner] !== void 0 && overrides$1[binding.id] === void 0 ? binding.id : owner;
				return ui(`与 ${reported} 冲突`, `Conflicts with ${reported}`);
			}
			owners.set(chord, binding.id);
		}
	}
}
/**
* Explain why a complete override map cannot be written or applied.
* @param value - persisted or typed override map.
* @returns a localized error, or undefined when the map is valid.
*/
function keyBindingsIssue(value) {
	const parsed = parsedOverrides(value);
	return parsed.issue ?? conflictIssue(parsed.bindings);
}
function dropConflictingOverrides(overrides$1) {
	const next = { ...overrides$1 };
	for (;;) {
		const owners = /* @__PURE__ */ new Map();
		for (const binding of SURFACE_KEYMAP) {
			const override = next[binding.id];
			const chords = override === void 0 ? defaultChords(binding) : [override];
			for (const chord of chords) {
				const list = owners.get(chord) ?? [];
				list.push(binding.id);
				owners.set(chord, list);
			}
		}
		let dropped = false;
		for (const ids of owners.values()) {
			if (ids.length < 2) continue;
			for (const id of ids) {
				if (next[id] === void 0) continue;
				delete next[id];
				dropped = true;
			}
		}
		if (!dropped) return next;
	}
}
/**
* Drop unknown ids, documentation-only rows, and chords that cannot be parsed.
* @param value - persisted or typed override map.
*/
function sanitizeKeyBindings(value) {
	if (typeof value !== "object" || value === null) return {};
	const next = {};
	for (const [id, raw] of Object.entries(value)) {
		if (typeof raw !== "string") continue;
		const binding = byId.get(id);
		if (binding === void 0 || !isConfigurable(binding)) continue;
		const chord = normalizeChord(raw);
		if (chord === void 0 || isUnmodifiedPrintableChord(chord)) continue;
		next[id] = chord;
	}
	return dropConflictingOverrides(next);
}
/**
* Replace the live override table used by matching and help text.
* @param value - canonical or user-typed override map; empty restores defaults.
*/
function applyKeyBindingOverrides(value) {
	overrides = sanitizeKeyBindings(value);
}
/**
* Match one named surface binding against a raw input chunk.
* @param id - SURFACE_KEYMAP id.
* @param data - terminal input.
*/
function matchesBinding(id, data) {
	const binding = byId.get(id);
	if (binding === void 0) return false;
	const override = overrides[id];
	if (override !== void 0) return matchChord(data, override);
	return binding.match(data) === true;
}
/**
* First stage of the Surface input listener: a running turn consumes Ctrl+C
* before pi-tui can deliver the chord to an overlay.
*/
function consumeRunningInterrupt(data, session) {
	if (!matchesBinding("interrupt", data)) return void 0;
	if (session?.getSnapshot().running !== true) return void 0;
	session.cancel();
	return { consume: true };
}
/**
* Display the live chords for one binding, using the override when present.
* @param id - SURFACE_KEYMAP id.
*/
function bindingKeysLabel(id) {
	const binding = byId.get(id);
	if (binding === void 0) return id;
	const override = overrides[id];
	return override === void 0 ? binding.keys.length === 0 ? ui("未绑定", "Unbound") : binding.keys.join(" / ") : formatChord(override);
}
/**
* Render grouped help using live chords, keeping context-only keys out of global dispatch.
*/
function helpKeymapText() {
	const rows = [...SURFACE_KEYMAP.map((binding) => ({
		...binding,
		label: bindingKeysLabel(binding.id)
	})), ...CONTEXT_KEYMAP.map((row) => ({
		...row,
		label: row.keys.join(" / ")
	}))];
	const keyWidth = Math.max(...rows.map((row) => row.label.length));
	return [...KEYMAP_GROUPS.map((group) => [`[${ui(group.zh, group.en)}]`, ...rows.filter((row) => row.group === group.id).map((row) => `  ${row.label.padEnd(keyWidth)}  ${ui(row.zh, row.en)}`)].join("\n")), ui("显示当前绑定；可改绑项见 /keymap。Ctrl+Z 仅撤销当前框内编辑，不撤回已发送消息或已保存设置。", "Shows current bindings; see /keymap to rebind supported actions. Ctrl+Z undoes field edits, not sent messages or saved settings.")].join("\n\n");
}

var UnknownSpeechOutcome = class extends Error {
	constructor(operation, cause) {
		super(`${operation} outcome unknown; no automatic retry. Refresh the Host before any explicit retry.`, { cause });
		this.operation = operation;
		this.name = "UnknownSpeechOutcome";
	}
};

/**
* Whether the user can still request cancellation.
* @param status - JobView lifecycle state.
*/
function isStoppableJob(status) {
	return status === "running" || status === "stopping";
}
/**
* Elapsed milliseconds using a frozen `now` so overlay refresh stays testable.
* @param job - startedAt plus optional finishedAt.
* @param now - comparison instant.
*/
function jobElapsedMs(job, now) {
	return Math.max(0, (job.finishedAt ?? now) - job.startedAt);
}
/**
* Stop one job through the Host registry without depending on dsh-jobs.
* @param jobs - ctx.jobs, if the Host assembled it.
* @param id - registry job id.
*/
function killHostJob(jobs, id) {
	if (jobs === void 0) throw new Error(ui("Harness 后台任务服务未装配", "Harness background job service is not mounted"));
	return jobs.kill(id, void 0, "user stopped the job from SeekTTY");
}
/**
* Translate a kill result into a status-bar notice.
* @param result - registry kill outcome.
*/
function jobKillNotice(result) {
	return result === "requested" ? ui("已请求停止任务", "Stop requested") : ui("任务已经结束", "Job already finished");
}

/** Keep printable text and color-only SGR while dropping active terminal commands. */
function safeSgr(parameters) {
	const values = parameters === "" ? [0] : parameters.split(";").map((value) => Number.parseInt(value, 10));
	if (values.some((value) => !Number.isInteger(value) || value < 0)) return void 0;
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (value === 38 || value === 48) {
			const mode = values[index + 1];
			if (mode === 5) {
				const palette = values[index + 2];
				if (palette === void 0 || palette > 255) return void 0;
				index += 2;
				continue;
			}
			if (mode === 2) {
				const channels = values.slice(index + 2, index + 5);
				if (channels.length !== 3 || channels.some((channel) => channel > 255)) return void 0;
				index += 4;
				continue;
			}
			return;
		}
		if (value === void 0 || !(value === 0 || value === 1 || value === 2 || value === 22 || value === 39 || value === 49 || value >= 30 && value <= 37 || value >= 40 && value <= 47 || value >= 90 && value <= 97 || value >= 100 && value <= 107)) return void 0;
	}
	return `\u001B[${parameters}m`;
}
/**
* Sanitize untrusted terminal text without interpreting it. The result can
* contain only printable Unicode, newlines, spaces, and validated SGR color or
* intensity sequences.
*/
function sanitizeColorAnsiText(source) {
	let output = "";
	let index = 0;
	while (index < source.length) {
		const code = source.charCodeAt(index);
		if (code === 10) {
			output += "\n";
			index += 1;
			continue;
		}
		if (code === 13) {
			output += "\n";
			index += source.charCodeAt(index + 1) === 10 ? 2 : 1;
			continue;
		}
		if (code === 9) {
			output += "  ";
			index += 1;
			continue;
		}
		if (code === 27) {
			const rest = source.slice(index);
			const sgr = /^\x1B\[([0-9;]*)m/u.exec(rest);
			if (sgr !== null) {
				output += safeSgr(sgr[1] ?? "") ?? "";
				index += sgr[0].length;
				continue;
			}
			const control = /^\x1B(?:\][^\x07]*(?:\x07|\x1B\\)|[P^_X][\s\S]*?\x1B\\|\[[0-?]*[ -\/]*[@-~]|[@-_])/u.exec(rest);
			index += control?.[0].length ?? 1;
			continue;
		}
		const point = source.codePointAt(index);
		if (point === void 0) break;
		if (point >= 32 && point !== 127 || point > 159) output += String.fromCodePoint(point);
		index += point > 65535 ? 2 : 1;
	}
	return output;
}

const TYPE = "seektty-key-bindings-v1";
z$1.extend(TYPE, (data, schema, options) => {
	if (schema.inner === void 0) throw new Error("Key binding schema is missing its dictionary");
	const [value, adapted] = z$1.resolve(data, schema.inner, options);
	const issue = keyBindingsIssue(value);
	if (issue !== void 0) throw new Error(issue);
	return [sanitizeKeyBindings(value), adapted];
});
/** Schemastery JSON carries only the type and dictionary; the resolver stays in this module. */
function keyBindingsSchema() {
	return new z$1({
		type: TYPE,
		inner: z$1.dict(z$1.string())
	});
}

const DEFAULT_TIMEOUT_MS = 2e3;
const DEFAULT_OUTPUT_LIMIT = 256 * 1024;
function withoutTerminalControls(value) {
	return value.replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/gu, "").replace(/\x1B[P^_X][\s\S]*?\x1B\\/gu, "").replace(/\x1B\[[0-?]*[ -\/]*[@-~]/gu, "").replace(/\x1B[@-_]/gu, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, "").replace(/\t/gu, "  ");
}
function oneLine(value, maximum = 512) {
	return withoutTerminalControls(value).replace(/[\r\n]+/gu, " ").trim().slice(0, maximum);
}
function fastfetchArguments(request, separator) {
	const config = request.source === "safe" ? ["--config", "none"] : request.configPath.trim() === "" ? [] : ["--config", request.configPath];
	const structure = request.source === "safe" ? ["--structure", request.modules.join(":")] : [];
	return [
		...config,
		"--logo",
		"none",
		"--pipe",
		"true",
		"--separator",
		separator,
		...structure
	];
}
/** Render only the Logo from the selected Fastfetch config; never run modules. */
function fastfetchLogoArguments(request) {
	return [
		...request.configPath.trim() === "" ? [] : ["--config", request.configPath],
		"--structure",
		"none",
		"--pipe",
		"false",
		"--logo-padding",
		"0",
		"--logo-padding-top",
		"0",
		"--logo-padding-right",
		"0",
		"--logo-print-remaining",
		"true"
	];
}
function parseFastfetchOutput(stdout, separator) {
	const rows = [];
	for (const rawLine of stdout.replace(/\r\n?/gu, "\n").split("\n")) {
		const line = withoutTerminalControls(rawLine).trimEnd();
		if (line.trim() === "") continue;
		const split = line.indexOf(separator);
		if (split === -1) {
			rows.push({
				kind: "text",
				text: line.slice(0, 512)
			});
			continue;
		}
		const label = line.slice(0, split).trim().slice(0, 512);
		const value = line.slice(split + separator.length).trim().slice(0, 512);
		if (label === "" && value === "") continue;
		if (/^(?:error|failed|not supported)(?::|$)/iu.test(value)) continue;
		rows.push({
			kind: "field",
			label,
			value
		});
	}
	return rows.slice(0, 128);
}
function defaultSpawn(command, args) {
	return crossSpawn(command, [...args], {
		shell: false,
		windowsHide: true,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
}
function runFastfetch(args, signal, options) {
	if (signal?.aborted === true) return Promise.resolve({
		status: "cancelled",
		stdout: ""
	});
	const spawn = options.spawn ?? defaultSpawn;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(options.command ?? "fastfetch", [...options.prefixArgs ?? [], ...args]);
		} catch (error) {
			resolve({
				status: "unavailable",
				stdout: "",
				diagnostic: oneLine(String(error))
			});
			return;
		}
		let settled = false;
		let stdout = "";
		let stderr = "";
		let overflow = false;
		const append = (current, chunk) => {
			const next = current + chunk.toString("utf8");
			if (Buffer.byteLength(next, "utf8") <= outputLimit) return next;
			overflow = true;
			return next.slice(0, outputLimit);
		};
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve(result);
		};
		const stop = () => {
			if (!child.killed) child.kill();
		};
		const onAbort = () => {
			stop();
			finish({
				status: "cancelled",
				stdout: ""
			});
		};
		const timer = setTimeout(() => {
			stop();
			finish({
				status: "timeout",
				stdout: "",
				diagnostic: `Fastfetch timed out after ${String(timeoutMs)} ms`
			});
		}, timeoutMs);
		timer.unref?.();
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stdout.on("data", (chunk) => {
			stdout = append(stdout, chunk);
			if (overflow) stop();
		});
		child.stderr.on("data", (chunk) => {
			stderr = append(stderr, chunk);
			if (overflow) stop();
		});
		child.once("error", (error) => {
			const code = error.code;
			finish({
				status: code === "ENOENT" ? "unavailable" : "error",
				stdout: "",
				diagnostic: oneLine(error.message)
			});
		});
		child.once("close", (code) => {
			if (overflow) {
				finish({
					status: "error",
					stdout: "",
					diagnostic: "Fastfetch output exceeded 256 KiB"
				});
				return;
			}
			if (code === 0) {
				finish({
					status: "ok",
					stdout
				});
				return;
			}
			finish({
				status: "error",
				stdout: "",
				diagnostic: oneLine(stderr === "" ? `Fastfetch exited with code ${String(code)}` : stderr)
			});
		});
	});
}
/**
* Run Fastfetch without a shell and return only sanitized semantic rows.
* User-config mode is deliberately an opt-in trust boundary because Fastfetch
* configurations may contain their own command modules.
*/
function collectFastfetch(request, signal, options = {}) {
	const separator = `__SEEKTTY_${randomUUID()}__`;
	return runFastfetch(fastfetchArguments(request, separator), signal, options).then((result) => result.status === "ok" ? {
		status: "ok",
		rows: parseFastfetchOutput(result.stdout, separator)
	} : {
		status: result.status,
		rows: [],
		...result.diagnostic === void 0 ? {} : { diagnostic: result.diagnostic }
	});
}
/** Capture the configured Fastfetch Logo, preserving only safe ANSI colors. */
function collectFastfetchLogo(request, signal, options = {}) {
	return runFastfetch(fastfetchLogoArguments(request), signal, options).then((result) => {
		if (result.status !== "ok") return {
			status: result.status,
			...result.diagnostic === void 0 ? {} : { diagnostic: result.diagnostic }
		};
		const lines = sanitizeColorAnsiText(result.stdout).split("\n");
		while (lines.at(-1)?.replace(/\x1B\[[0-9;]*m/gu, "").trim() === "") lines.pop();
		const ansi = lines.join("\n");
		if (ansi.replace(/\x1B\[[0-9;]*m/gu, "").trim() === "") return {
			status: "error",
			diagnostic: "Fastfetch did not produce a text Logo"
		};
		return {
			status: "ok",
			ansi
		};
	});
}

/** Presentation reads never resume an Agent or change its credentials. */
function sessionExportSource(ctx) {
	return {
		inspect: (id, signal) => ctx.sessionController.inspect(id, signal),
		presenter: async (id, signal) => {
			const lease = await toolPresenterScope(ctx, id, signal);
			return {
				present: (name, args) => ctx.tools.get(name, lease.scope)?.presentCall?.(args),
				[Symbol.asyncDispose]: () => lease[Symbol.asyncDispose]()
			};
		}
	};
}
function sessionConversation(inspection, presentCall) {
	const nodes = [];
	const calls = /* @__PURE__ */ new Map();
	const produced = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	let title = inspection.meta.id;
	for (const event of inspection.events) {
		if (event.type === "session/title" && typeof event.data.title === "string") title = event.data.title;
		if (event.type === "tool/call") try {
			calls.set(String(event.data.callId), presentCall(event.data.name, JSON.parse(event.data.arguments)));
		} catch {
			calls.set(String(event.data.callId), void 0);
		}
		if (!isAppendSurfaceEvent(event)) continue;
		if (event.type === "user/message") {
			if (event.data.source.kind === "user") nodes.push({
				kind: "user",
				content: event.data.content
			});
		} else if (event.type === "assistant/message") nodes.push({
			kind: "assistant",
			blocks: toAssistantBlocks(event.data.message.content)
		});
		else if (event.type === "tool/result") {
			const result = event.data.message;
			nodes.push({
				kind: "tool-result",
				content: result.content,
				isError: result.isError === true
			});
			const call = calls.get(String(event.data.message.source.callId));
			if (result.isError === true || call === void 0) continue;
			if (call.card !== "diff" && !(call.card === "generic" && call.kind === "edit")) continue;
			for (const location of call.locations ?? []) {
				if (seen.has(location.path)) continue;
				seen.add(location.path);
				const paths = produced.get(event.data.turn) ?? [];
				paths.push(location.path);
				produced.set(event.data.turn, paths);
			}
		}
	}
	return {
		title,
		nodes,
		producedFiles: [...produced].map(([turn, paths]) => ({
			turn,
			paths
		}))
	};
}
/** Use Harness's own flush, canonical serializer, attachment reads and bounded ZIP producer. */
async function exportSession(ctx, rawId, descendants, signal) {
	signal.throwIfAborted();
	const id = SessionId(rawId);
	const deps = sessionLogExportDeps(ctx);
	if (deps.sessionQuery === void 0 || deps.sessionPersistence === void 0 || deps.attachments === void 0) throw new Error("Harness Session Export requires session-query, persistence and attachments");
	const ready = {
		sessionQuery: deps.sessionQuery,
		sessionPersistence: deps.sessionPersistence,
		attachments: deps.attachments,
		sessions: deps.sessions
	};
	await flushLiveSessionLog(deps, id, signal);
	const root = await readSessionLogText(deps.sessionPersistence, id, signal);
	signal.throwIfAborted();
	if (root === void 0) throw new Error(`Session not found: ${rawId}`);
	return {
		suggestedFilename: sessionLogZipFilename(rawId),
		mediaType: "application/zip",
		stream: streamSessionLogZip(ready, root, id, descendants, DEFAULT_SESSION_LOG_COMPRESSION_LEVEL, signal)
	};
}
async function readSessionConversation(source, rawId, signal) {
	try {
		var _usingCtx$1 = _usingCtx();
		signal.throwIfAborted();
		const inspection = await source.inspect(SessionId(rawId), signal);
		signal.throwIfAborted();
		if (inspection.meta.id !== rawId) throw new Error("Session export identity mismatch");
		const presenter = _usingCtx$1.a(await source.presenter(inspection.meta.id, signal));
		signal.throwIfAborted();
		return sessionConversation(inspection, presenter.present);
	} catch (_) {
		_usingCtx$1.e = _;
	} finally {
		await _usingCtx$1.d();
	}
}

function plainScalar(value) {
	if (typeof value === "object" && value !== null && "get" in value && typeof value.get === "function") return value.get();
	return value;
}
/** Read only known policy scalars from actual mounted instances, never credentials or endpoints. */
function readPrivacySnapshot(ctx) {
	const entries = [];
	for (const { entry } of ctx.configEditor.configuration()) {
		const name = entry.options.name;
		const channel = name === "@deepseek-ai/dsh-session-log-deepseek" ? "session-log" : name === "@deepseek-ai/dsh-session-telemetry-otel" ? "feedback-otel" : void 0;
		if (channel === void 0) continue;
		const active = entry.fiber?.state === 2;
		const config = active ? entry.fiber?.config : void 0;
		const values = typeof config === "object" && config !== null ? config : {};
		const policy = plainScalar(values[channel === "session-log" ? "enabled" : "mode"]);
		const maxBytes = plainScalar(values[channel === "session-log" ? "maxBytes" : "maxRequestBytes"]);
		entries.push({
			channel,
			entryId: entry.options.id,
			active,
			policy: channel === "session-log" ? policy === true ? "enabled" : policy === false ? "disabled" : "unknown" : policy === "FEEDBACK_ONLY" ? "feedback-only" : policy === "DISABLED" ? "disabled" : "unknown",
			...typeof maxBytes === "number" && Number.isFinite(maxBytes) ? { maxBytes } : {}
		});
	}
	return {
		profile: ctx.profileContext.name,
		entries
	};
}

const packageName = "@deepseek-ai/dsh-api-workspace-files";
const symbols$1 = `${packageName}/types#`;
const results = {
	read: "WorkspaceFileText",
	stat: "WorkspaceFileStat",
	readBytes: "WorkspaceFileBytes",
	list: "WorkspaceDirectoryListing",
	changes: "WorkspaceFileWatchFrame"
};
function strict(codec, symbol, binary = false) {
	return codec.mode === "strict" && codec.typeSymbol === symbol && typeof codec.create === "function" && (binary ? typeof codec.decode === "function" && typeof codec.encode === "function" : codec.decode === void 0 && codec.encode === void 0);
}
function nativeWorkspaceFileDescriptor(descriptor, method$1) {
	if (descriptor === void 0 || descriptor.id !== `${packageName}#workspaceFiles/${method$1}` || descriptor.namespace !== "workspaceFiles" || descriptor.service !== "workspaceFiles" || descriptor.method !== method$1 || (descriptor.implementation ?? method$1) !== method$1 || descriptor.invocation.kind !== "direct" || descriptor.scope !== void 0 || descriptor.uplink !== void 0 || descriptor.mode !== (method$1 === "changes" ? "stream" : void 0) || descriptor.cancellation?.parameter !== "signal") return false;
	const fields = [
		[
			"workspaceFileScope",
			"workspaceFileScopeId",
			"lookup",
			"workspaceFileScope",
			"@deepseek-ai/dsh-session/types#SessionId"
		],
		[
			"path",
			"path",
			"json",
			void 0,
			`${packageName}#workspaceFiles/${method$1}:path`
		],
		...method$1 === "read" ? [[
			"range",
			"range",
			"json",
			void 0,
			`${symbols$1}WorkspaceFileRange`
		]] : [],
		...method$1 === "readBytes" ? [[
			"options",
			"options",
			"json",
			void 0,
			`${symbols$1}WorkspaceByteReadOptions`
		]] : []
	];
	if (descriptor.parameters.length !== fields.length || !descriptor.parameters.every((parameter$1, index) => {
		const field = fields[index];
		return parameter$1.name === field[0] && parameter$1.wire === field[1] && parameter$1.source === field[2] && parameter$1.lookup === field[3] && parameter$1.acceptsUndefined === void 0 && strict(parameter$1.codec, field[4]);
	}) || !strict(descriptor.result, `${symbols$1}${results[method$1]}`, method$1 === "readBytes")) return false;
	try {
		for (const parameter$1 of descriptor.parameters) {
			if (parameter$1.codec.mode !== "strict") return false;
			const schema$1 = parameter$1.codec.create();
			schema$1.parse(parameter$1.name === "range" || parameter$1.name === "options" ? {} : "synthetic-file");
			for (const invalid of [
				void 0,
				null,
				1,
				false
			]) try {
				schema$1.parse(invalid);
				return false;
			} catch {}
			const nestedInvalid = parameter$1.name === "range" ? [{ offset: false }, { limit: "all" }] : parameter$1.name === "options" ? [
				{ baseFile: false },
				{ range: "all" },
				{ range: { offset: false } },
				{ range: { length: "all" } }
			] : [];
			for (const invalid of nestedInvalid) try {
				schema$1.parse(invalid);
				return false;
			} catch {}
		}
		if (descriptor.result.mode !== "strict") return false;
		const schema = descriptor.result.create();
		const stat = {
			absolutePath: "/synthetic/file",
			version: "opaque-v1"
		};
		const valid = method$1 === "stat" ? stat : method$1 === "read" ? {
			...stat,
			offset: 1,
			text: "synthetic",
			lines: 1,
			eof: true
		} : method$1 === "readBytes" ? {
			...stat,
			offset: 0,
			data: new Uint8Array([1]),
			eof: true
		} : method$1 === "list" ? {
			path: "",
			entries: [],
			truncated: false
		} : { kind: "ready" };
		schema.parse(valid);
		for (const invalid of [
			void 0,
			null,
			true,
			{},
			{
				absolutePath: 1,
				version: false
			}
		]) try {
			schema.parse(invalid);
			return false;
		} catch {}
		return true;
	} catch {
		return false;
	}
}
function createWorkspaceFileAdapter(options) {
	function gate(method$1, sessionId) {
		const confinement = strictFileConfinementReason(options.strictConfined);
		if (confinement !== void 0) return {
			available: false,
			reason: confinement
		};
		const authorization = options.authorize(method$1, sessionId);
		if (authorization?.available !== true) return {
			available: false,
			reason: authorization?.reason ?? "Host file permission is not confirmed"
		};
		const descriptor = options.local()?.get(`workspaceFiles/${method$1}`);
		if (!nativeWorkspaceFileDescriptor(descriptor, method$1)) return {
			available: false,
			reason: `Official rc.2 workspaceFiles/${method$1} descriptor is absent or unknown`
		};
		const service = options.service("workspaceFiles");
		if (service === null || typeof service !== "object" || typeof Reflect.get(service, method$1) !== "function") return {
			available: false,
			reason: `Official rc.2 workspaceFiles/${method$1} descriptor/service is absent or unknown`
		};
		try {
			containedHostPath("", options.workspaceRoot(sessionId));
		} catch (error) {
			return {
				available: false,
				reason: error instanceof Error ? error.message : String(error)
			};
		}
		if (method$1 === "read" || method$1 === "readBytes" || method$1 === "changes") {
			const identity = gate("stat", sessionId);
			if (!identity.available) return {
				available: false,
				reason: `Canonical Host file stat is required before content reads: ${identity.reason ?? "not confirmed"}`
			};
		}
		return { available: true };
	}
	const require = (method$1, sessionId, signal) => {
		signal?.throwIfAborted();
		const current = gate(method$1, sessionId);
		if (!current.available) throw new Error(current.reason);
	};
	async function invoke(method$1, sessionId, args, signal) {
		require(method$1, sessionId, signal);
		const root = options.workspaceRoot(sessionId);
		if (typeof args.path !== "string") throw new Error("Invalid Host path argument");
		let path = containedHostPath(args.path, root);
		if (method$1 === "readBytes" && typeof args.options === "object" && args.options !== null && Reflect.get(args.options, "baseFile") !== void 0) throw new Error("Resolve baseFile through the Host file controller before dispatch");
		try {
			let version;
			if (method$1 === "read" || method$1 === "readBytes") {
				const identity = await invoke("stat", sessionId, { path }, signal);
				if (!identity.ok) return identity;
				path = identity.value.absolutePath;
				version = identity.value.version;
				require(method$1, sessionId, signal);
				if (options.workspaceRoot(sessionId) !== root) throw new Error("Host workspace changed during canonical file stat");
			}
			const value = await options.gateway.invoke({
				namespace: "workspaceFiles",
				method: method$1,
				args: {
					workspaceFileScopeId: sessionId,
					...args,
					path
				},
				...signal === void 0 ? {} : { signal }
			});
			require(method$1, sessionId, signal);
			if (options.workspaceRoot(sessionId) !== root) throw new Error("Host Session workspace changed during file read");
			const descriptor = options.local()?.get(`workspaceFiles/${method$1}`);
			if (descriptor?.result.mode !== "strict") throw new Error("Workspace file result contract changed");
			const parsed = descriptor.result.create().parse(value);
			if (parsed !== null && typeof parsed === "object") {
				const absolutePath = Reflect.get(parsed, "absolutePath");
				if (typeof absolutePath === "string") containedHostPath(absolutePath, root);
				if (version !== void 0 && Reflect.get(parsed, "version") !== version) throw new Error("Host file changed after stat; refresh before reading another page");
				if (method$1 === "list" && (typeof Reflect.get(parsed, "path") !== "string" || containedHostPath(Reflect.get(parsed, "path"), root) !== path)) throw new Error("Host listing belongs to another workspace directory");
			}
			return {
				ok: true,
				value: parsed
			};
		} catch (error) {
			const failure = remoteErrorOf(error);
			if (failure === void 0) throw error;
			return {
				ok: false,
				error: failure
			};
		}
	}
	return {
		gate,
		boundary: HOST_FILE_READ_BOUNDARY,
		files: {
			read: (sessionId, path, range, signal) => invoke("read", sessionId, {
				path,
				range
			}, signal),
			stat: (sessionId, path, signal) => invoke("stat", sessionId, { path }, signal),
			readBytes: (sessionId, path, options$1, signal) => invoke("readBytes", sessionId, {
				path,
				options: options$1
			}, signal),
			list: (sessionId, path, signal) => invoke("list", sessionId, { path }, signal),
			changes: async (sessionId, path, signal) => {
				require("changes", sessionId, signal);
				const root = options.workspaceRoot(sessionId);
				const identity = await invoke("stat", sessionId, { path: containedHostPath(path, root) }, signal);
				if (!identity.ok) throw identity.error;
				require("changes", sessionId, signal);
				if (options.workspaceRoot(sessionId) !== root) throw new Error("Host workspace changed while resolving observation target");
				const stream = await options.gateway.stream({
					namespace: "workspaceFiles",
					method: "changes",
					args: {
						workspaceFileScopeId: sessionId,
						path: identity.value.absolutePath
					},
					signal
				});
				const dispose = () => {
					if ("dispose" in stream && typeof stream.dispose === "function") return stream.dispose();
				};
				try {
					require("changes", sessionId, signal);
					if (options.workspaceRoot(sessionId) !== root) throw new Error("Host workspace changed while opening observation");
				} catch (error) {
					try {
						await closeHostFileStream(stream);
					} catch (cleanup) {
						throw new HostFileStreamCleanupFailure([error, cleanup]);
					}
					throw error;
				}
				return {
					dispose,
					async *[Symbol.asyncIterator]() {
						try {
							for await (const frame of stream) {
								require("changes", sessionId, signal);
								if (options.workspaceRoot(sessionId) !== root) throw new Error("Host Session workspace changed during observation");
								const descriptor = options.local()?.get("workspaceFiles/changes");
								if (descriptor?.result.mode !== "strict") throw new Error("Workspace file watch contract changed");
								const parsed = descriptor.result.create().parse(frame);
								if (parsed !== null && typeof parsed === "object" && Reflect.get(parsed, "kind") === "change") {
									const change = Reflect.get(parsed, "change");
									if (change !== null && typeof change === "object") containedHostPath(Reflect.get(change, "absolutePath"), root);
								}
								yield parsed;
							}
						} finally {
							await dispose();
						}
					}
				};
			}
		}
	};
}

const MANAGEMENT_ENDPOINTS = [
	"workspace/archiveSession",
	"workspace/unarchiveSession",
	"workspace/pinSession",
	"workspace/unpinSession",
	"session/cancel"
];
/** A descriptor in a client bundle does not prove the service is mounted on the connected Host. */
function publishedSessionManagementMethods(local, service) {
	if (local === void 0) return void 0;
	const available = /* @__PURE__ */ new Set();
	for (const endpoint of MANAGEMENT_ENDPOINTS) {
		const descriptor = local.get(endpoint);
		if (descriptor === void 0 || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== "direct") continue;
		const receiver = service(descriptor.service);
		if ((typeof receiver === "object" && receiver !== null || typeof receiver === "function") && typeof Reflect.get(receiver, descriptor.implementation ?? descriptor.method) === "function") available.add(endpoint);
	}
	return available;
}
/** workspaceChanges is a published Host service, not a Typert Remote namespace. */
function mountedArtifactReviewReader(value) {
	if (typeof value !== "object" || value === null) return void 0;
	if (typeof Reflect.get(value, "summary") !== "function" || typeof Reflect.get(value, "diff") !== "function") return void 0;
	return value;
}

function workspaceBrowserFrame(state, frame) {
	if (frame.type === "baseline") return frame.value;
	if (state === void 0) return void 0;
	if (frame.type === "pinned") return {
		...state,
		pinnedSessionIds: frame.pinnedSessionIds
	};
	if (frame.type === "archived") return {
		...state,
		archivedSessionIds: frame.archivedSessionIds
	};
	if (frame.type === "remove") return {
		...state,
		items: state.items.filter((row) => row.workspaceId !== frame.workspaceId)
	};
	if (frame.type === "upsert") {
		const found = state.items.some((row) => row.workspaceId === frame.workspace.workspaceId);
		return {
			...state,
			items: found ? state.items.map((row) => row.workspaceId === frame.workspace.workspaceId ? frame.workspace : row) : [...state.items, frame.workspace]
		};
	}
	const byId$1 = new Map(state.items.map((row) => [row.workspaceId, row]));
	return {
		...state,
		items: [...frame.workspaceIds.flatMap((id) => byId$1.get(id) ?? []), ...state.items.filter((row) => !frame.workspaceIds.includes(row.workspaceId))]
	};
}
function createSessionManagementPorts(ctx) {
	const service = (key) => ctx.get(key);
	const local = () => ctx.get("typert")?.local;
	const original$1 = (value) => typeof value === "object" && value !== null ? Reflect.get(value, symbols.original) ?? value : value;
	const roots = /* @__PURE__ */ new Map();
	const scopeLookup = () => {
		const lookup = ctx.get("typert")?.lookups.get("workspaceFileScope");
		return lookup?.parameter === "workspaceFileScope" && lookup.wire === "workspaceFileScopeId" && lookup.hostTypeSymbol === "@deepseek-ai/dsh-api-workspace-files#WorkspaceFileScope" && lookup.wireTypeSymbol === "@deepseek-ai/dsh-session/types#SessionId" ? lookup : void 0;
	};
	const liveCwd = (id) => ctx.get("sessions")?.get(id)?.header.cwd;
	const workspaceRoot = (id) => {
		const root = roots.get(id);
		return root !== void 0 && root.fs === original$1(service("fs")) && root.files === original$1(service("workspaceFiles")) && root.gateway === original$1(service("typertGateway")) && root.lookup === scopeLookup() && root.liveCwd === liveCwd(id) ? root.path : void 0;
	};
	const prepareRootWork = async (id, signal) => {
		signal.throwIfAborted();
		const lookup = scopeLookup(), fs = ctx.get("fs"), files = original$1(service("workspaceFiles")), gateway = original$1(service("typertGateway"));
		if (lookup === void 0 || fs === void 0 || files === void 0 || gateway === void 0) throw new Error("Native Host file authority is unavailable");
		const readScope = async () => {
			const value = await lookup.resolve(id);
			if (typeof value !== "object" || value === null || Reflect.get(value, "sessionId") !== id || typeof Reflect.get(value, "workspaceRoot") !== "string") throw new Error("Native Session file scope is unavailable");
			return Reflect.get(value, "workspaceRoot");
		};
		const cwd = await readScope(), headerCwd = liveCwd(id);
		const target = await fs.resolve(cwd, { signal }), path = fs.processPath(target);
		containedHostPath("", path);
		signal.throwIfAborted();
		if (scopeLookup() !== lookup || original$1(ctx.get("fs")) !== original$1(fs) || original$1(service("workspaceFiles")) !== files || original$1(service("typertGateway")) !== gateway || headerCwd !== liveCwd(id) || await readScope() !== cwd) throw new Error("Host file scope changed while resolving its root");
		signal.throwIfAborted();
		roots.set(id, {
			path,
			cwd,
			fs: original$1(fs),
			files,
			gateway,
			lookup,
			liveCwd: headerCwd
		});
		notify();
	};
	const prepareRoot = (id, signal) => observeManagement(prepareRootWork(id, signal), signal);
	const nativeFiles = createWorkspaceFileAdapter({
		gateway: ctx.typertGateway,
		local,
		service,
		workspaceRoot,
		authorize: (_method, id) => ({
			available: workspaceRoot(id) !== void 0 && ctx.get("typertGateway") !== void 0,
			reason: "Confirmed native operator file scope/root is unavailable"
		})
	});
	const available = (endpoint) => {
		if (endpoint.startsWith("workspaceChanges/")) return mountedArtifactReviewReader(service("workspaceChanges")) !== void 0;
		const descriptor = local()?.get(endpoint);
		if (descriptor === void 0 || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== "direct") return false;
		const receiver = service(descriptor.service);
		return receiver !== void 0 && receiver !== null && typeof Reflect.get(Object(receiver), descriptor.implementation ?? descriptor.method) === "function";
	};
	let state;
	const listeners = /* @__PURE__ */ new Set();
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	const controller = ctx.get("workspaceController");
	if (controller !== void 0) ctx.effect(() => {
		const lifetime = new AbortController();
		(async () => {
			try {
				for await (const frame of controller.follow(lifetime.signal)) {
					if (lifetime.signal.aborted) return;
					state = workspaceBrowserFrame(state, frame);
					notify();
				}
			} finally {
				state = void 0;
				notify();
			}
		})().catch(() => {});
		return () => {
			lifetime.abort();
			state = void 0;
			notify();
			listeners.clear();
		};
	}, "tui: native Workspace browser baseline");
	ctx.effect(() => () => {
		roots.clear();
		notify();
	}, "tui: transient Host file roots");
	return {
		sessionManagement: {
			snapshot: () => state,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			methods: () => publishedSessionManagementMethods(local(), service)
		},
		artifacts: {
			available: (endpoint) => endpoint.startsWith("workspaceFiles/") ? local()?.get(endpoint) !== void 0 : available(endpoint),
			...nativeFiles.files,
			gate: nativeFiles.gate,
			workspaceRoot,
			openReason: (id) => {
				const root = workspaceRoot(id), fs = ctx.get("fs");
				return root !== void 0 && fs !== void 0 && fs.processPathFromHostPath(root) !== void 0 ? void 0 : "Host filesystem has no confirmed desktop mapping for this workspace";
			},
			prepareRoot,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			summary: (sessionId, seq) => mountedArtifactReviewReader(service("workspaceChanges"))?.summary(sessionId, seq),
			diff: async (sessionId, seq, index, signal) => mountedArtifactReviewReader(service("workspaceChanges"))?.diff(sessionId, seq, index, signal)
		}
	};
}

const SCHEDULE_ENDPOINTS = [
	"schedule/catalog",
	"schedule/list",
	"schedule/history",
	"schedule/update",
	"schedule/delete"
];
function method(receiver, name) {
	if ((typeof receiver !== "object" || receiver === null) && typeof receiver !== "function") return void 0;
	const fn = Reflect.get(receiver, name);
	return typeof fn === "function" ? (...args) => Reflect.apply(fn, receiver, args) : void 0;
}
function publishedScheduleMethods(local, service) {
	if (local === void 0) return void 0;
	const available = /* @__PURE__ */ new Set();
	for (const endpoint of SCHEDULE_ENDPOINTS) {
		const descriptor = local.get(endpoint);
		if (descriptor === void 0 || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== "direct") continue;
		if (method(service(descriptor.service), descriptor.implementation ?? descriptor.method) !== void 0) available.add(endpoint);
	}
	return available;
}
/** Gateway validates official descriptor args/results and cancellation; no hand-written Schedule Host API. */
function nativeScheduleRemote(gateway) {
	const call = async (method$1, request, signal) => ({
		ok: true,
		value: await gateway.invoke({
			namespace: "schedule",
			method: method$1,
			args: request === void 0 ? {} : { request },
			...signal === void 0 ? {} : { signal }
		})
	});
	return {
		catalog: () => call("catalog"),
		list: (request) => call("list", request),
		history: (request) => call("history", request),
		update: (request, signal) => call("update", request, signal),
		delete: (request, signal) => call("delete", request, signal)
	};
}
/** Caller getter must resolve the exact currently authorized live Agent, never construct or resume one. */
function nativeMcpResourcePort(tools, caller) {
	const reason = (name) => {
		const agent = caller();
		if (agent === void 0) return "MCP resources require an exact live Agent scope";
		const runtime = tools();
		if (runtime === void 0) return "Tool runtime is not mounted";
		return runtime.get(name, agent) === void 0 ? `Shared resource tool ${name} is not visible in this Agent scope` : void 0;
	};
	return {
		reason,
		execute: async (name, args, signal) => {
			signal.throwIfAborted();
			const agent = caller();
			const runtime = tools();
			if (agent === void 0 || runtime === void 0 || runtime.get(name, agent) === void 0) throw new Error(reason(name) ?? "MCP resource capability changed");
			return runtime.execute({
				callId: ToolCallId$1(`seektty-resource-${randomUUID()}`),
				name,
				arguments: args,
				agent,
				signal
			});
		}
	};
}
function nativeTeamBoardPort(service, caller, readLeadJournal) {
	const reason = () => {
		const value = service();
		if (![
			"membership",
			"listMembers",
			"listTasks"
		].every((name) => method(value, name) !== void 0)) return "Experimental agentTeams service is absent, disabled, or incomplete";
		if (caller() === void 0) return "Team membership requires the exact live Agent; cold Session is not resumed by this view";
	};
	return {
		reason,
		readLeadJournal,
		read: async (signal) => {
			signal.throwIfAborted();
			const missing = reason();
			if (missing !== void 0) throw new Error(missing);
			const value = service();
			const agent = caller();
			const membership = method(value, "membership")(agent);
			if (typeof membership !== "object" || membership === null) throw new Error("Team membership was not confirmed");
			const root = Reflect.get(membership, "root");
			if (typeof root !== "object" || root === null) throw new Error("Team Lead identity was not confirmed");
			return {
				membership: {
					id: Reflect.get(membership, "id"),
					rootSessionId: Reflect.get(root, "id"),
					role: Reflect.get(membership, "role"),
					name: Reflect.get(membership, "name")
				},
				members: method(value, "listMembers")(agent),
				tasks: method(value, "listTasks")(agent)
			};
		}
	};
}
function nativeSubagentDescendantPort(service, open) {
	const reason = () => method(service(), "listDescendants") === void 0 ? "Host subagents.listDescendants service is not mounted; no catalog Remote is synthesized" : void 0;
	return {
		reason,
		open,
		listDescendants: async (rootSessionId, signal) => {
			signal.throwIfAborted();
			const fn = method(service(), "listDescendants");
			if (fn === void 0) throw new Error(reason());
			return await fn(SessionId(rootSessionId), signal);
		}
	};
}

/** Cordis contextual proxies are recreated on access; the published original token owns identity. */
function nativeIdentity(value) {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return value;
	return Reflect.get(value, symbols.original) ?? value;
}
function createOptionalManagementPorts(ctx) {
	const service = (key) => ctx.get(key);
	const caller = (id) => ctx.get("agents")?.get(SessionId(id));
	const team = (id) => nativeTeamBoardPort(() => service("agentTeams"), () => caller(id), async (teamId, signal) => {
		const agent = caller(id);
		const teams = service("agentTeams");
		if (agent === void 0 || teams === void 0 || teams === null) throw new Error("Team scope is unavailable");
		if (typeof Reflect.get(Object(teams), "membership") !== "function") throw new Error("Team membership is unavailable");
		const agentIdentity = nativeIdentity(agent);
		const teamsIdentity = nativeIdentity(teams);
		const requireLead = () => {
			const currentAgent = caller(id);
			const currentTeams = service("agentTeams");
			if (nativeIdentity(currentAgent) !== agentIdentity || nativeIdentity(currentTeams) !== teamsIdentity) throw new Error("Team scope changed");
			const currentMembership = Reflect.get(Object(currentTeams), "membership");
			if (typeof currentMembership !== "function") throw new Error("Team membership is unavailable");
			const value = Reflect.apply(currentMembership, currentTeams, [currentAgent]);
			if (typeof value !== "object" || value === null) throw new Error("Team membership is unconfirmed");
			const root = Reflect.get(value, "root");
			if (typeof root !== "object" || root === null || Reflect.get(root, "id") !== teamId) throw new Error("Team Lead identity changed");
		};
		signal.throwIfAborted();
		requireLead();
		const controller = ctx.get("sessionController");
		if (controller === void 0) throw new Error("Native Session journal reader is unavailable");
		const inspection = await controller.inspect(SessionId(teamId), signal);
		signal.throwIfAborted();
		requireLead();
		if (inspection.meta.id !== teamId) throw new Error("Team journal identity mismatch");
		return {
			teamId,
			events: inspection.events,
			complete: false
		};
	});
	return { optionalViews: {
		mcp: (id) => nativeMcpResourcePort(() => ctx.get("tools"), () => caller(id)),
		team,
		descendants: (open) => nativeSubagentDescendantPort(() => service("subagents"), open),
		scheduleMethods: () => publishedScheduleMethods(ctx.get("typert")?.local, service),
		schedule: nativeScheduleRemote(ctx.typertGateway)
	} };
}

const pkg = "@deepseek-ai/dsh-experimental-api-speech-to-text";
const core = "@deepseek-ai/dsh-experimental-speech-to-text/types#";
const parameter = (name, typeSymbol, optional = false) => ({
	name,
	wire: name,
	source: "json",
	...optional ? { acceptsUndefined: true } : {},
	codec: {
		mode: "strict",
		typeSymbol,
		create: "factory"
	}
});
const shape = (method$1) => ({
	id: `${pkg}#speech/${method$1}`,
	service: "speechController",
	namespace: "speech",
	method: method$1,
	invocation: { kind: "direct" },
	parameters: method$1 === "cancelPreparation" ? [parameter("providerId", `${core}SpeechProviderId`)] : method$1 === "configure" ? [parameter("patch", `${core}SpeechSelectionPatch`)] : method$1 === "prepare" ? [parameter("providerId", `${core}SpeechProviderId`), parameter("options", `${core}SpeechPreparationOptions`, true)] : method$1 === "transcribe" ? [parameter("request", `${pkg}/types#TranscriptionRequest`)] : [],
	...method$1 === "follow" ? { mode: "stream" } : {},
	...method$1 === "follow" || method$1 === "transcribe" ? { cancellation: { parameter: "signal" } } : {},
	result: {
		mode: "strict",
		typeSymbol: method$1 === "catalog" || method$1 === "follow" ? `${pkg}/types#SpeechCatalog` : method$1 === "transcribe" ? `${core}Transcript` : `${pkg}#speech/${method$1}:result`,
		create: "factory"
	}
});
function fingerprint(value) {
	const canonical = (item) => {
		if (typeof item === "function") return "factory";
		if (Array.isArray(item)) return item.map(canonical);
		if (item !== null && typeof item === "object") return Object.fromEntries(Object.entries(item).filter(([key, field]) => key !== "sourceLocation" && field !== void 0).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, field]) => [key, canonical(field)]));
		return item;
	};
	return JSON.stringify(canonical(value));
}
function parse(codec, value) {
	if (codec.mode !== "strict") throw new Error("Published speech strict codec unavailable");
	return codec.create().parse(value);
}
function createWavSpeechPort(ctx, target, current, timeoutMs = 15e3) {
	const bound = { ...target };
	const reason = (method$1) => {
		const scope = current();
		if (!bound.ready || !scope.ready || !bound.sessionId || scope.sessionId !== bound.sessionId || scope.generation !== bound.generation) return "Speech Session/connection changed; refresh";
		try {
			const descriptor$1 = ctx.get("typert")?.local.get(`speech/${method$1}`);
			if (!descriptor$1 || fingerprint(descriptor$1) !== fingerprint(shape(method$1))) return "Published speech descriptor absent or incompatible (tested dsh 0.2.0-rc.2)";
			const receiver = ctx.get("speechController");
			if (!receiver || typeof Reflect.get(Object(receiver), method$1) !== "function" || typeof ctx.get("typertGateway")?.[method$1 === "follow" ? "stream" : "invoke"] !== "function") return "Native speech service/Gateway is not mounted";
		} catch {
			return "Speech capability is unknown";
		}
	};
	const descriptor = (method$1) => {
		const unavailable = reason(method$1);
		if (unavailable) throw new Error(unavailable);
		return ctx.get("typert").local.get(`speech/${method$1}`);
	};
	const invoke = async (method$1, args, signal) => {
		let sent = false, refused = false;
		try {
			return await new RemoteOperationScope().run(async (inner) => {
				const d = descriptor(method$1);
				const wire = Object.fromEntries(d.parameters.map((p) => [p.wire, parse(p.codec, args[p.wire])]));
				inner.throwIfAborted();
				sent = true;
				let value;
				try {
					value = await ctx.get("typertGateway").invoke({
						namespace: "speech",
						method: method$1,
						args: wire,
						signal: inner
					});
				} catch (error) {
					refused = remoteErrorOf(error) !== void 0;
					throw error;
				}
				inner.throwIfAborted();
				descriptor(method$1);
				return parse(d.result, value);
			}, timeoutMs, signal);
		} catch (error) {
			if (method$1 !== "catalog" && sent && !refused) throw new UnknownSpeechOutcome(`speech/${method$1}`, error);
			throw error;
		}
	};
	return {
		reason,
		catalog: (signal) => invoke("catalog", {}, signal),
		configure: (patch, signal) => invoke("configure", { patch }, signal),
		prepare: (providerId, options, signal) => invoke("prepare", {
			providerId,
			options
		}, signal),
		cancelPreparation: (providerId, signal) => invoke("cancelPreparation", { providerId }, signal),
		transcribe: (request, signal) => invoke("transcribe", { request }, signal),
		follow: async function* (signal) {
			const d = descriptor("follow");
			const observation = new AbortController();
			const abort = () => observation.abort(signal.reason);
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
			let iterator;
			try {
				iterator = (await new RemoteOperationScope().run(() => ctx.get("typertGateway").stream({
					namespace: "speech",
					method: "follow",
					args: {},
					signal: observation.signal
				}), timeoutMs, signal))[Symbol.asyncIterator]();
				while (true) {
					const row = await new RemoteOperationScope().run(() => iterator.next(), timeoutMs, signal);
					signal.throwIfAborted();
					descriptor("follow");
					if (row.done) return;
					yield parse(d.result, row.value);
				}
			} finally {
				observation.abort();
				signal.removeEventListener("abort", abort);
				iterator?.return?.().catch(() => {});
			}
		}
	};
}

const ACCOUNT_METHODS = [
	"getState",
	"getBalance",
	"startSignIn",
	"cancelSignIn",
	"hasRunningAccountTasks",
	"signOut"
];
function createNativeIntakePort(ctx) {
	const available = (endpoint) => {
		const descriptor = ctx.get("typert")?.local.get(endpoint);
		if (descriptor === void 0 || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== "direct") return false;
		const receiver = ctx.get(descriptor.service);
		return receiver !== null && receiver !== void 0 && typeof Reflect.get(Object(receiver), descriptor.implementation ?? descriptor.method) === "function";
	};
	const call = async (namespace, method$1, args) => {
		if (!available(`${namespace}/${method$1}`)) throw new Error(`Current Host does not publish ${namespace}/${method$1}`);
		return {
			ok: true,
			value: await ctx.typertGateway.invoke({
				namespace,
				method: method$1,
				args
			})
		};
	};
	return { intake: {
		available,
		model: { session: { modelCatalog: () => call("session", "modelCatalog", {}) } },
		account: () => ACCOUNT_METHODS.every((name) => available(`account/${name}`)) ? { account: {
			getState: () => call("account", "getState", {}),
			getBalance: (client) => call("account", "getBalance", { client }),
			startSignIn: (client, callbackOrigin, loginSource) => call("account", "startSignIn", {
				client,
				callbackOrigin,
				loginSource
			}),
			cancelSignIn: (attemptId) => call("account", "cancelSignIn", { attemptId }),
			hasRunningAccountTasks: () => call("account", "hasRunningAccountTasks", {}),
			signOut: (client) => call("account", "signOut", { client })
		} } : {},
		callbackOrigin: () => {
			const server = ctx.get("webServer");
			if (typeof server !== "object" || server === null) return void 0;
			const port = Reflect.get(server, "port");
			const host = Reflect.get(server, "host");
			if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return void 0;
			if (host !== "127.0.0.1" && host !== "0.0.0.0") return void 0;
			return `http://127.0.0.1:${port}`;
		}
	} };
}

const upload = TYPERT_REMOTE$1.descriptors.find((row) => row.id === "@deepseek-ai/dsh-client-file-upload#fileUploads/upload");
const references = TYPERT_REMOTE.descriptors.find((row) => row.id === "@deepseek-ai/dsh-api-session-controller#fileReferences/list");
function contract(descriptor) {
	const codec = (value) => value.mode === "strict" ? {
		mode: value.mode,
		typeSymbol: value.typeSymbol,
		factory: typeof value.create === "function"
	} : { mode: value.mode };
	return JSON.stringify({
		id: descriptor.id,
		service: descriptor.service,
		namespace: descriptor.namespace,
		method: descriptor.method,
		implementation: descriptor.implementation,
		invocation: descriptor.invocation,
		scope: descriptor.scope,
		mode: descriptor.mode,
		uplink: descriptor.uplink,
		parameters: descriptor.parameters.map((parameter$1) => ({
			name: parameter$1.name,
			wire: parameter$1.wire,
			source: parameter$1.source,
			lookup: parameter$1.lookup,
			acceptsUndefined: parameter$1.acceptsUndefined,
			codec: codec(parameter$1.codec)
		})),
		cancellation: descriptor.cancellation,
		result: codec(descriptor.result)
	});
}
function decode(codec, value) {
	if (codec.mode !== "strict") throw new Error("Expected the published strict file receipt codec");
	return codec.create().parse(value);
}
/** Bind once to the actual current Session generation; create a new port on switch/reconnect. */
function createFileReceiptPort(ctx, target, current, timeoutMs = 15e3) {
	const bound = { ...target };
	const gate = (method$1) => {
		const scope = current();
		if (!bound.ready || !scope?.ready || scope.sessionId !== bound.sessionId || scope.generation !== bound.generation || bound.signal?.aborted || scope.signal?.aborted) return {
			available: false,
			reason: "Attachment Session/connection changed; refresh"
		};
		if (method$1 === "upload" && (bound.files !== true || scope.files !== true)) return {
			available: false,
			reason: "Host Files intake is absent, disabled, or unconfirmed"
		};
		const expected = method$1 === "upload" ? upload : references;
		try {
			const descriptor = ctx.get("typert")?.local.get(`${expected.namespace}/${expected.method}`);
			if (descriptor === void 0 || contract(descriptor) !== contract(expected)) return {
				available: false,
				reason: "Published file receipt descriptor is absent or incompatible (tested dsh 0.2.0-rc.2)"
			};
			const receiver = ctx.get(expected.service);
			if (receiver === void 0 || receiver === null || typeof Reflect.get(Object(receiver), expected.implementation ?? expected.method) !== "function" || typeof ctx.get("typertGateway")?.invoke !== "function") return {
				available: false,
				reason: "Native file receipt service/Gateway is not mounted"
			};
		} catch {
			return {
				available: false,
				reason: "Native file receipt capability is unknown"
			};
		}
		return { available: true };
	};
	const invoke = async (method$1, agentId, args, signal) => {
		if (agentId !== bound.sessionId) throw new Error("File receipt port cannot target another Session");
		const descriptor = method$1 === "upload" ? upload : references;
		const signals = [
			signal,
			bound.signal,
			current()?.signal
		].filter((value) => value !== void 0);
		let dispatched = false;
		let refused = false;
		try {
			return await new RemoteOperationScope().run(async (inner) => {
				const admission = gate(method$1);
				if (!admission.available) throw new Error(admission.reason);
				const wire = Object.fromEntries(descriptor.parameters.map((parameter$1) => [parameter$1.wire, decode(parameter$1.codec, args[parameter$1.wire])]));
				inner.throwIfAborted();
				dispatched = true;
				let value;
				try {
					value = await ctx.typertGateway.invoke({
						namespace: descriptor.namespace,
						method: descriptor.method,
						args: wire,
						signal: inner
					});
				} catch (error) {
					refused = remoteErrorOf(error) !== void 0;
					throw error;
				}
				inner.throwIfAborted();
				if (!gate(method$1).available) throw new Error("Attachment result belongs to an obsolete Session/capability; upload outcome not confirmed");
				return {
					ok: true,
					value: decode(descriptor.result, value)
				};
			}, timeoutMs, signals.length === 0 ? void 0 : AbortSignal.any(signals));
		} catch (error) {
			if (method$1 === "upload" && dispatched && !refused) throw new Error(`File upload outcome unknown; refresh before any explicit retry: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
			throw error;
		}
	};
	return {
		gate,
		remote: {
			fileUploads: { upload: (agentId, request, signal) => invoke("upload", agentId, {
				agentId,
				request
			}, signal) },
			fileReferences: { list: (agentId, query, signal) => invoke("references", agentId, {
				agentId,
				query
			}, signal) }
		}
	};
}

const openDescriptor = TYPERT_REMOTE.descriptors.find((row) => row.id === "@deepseek-ai/dsh-api-session-controller#session/openWorkspacePath");
function descriptorContract(d) {
	const codec = (c) => c.mode === "strict" ? {
		mode: c.mode,
		typeSymbol: c.typeSymbol,
		factory: typeof c.create === "function"
	} : { mode: c.mode };
	return JSON.stringify({
		id: d.id,
		service: d.service,
		namespace: d.namespace,
		method: d.method,
		implementation: d.implementation,
		invocation: d.invocation,
		scope: d.scope,
		mode: d.mode,
		uplink: d.uplink,
		parameters: d.parameters.map((p) => ({
			name: p.name,
			wire: p.wire,
			source: p.source,
			lookup: p.lookup,
			acceptsUndefined: p.acceptsUndefined,
			codec: codec(p.codec)
		})),
		cancellation: d.cancellation,
		result: codec(d.result)
	});
}
function original(value) {
	return typeof value === "object" && value !== null ? Reflect.get(value, symbols.original) ?? value : value;
}
function createFileIntakeManagement(ctx) {
	const owners = /* @__PURE__ */ new WeakMap();
	let generation = 0;
	const read = (sessionId) => {
		const agents = ctx.get("agents"), agent = agents?.get(SessionId(sessionId));
		const live = agent !== void 0 && agent.id === sessionId && agents?.roots().some((root) => original(root) === original(agent)) === true;
		const rawAgent = original(agent), uploads = original(ctx.get("fileUploads"));
		const store = original(agent?.ctx.get("attachments"));
		const key = live && typeof rawAgent === "object" && rawAgent !== null ? rawAgent : void 0;
		let owner = key === void 0 ? void 0 : owners.get(key);
		if (key !== void 0 && (owner === void 0 || owner.uploads !== uploads || owner.store !== store)) {
			owner = {
				uploads,
				store,
				generation: ++generation,
				token: {}
			};
			owners.set(key, owner);
		}
		const files = store instanceof AttachmentStore && store.saveFile !== AttachmentStore.prototype.saveFile;
		return {
			scope: {
				sessionId: SessionId(sessionId),
				generation: owner?.generation ?? -1,
				ready: live && ctx.get("typertGateway") !== void 0,
				files
			},
			...owner === void 0 ? {} : { owner: owner.token }
		};
	};
	return { fileReceipts: { forSession: (sessionId) => {
		const port = () => {
			return createFileReceiptPort(ctx, read(sessionId).scope, () => read(sessionId).scope);
		};
		return {
			owner: () => read(sessionId).owner,
			reason: () => port().gate("upload").reason,
			referencesReason: () => port().gate("references").reason,
			remote: {
				fileUploads: { upload: (id, request, signal) => port().remote.fileUploads.upload(id, request, signal) },
				fileReferences: { list: (id, query, signal) => port().remote.fileReferences.list(id, query, signal) },
				session: { openWorkspacePath: async (request, signal) => {
					signal?.throwIfAborted();
					const scope = read(sessionId);
					if (!scope.scope.ready) throw new Error("Exact live ordinary Agent is unavailable");
					const endpoint = ctx.get("typert")?.local.get("session/openWorkspacePath");
					if (endpoint === void 0 || descriptorContract(endpoint) !== descriptorContract(openDescriptor)) throw new Error("Native external file opening is unavailable");
					const result = openDescriptor.result, parameter$1 = openDescriptor.parameters[0].codec;
					if (result.mode !== "strict" || parameter$1.mode !== "strict") throw new Error("Native external-open codec is unknown");
					const value = result.create().parse(await ctx.typertGateway.invoke({
						namespace: "session",
						method: "openWorkspacePath",
						args: { request: parameter$1.create().parse(request) },
						...signal === void 0 ? {} : { signal }
					}));
					signal?.throwIfAborted();
					if (read(sessionId).owner !== scope.owner) throw new Error("External file opening outcome unknown: Agent changed");
					return {
						ok: true,
						value
					};
				} }
			}
		};
	} } };
}

const answerIdentity = "@deepseek-ai/dsh-user-questions#userQuestions/answer";
/** Published rc.2 unary contract. Diagnostic source positions are not invocation identity. */
function nativeAnswerDescriptor(descriptor) {
	if (descriptor === void 0 || descriptor.id !== answerIdentity || descriptor.namespace !== "userQuestions" || descriptor.service !== "userQuestions" || descriptor.method !== "answer" || (descriptor.implementation ?? descriptor.method) !== "answer" || descriptor.mode !== void 0 || descriptor.invocation.kind !== "direct" || descriptor.cancellation !== void 0 || descriptor.uplink !== void 0 || descriptor.scope?.context !== "agent" || descriptor.scope.wire !== "agentId" || descriptor.parameters.length !== 3) return false;
	const contract$1 = [
		[
			"agent",
			"agentId",
			"lookup",
			"agent",
			"@deepseek-ai/dsh-session/types#SessionId"
		],
		[
			"callId",
			"callId",
			"json",
			void 0,
			"@deepseek-ai/dsh-llm/brand#ToolCallId"
		],
		[
			"answer",
			"answer",
			"json",
			void 0,
			"@deepseek-ai/dsh-user-questions/types#AskUserQuestionAnswer"
		]
	];
	if (!descriptor.parameters.every((parameter$1, index) => {
		const expected = contract$1[index];
		return parameter$1.name === expected[0] && parameter$1.wire === expected[1] && parameter$1.source === expected[2] && parameter$1.lookup === expected[3] && parameter$1.acceptsUndefined === void 0 && strictCodec(parameter$1.codec, expected[4]);
	}) || !strictCodec(descriptor.result, `${answerIdentity}:result`)) return false;
	try {
		const invalidIds = [
			void 0,
			null,
			0,
			true,
			[],
			{}
		];
		return boundaryMatches(descriptor.parameters[0].codec, ["synthetic-owner"], invalidIds) && boundaryMatches(descriptor.parameters[1].codec, ["synthetic-call"], invalidIds) && boundaryMatches(descriptor.parameters[2].codec, [{ answers: [] }, { answers: [{
			id: "synthetic",
			selected: ["one"],
			custom: "text"
		}] }], [
			void 0,
			null,
			{},
			{ answers: "bad" },
			{ answers: [{
				id: 1,
				selected: []
			}] },
			{ answers: [{
				id: "synthetic",
				selected: "bad"
			}] },
			{ answers: [{
				id: "synthetic",
				selected: [],
				custom: false
			}] }
		]) && boundaryMatches(descriptor.result, [true, false], [
			void 0,
			null,
			0,
			1,
			"true",
			[],
			{},
			{ success: true }
		]);
	} catch {
		return false;
	}
}
function strictCodec(codec, typeSymbol) {
	return codec.mode === "strict" && codec.typeSymbol === typeSymbol && typeof codec.create === "function" && codec.decode === void 0 && codec.encode === void 0;
}
function boundaryMatches(codec, valid, invalid) {
	if (codec.mode !== "strict") return false;
	const schema = codec.create();
	for (const value of valid) if (JSON.stringify(schema.parse(value)) !== JSON.stringify(value)) return false;
	for (const value of invalid) try {
		schema.parse(value);
		return false;
	} catch {}
	return true;
}
function continuedQuestionHostGate(local, service, agents, selectedSessionId) {
	const methods = local === void 0 ? void 0 : /* @__PURE__ */ new Set();
	const descriptor = local?.get("userQuestions/answer");
	if (nativeAnswerDescriptor(descriptor)) {
		const receiver = service("userQuestions");
		if (typeof receiver === "object" && receiver !== null && typeof Reflect.get(receiver, "answer") === "function") methods?.add("userQuestions/answer");
	}
	if (agents === void 0) return {
		methods,
		liveRoot: void 0,
		liveRootReason: "Exact live root Agent registry is unavailable"
	};
	const agent = agents.get(selectedSessionId);
	if (agent === void 0) return {
		methods,
		liveRoot: false,
		liveRootReason: "CALLER_NOT_LIVE: selected Session has no exact live Agent; this view does not resume one"
	};
	if (!agents.roots().includes(agent)) return {
		methods,
		liveRoot: false,
		liveRootReason: "DELEGATED_CALLER: selected Agent is owned by another live Agent"
	};
	return {
		methods,
		liveRoot: true
	};
}
/** Uses only the published answer invocation; attachWait is intentionally not claimed by this background view. */
function nativeContinuedQuestionRemote(gateway) {
	return { answer: async (agentId, callId, answer) => {
		const value = await gateway.invoke({
			namespace: "userQuestions",
			method: "answer",
			args: {
				agentId,
				callId,
				answer
			}
		});
		if (typeof value !== "boolean") throw new Error("Native answer returned an unknown receipt");
		return {
			ok: true,
			value
		};
	} };
}

function createContinuedQuestionPorts(ctx) {
	const gate = (sessionId) => continuedQuestionHostGate(ctx.get("typert")?.local, (name) => ctx.get(name), ctx.get("agents"), SessionId(sessionId));
	const native = nativeContinuedQuestionRemote(ctx.typertGateway);
	return { continuedQuestions: {
		gate,
		attachWait: async function* (sessionId, callId, signal) {
			const current = gate(sessionId);
			const service = ctx.get("userQuestions");
			const agent = ctx.get("agents")?.get(SessionId(sessionId));
			if (signal.aborted) return;
			if (current.liveRoot !== true || !current.methods?.has("userQuestions/answer") || !(service instanceof UserQuestionService) || agent === void 0) throw new Error("Native foreground question wait is unavailable");
			yield* service.attachWait(agent, ToolCallId(callId), signal);
		},
		remote: { answer: async (agentId, callId, answer) => {
			const current = gate(agentId);
			if (current.liveRoot !== true || current.methods?.has("userQuestions/answer") !== true) throw new Error(current.liveRootReason ?? "Native continued-question answer contract is unavailable");
			return native.answer(agentId, callId, answer);
		} }
	} };
}

const MARKETPLACE_NAMESPACE = "tui-plugin-marketplace";
const TUI_BUNDLE = "seektty";
const NON_TUI_SURFACE_BUNDLES = ["@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-headless"];
const NPM_SOURCE = Object.freeze({
	id: "npm",
	kind: "npm",
	label: "npm Registry",
	url: "https://registry.npmjs.org/",
	enabled: true,
	builtIn: true,
	rowKey: "builtin:npm"
});
const CatalogSourceSchema = z$1.object({
	id: z$1.string().required(),
	label: z$1.string().required(),
	url: z$1.string().required(),
	enabled: z$1.boolean().default(true),
	credentialRef: z$1.string().role("credential-ref").default("")
});
const MarketplaceSettingsSchema = z$1.object({ sources: z$1.array(CatalogSourceSchema).default([]) });
const ThemeColorSchema = z$1.string().pattern(/^#[0-9A-Fa-f]{6}$/u);
const ThemeUiColorsSchema = z$1.object({
	text: ThemeColorSchema.required(),
	muted: ThemeColorSchema.required(),
	border: ThemeColorSchema.required(),
	brand: ThemeColorSchema.required(),
	accent: ThemeColorSchema.required(),
	success: ThemeColorSchema.required(),
	warning: ThemeColorSchema.required(),
	danger: ThemeColorSchema.required(),
	canvas: ThemeColorSchema.required(),
	surface: ThemeColorSchema.required(),
	selection: ThemeColorSchema.required()
}).required();
const SyntaxThemeColorsSchema = z$1.object({
	background: ThemeColorSchema.required(),
	foreground: ThemeColorSchema.required(),
	comment: ThemeColorSchema.required(),
	keyword: ThemeColorSchema.required(),
	string: ThemeColorSchema.required(),
	number: ThemeColorSchema.required(),
	constant: ThemeColorSchema.required(),
	function: ThemeColorSchema.required(),
	type: ThemeColorSchema.required(),
	variable: ThemeColorSchema.required(),
	property: ThemeColorSchema.required(),
	parameter: ThemeColorSchema.required(),
	operator: ThemeColorSchema.required(),
	punctuation: ThemeColorSchema.required(),
	tag: ThemeColorSchema.required(),
	attribute: ThemeColorSchema.required(),
	regexp: ThemeColorSchema.required()
}).required();
const TextMateRuleSchema = z$1.object({
	scope: z$1.array(z$1.string().min(1).max(256)).min(1).max(64).required(),
	foreground: ThemeColorSchema,
	background: ThemeColorSchema,
	fontStyle: z$1.array(z$1.union([
		"bold",
		"italic",
		"underline",
		"strikethrough"
	])).max(4)
});
const CustomThemeSchema = z$1.object({
	id: z$1.string().pattern(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u).max(48).required(),
	name: z$1.string().min(1).max(80).pattern(/^[^\u0000-\u001F\u007F-\u009F]+$/u).required(),
	tone: z$1.union(["dark", "light"]).required(),
	source: z$1.union([
		"manual",
		"palette",
		"vscode"
	]).required(),
	remoteSource: z$1.object({ url: z$1.string().max(2048).pattern(/^https:\/\/[^\s#]+$/u) }),
	colors: ThemeUiColorsSchema,
	syntax: SyntaxThemeColorsSchema,
	tokenColors: z$1.array(TextMateRuleSchema).max(MAX_TEXTMATE_RULES).default([])
});
function localeDescription(copy) {
	return copy;
}
const AppearanceSettingsSchema = z$1.object({
	theme: z$1.string().pattern(/^(?:dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u).default(DEFAULT_TUI_THEME).description(localeDescription({
		zh: "SeekTTY 当前使用的界面主题。",
		en: "The interface theme currently used by SeekTTY."
	})),
	codeTheme: z$1.string().pattern(/^(?:auto|dark|light|custom:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$/u).default(DEFAULT_TUI_CODE_THEME).description(localeDescription({
		zh: "代码块独立主题；auto 跟随当前界面主题。",
		en: "Independent code-block theme; auto follows the current interface theme."
	})),
	backgroundMode: z$1.union([
		"theme",
		"terminal",
		"explicit",
		"foreground"
	]).default(DEFAULT_TUI_BACKGROUND_MODE).description(localeDescription({
		zh: "旧版外观组合（兼容读取）：主题颜色＋终端效果、跟随终端、显式铺底或原色 RGB。新设置分别控制显色、铺底与终端背景同步。",
		en: "Legacy appearance preset: theme with terminal effects, follow terminal, explicit fill, or original RGB. New settings independently control encoding, fill and terminal background sync."
	})),
	colorMode: z$1.union(["auto", "rgb"]).description(localeDescription({
		zh: "显色方式：auto 自动检测；rgb 直接输出主题原色。未设置时沿用旧组合。禁色优先。",
		en: "Color rendering: auto detection or original RGB. When absent, inherit the legacy preset. Color suppression takes priority."
	})),
	backgroundFill: z$1.union(["terminal", "theme"]).description(localeDescription({
		zh: "背景呈现：沿用终端或主题铺底；不改变显色，不依赖 OSC 11。",
		en: "Background fill: inherit terminal or paint theme backgrounds. Independent of color rendering and OSC 11."
	})),
	terminalBackgroundSync: z$1.union(["off", "theme"]).description(localeDescription({
		zh: "终端背景同步（高级）：关闭，或在支持时尝试 OSC 11 同步主题底色。",
		en: "Terminal background sync (advanced): off, or attempt OSC 11 theme synchronization when supported."
	})),
	customThemes: z$1.array(CustomThemeSchema).max(MAX_CUSTOM_THEMES).default([]).description(localeDescription({
		zh: "SeekTTY 命名自定义主题。",
		en: "Named custom SeekTTY themes."
	}))
});
const WelcomeTextSchema = z$1.string().max(MAX_WELCOME_TEXT_LENGTH);
const WelcomeRowSchema = z$1.union([
	z$1.object({
		kind: z$1.union(["heading"]).required(),
		text: WelcomeTextSchema.required()
	}),
	z$1.object({
		kind: z$1.union(["text"]).required(),
		text: WelcomeTextSchema.required()
	}),
	z$1.object({
		kind: z$1.union(["field"]).required(),
		label: WelcomeTextSchema.required(),
		value: WelcomeTextSchema.required()
	}),
	z$1.object({
		kind: z$1.union(["fact"]).required(),
		fact: z$1.union([
			"seekttyVersion",
			"profile",
			"workspace",
			"model",
			"reasoning",
			"mode",
			"permission",
			"theme",
			"platform"
		]).required(),
		label: WelcomeTextSchema
	}),
	z$1.object({ kind: z$1.union(["separator"]).required() }),
	z$1.object({ kind: z$1.union(["blank"]).required() }),
	z$1.object({ kind: z$1.union(["palette"]).required() })
]);
const SafeFastfetchModuleSchema = z$1.union([
	"os",
	"host",
	"kernel",
	"uptime",
	"packages",
	"shell",
	"display",
	"de",
	"wm",
	"terminal",
	"terminalfont",
	"cpu",
	"gpu",
	"memory",
	"swap",
	"disk",
	"battery",
	"locale",
	"theme",
	"colors"
]);
/** Profile-scoped, live-applied startup presentation settings. */
const WelcomeSettingsSchema = z$1.object({
	infoMode: z$1.union([
		"custom",
		"fastfetch",
		"mixed"
	]).default(DEFAULT_TUI_WELCOME.infoMode).description(localeDescription({
		zh: "空会话欢迎页的信息来源。",
		en: "Information source for the empty-session welcome page."
	})),
	mixedOrder: z$1.union(["custom-first", "fastfetch-first"]).default(DEFAULT_TUI_WELCOME.mixedOrder).description(localeDescription({
		zh: "混合模式下自定义信息与 Fastfetch 信息的顺序。",
		en: "Order of custom and Fastfetch blocks in mixed mode."
	})),
	customRows: z$1.array(WelcomeRowSchema).max(MAX_WELCOME_ROWS).default([...DEFAULT_TUI_WELCOME.customRows]).description(localeDescription({
		zh: "欢迎页的结构化自定义信息。请使用 /welcome 编辑。",
		en: "Structured custom welcome content. Edit it with /welcome."
	})),
	logo: z$1.object({
		source: z$1.union([
			"builtin",
			"file",
			"fastfetch",
			"none"
		]).default(DEFAULT_TUI_WELCOME.logo.source),
		colorMode: z$1.union(["original", "theme"]).default(DEFAULT_TUI_WELCOME.logo.colorMode),
		largePath: z$1.string().max(2048).default(""),
		compactPath: z$1.string().max(2048).default("")
	}).default({ ...DEFAULT_TUI_WELCOME.logo }).description(localeDescription({
		zh: "内置或用户提供的终端文本 Logo；SeekTTY 不转换普通图片。",
		en: "Built-in or user-provided terminal-text logo; SeekTTY does not convert ordinary images."
	})),
	fastfetch: z$1.object({
		source: z$1.union(["safe", "user-config"]).default(DEFAULT_TUI_WELCOME.fastfetch.source),
		modules: z$1.array(SafeFastfetchModuleSchema).max(20).default([...DEFAULT_TUI_WELCOME.fastfetch.modules]),
		configPath: z$1.string().max(2048).default("")
	}).default({
		...DEFAULT_TUI_WELCOME.fastfetch,
		modules: [...DEFAULT_TUI_WELCOME.fastfetch.modules]
	}).description(localeDescription({
		zh: "可选 Fastfetch 数据源；用户配置可能执行 command 模块。",
		en: "Optional Fastfetch source; user configuration may execute command modules."
	}))
});
const BehaviorSettingsSchema = z$1.object({
	workProcessDisplay: z$1.union([
		"compact",
		"standard",
		"detailed",
		"verbose",
		"normal",
		"expanded"
	]).loose().description(localeDescription({
		zh: "工作过程显示；留空保留现有终端偏好。",
		en: "Work-process display; leave unset to preserve existing terminal preferences."
	})),
	toolCards: z$1.union([
		"collapsed",
		"expanded",
		"hidden"
	]).default(DEFAULT_TUI_BEHAVIOR.toolCards).description(localeDescription({
		zh: "工具卡片默认形态；启动时应用到当前会话。",
		en: "Default tool-card shape; applied to the current session at startup."
	})),
	showReasoning: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.showReasoning).description(localeDescription({
		zh: "推理内容默认是否显示。",
		en: "Whether reasoning is shown by default."
	})),
	desktopNotifications: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.desktopNotifications).description(localeDescription({
		zh: "回合完成或待审批时发送终端桌面通知。",
		en: "Send a desktop notification when a turn completes or an approval is pending."
	})),
	followTerminalTitle: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.followTerminalTitle).description(localeDescription({
		zh: "终端标题跟随当前会话运行状态。",
		en: "Follow the current session status in the terminal title."
	})),
	composerHistoryLimit: z$1.natural().max(MAX_COMPOSER_HISTORY).default(DEFAULT_TUI_BEHAVIOR.composerHistoryLimit).description(localeDescription({
		zh: "输入历史持久化条数；0 表示关闭。",
		en: "Number of persisted composer history entries; 0 disables history."
	})),
	statusElapsed: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.statusElapsed).description(localeDescription({
		zh: "状态栏显示当前回合实时耗时。",
		en: "Show live elapsed time for the current turn in the status bar."
	})),
	clipboardFallback: z$1.union([
		"auto",
		"osc52",
		"off"
	]).default(DEFAULT_TUI_BEHAVIOR.clipboardFallback).description(localeDescription({
		zh: "OSC 52 失败后的剪贴板回退命令；auto 按平台探测。",
		en: "Clipboard fallback after OSC 52 fails; auto probes the platform."
	})),
	toolOutputLineLimit: z$1.natural().max(MAX_TOOL_OUTPUT_LINE_LIMIT).default(DEFAULT_TUI_BEHAVIOR.toolOutputLineLimit).description(localeDescription({
		zh: "展开态工具输出单块行数上限；0 表示不折叠。",
		en: "Line cap for one expanded tool-output block; 0 means no folding."
	})),
	diffContextLines: z$1.natural().max(MAX_DIFF_CONTEXT_LINES).default(DEFAULT_TUI_BEHAVIOR.diffContextLines).description(localeDescription({
		zh: "Diff 上下文行数。",
		en: "Number of diff context lines."
	})),
	dangerConfirmDefault: z$1.union(["cancel", "confirm"]).default(DEFAULT_TUI_BEHAVIOR.dangerConfirmDefault).description(localeDescription({
		zh: "危险确认默认焦点；cancel 表示回车不执行。",
		en: "Default focus for danger confirmation; cancel means Enter does not proceed."
	})),
	mouseMode: z$1.union(["full", "native"]).default(DEFAULT_TUI_BEHAVIOR.mouseMode).description(localeDescription({
		zh: "完整模式使用备用屏幕、应用内滚动和点击；终端原生模式把完整对话交给终端滚动记录。",
		en: "Full mode uses the alternate screen with in-app scrolling and clicks; terminal-native mode writes the full conversation to terminal scrollback."
	})),
	hoverFeedback: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.hoverFeedback).description(localeDescription({
		zh: "完整鼠标模式下高亮当前指针所在的可交互目标。",
		en: "Highlight the interactive target under the pointer in full mouse mode."
	})),
	scrollbarVisibility: z$1.union(["always", "hidden"]).default(DEFAULT_TUI_BEHAVIOR.scrollbarVisibility).description(localeDescription({
		zh: "对话区内部滚动条是否始终显示。",
		en: "Whether the in-transcript scrollbar is always visible."
	})),
	copyOnSelect: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.copyOnSelect).description(localeDescription({
		zh: "鼠标松开选区后自动写入剪贴板。",
		en: "Write the clipboard automatically when a mouse selection is released."
	})),
	wheelScrollLines: z$1.natural().min(1).max(MAX_WHEEL_SCROLL_LINES).default(DEFAULT_TUI_BEHAVIOR.wheelScrollLines).description(localeDescription({
		zh: "每个滚轮刻度滚动的行数。",
		en: "Lines scrolled per mouse-wheel detent."
	})),
	wheelAcceleration: z$1.boolean().default(DEFAULT_TUI_BEHAVIOR.wheelAcceleration).description(localeDescription({
		zh: "连续同向滚轮刻度加速滚动。",
		en: "Accelerate consecutive same-direction wheel detents."
	})),
	keyBindings: keyBindingsSchema().default({}).description(localeDescription({
		zh: "覆盖默认快捷键；键为绑定 id，值为 Ctrl+P 这类组合。空对象表示使用默认键位。",
		en: "Override default shortcuts; keys are binding ids and values are chords such as Ctrl+P. An empty object uses the defaults."
	}))
});
const ComposerHistorySettingsSchema = z$1.object({ entries: z$1.array(z$1.string().max(1e5)).max(MAX_COMPOSER_HISTORY).default([]) });
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
/**
* Cache a full Settings describe() so one() and namespaced reads do not reserialize
* every namespace on the Host event loop.
* @param load - redacted descriptors from Harness Settings.
*/
function createSettingsDescribeCache(load, fingerprint$1) {
	let cached;
	let cachedFingerprint;
	const all = (bypass = false) => {
		const stamp = fingerprint$1?.();
		if (bypass || cached === void 0 || stamp !== void 0 && stamp !== cachedFingerprint) {
			cached = load();
			cachedFingerprint = stamp;
		}
		return cached;
	};
	const one = (namespace, options) => {
		const document = all(options?.bypassCache === true).find((row) => row.namespace === namespace);
		if (document === void 0) throw new Error(ui(`设置命名空间 ${JSON.stringify(namespace)} 已卸载`, `Settings namespace ${JSON.stringify(namespace)} is no longer available`));
		return document;
	};
	return {
		describe(namespace, options) {
			if (namespace === void 0) return all(options?.bypassCache === true);
			return [one(namespace, options)];
		},
		one,
		invalidate() {
			cached = void 0;
			cachedFingerprint = void 0;
		}
	};
}
function sessionMarkdownFilename(sessionId) {
	return `${sessionId.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 120) || "session"}.md`;
}
function textStream(text) {
	return new ReadableStream({ start(controller) {
		controller.enqueue(Buffer.from(text, "utf8"));
		controller.close();
	} });
}
function validateCatalogSource(source) {
	if (source.builtIn || source.kind !== "catalog") throw new Error(ui("内置 npm Source 不能写入用户来源", "The built-in npm Source cannot be written as a user source"));
	if (!/^[a-z][a-z0-9-]*$/.test(source.id) || source.id === NPM_SOURCE.id) throw new Error(ui(`Catalog Source id ${JSON.stringify(source.id)} 必须是唯一的小写 kebab-case`, `Catalog Source id ${JSON.stringify(source.id)} must be a unique lowercase kebab-case value`));
	if (source.label.trim() === "" || source.url.trim() === "") throw new Error(ui("Catalog Source 名称和 URL 不能为空", "Catalog Source name and URL cannot be empty"));
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
function storedIndexFromRowKey(rowKey) {
	const match = /^stored:(\d+)$/u.exec(rowKey ?? "");
	if (match === null) return void 0;
	return Number(match[1]);
}
function degradedCatalogSource(raw, index, diagnostic) {
	const record = typeof raw === "object" && raw !== null ? raw : {};
	const id = typeof record.id === "string" && record.id.trim() !== "" ? record.id.trim() : `invalid-${String(index)}`;
	const label = typeof record.label === "string" && record.label.trim() !== "" ? record.label.trim() : id;
	const url = typeof record.url === "string" ? redactMarketplaceUrl(record.url) : "";
	return {
		id,
		kind: "catalog",
		label: ui(`${label}（无效）`, `${label} (invalid)`),
		url,
		enabled: false,
		builtIn: false,
		diagnostic,
		rowKey: `stored:${String(index)}`
	};
}
/**
* Read stored catalog rows, disabling invalid ones instead of locking the marketplace.
* @param stored - Settings-persisted catalog rows.
* @param reservedIds - built-in and Provider source ids that must stay unique.
*/
function catalogSourcesFromStored(stored, reservedIds) {
	const seen = new Set(reservedIds);
	const sources = [];
	for (const [index, raw] of stored.entries()) {
		const record = typeof raw === "object" && raw !== null ? raw : {};
		const rawId = typeof record.id === "string" ? record.id : "";
		if (rawId !== "" && seen.has(rawId)) {
			sources.push(degradedCatalogSource(raw, index, ui(`Catalog Source ${rawId} 与内置或 Provider Source 冲突`, `Catalog Source ${rawId} conflicts with a built-in or Provider Source`)));
			continue;
		}
		try {
			const storedSource = validateCatalogSource({
				id: typeof record.id === "string" ? record.id : "",
				kind: "catalog",
				label: typeof record.label === "string" ? record.label : "",
				url: typeof record.url === "string" ? record.url : "",
				enabled: record.enabled !== false,
				...typeof record.credentialRef === "string" && record.credentialRef !== "" ? { credentialRef: record.credentialRef } : {},
				builtIn: false
			});
			if (seen.has(storedSource.id)) {
				sources.push(degradedCatalogSource(raw, index, ui(`Catalog Source ${storedSource.id} 与内置或 Provider Source 冲突`, `Catalog Source ${storedSource.id} conflicts with a built-in or Provider Source`)));
				continue;
			}
			seen.add(storedSource.id);
			sources.push({
				id: storedSource.id,
				kind: "catalog",
				label: storedSource.label,
				url: storedSource.url,
				enabled: storedSource.enabled,
				...storedSource.credentialRef === "" ? {} : { credentialRef: storedSource.credentialRef },
				builtIn: false,
				rowKey: `stored:${String(index)}`
			});
		} catch (error) {
			sources.push(degradedCatalogSource(raw, index, error instanceof Error ? error.message : String(error)));
		}
	}
	return sources;
}
function tuiProfile(summary) {
	if (!summary.compatible || summary.bundles.includes(TUI_BUNDLE)) return summary;
	return {
		...summary,
		compatible: false,
		diagnostic: ui("Profile 未组合 TUI Surface；可以复制为新的 TUI Profile，但不能由 deepseek 直接启动", "This Profile does not compose a TUI Surface; copy it into a new TUI Profile instead of launching it with deepseek")
	};
}
async function mutateSettings(settings, namespace, ops, expectedRevision) {
	try {
		await settings.mutate(namespace, ops, expectedRevision);
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
	if (manager === void 0) throw new Error(ui("tui-runner: Settings、Credentials 或 Profile Plugin Manager 未装配", "tui-runner: Settings, Credentials, or the Profile Plugin Manager is not mounted"));
	const marketplace = new PluginMarketplace({
		cwd,
		resolveCredential: async (ref) => (await credentials.resolve(credentialRef(ref)))?.value,
		...providers === void 0 ? {} : { providers }
	});
	let settingsGeneration = 0;
	const documents = createSettingsDescribeCache(() => settings.describe({ redactSecrets: true }).map(settingsDocument), () => String(settingsGeneration));
	ctx.on("settings/document-updated", () => {
		settingsGeneration += 1;
		documents.invalidate();
	});
	const sourceSnapshot = () => {
		const document = documents.one(MARKETPLACE_NAMESPACE);
		const value = document.value;
		const stored = catalogSourcesFromStored(value.sources, new Set([NPM_SOURCE.id, ...(providers?.sources() ?? []).map((source) => source.id)]));
		return {
			revision: document.revision,
			sources: [
				NPM_SOURCE,
				...providers?.sources() ?? [],
				...stored
			]
		};
	};
	const downloadSessionLog = async (sessionId, includeDescendants, signal) => {
		return exportSession(ctx, sessionId, includeDescendants, signal ?? new AbortController().signal);
	};
	const terminalExtensions = ctx.get("seekttyExtensions");
	return {
		...createSessionManagementPorts(ctx),
		...terminalExtensions === void 0 ? {} : { terminalExtensions },
		...createOptionalManagementPorts(ctx),
		...createNativeIntakePort(ctx),
		wavSpeech: { forScope: (scope, current) => createWavSpeechPort(ctx, scope, current) },
		...createFileIntakeManagement(ctx),
		...createContinuedQuestionPorts(ctx),
		privacy: { snapshot: () => Promise.resolve(readPrivacySnapshot(ctx)) },
		sessionExport: {
			download: downloadSessionLog,
			markdown: async (sessionId, signal) => {
				const snapshot = await readSessionConversation(sessionExportSource(ctx), sessionId, signal ?? new AbortController().signal);
				const markdown = conversationMarkdown(snapshot.title, snapshot.nodes);
				const encoded = Buffer.from(markdown, "utf8");
				return {
					suggestedFilename: sessionMarkdownFilename(sessionId),
					mediaType: "text/markdown",
					contentLength: encoded.byteLength,
					stream: textStream(markdown)
				};
			}
		},
		sessionFiles: { index: async (sessionId, signal) => {
			return (await readSessionConversation(sessionExportSource(ctx), sessionId, signal ?? new AbortController().signal)).producedFiles;
		} },
		settings: {
			describe: (namespace, options) => Promise.resolve(documents.describe(namespace, options)),
			mutate: async (namespace, ops, expectedRevision) => {
				try {
					await mutateSettings(settings, namespace, ops, expectedRevision);
				} catch (error) {
					documents.invalidate();
					throw error;
				}
				documents.invalidate();
				return documents.one(namespace);
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
			create: async (name, copyFrom) => tuiProfile(await manager.createUsableProfile(name, copyFrom, {
				addBundles: [TUI_BUNDLE],
				removeBundles: NON_TUI_SURFACE_BUNDLES
			}))
		},
		plugins: {
			snapshot: () => Promise.resolve(manager.snapshot()),
			run: async (args, options = {}) => {
				const result = await manager.run(args, {
					...options.signal === void 0 ? {} : { signal: options.signal },
					...options.onOutput === void 0 ? {} : { onOutput: options.onOutput }
				});
				const secrets = installerSecrets();
				return {
					exitCode: result.exitCode,
					stdout: redactInstallerText(result.stdout, secrets),
					stderr: redactInstallerText(result.stderr, secrets),
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
				const currentStored = documents.one(MARKETPLACE_NAMESPACE).value.sources;
				const catalog = [];
				for (const source of sources.filter((source$1) => !source$1.builtIn)) {
					if (source.diagnostic !== void 0) {
						const index = storedIndexFromRowKey(source.rowKey);
						const raw = index === void 0 ? void 0 : currentStored[index];
						if (typeof raw === "object" && raw !== null) catalog.push(raw);
						continue;
					}
					catalog.push(validateCatalogSource(source));
				}
				if (new Set(catalog.map((source) => source.id)).size !== catalog.length) throw new Error(ui("Catalog Source id 不能重复", "Catalog Source IDs must be unique"));
				const reserved = new Set([NPM_SOURCE.id, ...(providers?.sources() ?? []).map((source) => source.id)]);
				const conflict = catalog.find((source) => reserved.has(source.id));
				if (conflict !== void 0) throw new Error(ui(`Catalog Source ${conflict.id} 与内置或 Provider Source 冲突`, `Catalog Source ${conflict.id} conflicts with a built-in or Provider Source`));
				await mutateSettings(settings, MARKETPLACE_NAMESPACE, [{
					op: "set",
					path: ["sources"],
					value: catalog
				}], expectedRevision);
				documents.invalidate();
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
		},
		jobs: { kill: (id) => Promise.resolve(killHostJob(ctx.get("jobs"), id)) },
		welcome: {
			collectFastfetch,
			collectFastfetchLogo
		}
	};
}

export { toAssistantBlock as C, _usingCtx as E, EMPTY_CONVERSATION_VIEWS as S, toolPresenterScope as T, keyBindingsIssue as _, WelcomeSettingsSchema as a, sanitizeKeyBindings as b, isStoppableJob as c, UnknownSpeechOutcome as d, SURFACE_KEYMAP as f, helpKeymapText as g, consumeRunningInterrupt as h, MarketplaceSettingsSchema as i, jobElapsedMs as l, bindingKeysLabel as m, BehaviorSettingsSchema as n, createTuiManagementBridge as o, applyKeyBindingOverrides as p, ComposerHistorySettingsSchema as r, sanitizeColorAnsiText as s, AppearanceSettingsSchema as t, jobKillNotice as u, matchesBinding as v, toAssistantBlocks as w, EMPTY_CHAT_SNAPSHOT as x, normalizeChord as y };