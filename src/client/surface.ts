/** Interactive pi-tui lifecycle over the authoritative Harness Client Runtime. */

import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Box,
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
  type Terminal,
} from '@mariozechner/pi-tui'
import type { TuiStartOptions, TuiSurfaceHandle, TuiSurfaceOutcome } from './index.ts'
import { startTuiClient, type TuiClient } from './client-runtime.ts'
import { capabilityError, type TuiActiveSession } from './capabilities.ts'
import { HarnessAutocompleteProvider } from './autocomplete.ts'
import { commandOf, TuiActions } from './actions.ts'
import {
  BottomAnchoredLayout,
  ContextBar,
  PromptEditor,
  StatusBar,
  transcriptViewportRows,
} from './chrome.ts'
import { appearanceSettings, themeFromAppearance } from './appearance.ts'
import { behaviorFromSettings, behaviorSettings } from './behavior.ts'
import {
  composerHistoryPath,
  loadComposerHistory,
  rememberComposerHistory,
  saveComposerHistory,
} from './composer-history.ts'
import {
  localeFromSettings,
  setUiLocale,
  translateUiText,
  ui,
  uiLocale,
} from './locale.ts'
import { OverlayQueue } from './overlays.ts'
import { SyntaxHighlighter } from './syntax-highlighter.ts'
import { background, color, escapeTerminalText, setCodeHighlighter, setTheme } from './theme.ts'
import { Transcript } from './transcript.ts'
import { formatElapsed } from './elapsed.ts'
import { writeClipboard } from './clipboard.ts'
import { captureClipboardImage } from './clipboard-image.ts'
import {
  desktopNotifyBody,
  desktopNotifySequence,
  nextDesktopNotify,
  type DesktopNotifySnapshot,
} from './desktop-notify.ts'
import { sessionTerminalTitle } from './terminal-title.ts'
import { applyKeyBindingOverrides, matchesBinding } from './keymap.ts'

/** Replaceable terminal seams used by virtual-terminal tests. */
export const internals: {
  createTerminal(): Terminal
  isInteractive(): boolean
  reportCleanupError(error: Error): void
  startClient(options: TuiStartOptions): Promise<TuiClient>
} = {
  createTerminal: () => new ProcessTerminal(),
  isInteractive: () => process.stdin.isTTY && process.stdout.isTTY,
  reportCleanupError: (error) => {
    process.stderr.write(`${escapeTerminalText(ui(
      `deepseek: 终端清理失败：${error.message}`,
      `deepseek: terminal cleanup failed: ${error.message}`,
    ))}\n`)
  },
  startClient: startTuiClient,
}

type NoticeTone = 'info' | 'success' | 'warning' | 'error'

const BRACKETED_PASTE = /^\u001B\[200~([\s\S]*)\u001B\[201~$/u
const IMAGE_PATH_SUFFIX = /\.(?:gif|jpe?g|png|webp)$/iu

function pastedImagePath(data: string): string | undefined {
  const match = BRACKETED_PASTE.exec(data)
  if (match === null) return undefined
  let candidate = (match[1] ?? '').trim()
  if (candidate === '' || candidate.includes('\n') || candidate.includes('\r') || candidate.includes('\0')) {
    return undefined
  }
  const quoted = (candidate.startsWith('"') && candidate.endsWith('"'))
    || (candidate.startsWith("'") && candidate.endsWith("'"))
  if (quoted) candidate = candidate.slice(1, -1)
  const pathLike = quoted
    || candidate.startsWith('/')
    || candidate.startsWith('./')
    || candidate.startsWith('../')
    || candidate.startsWith('~/')
    || candidate.startsWith('~\\')
    || candidate.startsWith('file://')
    || /^[A-Za-z]:[\\/]/u.test(candidate)
    || candidate.startsWith('\\\\')
    || !/\s/u.test(candidate)
  if (!pathLike) return undefined
  const suffixTarget = candidate.startsWith('file://')
    ? (() => {
      try { return new URL(candidate).pathname } catch { return '' }
    })()
    : candidate
  return IMAGE_PATH_SUFFIX.test(suffixTarget) ? candidate : undefined
}

function noticeText(message: string, tone: NoticeTone): string {
  const text = translateUiText(message)
  switch (tone) {
    case 'success': return color.success(text)
    case 'warning': return color.warning(text)
    case 'error': return color.danger(text)
    case 'info': return color.brand(text)
  }
}

/**
 * Start the interactive Surface after the Host bridge is available.
 * @param options - in-process API, RPC carrier, and launch target.
 * @returns idempotent lifecycle handle.
 */
export async function startTuiSurface(options: TuiStartOptions): Promise<TuiSurfaceHandle> {
  if (!internals.isInteractive()) {
    throw new Error(ui(
      '需要交互式 TTY；非交互任务请使用 dsh --profile headless',
      'An interactive TTY is required; use dsh --profile headless for non-interactive tasks',
    ))
  }
  const settingsDocuments = await options.management.settings.describe()
  setUiLocale(localeFromSettings(settingsDocuments))
  const terminal = internals.createTerminal()
  const client = await internals.startClient(options)
  let stopConstructedTui = (): void => undefined
  let disposeConstructedSyntax = (): void => undefined
  try {
    const initialTheme = themeFromAppearance(appearanceSettings(settingsDocuments))
    const initialBehavior = behaviorFromSettings(behaviorSettings(settingsDocuments))
    applyKeyBindingOverrides(initialBehavior.keyBindings)
    setTheme(initialTheme)
    const tui = new TUI(terminal, true)
    stopConstructedTui = () => {
      tui.stop()
    }
    const capabilities = client.capabilities
    let stopping: Promise<void> | undefined
    let active: TuiActiveSession | undefined
    const profile = options.profile ?? 'tui'
    const contextBar = new ContextBar(profile, options.cwd)
    const editor = new PromptEditor(tui)
    const historyPath = composerHistoryPath(profile)
    const historyLimit = initialBehavior.composerHistoryLimit
    let composerHistory = loadComposerHistory(historyPath, historyLimit)
    for (const entry of [...composerHistory].reverse()) editor.addToHistory(entry)
    let transcriptFocused = false
    const transcript = new Transcript(
      // The default full transcript becomes normal terminal scrollback, which keeps
      // native drag selection, Command+C, and wheel scrolling under terminal control.
      () => transcriptFocused
        ? transcriptViewportRows(terminal.rows, editor.render(terminal.columns).length)
        : Number.POSITIVE_INFINITY,
      () => { if (stopping === undefined) tui.requestRender() },
      () => {
        const current = active
        if (current === undefined) return
        const snapshot = current.session.getSnapshot()
        if (snapshot.hasMore && !snapshot.loadingOlder) void current.session.loadOlder()
      },
    )
    transcript.applyPresentationDefaults(
      initialBehavior.toolCards,
      initialBehavior.showReasoning,
      initialBehavior.toolOutputLineLimit,
    )
    const syntax = await SyntaxHighlighter.create(initialTheme, () => {
      transcript.refreshPresentation()
      tui.invalidate()
      tui.requestRender(true)
    })
    disposeConstructedSyntax = () => { syntax.dispose() }
    setCodeHighlighter((code, lang) => syntax.highlight(code, lang))
    const status = new StatusBar()
    const canvas = new Box(0, 0, background.canvas)
    if (options.draft !== undefined) editor.setText(escapeTerminalText(options.draft))
    canvas.addChild(new BottomAnchoredLayout(
      () => terminal.rows,
      contextBar,
      transcript,
      editor,
      status,
      () => transcript.isEmptyState(),
    ))
    tui.addChild(canvas)
    tui.setFocus(editor)

    const overlays = new OverlayQueue(tui)
    let resolveClosed: (outcome: TuiSurfaceOutcome) => void = () => undefined
    const closed = new Promise<TuiSurfaceOutcome>((resolve) => { resolveClosed = resolve })
    let exitArmedUntil = 0
    let latestSessionId = ''
    let notice: { message: string; tone: NoticeTone } | undefined
    let restartRequired: string | undefined
    let headerGeneration = 0
    let runningSince: number | undefined
    let elapsedTimer: ReturnType<typeof setInterval> | undefined
    let notifySnapshot: DesktopNotifySnapshot = { running: false, pending: [] }
    let notifyPrimed = false

    const focusEditor = (): void => {
      transcriptFocused = false
      tui.setFocus(editor)
    }

    const renderWhileOpen = (): void => {
      if (stopping === undefined) tui.requestRender()
    }

    const updateTranscript = (current: TuiActiveSession): void => {
      transcript.update(current.session.getSnapshot(), async (attachment) => {
        const result = await current.session.readAttachment(attachment.attachmentId)
        if (!result.ok) throw new Error(ui(
          `图片读取失败：${result.error.message}`,
          `Failed to load image: ${result.error.message}`,
        ))
        return {
          attachment: result.value.attachment,
          data: Buffer.from(result.value.data).toString('base64'),
        }
      })
    }

    const setNotice = (message: string, tone: NoticeTone = 'info'): void => {
      if (stopping !== undefined) return
      notice = { message, tone }
      updateStatus()
      renderWhileOpen()
    }

    const applyTerminalTitle = (): void => {
      const snapshot = active?.session.getSnapshot()
      terminal.setTitle(sessionTerminalTitle({
        follow: initialBehavior.followTerminalTitle,
        sessionTitle: active?.summary.displayTitle ?? '',
        running: snapshot?.running === true,
        pendingApproval: snapshot?.pending.some(wait => wait.kind === 'approval') === true,
      }))
    }

    let actions!: TuiActions

    const updateStatus = (): void => {
      if (stopping !== undefined) return
      const snapshot = active?.session.getSnapshot()
      if (snapshot?.running === true) {
        runningSince ??= Date.now()
        if (elapsedTimer === undefined && initialBehavior.statusElapsed) {
          elapsedTimer = setInterval(() => {
            if (stopping !== undefined) return
            updateStatus()
            renderWhileOpen()
          }, 500)
        }
      } else {
        runningSince = undefined
        if (elapsedTimer !== undefined) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
      }
      if (snapshot === undefined) {
        notifySnapshot = { running: false, pending: [] }
        notifyPrimed = false
        status.setDetail(color.warning(translateUiText('未打开会话')))
        applyTerminalTitle()
        return
      }
      const currentNotify: DesktopNotifySnapshot = {
        running: snapshot.running,
        pending: snapshot.pending.map(wait => ({ key: wait.key, kind: wait.kind })),
      }
      if (initialBehavior.desktopNotifications) {
        const kind = nextDesktopNotify(notifySnapshot, currentNotify, notifyPrimed)
        if (kind !== undefined) {
          terminal.write(desktopNotifySequence(desktopNotifyBody(kind, uiLocale())))
        }
      }
      notifySnapshot = currentNotify
      notifyPrimed = true
      const pendingCount = snapshot.pending.length
      const generating = initialBehavior.statusElapsed && runningSince !== undefined
        ? `生成中 · ${formatElapsed(Date.now() - runningSince)} · Ctrl+C 停止`
        : '生成中 · Ctrl+C 停止'
      const primary = snapshot.removed
        ? color.danger(translateUiText('会话已删除'))
        : snapshot.promptError !== null
          ? color.danger(translateUiText(`${snapshot.promptError.op === 'send' ? '发送' : '停止'}失败：${snapshot.promptError.error.message}`))
          : pendingCount > 0
            ? color.warning(translateUiText(`/pending 处理 ${String(pendingCount)} 项交互`))
            : snapshot.running
              ? color.accent(translateUiText(generating))
              : undefined
      const facts: string[] = []
      if (snapshot.queue.length > 0) facts.push(translateUiText(`队列 ${String(snapshot.queue.length)}`))
      const jobs = active === undefined ? undefined : capabilities.jobs()
      const jobCount = jobs?.filter(job => job.status === 'running' || job.status === 'stopping').length ?? 0
      if (jobCount > 0) facts.push(translateUiText(`后台 ${String(jobCount)}`))
      const todos = active?.session.projections.faceOf('todos').getSnapshot()
      if (Array.isArray(todos) && todos.length > 0) facts.push(translateUiText(`任务 ${String(todos.length)}`))
      const plan = active?.session.projections.faceOf('plan').getSnapshot()
      if (typeof plan === 'object' && plan !== null && 'active' in plan && plan.active === true) facts.push('Plan')
      const goal = active?.session.projections.faceOf('goal').getSnapshot()
      if (goal !== null && goal !== undefined) facts.push(translateUiText('目标'))
      const attachmentCount = capabilities.draftAttachments().length
      if (attachmentCount > 0) facts.push(translateUiText(`图片 ${String(attachmentCount)}`))
      const allowedTools = actions.sessionAllowlistCount()
      if (allowedTools > 0) {
        facts.push(ui(`自动允许 ${String(allowedTools)} 个工具`, `Auto-allow ${String(allowedTools)} tool(s)`))
      }
      if (restartRequired !== undefined) facts.push(translateUiText('需要重启'))
      const secondary = notice === undefined
        ? [primary, facts.length === 0 ? undefined : color.muted(facts.join(' · '))]
          .filter((value): value is string => value !== undefined)
          .join(' · ') || undefined
        : noticeText(notice.message, notice.tone)
      status.setDetail(secondary)
      applyTerminalTitle()
    }

    const refreshHeader = (forceModel = false): void => {
      const generation = ++headerGeneration
      void capabilities.headerFacts(forceModel).then((facts) => {
        if (stopping !== undefined || generation !== headerGeneration) return
        contextBar.setFacts({
          ...facts,
          ...(runningSince === undefined ? {} : { runningSince }),
          statusElapsed: initialBehavior.statusElapsed,
        })
        editor.setFacts(facts)
        status.setPermission(facts.permission)
        renderWhileOpen()
      }, (error: unknown) => {
        if (stopping !== undefined || generation !== headerGeneration) return
        contextBar.setError(profile, capabilityError(error))
        renderWhileOpen()
      })
    }

    const refresh = (): void => {
      const current = capabilities.active()
      if (current === undefined) {
        active = undefined
        headerGeneration += 1
        contextBar.setEmpty(profile, options.cwd)
        editor.setEmpty()
        status.setPermission('workspace-write')
        transcript.empty('当前没有打开的会话；使用 /workspace 或 /new 继续。')
        editor.disableSubmit = false
        updateStatus()
        renderWhileOpen()
        return
      }
      active = current
      const snapshot = current.session.getSnapshot()
      updateTranscript(current)
      actions.syncPending(snapshot)
      editor.disableSubmit = false
      updateStatus()
      renderWhileOpen()
    }

    const close = (outcome: TuiSurfaceOutcome): Promise<void> => {
      if (stopping !== undefined) return stopping
      stopping = (async () => {
        const failures: unknown[] = []
        if (elapsedTimer !== undefined) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
        overlays.dispose()
        transcript.dispose()
        setCodeHighlighter(undefined)
        try { syntax.dispose() } catch (error) { failures.push(error) }
        try { unsubscribeActive() } catch (error) { failures.push(error) }
        try {
          await terminal.drainInput(250, 30)
        } catch (error) {
          failures.push(error)
        }
        try {
          tui.stop()
        } catch (error) {
          failures.push(error)
        }
        try {
          await client.ctx.fiber.dispose()
        } catch (error) {
          failures.push(error)
        }
        resolveClosed(failures.length === 0 ? outcome : { kind: 'exit', code: 1 })
        if (failures.length > 0) {
          const error = failures.length === 1 && failures[0] instanceof Error
            ? failures[0]
            : new AggregateError(failures, 'multiple terminal cleanup operations failed')
          try { internals.reportCleanupError(error) } catch { /* diagnostics must not break cleanup */ }
        }
      })()
      return stopping
    }

    actions = new TuiActions(capabilities, {
      overlays,
      transcript,
      notice: setNotice,
      refresh,
      refreshHeader: () => { refreshHeader(false) },
      applyTheme: (theme) => {
        setTheme(theme)
        syntax.setTheme(theme)
        transcript.refreshPresentation()
        tui.invalidate()
        tui.requestRender(true)
      },
      applyLocale: (locale) => {
        setUiLocale(locale)
        transcript.refreshPresentation()
        refreshHeader(false)
        refresh()
        tui.invalidate()
        tui.requestRender(true)
      },
      applyBehavior: (behavior) => {
        applyKeyBindingOverrides(behavior.keyBindings)
      },
      setEditor: (text) => {
        editor.setText(escapeTerminalText(text))
        focusEditor()
        renderWhileOpen()
      },
      copy: (text) => {
        writeClipboard(text, {
          fallback: initialBehavior.clipboardFallback,
          platform: process.platform,
          writeOsc52: sequence => { terminal.write(sequence) },
        })
      },
      close: (code) => { void close({ kind: 'exit', code }) },
      restart: (profile, restartNotice) => {
        const current = capabilities.active()
        const draft = editor.getExpandedText()
        void close({
          kind: 'restart',
          request: {
            profile,
            cwd: current?.workspacePath ?? options.cwd,
            ...(current === undefined ? {} : { resume: current.sessionId }),
            ...(draft === '' ? {} : { draft }),
            attachmentPaths: capabilities.draftAttachments().map(item => item.path),
            notice: restartNotice,
          },
        })
      },
      requireRestart: (message) => {
        restartRequired = message
        setNotice(`${message}；可输入 /restart 稍后重启`, 'warning')
      },
    })

    const unsubscribeActive = capabilities.subscribeActive((current, snapshot) => {
      if (stopping !== undefined) return
      if (current === undefined || snapshot === undefined) {
        active = undefined
        latestSessionId = ''
        headerGeneration += 1
        transcript.empty('当前没有打开的会话；使用 /workspace 或 /new 继续。')
        editor.disableSubmit = false
        contextBar.setEmpty(profile, options.cwd)
        editor.setEmpty()
        updateStatus()
        renderWhileOpen()
        return
      }
      active = current
      updateTranscript(current)
      actions.syncPending(snapshot)
      editor.disableSubmit = false
      if (latestSessionId !== current.sessionId) {
        latestSessionId = current.sessionId
        notice = undefined
        refreshHeader(true)
      } else {
        refreshHeader(false)
      }
      updateStatus()
      renderWhileOpen()
    })

    editor.setAutocompleteProvider(new HarnessAutocompleteProvider(capabilities, (message) => {
      setNotice(`命令目录：${message}`, 'error')
    }))

    const sendPrompt = async (text: string, mode: 'queue' | 'steer' = 'queue'): Promise<boolean> => {
      const current = capabilities.active()
      if (current === undefined) {
        setNotice('当前没有打开的会话', 'error')
        if (text !== '' && editor.getText() === '') editor.setText(text)
        return false
      }
      const content = capabilities.promptContent(text)
      if (content.length === 0) return false
      const result = await current.session.prompt(content, mode)
      if (!result.ok) {
        setNotice(`${mode === 'steer' ? '引导' : '发送'}失败：${result.error.message}`, 'error')
        if (text !== '' && editor.getText() === '') editor.setText(text)
        return false
      }
      capabilities.clearAttachments()
      notice = undefined
      updateStatus()
      return true
    }

    const dispatchCommand = async (line: string): Promise<void> => {
      const trimmed = line.trim()
      const separator = trimmed.search(/\s/u)
      const token = separator === -1 ? trimmed : trimmed.slice(0, separator)
      const name = token.slice(1)
      const args = separator === -1 ? '' : trimmed.slice(separator + 1)
      try {
        const catalog = await capabilities.commandCatalog()
        if (stopping !== undefined) return
        const command = commandOf(catalog, name)
        if (command === undefined) {
          const near = catalog.filter(candidate => candidate.name.includes(name)).slice(0, 3)
          setNotice(`未知命令 /${name}${near.length === 0 ? '' : `；可能是 ${near.map(item => `/${item.name}`).join('、')}`}`, 'warning')
          return
        }
        if (command.behavior === 'local') {
          await actions.execute(name, args)
          return
        }
        const current = capabilities.active()
        if (current === undefined) throw new Error('当前没有打开的会话')
        if (command.behavior === 'skill') {
          await sendPrompt(trimmed, 'queue')
          return
        }
        const result = await current.session.command(trimmed)
        if (!result.ok) setNotice(`命令失败：${result.error.message}`, 'error')
        else if (!result.value.matched) setNotice(`未识别命令 /${name}`, 'warning')
        else setNotice(`已执行 /${name}`, 'success')
      } catch (error) {
        setNotice(capabilityError(error), 'error')
      }
    }

    editor.onSubmit = (raw): void => {
      // pi-tui expands large-paste markers before invoking onSubmit and clears
      // its editor state before this callback returns. The callback value is
      // therefore the only lossless submission payload.
      const text = raw.trim()
      if (text === '' && capabilities.draftAttachments().length === 0) return
      transcript.followLatest()
      if (text !== '') {
        editor.addToHistory(text)
        composerHistory = rememberComposerHistory(composerHistory, text, historyLimit)
        if (historyLimit > 0) {
          try { saveComposerHistory(historyPath, composerHistory) } catch { /* send must not wait on disk */ }
        }
      }
      editor.setText('')
      if (text.startsWith('/')) void dispatchCommand(text)
      else void sendPrompt(text)
    }

    const attachPastedImage = (path: string, fallbackText: string): { consume: true } => {
      void capabilities.addAttachment(path).then((attachment) => {
        const dimensions = attachment.width === undefined ? '' : ` · ${attachment.width}×${attachment.height}`
        setNotice(ui(
          `已从粘贴加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`,
          `Attached ${attachment.name} from paste · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`,
        ), 'success')
      }, (error: unknown) => {
        if (fallbackText !== '') editor.insertTextAtCursor(escapeTerminalText(fallbackText))
        setNotice(ui(
          `粘贴图片未加入：${capabilityError(error)}${fallbackText === '' ? '' : '；路径已保留为文本'}`,
          `Pasted image was not attached: ${capabilityError(error)}${fallbackText === '' ? '' : '; the path was kept as text'}`,
        ), 'warning')
      })
      return { consume: true }
    }

    tui.addInputListener((data) => {
      if (overlays.hasActive()) return undefined
      const attachmentPath = pastedImagePath(data)
      if (!transcriptFocused && attachmentPath !== undefined) {
        return attachPastedImage(attachmentPath, BRACKETED_PASTE.exec(data)?.[1] ?? attachmentPath)
      }
      const paste = BRACKETED_PASTE.exec(data)
      if (!transcriptFocused && paste !== null) {
        const content = paste[1] ?? ''
        if (content.trim() === '') {
          const dest = join(tmpdir(), `seektty-paste-${randomUUID()}.png`)
          const captured = captureClipboardImage({ platform: process.platform, dest })
          if (captured !== undefined) return attachPastedImage(captured, '')
        }
        const safeContent = escapeTerminalText(content)
        if (safeContent !== content) {
          return { data: `\u001B[200~${safeContent}\u001B[201~` }
        }
      }
      if (matchesBinding('focusToggle', data) && (transcriptFocused || editor.getText() === '')) {
        transcript.cancelSearch()
        transcriptFocused = !transcriptFocused
        tui.setFocus(transcriptFocused ? transcript : editor)
        setNotice(transcriptFocused ? '对话浏览 · Tab/Escape 返回输入' : '已返回输入区', 'info')
        return { consume: true }
      }
      if (transcriptFocused && matchesKey(data, Key.escape)) {
        if (transcript.cancelSearch()) {
          setNotice('已取消查找', 'info')
          return { consume: true }
        }
        focusEditor()
        setNotice('已返回输入区', 'info')
        return { consume: true }
      }
      if (transcriptFocused && (matchesKey(data, Key.enter) || data === '\r' || data === '\n')) {
        const action = transcript.activateFocused()
        if (action?.kind === 'example') {
          focusEditor()
          void sendPrompt(action.text)
          return { consume: true }
        }
        if (action?.kind === 'tool') {
          refresh()
          return { consume: true }
        }
      }
      if (matchesBinding('cyclePermission', data)) {
        void actions.cyclePermission()
        return { consume: true }
      }
      if (matchesBinding('help', data)) {
        void actions.help()
        return { consume: true }
      }
      if (matchesBinding('commandPalette', data)) {
        void actions.commandPalette()
        return { consume: true }
      }
      if (matchesBinding('historySearch', data)) {
        if (historyLimit <= 0) {
          setNotice('输入历史已关闭', 'info')
          return { consume: true }
        }
        if (composerHistory.length === 0) {
          setNotice('没有可搜索的输入历史', 'info')
          return { consume: true }
        }
        void overlays.select({
          title: '输入历史',
          detail: '选择一条历史输入填入编辑器',
          searchable: true,
          choices: composerHistory.map((entry, index) => ({
            id: String(index),
            label: entry.replace(/\s+/gu, ' ').slice(0, 80) || '(空)',
          })),
          options: { width: '90%', maxHeight: '90%', anchor: 'center', margin: 1 },
        }).then((selected) => {
          if (selected === undefined || stopping !== undefined) return
          const entry = composerHistory[Number(selected.id)]
          if (entry === undefined) return
          editor.setText(escapeTerminalText(entry))
          focusEditor()
          renderWhileOpen()
        })
        return { consume: true }
      }
      // Legacy terminals encode both Enter and Ctrl+M as CR. Only an extended
      // keyboard protocol can identify Ctrl+M without stealing every submit.
      if (matchesBinding('model', data)) {
        void actions.execute('model', '')
        return { consume: true }
      }
      if (matchesBinding('sessions', data)) {
        void actions.execute('sessions', '')
        return { consume: true }
      }
      if (matchesBinding('toolsDisplay', data)) {
        void actions.execute('tools', 'display')
        return { consume: true }
      }
      if (matchesBinding('reasoning', data)) {
        const visible = transcript.toggleReasoning()
        setNotice(`推理内容：${visible ? '显示' : '隐藏'}`, 'info')
        refresh()
        return { consume: true }
      }
      if (matchesBinding('previousTurn', data) || matchesBinding('nextTurn', data)) {
        if (!transcriptFocused) {
          transcriptFocused = true
          tui.setFocus(transcript)
        }
        const offset = matchesBinding('previousTurn', data) ? -1 : 1
        const moved = transcript.navigateTurn(offset)
        setNotice(
          moved ? `已跳到${offset < 0 ? '上一个' : '下一个'}用户轮次` : '没有可跳转的用户轮次',
          moved ? 'info' : 'warning',
        )
        return { consume: true }
      }
      if (matchesBinding('settings', data)) {
        void actions.execute('settings', '')
        return { consume: true }
      }
      if (matchesKey(data, Key.escape) && notice !== undefined && editor.getText() === '') {
        notice = undefined
        updateStatus()
        renderWhileOpen()
        return { consume: true }
      }
      if (!matchesBinding('interrupt', data)) return undefined
      const current = capabilities.active()
      if (current !== undefined && current.session.getSnapshot().running) {
        void current.session.cancel()
        return { consume: true }
      }
      if (editor.getText() !== '' || capabilities.draftAttachments().length > 0) {
        editor.setText('')
        capabilities.clearAttachments()
        setNotice('已清空输入草稿', 'info')
        return { consume: true }
      }
      const now = Date.now()
      if (now <= exitArmedUntil) {
        void close({ kind: 'exit', code: 0 })
        return { consume: true }
      }
      exitArmedUntil = now + 1_500
      setNotice('再按一次 Ctrl+C 退出', 'warning')
      return { consume: true }
    })

    applyTerminalTitle()
    tui.start()
    refreshHeader(true)
    refresh()
    if (options.startupNotice !== undefined) setNotice(options.startupNotice, 'success')
    if (options.attachmentPaths !== undefined && options.attachmentPaths.length > 0) {
      void (async () => {
        const failures: string[] = []
        for (const path of options.attachmentPaths ?? []) {
          try { await capabilities.addAttachment(path) } catch (error) { failures.push(`${path}: ${capabilityError(error)}`) }
        }
        if (failures.length === 0) setNotice(`已恢复 ${options.attachmentPaths?.length ?? 0} 个附件`, 'success')
        else setNotice(`部分附件未恢复：${failures.join('；')}`, 'warning')
        refresh()
      })()
    }
    if (options.task !== undefined) {
      void sendPrompt(options.task).catch((error: unknown) => {
        setNotice(`发送初始任务失败：${capabilityError(error)}`, 'error')
      })
    }
    return { closed, stop: () => close({ kind: 'exit', code: 0 }) }
  } catch (error) {
    setCodeHighlighter(undefined)
    try { disposeConstructedSyntax() } catch { /* preserve the setup failure */ }
    try { stopConstructedTui() } catch { /* preserve the setup failure */ }
    try {
      await client.ctx.fiber.dispose()
    } catch { /* preserve the setup failure */ }
    throw error
  }
}
