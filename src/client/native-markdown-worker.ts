import { parentPort } from 'node:worker_threads'
import { Markdown, wrapTextWithAnsi, setCapabilities, type TerminalCapabilities } from '@mariozechner/pi-tui'
import { Transcript, renderNativeCode, type NativePreparedRow, type NativePreparedRows } from './transcript.ts'
import { applyMarkdownPresentation, escapeTerminalText, markdownTheme, setCodeHighlighter, type MarkdownPresentation } from './theme.ts'
import { SyntaxHighlighter } from './syntax-highlighter.ts'

// Uses the same patched pi-tui 0.73.1 parser, selection projection and theme as
// the UI. Whole-document link/list/table semantics are not approximated.
const port = parentPort!
let lines: string[] = []
let offset = 0
function page(): void {
  const next = lines.slice(offset, offset + 256)
  offset += next.length
  port.postMessage({ lines: next, done: offset === lines.length, total: lines.length })
  if (offset === lines.length) lines = []
}
port.on('message', async (request: { next?: boolean; source: string; row?: NativePreparedRow; rows?: NativePreparedRows; first: boolean; width: number; tailRows?: number; presentation: MarkdownPresentation; capabilities: TerminalCapabilities }) => {
  try {
    if (request.next) { page(); return }
    applyMarkdownPresentation(request.presentation)
    setCapabilities(request.capabilities)
    const syntax = await SyntaxHighlighter.create(request.presentation.theme, () => {})
    try {
      setCodeHighlighter((code, language, background) => syntax.highlight(code, language, background))
      const render = () => request.rows ? Transcript.prepareNativeRows(request.rows, request.width, request.first)
        : request.row?.format === 'code' ? renderNativeCode(request.row, request.width)
        : request.row?.format === 'plain' ? wrapTextWithAnsi(escapeTerminalText(request.source).replace(/\t/gu, '   '), request.width)
        : new Markdown(escapeTerminalText(request.source), 0, 0, markdownTheme).renderUnpadded(request.width)
      lines = render()
      if (await syntax.finishPendingLanguages()) lines = render()
    } finally { syntax.dispose() }
    if (request.tailRows !== undefined) {
      port.postMessage({ lines: lines.slice(-request.tailRows), done: true, total: lines.length })
      lines = []
    } else page()
  } catch (error) { port.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
})
