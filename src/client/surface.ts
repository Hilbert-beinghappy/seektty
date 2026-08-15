/** Interactive pi-tui lifecycle over the authoritative Harness Client Runtime. */

import {
  Box,
  Key,
  matchesKey,
  ProcessTerminal,
  Spacer,
  TUI,
  type Terminal,
} from '@mariozechner/pi-tui'
import type { TuiStartOptions, TuiSurfaceHandle, TuiSurfaceOutcome } from './index.ts'
import { startTuiClient, type TuiClient } from './client-runtime.ts'
import { capabilityError, type TuiActiveSession } from './capabilities.ts'
import { HarnessAutocompleteProvider } from './autocomplete.ts'
import { commandOf, TuiActions } from './actions.ts'
import { ContextBar, PromptEditor, StatusBar, transcriptViewportRows } from './chrome.ts'
import { appearanceSettings, themeFromAppearance } from './appearance.ts'
import {
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  isMouseInput,
  mouseWheelDirection,
} from './mouse.ts'
import { OverlayQueue } from './overlays.ts'
import { background, color, escapeTerminalText, setTheme } from './theme.ts'
import { Transcript } from './transcript.ts'

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
    process.stderr.write(`${escapeTerminalText(`deepseek: 终端清理失败：${error.message}`)}\n`)
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
  switch (tone) {
    case 'success': return color.success(message)
    case 'warning': return color.warning(message)
    case 'error': return color.danger(message)
    case 'info': return color.brand(message)
  }
}

/**
 * Start the interactive Surface after the Host bridge is available.
 * @param options - in-process API, RPC carrier, and launch target.
 * @returns idempotent lifecycle handle.
 */
export async function startTuiSurface(options: TuiStartOptions): Promise<TuiSurfaceHandle> {
  if (!internals.isInteractive()) {
    throw new Error('需要交互式 TTY；非交互任务请使用 dsh --profile headless')
  }
  const terminal = internals.createTerminal()
  const client = await internals.startClient(options)
  let mouseTrackingEnabled = false
  const disableMouseTracking = (): void => {
    if (!mouseTrackingEnabled) return
    mouseTrackingEnabled = false
    terminal.write(DISABLE_MOUSE_TRACKING)
  }
  let stopConstructedTui = (): void => undefined
  try {
    setTheme(themeFromAppearance(appearanceSettings(
      await options.management.settings.describe(),
    )))
    const tui = new TUI(terminal, true)
    stopConstructedTui = () => {
      disableMouseTracking()
      tui.stop()
    }
    const capabilities = client.capabilities
    let stopping: Promise<void> | undefined
    let active: TuiActiveSession | undefined
    const profile = options.profile ?? 'tui'
    const contextBar = new ContextBar(profile, options.cwd)
    const editor = new PromptEditor(tui)
    const transcript = new Transcript(
      () => transcriptViewportRows(terminal.rows, editor.render(terminal.columns).length),
      () => { if (stopping === undefined) tui.requestRender() },
      () => {
        const current = active
        if (current === undefined) return
        const snapshot = current.session.getSnapshot()
        if (snapshot.hasMore && !snapshot.loadingOlder) void current.session.loadOlder()
      },
    )
    const status = new StatusBar()
    const canvas = new Box(0, 0, background.canvas)
    if (options.draft !== undefined) editor.setText(escapeTerminalText(options.draft))
    canvas.addChild(contextBar)
    canvas.addChild(new Spacer(1))
    canvas.addChild(transcript)
    canvas.addChild(new Spacer(1))
    canvas.addChild(editor)
    canvas.addChild(status)
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
    let transcriptFocused = false

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
        if (!result.ok) throw new Error(`图片读取失败：${result.error.message}`)
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

    const updateStatus = (): void => {
      if (stopping !== undefined) return
      const snapshot = active?.session.getSnapshot()
      if (snapshot === undefined) {
        status.setDetail(color.warning('未打开会话'))
        return
      }
      const pendingCount = snapshot.pending.length
      const primary = snapshot.removed
        ? color.danger('会话已删除')
        : snapshot.promptError !== null
          ? color.danger(`${snapshot.promptError.op === 'send' ? '发送' : '停止'}失败：${snapshot.promptError.error.message}`)
          : pendingCount > 0
            ? color.warning(`/pending 处理 ${String(pendingCount)} 项交互`)
            : snapshot.running
              ? color.accent('生成中 · Ctrl+C 停止')
              : undefined
      const facts: string[] = []
      if (snapshot.queue.length > 0) facts.push(`队列 ${String(snapshot.queue.length)}`)
      const jobs = active === undefined ? undefined : capabilities.jobs()
      const jobCount = jobs?.filter(job => job.status === 'running' || job.status === 'stopping').length ?? 0
      if (jobCount > 0) facts.push(`后台 ${String(jobCount)}`)
      const todos = active?.session.projections.faceOf('todos').getSnapshot()
      if (Array.isArray(todos) && todos.length > 0) facts.push(`任务 ${String(todos.length)}`)
      const plan = active?.session.projections.faceOf('plan').getSnapshot()
      if (typeof plan === 'object' && plan !== null && 'active' in plan && plan.active === true) facts.push('Plan')
      const goal = active?.session.projections.faceOf('goal').getSnapshot()
      if (goal !== null && goal !== undefined) facts.push('目标')
      const attachmentCount = capabilities.draftAttachments().length
      if (attachmentCount > 0) facts.push(`图片 ${String(attachmentCount)}`)
      if (restartRequired !== undefined) facts.push('需要重启')
      const secondary = notice === undefined
        ? [primary, facts.length === 0 ? undefined : color.muted(facts.join(' · '))]
          .filter((value): value is string => value !== undefined)
          .join(' · ') || undefined
        : noticeText(notice.message, notice.tone)
      status.setDetail(secondary)
    }

    const refreshHeader = (forceModel = false): void => {
      const generation = ++headerGeneration
      void capabilities.headerFacts(forceModel).then((facts) => {
        if (stopping !== undefined || generation !== headerGeneration) return
        contextBar.setFacts(facts)
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
        overlays.dispose()
        transcript.dispose()
        try { unsubscribeActive() } catch (error) { failures.push(error) }
        try { disableMouseTracking() } catch (error) { failures.push(error) }
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

    const actions = new TuiActions(capabilities, {
      overlays,
      transcript,
      notice: setNotice,
      refresh,
      refreshHeader: () => { refreshHeader(false) },
      applyTheme: (theme) => {
        setTheme(theme)
        tui.invalidate()
        tui.requestRender(true)
      },
      setEditor: (text) => {
        editor.setText(escapeTerminalText(text))
        focusEditor()
        renderWhileOpen()
      },
      copy: (text) => {
        const bytes = Buffer.from(text, 'utf8')
        if (bytes.byteLength > 100_000) throw new Error('回复超过终端剪贴板 100000 字节安全上限；请使用 /export')
        terminal.write(`\u001B]52;c;${bytes.toString('base64')}\u0007`)
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
      if (text !== '') editor.addToHistory(text)
      editor.setText('')
      if (text.startsWith('/')) void dispatchCommand(text)
      else void sendPrompt(text)
    }

    tui.addInputListener((data) => {
      const wheel = mouseWheelDirection(data)
      if (wheel !== undefined) {
        if (!overlays.hasActive()) transcript.scrollBy(wheel === 'up' ? 3 : -3)
        return { consume: true }
      }
      if (isMouseInput(data)) return { consume: true }
      if (overlays.hasActive()) return undefined
      const attachmentPath = pastedImagePath(data)
      if (!transcriptFocused && attachmentPath !== undefined) {
        void capabilities.addAttachment(attachmentPath).then((attachment) => {
          const dimensions = attachment.width === undefined ? '' : ` · ${attachment.width}×${attachment.height}`
          setNotice(`已从粘贴加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`, 'success')
        }, (error: unknown) => {
          editor.insertTextAtCursor(escapeTerminalText(BRACKETED_PASTE.exec(data)?.[1] ?? attachmentPath))
          setNotice(`粘贴图片未加入：${capabilityError(error)}；路径已保留为文本`, 'warning')
        })
        return { consume: true }
      }
      const paste = BRACKETED_PASTE.exec(data)
      if (!transcriptFocused && paste !== null) {
        const content = paste[1] ?? ''
        const safeContent = escapeTerminalText(content)
        if (safeContent !== content) {
          return { data: `\u001B[200~${safeContent}\u001B[201~` }
        }
      }
      if (matchesKey(data, Key.tab) && (transcriptFocused || editor.getText() === '')) {
        transcriptFocused = !transcriptFocused
        tui.setFocus(transcriptFocused ? transcript : editor)
        setNotice(transcriptFocused ? '对话浏览 · Tab/Escape 返回输入' : '已返回输入区', 'info')
        return { consume: true }
      }
      if (transcriptFocused && matchesKey(data, Key.escape)) {
        focusEditor()
        setNotice('已返回输入区', 'info')
        return { consume: true }
      }
      if (matchesKey(data, Key.shift(Key.tab))) {
        void actions.cyclePermission()
        return { consume: true }
      }
      if (matchesKey(data, Key.ctrl('p'))) {
        void actions.commandPalette()
        return { consume: true }
      }
      // Legacy terminals encode both Enter and Ctrl+M as CR. Only an extended
      // keyboard protocol can identify Ctrl+M without stealing every submit.
      if (data !== '\r' && data !== '\n' && matchesKey(data, Key.ctrl('m'))) {
        void actions.execute('model', '')
        return { consume: true }
      }
      if (matchesKey(data, Key.ctrl('s'))) {
        void actions.execute('sessions', '')
        return { consume: true }
      }
      if (matchesKey(data, Key.ctrl('o'))) {
        void actions.execute('tools', 'display')
        return { consume: true }
      }
      if (matchesKey(data, Key.ctrl('t'))) {
        const visible = transcript.toggleReasoning()
        setNotice(`推理内容：${visible ? '显示' : '隐藏'}`, 'info')
        refresh()
        return { consume: true }
      }
      if (matchesKey(data, Key.shift(Key.left)) || matchesKey(data, Key.shift(Key.right))) {
        const offset = matchesKey(data, Key.shift(Key.left)) ? -1 : 1
        const moved = transcript.navigateTurn(offset)
        setNotice(
          moved ? `已跳到${offset < 0 ? '上一个' : '下一个'}用户轮次` : '没有可跳转的用户轮次',
          moved ? 'info' : 'warning',
        )
        return { consume: true }
      }
      if (matchesKey(data, Key.f2)
        || matchesKey(data, Key.ctrl(Key.comma))
        || matchesKey(data, Key.super(Key.comma))) {
        void actions.execute('settings', '')
        return { consume: true }
      }
      if (matchesKey(data, Key.escape) && notice !== undefined && editor.getText() === '') {
        notice = undefined
        updateStatus()
        renderWhileOpen()
        return { consume: true }
      }
      if (!matchesKey(data, Key.ctrl('c'))) return undefined
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

    terminal.setTitle('DeepSeek Harness')
    tui.start()
    mouseTrackingEnabled = true
    terminal.write(ENABLE_MOUSE_TRACKING)
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
    try { stopConstructedTui() } catch { /* preserve the setup failure */ }
    try {
      await client.ctx.fiber.dispose()
    } catch { /* preserve the setup failure */ }
    throw error
  }
}
