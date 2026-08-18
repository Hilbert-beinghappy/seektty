/** Interactive pi-tui lifecycle over the authoritative Harness Client Runtime. */

import { chmodSync } from 'node:fs'
import {
  Box,
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
  type Terminal,
} from '@mariozechner/pi-tui'
import {
  TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE,
  TuiSettingsConflictError,
} from '@deepseek-ai/dsh-tui-protocol'
import type { TuiStartOptions, TuiSurfaceHandle, TuiSurfaceOutcome } from './index.ts'
import { startTuiClient, type TuiClient } from './client-runtime.ts'
import {
  capabilityError,
  noticeAfterDispatchCatch,
  noticeAfterFailedHostCommand,
  noticeAfterFailedPrompt,
  noticeAfterPromptError,
  type TuiActiveSession,
} from './capabilities.ts'
import { HarnessAutocompleteProvider } from './autocomplete.ts'
import { commandOf, TuiActions } from './actions.ts'
import {
  applyTranscriptEscape,
  applyTranscriptFocusToggle,
  noticeForHostCommand,
} from './nav-notice.ts'
import {
  BottomAnchoredLayout,
  ContextBar,
  PromptEditor,
  StatusBar,
  transcriptViewportRows,
} from './chrome.ts'
import { appearanceSettings, themeFromAppearance } from './appearance.ts'
import { behaviorFromSettings, behaviorSettings, createLiveBehavior } from './behavior.ts'
import { clearIdleComposerDraft } from './composer-draft.ts'
import {
  composerHistoryFromDocuments,
  rememberComposerHistory,
} from './composer-history.ts'
import {
  localeFromSettings,
  setUiLocale,
  translateUiText,
  ui,
} from './locale.ts'
import { OverlayQueue, setDangerConfirmDefault } from './overlays.ts'
import {
  dispatchAfterProviderOnboarding,
  inspectProviderReadiness,
  ProviderOnboardingGate,
  type ProviderOnboardingResult,
} from './provider-onboarding.ts'
import { adoptSyntaxHighlighter, SyntaxHighlighter } from './syntax-highlighter.ts'
import { background, color, escapeTerminalText, setCodeHighlighter, setTheme } from './theme.ts'
import { Transcript } from './transcript.ts'
import { writeClipboard } from './clipboard.ts'
import {
  captureClipboardImage,
  cleanupClipboardImageWorkspace,
  createClipboardImageWorkspace,
} from './clipboard-image.ts'
import {
  desktopNotifyBody,
  desktopNotifySequence,
  nextDesktopNotify,
  type DesktopNotifySnapshot,
} from './desktop-notify.ts'
import { createSessionChromeStore, nextTitleWrite } from './session-chrome.ts'
import { NoticeBoard, pickStatusLine } from './status-priority.ts'
import { restartRequiredFact, restartRequiredNotice } from './restart-copy.ts'
import { sessionTerminalTitle } from './terminal-title.ts'
import { applyKeyBindingOverrides, consumeRunningInterrupt, matchesBinding } from './keymap.ts'
import { pendingInteractionStatus } from './pending-status.ts'
import { attachFatalGuards, fatalLogHint, restoreTerminalSync, withCleanupTimeout } from '../process-guards.ts'
import { measureStartup } from '../startup-trace.ts'

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
  const terminal = internals.createTerminal()
  const [settingsDocuments, client, initialProviderReadiness] = await measureStartup('settings+client', () => Promise.all([
    options.management.settings.describe(),
    internals.startClient(options),
    inspectProviderReadiness(options.api),
  ]))
  setUiLocale(localeFromSettings(settingsDocuments))
  let stopConstructedTui = (): void => undefined
  let disposeConstructedSyntax = (): void => undefined
  let detachFatalGuards = (): void => undefined
  try {
    const initialTheme = themeFromAppearance(appearanceSettings(settingsDocuments))
    let liveTheme = initialTheme
    const liveBehavior = createLiveBehavior(behaviorFromSettings(behaviorSettings(settingsDocuments)))
    applyKeyBindingOverrides(liveBehavior.get().keyBindings)
    setDangerConfirmDefault(liveBehavior.get().dangerConfirmDefault)
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
    const historyLimit = liveBehavior.get().composerHistoryLimit
    let { entries: composerHistory, revision: composerHistoryRevision } =
      composerHistoryFromDocuments(settingsDocuments, historyLimit)
    for (const entry of [...composerHistory].reverse()) editor.addToHistory(entry)
    let historyPersist = Promise.resolve()
    const persistComposerHistory = (entries: readonly string[]): void => {
      if (liveBehavior.get().composerHistoryLimit <= 0) return
      historyPersist = historyPersist.then(async () => {
        const settings = capabilities.managementBridge().settings
        const write = (revision: number, next: readonly string[]): Promise<number> => (
          settings.mutate(
            TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE,
            [{ op: 'set', path: ['entries'], value: [...next] }],
            revision,
          ).then(saved => saved.revision)
        )
        try {
          composerHistoryRevision = await write(composerHistoryRevision, entries)
        } catch (error) {
          if (!(error instanceof TuiSettingsConflictError)) return
          const latest = composerHistoryFromDocuments(
            await settings.describe(TUI_COMPOSER_HISTORY_SETTINGS_NAMESPACE),
            historyLimit,
          )
          const merged = rememberComposerHistory(latest.entries, entries[0] ?? '', historyLimit)
          composerHistory = merged
          composerHistoryRevision = await write(latest.revision, merged)
        }
      }).catch(() => { /* send must not wait on Settings */ })
    }
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
      liveBehavior.get().toolCards,
      liveBehavior.get().showReasoning,
      liveBehavior.get().toolOutputLineLimit,
      liveBehavior.get().diffContextLines,
    )
    let syntax: SyntaxHighlighter | undefined
    disposeConstructedSyntax = () => { syntax?.dispose() }
    void SyntaxHighlighter.create(initialTheme, () => {
      transcript.refreshPresentation()
      tui.invalidate()
      tui.requestRender(true)
    }).then(created => {
      if (stopping !== undefined) {
        created.dispose()
        return
      }
      adoptSyntaxHighlighter(created, liveTheme, (ready) => {
        syntax = ready
        disposeConstructedSyntax = () => { ready.dispose() }
        setCodeHighlighter((code, lang) => ready.highlight(code, lang))
      })
      if (stopping !== undefined) {
        created.dispose()
        syntax = undefined
        setCodeHighlighter(undefined)
        return
      }
      transcript.refreshPresentation()
      tui.invalidate()
      tui.requestRender(true)
    }).catch(() => {
      /* first frame already shown; highlighting stays off */
    })
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
    const notices = new NoticeBoard()
    let restartRequired = false
    let headerGeneration = 0
    let elapsedTimer: ReturnType<typeof setInterval> | undefined
    const sessionChrome = createSessionChromeStore()

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
      notices.set(message, tone)
      updateStatus()
      renderWhileOpen()
    }

    const dismissNotice = (): void => {
      notices.dismiss()
    }

    const onboarding = new ProviderOnboardingGate(
      options.api,
      overlays,
      (message, tone) => { setNotice(message, tone) },
      initialProviderReadiness,
    )

    const applyTerminalTitle = (): void => {
      const snapshot = active?.session.getSnapshot()
      const chrome = sessionChrome.of(latestSessionId)
      const title = sessionTerminalTitle({
        follow: liveBehavior.get().followTerminalTitle,
        sessionTitle: active?.summary.displayTitle ?? '',
        running: snapshot?.running === true,
        pendingApproval: snapshot?.pending.some(wait => wait.kind === 'approval') === true,
      })
      const next = nextTitleWrite(chrome.lastTitle, title)
      if (next === undefined) return
      chrome.lastTitle = next
      terminal.setTitle(next)
    }

    let actions!: TuiActions

    const updateStatus = (): void => {
      if (stopping !== undefined) return
      const chrome = sessionChrome.of(latestSessionId)
      const snapshot = active?.session.getSnapshot()
      if (snapshot?.running === true) {
        chrome.runningSince ??= Date.now()
        if (elapsedTimer === undefined && liveBehavior.get().statusElapsed) {
          elapsedTimer = setInterval(() => {
            if (stopping !== undefined) return
            const elapsed = sessionChrome.of(latestSessionId)
            if (elapsed.runningSince === undefined || !liveBehavior.get().statusElapsed) return
            renderWhileOpen()
          }, 500)
        }
      } else {
        chrome.runningSince = undefined
        if (elapsedTimer !== undefined) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
      }
      if (snapshot === undefined) {
        chrome.notify = { running: false, pending: [] }
        chrome.notifyPrimed = false
        status.setDetail(color.warning(ui('未打开会话', 'No session open')))
        applyTerminalTitle()
        return
      }
      const currentNotify: DesktopNotifySnapshot = {
        running: snapshot.running,
        pending: snapshot.pending.map(wait => ({ key: wait.key, kind: wait.kind })),
      }
      if (liveBehavior.get().desktopNotifications) {
        const kind = nextDesktopNotify(chrome.notify, currentNotify, chrome.notifyPrimed)
        if (kind !== undefined) {
          terminal.write(desktopNotifySequence(desktopNotifyBody(kind)))
        }
      }
      chrome.notify = currentNotify
      chrome.notifyPrimed = true
      const pendingCount = snapshot.pending.length
      const facts: string[] = []
      if (snapshot.queue.length > 0) facts.push(ui(`队列 ${String(snapshot.queue.length)}`, `Queue ${String(snapshot.queue.length)}`))
      const jobs = active === undefined ? undefined : capabilities.jobs()
      const jobCount = jobs?.filter(job => job.status === 'running' || job.status === 'stopping').length ?? 0
      if (jobCount > 0) facts.push(ui(`后台 ${String(jobCount)}`, `Background ${String(jobCount)}`))
      const todos = active?.session.projections.faceOf('todos').getSnapshot()
      if (Array.isArray(todos) && todos.length > 0) facts.push(ui(`任务 ${String(todos.length)}`, `Tasks ${String(todos.length)}`))
      const plan = active?.session.projections.faceOf('plan').getSnapshot()
      if (typeof plan === 'object' && plan !== null && 'active' in plan && plan.active === true) facts.push('Plan')
      const goal = active?.session.projections.faceOf('goal').getSnapshot()
      if (goal !== null && goal !== undefined) facts.push(ui('目标', 'Goal'))
      const attachmentCount = capabilities.draftAttachments().length
      if (attachmentCount > 0) facts.push(ui(`图片 ${String(attachmentCount)}`, `Images ${String(attachmentCount)}`))
      const noticeView = notices.view()
      status.setDetail(pickStatusLine({
        ...(snapshot.removed
          ? { error: color.danger(ui('会话已删除', 'Session deleted')) }
          : snapshot.promptError !== null
            ? {
              error: color.danger(noticeAfterPromptError({
                promptError: snapshot.promptError,
                running: snapshot.running,
              })),
            }
            : noticeView.error === undefined
              ? {}
              : { error: noticeText(noticeView.error.message, 'error') }),
        ...(pendingCount > 0
          ? {
            pending: color.warning(pendingInteractionStatus(snapshot.pending)
              ?? ui(`等待 ${String(pendingCount)} 项交互`, `Waiting for ${String(pendingCount)} interaction(s)`)),
          }
          : {}),
        ...(restartRequired ? { restart: color.warning(restartRequiredFact()) } : {}),
        ...(noticeView.warning === undefined
          ? {}
          : { warning: noticeText(noticeView.warning.message, 'warning') }),
        ...(facts.length === 0 ? {} : { facts: color.muted(facts.join(' · ')) }),
        ...(noticeView.toast === undefined
          ? {}
          : { notice: noticeText(noticeView.toast.message, noticeView.toast.tone) }),
      }))
      applyTerminalTitle()
    }

    notices.setOnExpire(() => {
      updateStatus()
      renderWhileOpen()
    })

    const refreshHeader = (forceModel = false): void => {
      const generation = ++headerGeneration
      void capabilities.headerFacts(forceModel).then((facts) => {
        if (stopping !== undefined || generation !== headerGeneration) return
        const since = sessionChrome.of(latestSessionId).runningSince
        const header = { ...facts, statusElapsed: liveBehavior.get().statusElapsed }
        contextBar.setFacts(since === undefined ? header : { ...header, runningSince: since })
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
        transcript.empty(ui(
          '当前没有打开的会话；使用 /workspace 或 /new 继续。',
          'No session is open; use /workspace or /new to continue.',
        ))
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
      detachFatalGuards()
      detachFatalGuards = () => undefined
      if (stopping !== undefined) return stopping
      restoreTerminalSync(process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
      stopping = (async () => {
        const failures: unknown[] = []
        if (elapsedTimer !== undefined) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
        notices.dispose()
        overlays.dispose()
        transcript.dispose()
        setCodeHighlighter(undefined)
        try { syntax?.dispose() } catch (error) { failures.push(error) }
        try { unsubscribeActive() } catch (error) { failures.push(error) }
        try {
          await withCleanupTimeout(() => terminal.drainInput(250, 30))
        } catch (error) {
          failures.push(error)
        }
        try {
          tui.stop()
        } catch (error) {
          failures.push(error)
        }
        try {
          await withCleanupTimeout(() => client.ctx.fiber.dispose())
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
        liveTheme = theme
        setTheme(theme)
        syntax?.setTheme(theme)
        transcript.refreshPresentation()
        tui.invalidate()
        tui.requestRender(true)
      },
      applyLocale: (locale) => {
        setUiLocale(locale)
        capabilities.invalidateCommandCatalog()
        transcript.refreshPresentation()
        refreshHeader(false)
        refresh()
        tui.invalidate()
        tui.requestRender(true)
      },
      applyBehavior: (behavior) => {
        liveBehavior.apply(behavior)
        applyKeyBindingOverrides(behavior.keyBindings)
        setDangerConfirmDefault(behavior.dangerConfirmDefault)
        transcript.applyPresentationDefaults(
          behavior.toolCards,
          behavior.showReasoning,
          behavior.toolOutputLineLimit,
          behavior.diffContextLines,
        )
        transcript.refreshPresentation()
        tui.invalidate()
        tui.requestRender(true)
      },
      setEditor: (text) => {
        editor.setText(escapeTerminalText(text))
        focusEditor()
        renderWhileOpen()
      },
      copy: (text) => {
        void writeClipboard(text, {
          fallback: liveBehavior.get().clipboardFallback,
          platform: process.platform,
          writeOsc52: sequence => { terminal.write(sequence) },
        }).catch((error: unknown) => {
          setNotice(ui(
            `复制失败：${capabilityError(error)}`,
            `Copy failed: ${capabilityError(error)}`,
          ), 'warning')
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
      requireRestart: (label) => {
        restartRequired = true
        setNotice(restartRequiredNotice(label), 'warning')
      },
    })

    const unsubscribeActive = capabilities.subscribeActive((current, snapshot) => {
      if (stopping !== undefined) return
      if (current === undefined || snapshot === undefined) {
        active = undefined
        latestSessionId = ''
        headerGeneration += 1
        transcript.empty(ui(
          '当前没有打开的会话；使用 /workspace 或 /new 继续。',
          'No session is open; use /workspace or /new to continue.',
        ))
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
        dismissNotice()
        refreshHeader(true)
      } else {
        refreshHeader(false)
      }
      updateStatus()
      renderWhileOpen()
    })

    editor.setAutocompleteProvider(new HarnessAutocompleteProvider(capabilities, (message) => {
      setNotice(ui(`命令目录：${message}`, `Command catalog: ${message}`), 'error')
    }))

    const restoreDeferredPrompt = (text: string): void => {
      if (text !== '' && editor.getText() === '') editor.setText(escapeTerminalText(text))
    }

    const sendPrompt = async (
      text: string,
      mode: 'queue' | 'steer' = 'queue',
      readiness: Promise<ProviderOnboardingResult> = onboarding.ensure(),
    ): Promise<boolean> => dispatchAfterProviderOnboarding(
      readiness,
      () => { restoreDeferredPrompt(text) },
      async () => {
        const current = capabilities.active()
        if (current === undefined) {
          setNotice(ui('当前没有打开的会话', 'No session is open'), 'error')
          restoreDeferredPrompt(text)
          return false
        }
        const content = capabilities.promptContent(text)
        if (content.length === 0) return false
        const failed = await noticeAfterFailedPrompt(current.session, content, mode)
        if (failed !== undefined) {
          setNotice(failed, 'error')
          restoreDeferredPrompt(text)
          return false
        }
        capabilities.clearAttachments()
        dismissNotice()
        updateStatus()
        return true
      },
    )

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
          setNotice(ui(
            `未知命令 /${name}${near.length === 0 ? '' : `；可能是 ${near.map(item => `/${item.name}`).join('、')}`}`,
            `Unknown command /${name}${near.length === 0 ? '' : `; did you mean ${near.map(item => `/${item.name}`).join(', ')}?`}`,
          ), 'warning')
          return
        }
        if (command.behavior === 'local') {
          await actions.execute(name, args)
          return
        }
        const current = capabilities.active()
        if (current === undefined) throw new Error(ui('当前没有打开的会话', 'No session is open'))
        if (command.behavior === 'skill') {
          await sendPrompt(trimmed, 'queue')
          return
        }
        const outcome = await noticeAfterFailedHostCommand(current.session, trimmed)
        if (!outcome.ok) {
          setNotice(outcome.message, 'error')
          return
        }
        const hostNotice = noticeForHostCommand({ ok: true, matched: outcome.matched }, name)
        if (hostNotice !== undefined) setNotice(hostNotice.message, hostNotice.tone)
      } catch (error) {
        setNotice(
          noticeAfterDispatchCatch(error, capabilities.active()?.session),
          'error',
        )
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
        persistComposerHistory(composerHistory)
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
      const interrupt = consumeRunningInterrupt(data, capabilities.active()?.session)
      if (interrupt !== undefined) return interrupt
      if (overlays.hasActive()) return undefined
      const attachmentPath = pastedImagePath(data)
      if (!transcriptFocused && attachmentPath !== undefined) {
        return attachPastedImage(attachmentPath, BRACKETED_PASTE.exec(data)?.[1] ?? attachmentPath)
      }
      const paste = BRACKETED_PASTE.exec(data)
      if (!transcriptFocused && paste !== null) {
        const content = paste[1] ?? ''
        if (content.trim() === '') {
          const workspace = createClipboardImageWorkspace()
          void captureClipboardImage({ platform: process.platform, dest: workspace.dest })
            .then(async (captured) => {
              if (captured === undefined) return
              chmodSync(workspace.dest, 0o600)
              const attachment = await capabilities.addAttachment(captured)
              const dimensions = attachment.width === undefined ? '' : ` · ${attachment.width}×${attachment.height}`
              setNotice(ui(
                `已从粘贴加入 ${attachment.name} · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`,
                `Attached ${attachment.name} from paste · ${attachment.mediaType} · ${attachment.bytes} B${dimensions}`,
              ), 'success')
            })
            .catch((error: unknown) => {
              setNotice(ui(
                `粘贴图片未加入：${capabilityError(error)}`,
                `Pasted image was not attached: ${capabilityError(error)}`,
              ), 'warning')
            })
            .finally(() => { cleanupClipboardImageWorkspace(workspace) })
          return { consume: true }
        }
        const safeContent = escapeTerminalText(content)
        if (safeContent !== content) {
          return { data: `\u001B[200~${safeContent}\u001B[201~` }
        }
      }
      if (matchesBinding('focusToggle', data) && (transcriptFocused || editor.getText() === '')) {
        applyTranscriptFocusToggle(transcript)
        transcriptFocused = !transcriptFocused
        tui.setFocus(transcriptFocused ? transcript : editor)
        return { consume: true }
      }
      if (transcriptFocused && matchesKey(data, Key.escape)) {
        applyTranscriptEscape(transcript, focusEditor)
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
          setNotice(ui('输入历史已关闭', 'Composer history is disabled'), 'info')
          return { consume: true }
        }
        if (composerHistory.length === 0) {
          setNotice(ui('没有可搜索的输入历史', 'No composer history to search'), 'info')
          return { consume: true }
        }
        void overlays.select({
          title: ui('输入历史', 'Composer history'),
          detail: ui('选择一条历史输入填入编辑器', 'Choose a previous prompt to restore in the editor'),
          searchable: true,
          choices: composerHistory.map((entry, index) => ({
            id: String(index),
            label: entry.replace(/\s+/gu, ' ').slice(0, 80) || ui('(空)', '(empty)'),
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
        setNotice(visible
          ? ui('推理内容：显示', 'Reasoning: shown')
          : ui('推理内容：隐藏', 'Reasoning: hidden'), 'info')
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
          moved
            ? offset < 0
              ? ui('已跳到上一个用户轮次', 'Jumped to the previous user turn')
              : ui('已跳到下一个用户轮次', 'Jumped to the next user turn')
            : ui('没有可跳转的用户轮次', 'No user turn to jump to'),
          moved ? 'info' : 'warning',
        )
        return { consume: true }
      }
      if (matchesBinding('settings', data)) {
        void actions.execute('settings', '')
        return { consume: true }
      }
      if (matchesKey(data, Key.escape) && notices.hasVisible()) {
        dismissNotice()
        updateStatus()
        renderWhileOpen()
        return { consume: true }
      }
      if (!matchesBinding('interrupt', data)) return undefined
      if (editor.getText() !== '' || capabilities.draftAttachments().length > 0) {
        setNotice(clearIdleComposerDraft(
          editor,
          () => { capabilities.clearAttachments() },
          (text) => {
            composerHistory = rememberComposerHistory(composerHistory, text, historyLimit)
            persistComposerHistory(composerHistory)
          },
        ), 'info')
        return { consume: true }
      }
      const now = Date.now()
      if (now <= exitArmedUntil) {
        void close({ kind: 'exit', code: 0 })
        return { consume: true }
      }
      exitArmedUntil = now + 1_500
      setNotice(ui('再按一次 Ctrl+C 退出', 'Press Ctrl+C again to exit'), 'warning')
      return { consume: true }
    })

    const startupOnboarding = onboarding.ensure()
    applyTerminalTitle()
    detachFatalGuards = attachFatalGuards({
      restore: () => { restoreTerminalSync(process.stdin, chunk => { process.stdout.write(chunk) }, terminal) },
      cleanup: () => close({ kind: 'exit', code: 1 }),
      writeError: (message) => { process.stderr.write(`${escapeTerminalText(message)}\n`) },
      formatError: (error) => {
        const summary = error instanceof Error ? error.message : String(error)
        const logHint = fatalLogHint()
        return [
          ui(`deepseek: 未捕获异常：${summary}`, `deepseek: uncaught exception: ${summary}`),
          ui(`日志目录：${logHint}`, `Log directory: ${logHint}`),
        ].join('\n')
      },
      exit: (code) => { process.exit(code) },
    })
    tui.start()
    refreshHeader(true)
    refresh()
    if (options.startupNotice !== undefined) setNotice(options.startupNotice, 'success')
    const attachmentsReady = options.attachmentPaths !== undefined && options.attachmentPaths.length > 0
      ? (async () => {
        const failures: string[] = []
        for (const path of options.attachmentPaths ?? []) {
          try { await capabilities.addAttachment(path) } catch (error) { failures.push(`${path}: ${capabilityError(error)}`) }
        }
        if (failures.length === 0) {
          setNotice(ui(
            `已恢复 ${options.attachmentPaths?.length ?? 0} 个附件`,
            `Restored ${options.attachmentPaths?.length ?? 0} attachment(s)`,
          ), 'success')
        } else {
          setNotice(ui(`部分附件未恢复：${failures.join('；')}`, `Some attachments were not restored: ${failures.join('; ')}`), 'warning')
        }
        refresh()
      })()
      : Promise.resolve()
    if (options.task !== undefined) {
      void attachmentsReady.then(() => sendPrompt(options.task ?? '', 'queue', startupOnboarding)).catch((error: unknown) => {
        setNotice(ui(
          `发送初始任务失败：${capabilityError(error)}`,
          `Failed to send the initial task: ${capabilityError(error)}`,
        ), 'error')
      })
    } else {
      void startupOnboarding.catch((error: unknown) => {
        setNotice(ui(
          `读取模型配置失败：${capabilityError(error)}`,
          `Failed to read the model configuration: ${capabilityError(error)}`,
        ), 'warning')
      })
    }
    return { closed, stop: () => close({ kind: 'exit', code: 0 }) }
  } catch (error) {
    detachFatalGuards()
    restoreTerminalSync(process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
    setCodeHighlighter(undefined)
    try { disposeConstructedSyntax() } catch { /* preserve the setup failure */ }
    try { stopConstructedTui() } catch { /* preserve the setup failure */ }
    try {
      await withCleanupTimeout(() => client.ctx.fiber.dispose())
    } catch { /* preserve the setup failure */ }
    throw error
  }
}
