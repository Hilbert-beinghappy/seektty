import { At as wrapTextWithAnsi, E as setCodeHighlighter, S as escapeTerminalText, T as markdownTheme, _t as Markdown, g as applyMarkdownPresentation, n as renderNativeCode, p as SyntaxHighlighter, t as Transcript, wt as setCapabilities } from "./transcript-CT56UlgZ.js";
import "./locale-Bf-LPk7P.js";
import "./startup-trace-C21NRsLn.js";
import { parentPort } from "node:worker_threads";

const port = parentPort;
let lines = [];
let offset = 0;
function page() {
	const next = lines.slice(offset, offset + 256);
	offset += next.length;
	port.postMessage({
		lines: next,
		done: offset === lines.length,
		total: lines.length
	});
	if (offset === lines.length) lines = [];
}
port.on("message", async (request) => {
	try {
		if (request.next) {
			page();
			return;
		}
		applyMarkdownPresentation(request.presentation);
		setCapabilities(request.capabilities);
		const syntax = await SyntaxHighlighter.create(request.presentation.theme, () => {});
		try {
			setCodeHighlighter((code, language, background) => syntax.highlight(code, language, background));
			const render = () => request.rows ? Transcript.prepareNativeRows(request.rows, request.width, request.first) : request.row?.format === "code" ? renderNativeCode(request.row, request.width) : request.row?.format === "plain" ? wrapTextWithAnsi(escapeTerminalText(request.source).replace(/\t/gu, "   "), request.width) : new Markdown(escapeTerminalText(request.source), 0, 0, markdownTheme).renderUnpadded(request.width);
			lines = render();
			if (await syntax.finishPendingLanguages()) lines = render();
		} finally {
			syntax.dispose();
		}
		if (request.tailRows !== void 0) {
			port.postMessage({
				lines: lines.slice(-request.tailRows),
				done: true,
				total: lines.length
			});
			lines = [];
		} else page();
	} catch (error) {
		port.postMessage({ error: error instanceof Error ? error.message : String(error) });
	}
});

export {  };