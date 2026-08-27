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
  MAX_WHEEL_SCROLL_LINES,
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
import {
  applyHandoffAttachmentRestoreNotice,
  attachmentRestoreFailureItem,
} from './attachment-restore.ts'
import { HarnessAutocompleteProvider } from './autocomplete.ts'
import { commandOf, TuiActions } from './actions.ts'
import { dispatchComposerSubmit } from './clarify-composer.ts'
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
import { canReadClipboardText, readClipboardText, writeClipboard } from './clipboard.ts'
import { graphemeRangeAt, type SelectionAnchor } from './text-selection.ts'
import {
  captureClipboardImage,
  cleanupClipboardImageWorkspace,
  createClipboardImageWorkspace,
} from './clipboard-image.ts'
import {
  BRACKETED_PASTE,
  imagePathFromPasteText,
} from './pasted-image.ts'
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
import {
  createTerminalSession,
  type ManagedTui,
  supportsManagedTerminal,
  type ManagedTerminal,
} from './terminal-session.ts'
import { MouseProtocolDecoder, type CellPoint } from './mouse-protocol.ts'
import { createMouseController, type MouseSemanticEvent } from './mouse-controller.ts'
import {
  armMouseActivation,
  matchesMouseActivation,
  type MouseArmedActivation,
  type MouseArmedKind,
} from './mouse-activation.ts'
import { mouseContextChoices } from './mouse-context-menu.ts'
import { emptyHitMap, finalizeHitMap, HitMapBuilder, type HitRegion } from './mouse-hit-map.ts'
import {
  autocompleteTargetId,
  emptyFrameGeometry,
  editorMouseApi,
  tuiFrameApi,
} from './pi-tui-adapters.ts'
import { applyKeyBindingOverrides, consumeRunningInterrupt, matchesBinding } from './keymap.ts'
import { pendingInteractionStatus } from './pending-status.ts'
import { attachFatalGuards, fatalLogHint, restoreSurfaceTerminalSync, withCleanupTimeout } from '../process-guards.ts'
import { measureStartup } from '../startup-trace.ts'
import {
  instrumentTerminalWrites,
  TuiPerformanceProbe,
  type TuiPerformanceSnapshot,
} from './tui-performance.ts'

/** Replaceable terminal seams used by virtual-terminal tests. */
export const internals: {
  createTerminal(): Terminal
  isInteractive(): boolean
  reportCleanupError(error: Error): void
  reportPerformance(snapshot: TuiPerformanceSnapshot): void
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
  reportPerformance: () => undefined,
  startClient: startTuiClient,
}

type NoticeTone = 'info' | 'success' | 'warning' | 'error'

function noticeText(message: string, tone: NoticeTone): string {
  const text = translateUiText(message)
  switch (tone) {
    case 'success': return color.success(text)
    case 'warning': return color.warning(text)
    case 'error': return color.danger(text)
    case 'info': return color.brand(text)
  }
}

function sliceEditorSelection(
  text: string,
  selection: { readonly anchor: { readonly line: number; readonly col: number }; readonly focus: { readonly line: number; readonly col: number } },
): string {
  const lines = text.split('\n')
  const offsetOf = (point: { readonly line: number; readonly col: number }): number => {
    let offset = 0
    for (let index = 0; index < point.line; index += 1) {
      offset += (lines[index]?.length ?? 0) + 1
    }
    return offset + point.col
  }
  const start = offsetOf(selection.anchor)
  const end = offsetOf(selection.focus)
  return start <= end ? text.slice(start, end) : text.slice(end, start)
}

/**
 * Start the interactive Surface after the Host bridge is available.
 * @param options - in-process API, RPC carrier, and launch target.
 * @returns idempotent lifecycle handle.
 */
export async function startTuiSurface(options: TuiStartOptions): Promise<TuiSurfaceHandle> {
  if (!supportsManagedTerminal(internals.isInteractive(), process.env.TERM)) {
    throw new Error(ui(
      '需要支持终端私有模式的交互式 TTY；非交互任务请使用 dsh --profile headless',
      'An interactive TTY with private-mode support is required; use dsh --profile headless for non-interactive tasks',
    ))
  }
  const performanceProbe = new TuiPerformanceProbe()
  const rawTerminal = internals.createTerminal() as Terminal & ManagedTerminal
  const terminalInstrumentation = instrumentTerminalWrites(rawTerminal, performanceProbe, process.stdout)
  const terminal = terminalInstrumentation.terminal
  const reportPerformance = (): void => {
    terminalInstrumentation.release()
    const snapshot = performanceProbe.finish()
    if (snapshot === undefined) return
    performanceProbe.reportFinal(snapshot)
    internals.reportPerformance(snapshot)
  }
  let stopTuiRenderingSync = (): void => undefined
  const terminalSession = createTerminalSession(terminal, true, () => { stopTuiRenderingSync() })
  const startup = await (async () => {
    try {
      return await measureStartup('settings+client', () => Promise.all([
        options.management.settings.describe(),
        internals.startClient(options),
        inspectProviderReadiness(options.api),
      ]))
    } catch (error) {
      try { reportPerformance() } catch { /* preserve the startup failure */ }
      throw error
    }
  })()
  const [settingsDocuments, client, initialProviderReadiness] = startup
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
    terminalSession.setMouseReporting(
      liveBehavior.get().mouseMode,
      liveBehavior.get().hoverFeedback,
    )
    setTheme(initialTheme)
    const tui = new TUI(terminal, true)
    const requestTuiRender = tui.requestRender.bind(tui)
    tui.requestRender = (force = false): void => {
      performanceProbe.markRenderRequest(force ? 'forced' : 'normal')
      requestTuiRender(force)
    }
    stopTuiRenderingSync = () => {
      (tui as TUI & ManagedTui).stopRenderingSync?.()
    }
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
    let mouseContentGeneration = 0
    let mouseArmed: MouseArmedActivation | undefined
    let transcriptPointerOrigin: {
      readonly point: CellPoint
      readonly before: SelectionAnchor
      readonly after: SelectionAnchor
    } | undefined
    const clearTranscriptPointerGesture = (): void => {
      transcriptPointerOrigin = undefined
    }
    const clearMouseArm = (contentChanged = false): void => {
      mouseArmed = undefined
      if (contentChanged) mouseContentGeneration += 1
    }
    const armMouseTarget = (
      kind: MouseArmedKind,
      targetId: string,
      contentGeneration: number,
    ): void => {
      mouseArmed = armMouseActivation(kind, targetId, contentGeneration)
    }
    const isMouseTargetArmed = (
      kind: MouseArmedKind,
      targetId: string,
      contentGeneration: number,
    ): boolean => matchesMouseActivation(mouseArmed, kind, targetId, contentGeneration)
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
    transcript.applyPresentationDefaults(
      liveBehavior.get().toolCards,
      liveBehavior.get().showReasoning,
      liveBehavior.get().toolOutputLineLimit,
      liveBehavior.get().diffContextLines,
    )
    transcript.setScrollbarVisibility(liveBehavior.get().scrollbarVisibility)
    let syntax: SyntaxHighlighter | undefined
    disposeConstructedSyntax = () => { syntax?.dispose() }
    void SyntaxHighlighter.create(initialTheme, () => {
      if (stopping !== undefined) return
      // Non-forced render: a forced full redraw clears the screen and replays
      // the whole history, which flashes mid-session whenever a lazy grammar
      // finishes loading. The differential render repaints the visible rows.
      transcript.refreshPresentation()
      tui.invalidate()
      tui.requestRender()
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
      // Same as the lazy-grammar callback above: avoid a full clear-and-replay
      // right after startup once the highlighter becomes ready.
      transcript.refreshPresentation()
      tui.invalidate()
      tui.requestRender()
    }).catch(() => {
      /* first frame already shown; highlighting stays off */
    })
    const status = new StatusBar()
    const canvas = new Box(0, 0, background.canvas)
    const renderCanvas = canvas.render.bind(canvas)
    canvas.render = (width: number): string[] => performanceProbe.measureRender(() => renderCanvas(width))
    if (options.draft !== undefined) editor.setText(escapeTerminalText(options.draft))
    const layout = new BottomAnchoredLayout(
      () => terminal.rows,
      contextBar,
      transcript,
      editor,
      status,
      () => transcript.isEmptyState(),
    )
    canvas.addChild(layout)
    tui.addChild(canvas)
    tui.setFocus(editor)

    let mouseController!: ReturnType<typeof createMouseController>
    let clearHoverPresentation = (): boolean => false
    let extendTranscriptPointerAtEdge = (_edge: 'older' | 'newer', _point: CellPoint): void => undefined
    const overlays = new OverlayQueue(tui, () => {
      mouseController.endGesture()
      clearTranscriptPointerGesture()
      clearMouseArm(true)
      clearHoverPresentation()
    })
    const mouseDecoder = new MouseProtocolDecoder()
    let mouseInputFlushTimer: ReturnType<typeof setTimeout> | undefined
    let replayingMouseInput = false
    let hitMap = emptyHitMap(0, terminal.columns, terminal.rows)
    const freezeHitMap = (): void => {
      const resized = hitMap.terminalWidth !== terminal.columns || hitMap.terminalHeight !== terminal.rows
      const geometry = tuiFrameApi(tui).getLastFrameGeometry?.()
        ?? emptyFrameGeometry(terminal.columns, terminal.rows)
      const builder = new HitMapBuilder(hitMap.generation + 1)
      const slots = layout.lastContentGeometry()
      if (slots !== undefined) {
        builder.add({
          id: 'chrome:context',
          rect: slots.context,
          zIndex: 10,
          role: 'passive',
          enabled: true,
          activation: 'none',
          hover: 'none',
          action: { kind: 'chrome', commandId: 'context' },
        })
        builder.add({
          id: 'transcript:text',
          rect: slots.transcript,
          zIndex: 10,
          role: 'text',
          enabled: true,
          activation: 'select',
          hover: 'none',
          action: { kind: 'transcript', command: 'select' },
        })
        for (const region of transcript.scrollbarHitRegions(slots.transcript)) {
          builder.add(region)
        }
        for (const region of transcript.controlHitRegions(slots.transcript)) {
          builder.add(region)
        }
        const composerOrigin = { col: slots.composer.col, row: slots.composer.row }
        const local = editor.lastLocalGeometry()
        if (local === undefined) {
          builder.add({
            id: 'composer:input',
            rect: slots.composer,
            zIndex: 20,
            role: 'input',
            enabled: true,
            activation: 'select',
            hover: 'none',
            action: { kind: 'composer', command: 'focus' },
          })
        } else {
          builder.addLocal({
            id: 'composer:input',
            rect: local.editor,
            zIndex: 20,
            role: 'input',
            enabled: true,
            activation: 'select',
            hover: 'none',
            action: { kind: 'composer', command: 'caret' },
          }, composerOrigin)
          const autocompleteSnapshot = editorMouseApi(editor).getAutocompleteSnapshot?.()
          if (local.autocomplete.height > 0) {
            builder.addLocal({
              id: 'composer:autocomplete-surface',
              rect: local.autocomplete,
              zIndex: 20,
              role: 'passive',
              enabled: true,
              activation: 'none',
              hover: 'none',
              action: { kind: 'composer', command: 'autocomplete-scroll' },
            }, composerOrigin)
            for (const row of autocompleteSnapshot?.visibleRows ?? []) {
              if (!row.selectable) continue
              const generation = autocompleteSnapshot?.generation
              if (generation === undefined) continue
              builder.addLocal({
                id: autocompleteTargetId(generation, row.absoluteIndex),
                rect: {
                  col: local.autocomplete.col,
                  row: local.autocomplete.row + row.visualRow,
                  width: local.autocomplete.width,
                  height: 1,
                },
                zIndex: 21,
                role: 'option',
                enabled: true,
                activation: 'arm',
                hover: 'highlight',
                action: {
                  kind: 'composer',
                  command: 'autocomplete',
                  autocompleteGeneration: generation,
                  autocompleteItemId: row.itemId,
                },
              }, composerOrigin)
            }
          }
          if (local.attachments.height > 0) {
            builder.addLocal({
              id: 'composer:attachments',
              rect: local.attachments,
              zIndex: 20,
              role: 'passive',
              enabled: true,
              activation: 'none',
              hover: 'none',
              action: { kind: 'composer', command: 'focus' },
            }, composerOrigin)
          }
          builder.addLocal({
            id: 'composer:facts',
            rect: local.facts,
            zIndex: 20,
            role: 'passive',
            enabled: true,
            activation: 'none',
            hover: 'none',
            action: { kind: 'chrome', commandId: 'composer-facts' },
          }, composerOrigin)
          for (const token of editor.lastFactTokens()) {
            builder.addLocal({
              id: `chrome:${token.id}`,
              rect: token.rect,
              zIndex: 21,
              role: 'button',
              enabled: true,
              activation: 'direct',
              hover: 'highlight',
              action: { kind: 'chrome', commandId: token.id },
            }, composerOrigin)
          }
        }
        builder.add({
          id: 'chrome:status',
          rect: slots.status,
          zIndex: 10,
          role: 'passive',
          enabled: true,
          activation: 'none',
          hover: 'none',
          action: { kind: 'chrome', commandId: 'status' },
        })
        for (const token of status.lastTokens()) {
          builder.addLocal({
            id: `chrome:${token.id}`,
            rect: token.rect,
            zIndex: 11,
            role: 'button',
            enabled: true,
            activation: 'direct',
            hover: 'highlight',
            action: { kind: 'chrome', commandId: token.id },
          }, { col: slots.status.col, row: slots.status.row })
        }
      }
      const overlayId = overlays.activeOverlayId()
      hitMap = finalizeHitMap(
        builder,
        geometry,
        overlayId === undefined || !overlays.hasActive()
          ? undefined
          : { overlayId, children: [...overlays.hitChildren()] },
      )
      if (resized) {
        clearTranscriptPointerGesture()
        clearMouseArm(true)
        if (clearHoverPresentation()) tui.requestRender()
      }
    }
    tuiFrameApi(tui).onAfterRender = freezeHitMap
    mouseController = createMouseController({
      getHitMap: () => hitMap,
      getBehavior: () => liveBehavior.get(),
      onEdgeScroll: (lines, point) => {
        extendTranscriptPointerAtEdge(lines > 0 ? 'older' : 'newer', point)
        transcript.scrollBy(lines)
        renderWhileOpen()
      },
    })
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
      clearMouseArm(true)
      clearHoverPresentation()
      performanceProbe.markSnapshot()
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
      if (transcriptPointerOrigin !== undefined
        && !transcript.containsSelectionAnchor(transcriptPointerOrigin.before)) {
        clearTranscriptPointerGesture()
      }
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
      performanceProbe.markStatus()
      editor.setDraftAttachments(capabilities.draftAttachments())
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
      performanceProbe.markHeader()
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
        clearTranscriptPointerGesture()
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
      if (mouseInputFlushTimer !== undefined) {
        clearTimeout(mouseInputFlushTimer)
        mouseInputFlushTimer = undefined
      }
      mouseDecoder.reset()
      restoreSurfaceTerminalSync(terminalSession, process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
      stopping = (async () => {
        const failures: unknown[] = []
        if (elapsedTimer !== undefined) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
        notices.dispose()
        overlays.dispose()
        mouseController.dispose()
        transcript.dispose()
        setCodeHighlighter(undefined)
        try { syntax?.dispose() } catch (error) { failures.push(error) }
        try { unsubscribeActive() } catch (error) { failures.push(error) } finally {
          performanceProbe.changeSubscriptions(-1)
        }
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
        try { reportPerformance() } catch { /* optional diagnostics must not break cleanup */ }
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
        terminalSession.setMouseReporting(behavior.mouseMode, behavior.hoverFeedback)
        mouseController.endGesture()
        clearTranscriptPointerGesture()
        clearMouseArm(true)
        clearHoverPresentation()
        transcript.setScrollbarVisibility(behavior.scrollbarVisibility)
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
      composerText: () => editor.getText(),
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
        clearTranscriptPointerGesture()
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
        mouseController.endGesture()
        clearTranscriptPointerGesture()
        dismissNotice()
        refreshHeader(true)
      } else {
        refreshHeader(false)
      }
      updateStatus()
      renderWhileOpen()
    })
    performanceProbe.changeSubscriptions(1)

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

    const dispatchSubmittedComposer = (raw: string): void => {
      // PromptEditor snapshots the expanded composer before pi-tui trims and
      // clears it. Classify Clarify from that snapshot before history or send
      // so a local invocation cannot leak and failures restore exact text.
      // Ordinary slash lines still use isSlashCommandLine and splitLeadingImagePath
      // inside dispatchComposerSubmit after that classify step.
      dispatchComposerSubmit(editor.losslessSubmitText(raw), {
        followLatest: () => { transcript.followLatest() },
        draftAttachmentCount: () => capabilities.draftAttachments().length,
        addToHistory: (text) => {
          editor.addToHistory(text)
          composerHistory = rememberComposerHistory(composerHistory, text, historyLimit)
          persistComposerHistory(composerHistory)
        },
        clearEditor: () => { editor.setText('') },
        dispatchCommand: (line) => { void dispatchCommand(line) },
        attachLeadingImage: (path, rawText, rest) => {
          void (async () => {
            try {
              await capabilities.addAttachment(path)
            } catch (error: unknown) {
              setNotice(ui(
                `粘贴图片未加入：${capabilityError(error)}`,
                `Pasted image was not attached: ${capabilityError(error)}`,
              ), 'warning')
              restoreDeferredPrompt(rawText)
              return
            }
            await sendPrompt(rest)
          })()
        },
        sendPrompt: (text) => { void sendPrompt(text) },
        runClarify: (transaction) => { void actions.clarifyComposer(transaction) },
      })
    }

    const attachPastedImage = (path: string, fallbackText: string, rest = ''): { consume: true } => {
      void capabilities.addAttachment(path).then((attachment) => {
        if (rest !== '') editor.insertTextAtCursor(escapeTerminalText(rest))
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

    const composerSelectionText = (): string => {
      const editorApi = editorMouseApi(editor)
      const editorSelection = editorApi.getSelection?.()
      return editorSelection === undefined
        ? ''
        : sliceEditorSelection(editor.getText(), editorSelection)
    }

    const copyText = (text: string): void => {
      if (text === '') return
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
    }
    editor.onSubmit = dispatchSubmittedComposer

    const copyActiveSelection = (): void => {
      const transcriptText = transcript.copySelectionText()
      copyText(transcriptText !== '' ? transcriptText : composerSelectionText())
    }

    const openMouseContextMenu = async (
      semantic: Extract<MouseSemanticEvent, { kind: 'click' }>,
    ): Promise<void> => {
      const region = semantic.region
      if (region?.action.kind === 'overlay') return
      const composer = region?.role === 'input' || region?.action.kind === 'composer'
      const selectionText = composer ? composerSelectionText() : transcript.copySelectionText()
      const pasteSupported = composer && canReadClipboardText(process.platform)
      const choices = mouseContextChoices({
        target: composer ? 'composer' : 'transcript',
        hasSelection: selectionText !== '',
        pasteSupported,
      })
      const selected = await overlays.select({
        title: ui('文本操作', 'Text actions'),
        searchable: false,
        maxVisible: 4,
        choices,
        options: {
          width: 38,
          minWidth: 28,
          maxHeight: 9,
          row: semantic.point.row,
          col: semantic.point.col,
          margin: 1,
        },
      })
      if (selected === undefined || selected.id === 'cancel' || stopping !== undefined) return
      if (selected.id === 'copy') {
        copyText(selectionText)
        return
      }
      if (selected.id === 'native') {
        await actions.execute('mouse', 'native')
        return
      }
      if (selected.id !== 'paste') return
      try {
        const pasted = await readClipboardText({ platform: process.platform })
        if (pasted === '') {
          setNotice(ui('剪贴板中没有文本', 'The clipboard contains no text'), 'info')
          return
        }
        focusEditor()
        const api = editorMouseApi(editor)
        if (api.replaceSelection?.(pasted) !== true) editor.insertTextAtCursor(pasted)
        renderWhileOpen()
      } catch (error: unknown) {
        setNotice(ui(
          `无法安全读取剪贴板：${capabilityError(error)}`,
          `Could not safely read the clipboard: ${capabilityError(error)}`,
        ), 'warning')
      }
    }

    const applyTranscriptPointerFocus = (
      beforeFocus: SelectionAnchor | undefined,
      afterFocus: SelectionAnchor | undefined,
      granularity: 'character' | 'word' | 'line',
    ): void => {
      const origin = transcriptPointerOrigin
      if (origin === undefined || beforeFocus === undefined || afterFocus === undefined) return
      const forward = transcript.selectionRunsForward(origin.before, beforeFocus)
      transcript.applyPointerSelection(
        forward ? origin.before : origin.after,
        forward ? afterFocus : beforeFocus,
        granularity,
      )
    }

    const applyTranscriptPointer = (
      point: { readonly col: number; readonly row: number },
      originPoint: { readonly col: number; readonly row: number } | undefined,
      granularity: 'character' | 'word' | 'line',
      ended = false,
    ): void => {
      const slot = layout.lastContentGeometry()?.transcript
      if (slot === undefined) {
        if (ended) clearTranscriptPointerGesture()
        return
      }
      const edge = originPoint === undefined
        ? undefined
        : point.row <= slot.row
          ? 'older'
          : point.row >= slot.row + slot.height - 1
            ? 'newer'
            : undefined
      const hit = (target: typeof point, affinity: SelectionAnchor['affinity']): SelectionAnchor | undefined => (
        edge === undefined
          ? transcript.hitAnchor(target.col - slot.col, target.row - slot.row, slot.width, affinity)
          : transcript.hitViewportEdgeAnchor(target.col - slot.col, slot.width, edge, affinity)
      )
      if (originPoint === undefined) {
        const focus = hit(point, 'before')
        if (focus !== undefined) transcript.applyPointerSelection(focus, focus, granularity)
        return
      }
      const sameOrigin = transcriptPointerOrigin?.point.col === originPoint.col
        && transcriptPointerOrigin.point.row === originPoint.row
      if (!sameOrigin) {
        const before = transcript.hitAnchor(
          originPoint.col - slot.col,
          originPoint.row - slot.row,
          slot.width,
          'before',
        )
        const after = transcript.hitAnchor(
          originPoint.col - slot.col,
          originPoint.row - slot.row,
          slot.width,
          'after',
        )
        transcriptPointerOrigin = before === undefined || after === undefined
          ? undefined
          : { point: originPoint, before, after }
      }
      const beforeFocus = hit(point, 'before')
      const afterFocus = hit(point, 'after')
      applyTranscriptPointerFocus(beforeFocus, afterFocus, granularity)
      if (ended) clearTranscriptPointerGesture()
    }

    extendTranscriptPointerAtEdge = (edge, point): void => {
      const slot = layout.lastContentGeometry()?.transcript
      const origin = transcriptPointerOrigin
      if (slot === undefined || origin === undefined) return
      const localCol = point.col - slot.col
      const beforeFocus = transcript.hitViewportEdgeAnchor(localCol, slot.width, edge, 'before')
      const afterFocus = transcript.hitViewportEdgeAnchor(localCol, slot.width, edge, 'after')
      applyTranscriptPointerFocus(beforeFocus, afterFocus, 'character')
    }

    const applyComposerPointer = (
      point: { readonly col: number; readonly row: number },
      originPoint: { readonly col: number; readonly row: number } | undefined,
      drag: boolean,
    ): void => {
      const slots = layout.lastContentGeometry()
      const local = editor.lastLocalGeometry()
      if (slots === undefined || local === undefined) return
      const api = editorMouseApi(editor)
      const map = api.getVisualLineMap?.(local.frameWidth) ?? []
      const toCaret = (target: { readonly col: number; readonly row: number }): { line: number; col: number } => {
        const row = Math.max(0, target.row - slots.composer.row - local.editor.row)
        const col = Math.max(0, target.col - slots.composer.col - local.editor.col)
        const visual = map[Math.min(row, Math.max(0, map.length - 1))]
        if (visual === undefined) return api.getCursor()
        return { line: visual.logicalLine, col: visual.startCol + Math.min(col, visual.length) }
      }
      const focus = toCaret(point)
      api.setCursor?.(focus.line, focus.col)
      if (drag && originPoint !== undefined) {
        const anchor = toCaret(originPoint)
        const forward = focus.line > anchor.line
          || (focus.line === anchor.line && focus.col >= anchor.col)
        const advance = (caret: { line: number; col: number }): { line: number; col: number } => {
          const line = editor.getLines()[caret.line] ?? ''
          return { line: caret.line, col: graphemeRangeAt(line, caret.col).end }
        }
        api.setSelection?.(forward ? anchor : advance(anchor), forward ? advance(focus) : focus)
      } else {
        api.clearSelection?.()
      }
    }

    const hintEnter = (): void => {
      setNotice(ui('请按 Enter 执行。', 'Press Enter to run this action.'), 'info')
    }

    const restoreMouseFocus = (region: { readonly action: { readonly kind: string } } | undefined): void => {
      if (region?.action.kind === 'transcript') {
        transcriptFocused = true
        tui.setFocus(transcript)
        return
      }
      if (region?.action.kind === 'overlay') return
      focusEditor()
    }

    const applyHoverPresentation = (region: HitRegion | undefined): boolean => {
      const id = region?.id
      const transcriptChanged = transcript.setHoveredRegion(id)
      const editorChanged = editor.setHoveredTarget(
        id?.startsWith('composer:autocomplete:') === true || id?.startsWith('chrome:model') === true
          || id?.startsWith('chrome:mode') === true
          ? id
          : undefined,
      )
      const statusId = region?.action.kind === 'chrome'
        && (region.action.commandId === 'permission' || region.action.commandId === 'detail')
        ? region.action.commandId
        : undefined
      const statusChanged = status.setHoveredToken(statusId)
      const overlayChanged = overlays.handleHover(
        region?.action.kind === 'overlay' ? region.action.optionId : undefined,
      )
      return transcriptChanged || editorChanged || statusChanged || overlayChanged
    }

    clearHoverPresentation = (): boolean => {
      const controllerChanged = mouseController.clearHover()
      return applyHoverPresentation(undefined) || controllerChanged
    }

    const dispatchMouseClick = (semantic: Extract<MouseSemanticEvent, { kind: 'click' }>): void => {
      clearTranscriptPointerGesture()
      const region = semantic.region
      restoreMouseFocus(region)
      if (semantic.suppressed) return
      if (semantic.button === 'right') {
        void openMouseContextMenu(semantic)
        return
      }
      const isArmedTarget = region?.action.kind === 'overlay' && region.action.optionId !== undefined
        || region?.action.kind === 'transcript' && region.action.command === 'example'
        || region?.action.kind === 'composer' && region.action.command === 'autocomplete'
      if (!isArmedTarget) clearMouseArm()
      if (region?.action.kind === 'overlay' && region.action.optionId !== undefined) {
        const optionId = region.action.optionId
        const contentGeneration = overlays.activeGeneration()
        const result = overlays.handleOptionClick(optionId)
        if (result === 'danger') {
          hintEnter()
          return
        }
        if (result === 'activated') {
          if (!isMouseTargetArmed('option', optionId, contentGeneration)) {
            armMouseTarget('option', optionId, contentGeneration)
            return
          }
          if (!mouseController.allowsSensitiveMouse) {
            hintEnter()
            return
          }
          overlays.activateArmedOption()
          clearMouseArm()
          return
        }
        if (result === 'focused') armMouseTarget('option', optionId, contentGeneration)
        return
      }
      if (region?.action.kind === 'overlay') return
      if (region?.role === 'scrollbar') {
        const origin = layout.lastContentGeometry()?.transcript
        if (origin !== undefined) transcript.handleScrollbarClick(region, semantic.point, origin)
        return
      }
      if (region?.action.kind === 'transcript' && region.action.command === 'toggle' && region.action.targetKey !== undefined) {
        transcript.pointerToggleTool(region.action.targetKey)
        return
      }
      if (region?.action.kind === 'transcript' && region.action.command === 'example' && region.action.targetKey !== undefined) {
        const id = region.action.targetKey
        transcript.focusExample(id)
        const armed = isMouseTargetArmed('example', id, mouseContentGeneration)
        if (!armed) {
          armMouseTarget('example', id, mouseContentGeneration)
          return
        }
        if (!mouseController.allowsSensitiveMouse) {
          hintEnter()
          return
        }
        clearMouseArm()
        const action = transcript.activateFocused()
        if (action?.kind === 'example') {
          focusEditor()
          void sendPrompt(action.text)
        }
        return
      }
      if (region?.role === 'text' || region?.action.kind === 'transcript') {
        const granularity = semantic.count === 3 ? 'line' : semantic.count === 2 ? 'word' : 'character'
        applyTranscriptPointer(semantic.point, undefined, granularity)
        return
      }
      if (region?.action.kind === 'composer' && region.action.command === 'autocomplete') {
        const api = editorMouseApi(editor)
        const generation = region.action.autocompleteGeneration
        const itemId = region.action.autocompleteItemId
        if (generation === undefined || itemId === undefined) return
        if (api.selectAutocompleteItem?.(generation, itemId) !== true) {
          clearMouseArm()
          return
        }
        const armed = isMouseTargetArmed('autocomplete', itemId, generation)
        if (!armed) {
          armMouseTarget('autocomplete', itemId, generation)
          return
        }
        if (!mouseController.allowsSensitiveMouse) {
          hintEnter()
          return
        }
        clearMouseArm()
        const activation = api.activateAutocompleteSelection?.('mouse')
        if (activation?.submitText !== undefined) dispatchSubmittedComposer(activation.submitText)
        return
      }
      if (region?.action.kind === 'composer' && region.action.command === 'autocomplete-scroll') {
        return
      }
      if (region?.action.kind === 'chrome') {
        const commandId = region.action.commandId
        if (commandId === 'model') void actions.execute('model', '')
        else if (commandId === 'mode') void actions.execute('mode', '')
        else if (commandId === 'permission') void actions.execute('permission', '')
        else if (commandId === 'detail') void actions.execute('status', '')
        return
      }
      if (region?.role === 'input' || region?.action.kind === 'composer') {
        applyComposerPointer(semantic.point, undefined, false)
      }
    }

    tui.addInputListener((data) => {
      performanceProbe.markInput()
      if (mouseInputFlushTimer !== undefined) {
        clearTimeout(mouseInputFlushTimer)
        mouseInputFlushTimer = undefined
      }
      const decoded = replayingMouseInput
        ? { events: [], leftover: data, pending: '' }
        : mouseDecoder.push(data)
      let pendingWheel = 0
      let needMouseRender = false
      for (const event of decoded.events) {
        if (event.kind !== 'move' && event.kind !== 'focus' && clearHoverPresentation()) {
          needMouseRender = true
        }
        const outcome = mouseController.handle(event)
        if (outcome.semantic?.kind === 'wheel') {
          const region = outcome.semantic.region
          if (region?.action.kind === 'overlay') {
            clearMouseArm()
            overlays.handleWheel(outcome.semantic.lines)
          } else if (region?.action.kind === 'composer' && region.action.command.startsWith('autocomplete')) {
            const api = editorMouseApi(editor)
            clearMouseArm()
            api.moveAutocompleteSelection?.(-Math.sign(outcome.semantic.lines))
          } else if (region?.action.kind === 'composer' || region?.role === 'input') {
            // A mouse wheel is a semantic navigation gesture, never keyboard bytes.
            // Inputs consume it without changing text or cursor state.
          } else if (outcome.scrollTranscript !== undefined) {
            if (pendingWheel !== 0) mouseController.noteCoalescedWheel()
            pendingWheel += outcome.scrollTranscript
          }
        } else if (outcome.semantic?.kind === 'click') {
          dispatchMouseClick(outcome.semantic)
        } else if (outcome.semantic?.kind === 'drag') {
          clearMouseArm()
          const semantic = outcome.semantic
          if (semantic.grabOffset !== undefined || mouseController.gesture === 'dragging-scrollbar') {
            clearTranscriptPointerGesture()
            const origin = layout.lastContentGeometry()?.transcript
            if (origin !== undefined) {
              transcript.dragThumb(semantic.point.row - origin.row, semantic.grabOffset ?? 0)
            }
          } else if (semantic.region?.role === 'input' || semantic.region?.action.kind === 'composer') {
            clearTranscriptPointerGesture()
            applyComposerPointer(semantic.point, semantic.origin, true)
          } else {
            applyTranscriptPointer(semantic.point, semantic.origin, 'character', semantic.ended === true)
          }
          if (semantic.ended === true && liveBehavior.get().copyOnSelect) copyActiveSelection()
        } else if (outcome.semantic?.kind === 'hover') {
          applyHoverPresentation(outcome.semantic.region)
        } else if (outcome.semantic?.kind === 'focus' && !outcome.semantic.focused) {
          clearTranscriptPointerGesture()
          clearMouseArm(true)
          clearHoverPresentation()
        }
        if (outcome.requestRender === true) needMouseRender = true
      }
      if (pendingWheel !== 0) {
        transcript.scrollBy(Math.max(-MAX_WHEEL_SCROLL_LINES, Math.min(MAX_WHEEL_SCROLL_LINES, pendingWheel)))
        needMouseRender = true
      }
      if (decoded.events.length > 0 && needMouseRender) {
        mouseController.recordMouseRender()
        renderWhileOpen()
      }
      if (decoded.pending !== '') {
        mouseInputFlushTimer = setTimeout(() => {
          mouseInputFlushTimer = undefined
          const pending = mouseDecoder.flushPending()
          if (pending === '' || stopping !== undefined) return
          replayingMouseInput = true
          try {
            ;(tui as unknown as { handleInput(input: string): void }).handleInput(pending)
          } finally {
            replayingMouseInput = false
          }
        }, 30)
        return { consume: true }
      }
      if (decoded.events.length > 0 && decoded.leftover === '') return { consume: true }
      const payload = decoded.events.length > 0 ? decoded.leftover : data
      if (payload === '') return { consume: true }
      clearTranscriptPointerGesture()
      clearMouseArm()
      if (clearHoverPresentation()) renderWhileOpen()
      if (matchesBinding('toggleMouseMode', payload)) {
        void actions.execute('mouse', 'toggle')
        return { consume: true }
      }
      if (matchesBinding('copySelection', payload)) {
        copyActiveSelection()
        return { consume: true }
      }
      const interrupt = consumeRunningInterrupt(payload, capabilities.active()?.session)
      if (interrupt !== undefined) return interrupt
      if (overlays.hasActive()) return payload === data ? undefined : { data: payload }
      const pasted = imagePathFromPasteText(payload)
      if (!transcriptFocused && pasted !== undefined) {
        return attachPastedImage(pasted.path, pasted.raw, pasted.rest)
      }
      const paste = BRACKETED_PASTE.exec(payload)
      if (!transcriptFocused && paste !== null) {
        const content = paste[1] ?? ''
        if (content.trim() === '') {
          const workspace = createClipboardImageWorkspace()
          void captureClipboardImage({ platform: process.platform, dest: workspace.dest })
            .then(async (captured) => {
              if (captured === undefined) {
                setNotice(ui(
                  '剪贴板里没有可用图片。可粘贴图片文件路径，或先复制图片再粘贴。',
                  'No image on the clipboard. Paste an image file path, or copy an image and paste again.',
                ), 'warning')
                return
              }
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
      if (matchesBinding('focusToggle', payload) && (transcriptFocused || editor.getText() === '')) {
        applyTranscriptFocusToggle(transcript)
        transcriptFocused = !transcriptFocused
        tui.setFocus(transcriptFocused ? transcript : editor)
        return { consume: true }
      }
      if (transcriptFocused && matchesKey(payload, Key.escape)) {
        applyTranscriptEscape(transcript, focusEditor)
        return { consume: true }
      }
      if (transcriptFocused && (matchesKey(payload, Key.enter) || payload === '\r' || payload === '\n')) {
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
      if (matchesBinding('cyclePermission', payload)) {
        void actions.cyclePermission()
        return { consume: true }
      }
      if (matchesBinding('help', payload)) {
        void actions.help()
        return { consume: true }
      }
      if (matchesBinding('commandPalette', payload)) {
        void actions.commandPalette()
        return { consume: true }
      }
      if (matchesBinding('historySearch', payload)) {
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
      if (matchesBinding('model', payload)) {
        void actions.execute('model', '')
        return { consume: true }
      }
      if (matchesBinding('sessions', payload)) {
        void actions.execute('sessions', '')
        return { consume: true }
      }
      if (matchesBinding('toolsDisplay', payload)) {
        void actions.execute('tools', 'display')
        return { consume: true }
      }
      if (matchesBinding('reasoning', payload)) {
        const visible = transcript.toggleReasoning()
        setNotice(visible
          ? ui('推理内容：显示', 'Reasoning: shown')
          : ui('推理内容：隐藏', 'Reasoning: hidden'), 'info')
        refresh()
        return { consume: true }
      }
      if (matchesBinding('previousTurn', payload) || matchesBinding('nextTurn', payload)) {
        if (!transcriptFocused) {
          transcriptFocused = true
          tui.setFocus(transcript)
        }
        const offset = matchesBinding('previousTurn', payload) ? -1 : 1
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
      if (matchesBinding('settings', payload)) {
        void actions.execute('settings', '')
        return { consume: true }
      }
      if (matchesKey(payload, Key.escape) && notices.hasVisible()) {
        dismissNotice()
        updateStatus()
        renderWhileOpen()
        return { consume: true }
      }
      if (!matchesBinding('interrupt', payload)) return payload === data ? undefined : { data: payload }
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
      restore: () => {
        restoreSurfaceTerminalSync(terminalSession, process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
      },
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
    terminalSession.enter()
    tui.start()
    refreshHeader(true)
    refresh()
    if (options.startupNotice !== undefined) setNotice(options.startupNotice, 'success')
    const attachmentsReady = options.attachmentPaths !== undefined && options.attachmentPaths.length > 0
      ? (async () => {
        const failures: string[] = []
        const paths = options.attachmentPaths ?? []
        for (const [index, path] of paths.entries()) {
          try { await capabilities.addAttachment(path) } catch (error) {
            failures.push(attachmentRestoreFailureItem(path, error, index))
          }
        }
        applyHandoffAttachmentRestoreNotice(setNotice, failures, paths.length)
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
    restoreSurfaceTerminalSync(terminalSession, process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
    setCodeHighlighter(undefined)
    try { disposeConstructedSyntax() } catch { /* preserve the setup failure */ }
    try { stopConstructedTui() } catch { /* preserve the setup failure */ }
    try {
      await withCleanupTimeout(() => client.ctx.fiber.dispose())
    } catch { /* preserve the setup failure */ }
    try { reportPerformance() } catch { /* preserve the setup failure */ }
    throw error
  }
}
