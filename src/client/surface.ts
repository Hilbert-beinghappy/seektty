/** Interactive pi-tui lifecycle over the authoritative Harness Client Runtime. */

import { chmodSync } from 'node:fs'
import { CanvasLineCache } from './canvas-line-cache.ts'
import { NativeOutput, streamSink } from './native-output.ts'
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
  type TuiMouseMode,
  type TuiRenderingSettings,
} from '@deepseek-ai/dsh-tui-protocol'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/node-client'
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
import { appearanceFromSettings, appearanceSettings } from './appearance.ts'
import { welcomeFromSettings, welcomeSettings } from './welcome-settings.ts'
import { resolveAppearanceTheme, type ResolvedTuiTheme } from './theme-config.ts'
import { backgroundSyncMode, resolveRendering } from './appearance-rendering.ts'
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
import { background, color, escapeTerminalText, setRendering, setCodeHighlighter, setTerminalCanvasBackground, setTheme } from './theme.ts'
import { Transcript } from './transcript.ts'
import { WelcomeController, type WelcomeRuntimeFacts } from './welcome.ts'
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
import { decodeMouseSequence, type CellPoint } from './mouse-protocol.ts'
import { createMouseController, type MouseSemanticEvent } from './mouse-controller.ts'
import {
  armMouseActivation,
  matchesMouseActivation,
  type MouseArmedActivation,
  type MouseArmedKind,
} from './mouse-activation.ts'
import { ContextMenuController, mouseContextActions } from './mouse-context-menu.ts'
import type { ContextActionNode, ContextTarget } from './context-actions.ts'
import { emptyHitMap, finalizeHitMap, HitMapBuilder, type HitRegion } from './mouse-hit-map.ts'
import {
  autocompleteTargetId,
  emptyFrameGeometry,
  editorMouseApi,
  tuiFrameApi,
} from './pi-tui-adapters.ts'
import { applyKeyBindingOverrides, consumeRunningInterrupt, matchesBinding } from './keymap.ts'
import { pendingInteractionStatus } from './pending-status.ts'
import { attachFatalGuards, attachSuspendGuards, fatalLogHint, restoreSurfaceTerminalSync, withCleanupTimeout } from '../process-guards.ts'
import { measureStartup } from '../startup-trace.ts'
import {
  instrumentTerminalWrites,
  TuiPerformanceProbe,
  type TuiPerformanceSnapshot,
} from './tui-performance.ts'
import { PACKAGE_VERSION } from '../dsh-compat.ts'
import { AgentTreeDock, owningAgentRoot } from './agent-tree.ts'
import { ChildSessionView, type ParentViewSnapshot } from './child-session-view.ts'

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
  const nativeTailCandidate = process.env.SEEKTTY_NATIVE_TAIL === '1'
  let nativeOutputActive = false
  const rawWrite = rawTerminal.write.bind(rawTerminal)
  const outputSink = rawTerminal instanceof ProcessTerminal ? streamSink(process.stdout) : async (bytes: string) => { rawWrite(bytes) }
  const nativeOutput = nativeTailCandidate ? new NativeOutput(async bytes => {
    const delivered = outputSink(bytes)
    performanceProbe.markWrite(bytes, process.stdout.writableNeedDrain)
    await delivered
  }, error => { stopTuiRenderingSync(); internals.reportCleanupError(error) }) : undefined
  const terminalInstrumentation = instrumentTerminalWrites(rawTerminal, performanceProbe, process.stdout)
  const terminal: Terminal & ManagedTerminal = nativeOutput ? new Proxy(rawTerminal, {
    get(target, property) {
      if (property === 'write') return (bytes: string): void => {
        if (nativeOutputActive) nativeOutput.control(bytes)
        else rawWrite(bytes)
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) : terminalInstrumentation.terminal
  const setNativeOutputMode = (enabled: boolean): void => {
    nativeOutputActive = nativeOutput !== undefined && enabled
    if (rawTerminal instanceof ProcessTerminal) {
      (rawTerminal as Terminal & ManagedTerminal).__seekttyWrite = nativeOutputActive
        ? (bytes: string) => { nativeOutput!.control(bytes) } : undefined
    }
  }
  const reportPerformance = (): void => {
    terminalInstrumentation.release()
    const snapshot = performanceProbe.finish()
    if (snapshot === undefined) return
    performanceProbe.reportFinal(snapshot)
    internals.reportPerformance(snapshot)
  }
  let stopTuiRenderingSync = (): void => undefined
  let reportBackgroundUnavailable = (): void => undefined
  let repaintBackground = (): void => undefined
  setTerminalCanvasBackground(undefined)
  const terminalSession = createTerminalSession(terminal, true, () => { stopTuiRenderingSync() }, process.env,
    () => { reportBackgroundUnavailable() },
    color => { setTerminalCanvasBackground(color); repaintBackground() })
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
  let detachSuspendGuards = (): void => undefined
  try {
    const initialAppearance = appearanceFromSettings(appearanceSettings(settingsDocuments))
    const initialWelcome = welcomeFromSettings(welcomeSettings(settingsDocuments))
    const initialTheme = resolveAppearanceTheme(initialAppearance)
    let liveTheme = initialTheme
    let liveRendering = resolveRendering(initialAppearance)
    const liveBehavior = createLiveBehavior(behaviorFromSettings(behaviorSettings(settingsDocuments)))
    setNativeOutputMode(liveBehavior.get().mouseMode === 'native')
    applyKeyBindingOverrides(liveBehavior.get().keyBindings)
    setDangerConfirmDefault(liveBehavior.get().dangerConfirmDefault)
    terminalSession.setMouseReporting(
      liveBehavior.get().mouseMode,
      liveBehavior.get().hoverFeedback,
    )
    setTheme(initialTheme)
    setRendering(liveRendering)
    terminalSession.setBackgroundColor(initialTheme.colors.canvas, backgroundSyncMode(liveRendering))
    const tui = new TUI(terminal, true)
    let suppressNativeFrames = false
    const requestTuiRender = tui.requestRender.bind(tui)
    tui.requestRender = (force = false): void => {
      performanceProbe.markRenderRequest(force ? 'forced' : 'normal')
      requestTuiRender(force)
    }
    const requestSurfaceRender = (force = false): void => {
      if (suppressNativeFrames && liveBehavior.get().mouseMode === 'native') return
      tui.requestRender(force && liveBehavior.get().mouseMode !== 'native')
    }
    stopTuiRenderingSync = () => {
      (tui as TUI & ManagedTui).stopRenderingSync?.()
    }
    stopConstructedTui = () => {
      tui.stop()
    }
    const capabilities = client.capabilities
    let stopping: Promise<void> | undefined
    repaintBackground = () => {
      if (stopping !== undefined) return
      // Adapt cached foregrounds at the canvas boundary; no transcript rebuild,
      // selection reset, or scroll-anchor movement is needed for this repaint.
      tui.invalidate()
      requestSurfaceRender(true)
    }
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
    let hideComposer = false
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
    let reportWelcomeNotice = (_message: string): void => undefined
    let transcript!: Transcript
    const welcomeFacts = (): WelcomeRuntimeFacts => ({
      seekttyVersion: PACKAGE_VERSION,
      profile,
      workspace: active?.workspacePath ?? options.cwd,
      model: '',
      reasoning: '',
      mode: active?.summary.agentPreset ?? '',
      permission: '',
      theme: liveTheme.name,
      platform: `${process.platform}/${process.arch}`,
    })
    const welcome = new WelcomeController(
      initialWelcome,
      welcomeFacts(),
      (request, signal) => options.management.welcome.collectFastfetch(request, signal),
      (request, signal) => options.management.welcome.collectFastfetchLogo(request, signal),
      () => {
        if (stopping !== undefined || transcript === undefined) return
        // Welcome facts/resources are local presentation, not a theme change.
        // Transcript owns both welcome caches and ignores hidden-page updates.
        transcript.refreshWelcomePresentation()
      },
      message => { reportWelcomeNotice(message) },
    )
    const agentTree = new AgentTreeDock({
      presentation: capabilities.subagentPresentation(),
      requestRender: () => { if (stopping === undefined) requestSurfaceRender() },
      mouseMode: () => liveBehavior.get().mouseMode,
    })
    transcript = new Transcript(
      () => liveBehavior.get().mouseMode === 'native'
        ? Number.POSITIVE_INFINITY
        : transcriptViewportRows(
          terminal.rows,
          hideComposer ? 0 : editor.render(terminal.columns).length,
          agentTree.renderedHeight(),
        ),
      () => { if (stopping === undefined) requestSurfaceRender() },
      () => {
        const current = active
        if (current === undefined) return
        const snapshot = current.session.getSnapshot()
        if (snapshot.hasMore && !snapshot.loadingOlder) void current.session.loadOlder()
      },
      welcome,
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
      requestSurfaceRender()
    }).then(created => {
      if (stopping !== undefined) {
        created.dispose()
        return
      }
      adoptSyntaxHighlighter(created, liveTheme, (ready) => {
        syntax = ready
        disposeConstructedSyntax = () => { ready.dispose() }
        setCodeHighlighter((code, lang, background) => ready.highlight(code, lang, background))
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
      requestSurfaceRender()
    }).catch(() => {
      /* first frame already shown; highlighting stays off */
    })
    const status = new StatusBar()
    const childView = new ChildSessionView()
    const canvas = new Box(0, 0, background.canvas)
    if (options.draft !== undefined) editor.setText(escapeTerminalText(options.draft))
    const layout = new BottomAnchoredLayout(
      () => terminal.rows,
      contextBar,
      transcript,
      editor,
      status,
      () => transcript.isEmptyState(),
      agentTree,
      () => !hideComposer,
      () => liveBehavior.get().mouseMode === 'native',
    )
    canvas.addChild(layout)
    transcript.setNativeTailEnabled(nativeTailCandidate)
    const renderCanvas = canvas.render.bind(canvas)
    const nativeCanvasLines = new CanvasLineCache()
    canvas.render = (width: number): string[] => performanceProbe.measureRender(() => {
      if (liveBehavior.get().mouseMode !== 'native') return renderCanvas(width)
      return nativeCanvasLines.render(layout.render(width), width)
    })
    tui.addChild(canvas)
    if (nativeOutput) {
      let writing = false
      let renderAgain = false
      const historyCanvas = new CanvasLineCache()
      terminal.__seekttyNativeFrame = (lines, cursor, width, height) => {
        if (writing) { renderAgain = true; return true }
        const batch = transcript.takeNativeHistoryBatch()
        writing = true
        void nativeOutput.frame(historyCanvas.render(batch?.lines ?? [], width), lines, width, height, cursor).then(success => {
          writing = false
          if (!success) return
          batch?.acknowledge()
          if (renderAgain && stopping === undefined) { renderAgain = false; requestSurfaceRender() }
        })
        return true
      }
    }
    tui.setFocus(editor)

    let mouseController!: ReturnType<typeof createMouseController>
    let clearHoverPresentation = (): boolean => false
    let extendTranscriptPointerAtEdge = (_edge: 'older' | 'newer', _point: CellPoint): void => undefined
    const contextMenu = new ContextMenuController(tui, () => {
      mouseController.endGesture()
      clearTranscriptPointerGesture()
      clearMouseArm()
      clearHoverPresentation()
      hitMap = emptyHitMap(hitMap.generation + 1, terminal.columns, terminal.rows)
    })
    const overlays = new OverlayQueue(tui, () => {
      contextMenu.close()
      mouseController.endGesture()
      clearTranscriptPointerGesture()
      clearMouseArm(true)
      clearHoverPresentation()
      // A logical child page can change before its first paint. Never use the old hits.
      hitMap = emptyHitMap(hitMap.generation + 1, terminal.columns, terminal.rows)
    })
    let hitMap = emptyHitMap(0, terminal.columns, terminal.rows)
    const freezeHitMap = (): void => {
      const resized = hitMap.terminalWidth !== terminal.columns || hitMap.terminalHeight !== terminal.rows
      const geometry = tuiFrameApi(tui).getLastFrameGeometry?.()
        ?? emptyFrameGeometry(terminal.columns, terminal.rows)
      const builder = new HitMapBuilder(hitMap.generation + 1)
      const slots = layout.lastContentGeometry()
      if (slots !== undefined) {
        const agentTreeSlot = agentTree.dockedGeometry(slots.composer)
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
        for (const region of agentTree.hitRegions(agentTreeSlot, liveBehavior.get().mouseMode)) {
          builder.add(region)
        }
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
      hitMap = contextMenu.decorateHitMap(finalizeHitMap(
        builder,
        geometry,
        overlayId === undefined || !overlays.hasActive()
          ? undefined
          : { overlayId, children: [...overlays.hitChildren()] },
      ), geometry)
      if (resized) {
        mouseController.endGesture()
        clearTranscriptPointerGesture()
        clearMouseArm(true)
        if (clearHoverPresentation()) requestSurfaceRender()
      }
    }
    tuiFrameApi(tui).onAfterRender = freezeHitMap
    mouseController = createMouseController({
      getHitMap: () => hitMap,
      getBehavior: () => liveBehavior.get(),
      prepareGesture: () => {
        const underlay = contextMenu.dismissForGesture()
        if (underlay === undefined) return undefined
        if (underlay === null) return 'cancel'
        hitMap = underlay
        return 'retarget'
      },
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
      if (stopping === undefined) requestSurfaceRender()
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

    reportBackgroundUnavailable = () => {
      setNotice(ui(
        '背景同步不可用；铺底：/theme fill theme；原色：/theme colors rgb；兼容：/theme background explicit',
        'No background sync. Fill: /theme fill theme; RGB: /theme colors rgb; compatibility: /theme background explicit.',
      ), 'warning')
    }
    reportWelcomeNotice = message => { setNotice(message, 'warning') }

    const dismissNotice = (): void => {
      notices.dismiss()
    }

    const onboarding = new ProviderOnboardingGate(
      options.api,
      overlays,
      (message, tone) => { setNotice(message, tone) },
      initialProviderReadiness,
      async () => {
        capabilities.invalidateModelDirectory()
        const directory = await capabilities.listModels()
        const selected = await overlays.select({
          title: ui('选择当前会话模型', 'Choose the current session model'),
          detail: ui(
            'Provider 已保存。选择一个模型后，待发送消息才会继续。',
            'The Provider is saved. Choose a model before the pending message continues.',
          ),
          choices: [
            ...directory.options.map(option => ({
              id: option.id,
              label: option.label,
              description: option.description,
            })),
            ...directory.failures.map((failure, index) => ({
              id: `__failure_${String(index)}`,
              label: ui('Provider 目录不可用', 'Provider catalog unavailable'),
              disabledReason: failure,
            })),
          ],
        })
        if (selected === undefined) return false
        const option = directory.options.find(candidate => candidate.id === selected.id)
        if (option === undefined) return false
        if (!option.current) await capabilities.selectModel(option.selection)
        return true
      },
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
          const child = childView.snapshot()
          const childLabel = child === undefined
            ? undefined
            : `${agentTree.selectedNode()?.label ?? child.childSessionId} · ${child.parentSessionId}`
          terminal.write(desktopNotifySequence(desktopNotifyBody(kind, childLabel)))
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
        welcome.setRuntimeFacts({
          seekttyVersion: PACKAGE_VERSION,
          profile: facts.profile,
          workspace: facts.workspace,
          model: facts.model.includes(' · ') ? facts.model.slice(0, facts.model.lastIndexOf(' · ')) : facts.model,
          reasoning: facts.reasoning ?? '',
          mode: facts.mode,
          permission: facts.permission,
          theme: liveTheme.name,
          platform: `${facts.platform}/${facts.architecture}`,
        })
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
        welcome.setRuntimeFacts(welcomeFacts())
        editor.disableSubmit = false
        updateStatus()
        renderWhileOpen()
        return
      }
      active = current
      const snapshot = current.session.getSnapshot()
      updateTranscript(current)
      actions.syncPending(snapshot)
      editor.disableSubmit = childView.composerMode() === 'read-only'
      updateStatus()
      renderWhileOpen()
    }

    const restoreParentView = (snapshot: ParentViewSnapshot) => {
      const result = transcript.restorePresentation(snapshot.transcript)
      editor.setText(snapshot.composer.text)
      const api = editorMouseApi(editor)
      api.setCursor?.(snapshot.composer.cursor.line, snapshot.composer.cursor.col)
      if (snapshot.composer.selection === undefined) api.clearSelection?.()
      else api.setSelection?.(snapshot.composer.selection.anchor, snapshot.composer.selection.focus)
      capabilities.restoreDraftAttachments(snapshot.attachments)
      agentTree.restorePresentation(snapshot.tree)
      agentTree.resume()
      contextBar.clearChildContext()
      hideComposer = false
      editor.disableSubmit = false
      transcriptFocused = false
      tui.setFocus(agentTree)
      if (result === 'nearest') {
        setNotice(ui('父会话在子视图期间已更新；已恢复到最近的语义位置', 'The parent changed while the child view was open; restored the nearest semantic position'), 'warning')
      } else if (result === 'session-mismatch') {
        setNotice(ui('父会话视图尚未就绪；未应用旧的视口坐标', 'The parent view is not ready; stale viewport coordinates were not applied'), 'warning')
      }
      return result
    }

    const closeAgentChildView = (): boolean => childView.closeChildView({
      openParent: sessionId => { capabilities.openSession(sessionId) },
      restore: restoreParentView,
    }).closed

    const close = (outcome: TuiSurfaceOutcome): Promise<void> => {
      historyLoadController?.abort()
      detachFatalGuards()
      detachFatalGuards = () => undefined
      detachSuspendGuards()
      detachSuspendGuards = () => undefined
      if (stopping !== undefined) return stopping
      const closingNative = nativeOutput !== undefined && nativeOutputActive
      if (!closingNative) restoreSurfaceTerminalSync(terminalSession, process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
      else stopTuiRenderingSync()
      stopping = (async () => {
        const failures: unknown[] = []
        if (nativeOutput && closingNative) {
          try {
            await (async () => {
              await nativeOutput.drain()
              if (liveBehavior.get().mouseMode !== 'native') return
              transcript.finishNativeHistory()
              const finalCanvas = new CanvasLineCache()
              while (true) {
                transcript.render(terminal.columns)
                const batch = transcript.takeNativeHistoryBatch()
                if (!batch) break
                const success = await nativeOutput.frame(finalCanvas.render(batch.lines, terminal.columns), [], terminal.columns, terminal.rows, null)
                if (!success) break
                batch.acknowledge()
                await new Promise<void>(resolve => setImmediate(resolve))
              }
              await nativeOutput.drain()
            })()
          } catch (error) { failures.push(error) }
          restoreSurfaceTerminalSync(terminalSession, process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
        }
        if (elapsedTimer !== undefined) {
          clearInterval(elapsedTimer)
          elapsedTimer = undefined
        }
        notices.dispose()
        contextMenu.close()
        overlays.dispose()
        mouseController.dispose()
        welcome.dispose()
        transcript.dispose()
        agentTree.dispose()
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
        if (nativeOutput) {
          try { await withCleanupTimeout(() => nativeOutput.drain()) } catch (error) { failures.push(error) }
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

    const applyRenderedAppearance = (
      theme: ResolvedTuiTheme,
      rendering: TuiRenderingSettings,
      forceThemeRefresh = false,
    ): void => {
      const themeChanged = JSON.stringify(theme) !== JSON.stringify(liveTheme)
      const renderingChanged = liveRendering.colorMode !== rendering.colorMode || liveRendering.backgroundFill !== rendering.backgroundFill
      liveTheme = theme
      liveRendering = rendering
      setTheme(theme)
      setRendering(rendering)
      terminalSession.setBackgroundColor(theme.colors.canvas, backgroundSyncMode(rendering), forceThemeRefresh)
      // Re-encode tokens when either encoding or base-background policy changes.
      // refreshPresentation preserves selection and historical viewport anchors.
      if (themeChanged || forceThemeRefresh || renderingChanged) {
        syntax?.setTheme(theme)
        transcript.refreshPresentation()
      }
      tui.invalidate()
      requestSurfaceRender(true)
    }

    let displayModeTransition = false
    let historyLoadController: AbortController | undefined
    let nativeRenderState: {
      readonly frame: unknown
      readonly columns: number
      readonly rows: number
    } | undefined
    const interactionModeBlockReason = (next: TuiMouseMode): string | undefined => {
      if (next === liveBehavior.get().mouseMode) return undefined
      if (displayModeTransition) return ui('终端模式正在切换，请稍候', 'The terminal mode is already switching')
      if (historyLoadController !== undefined) return ui('完整历史仍在补载；可按 Esc 停止', 'Complete history is still loading; press Esc to stop')
      if (childView.isOpen()) return ui(
        '当前正在查看子 Agent；请先按 Esc 返回父会话。',
        'A child Agent is open; press Esc to return to the parent Session.',
      )
      const snapshot = active?.session.getSnapshot()
      if (snapshot?.running === true || (snapshot?.runningCalls.length ?? 0) > 0) return ui(
        '当前轮次仍在运行；请停止或等待完成后再切换终端模式。',
        'The current turn is still running; stop it or wait until it finishes before switching terminal modes.',
      )
      if ((snapshot?.pending.length ?? 0) > 0) return ui(
        '当前有待处理的审批或问题；处理完成后再切换终端模式。',
        'An approval or question is pending; resolve it before switching terminal modes.',
      )
      if ((snapshot?.queue.length ?? 0) > 0) return ui(
        '当前有待发送消息；清空队列或等待发送后再切换终端模式。',
        'Queued messages are waiting; clear or send them before switching terminal modes.',
      )
      return undefined
    }
    const loadCompleteHistory = async (
      signal?: AbortSignal,
      report: (loadedNodes: number) => void = () => undefined,
    ): Promise<'complete' | 'cancelled' | 'incomplete'> => {
      const target = active
      if (target === undefined) return 'complete'
      let lastSize = -1
      while (active?.sessionId === target.sessionId) {
        if (signal?.aborted === true) return 'cancelled'
        const snapshot = target.session.getSnapshot()
        if (!snapshot.hasMore) return 'complete'
        const size = snapshot.chat.order.length
        report(size)
        if (!snapshot.loadingOlder && size === lastSize) return 'incomplete'
        lastSize = size
        if (!snapshot.loadingOlder) await target.session.loadOlder()
        else await new Promise<void>(resolve => setTimeout(resolve, 16))
        if (nativeOutput) await new Promise<void>(resolve => setImmediate(resolve))
      }
      return signal?.aborted === true ? 'cancelled' : 'incomplete'
    }
    const switchDisplayMode = async (next: TuiMouseMode): Promise<void> => {
      const previous = terminalSession.displayMode()
      if (previous === next) return
      displayModeTransition = true
      try {
        if (next === 'native') {
          const controller = new AbortController()
          historyLoadController?.abort()
          historyLoadController = controller
          setNotice(ui('正在载入完整会话历史；按 Esc 可停止补载', 'Loading complete Session history; press Esc to stop backfilling'), 'info')
          const result = await loadCompleteHistory(controller.signal, loaded => {
            setNotice(ui(`正在载入完整会话历史 · ${String(loaded)} 个节点`, `Loading complete Session history · ${String(loaded)} nodes`), 'info')
          }).catch(() => 'incomplete' as const)
          if (historyLoadController === controller) historyLoadController = undefined
          if (result !== 'complete') setNotice(ui(
            '部分较早历史无法载入；已显示当前可用内容，可稍后使用 /transcript replay 重试。',
            'Some older history could not be loaded; available content is shown. Use /transcript replay to retry.',
          ), 'warning')
        }
        const managed = tui as TUI & ManagedTui
        await nativeOutput?.drain()
        nativeOutput?.reset(true)
        setNativeOutputMode(next === 'native')
        if (previous === 'native') {
          nativeRenderState = {
            frame: managed.captureRenderState?.(),
            columns: terminal.columns,
            rows: terminal.rows,
          }
        }
        transcript.setNativeMode(next === 'native')
        if (next === 'native') {
          terminalSession.setDisplayMode(next)
          const reusable = nativeRenderState !== undefined
            && nativeRenderState.frame !== undefined
            && nativeRenderState.columns === terminal.columns
            && nativeRenderState.rows === terminal.rows
          if (reusable) managed.restoreRenderState?.(nativeRenderState?.frame)
          else managed.resetRenderState?.()
        } else {
          managed.resetRenderState?.()
          terminalSession.setDisplayMode(next)
        }
        tui.invalidate()
        requestSurfaceRender()
      } finally {
        displayModeTransition = false
      }
    }

    actions = new TuiActions(capabilities, {
      overlays,
      transcript,
      notice: setNotice,
      refresh,
      refreshHeader: () => { refreshHeader(false) },
      applyTheme: (theme) => {
        applyRenderedAppearance(theme, liveRendering)
      },
      applyAppearance: (appearance, options) => {
        applyRenderedAppearance(
          resolveAppearanceTheme(appearance),
          resolveRendering(appearance),
          options?.forceThemeRefresh === true,
        )
      },
      applyLocale: (locale) => {
        setUiLocale(locale)
        capabilities.invalidateCommandCatalog()
        transcript.refreshPresentation()
        refreshHeader(false)
        refresh()
        tui.invalidate()
        requestSurfaceRender(true)
      },
      applyBehavior: async (behavior) => {
        contextMenu.close()
        const previous = liveBehavior.get()
        const blockReason = interactionModeBlockReason(behavior.mouseMode)
        if (blockReason !== undefined) throw new Error(blockReason)
        terminalSession.setMouseReporting(behavior.mouseMode, behavior.hoverFeedback)
        if (previous.mouseMode !== behavior.mouseMode) await switchDisplayMode(behavior.mouseMode)
        liveBehavior.apply(behavior)
        applyKeyBindingOverrides(behavior.keyBindings)
        setDangerConfirmDefault(behavior.dangerConfirmDefault)
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
        requestSurfaceRender(true)
      },
      applyWelcome: (settings) => {
        welcome.applySettings(settings)
      },
      refreshWelcome: () => welcome.refreshFastfetch(),
      previewWelcome: (settings, width) => welcome.preview(settings, width, active !== undefined),
      workspacePath: () => active?.workspacePath ?? options.cwd,
      setEditor: (text) => {
        editor.setText(escapeTerminalText(text))
        focusEditor()
        renderWhileOpen()
      },
      composerText: () => editor.getText(),
      canChangeSession: () => !childView.isOpen(),
      interactionModeBlockReason,
      openTranscript: () => {
        transcriptFocused = true
        transcript.followLatest()
        tui.setFocus(transcript)
        setNotice(ui('对话查看已打开：/ 搜索，Tab 返回输入框', 'Transcript view opened: / searches, Tab returns to the composer'), 'info')
        renderWhileOpen()
      },
      replayTranscript: () => {
        if (liveBehavior.get().mouseMode !== 'native') {
          setNotice(ui('历史回放只适用于终端原生模式；先使用 /mouse native', 'History replay is available in terminal-native mode; use /mouse native first'), 'warning')
          return
        }
        const controller = new AbortController()
        historyLoadController?.abort()
        historyLoadController = controller
        if (nativeOutput) transcript.pauseNativeHistory(true)
        setNotice(ui('正在补载完整历史；按 Esc 取消', 'Backfilling complete history; press Esc to cancel'), 'info')
        void loadCompleteHistory(controller.signal, loaded => {
          setNotice(ui(`正在补载完整历史 · ${String(loaded)} 个节点`, `Backfilling complete history · ${String(loaded)} nodes`), 'info')
        }).catch(() => 'incomplete' as const).then((result) => {
          if (stopping !== undefined || historyLoadController !== controller) return
          if (nativeOutput) transcript.pauseNativeHistory(false)
          if (historyLoadController === controller) historyLoadController = undefined
          if (controller.signal.aborted) { requestSurfaceRender(); return }
          nativeOutput?.reset()
          if (nativeOutput) transcript.resetNativeHistory()
          terminal.write(`\r\n${color.muted(ui('── 手动回放当前会话 ──', '── Manual transcript replay ──'))}\r\n`)
          ;(tui as TUI & ManagedTui).resetRenderState?.()
          transcript.refreshPresentation()
          requestSurfaceRender()
          if (result !== 'complete') setNotice(ui('历史载入未完成；已回放当前可用内容', 'History loading was incomplete; replayed available content'), 'warning')
        })
      },
      interactionOrigin: (sessionId) => {
        const child = childView.snapshot()
        if (child !== undefined && child.childSessionId === sessionId) {
          return `${child.parentSessionId} › ${agentTree.node(sessionId)?.label ?? sessionId}`
        }
        const current = capabilities.active()
        return current?.sessionId === sessionId ? current.summary.displayTitle : undefined
      },
      openAgentTree: async () => {
        const current = capabilities.active()
        if (current === undefined) return false
        const presentation = capabilities.subagentPresentation()
        const root = owningAgentRoot(presentation, current.sessionId)
        const probe = await presentation.listDirectChildren(root)
        if (probe.support === 'unsupported' || probe.value.source === 'direct-address') return false
        if (childView.isOpen()) closeAgentChildView()
        capabilities.setSubagentCatalogOpen(root, true)
        agentTree.openOrFocus(root, current.sessionId === root ? undefined : current.sessionId, editor.getExpandedText())
        transcriptFocused = false
        tui.setFocus(agentTree)
        renderWhileOpen()
        return true
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
          nativeOutput?.reset()
          if (nativeOutput) { transcript.resetNativeHistory(); transcript.pauseNativeHistory(false) }
        historyLoadController?.abort()
        historyLoadController = undefined
        suppressNativeFrames = false
        nativeRenderState = undefined
        if (childView.isOpen()) childView.discard()
        agentTree.suspend()
        contextMenu.close()
        mouseController.endGesture()
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
      const child = childView.snapshot()
      if (child !== undefined && current.sessionId !== child.childSessionId) {
        childView.discard()
        agentTree.resume()
        contextBar.clearChildContext()
        hideComposer = false
        editor.disableSubmit = false
        transcriptFocused = false
        focusEditor()
      }
      if (!childView.isOpen()) agentTree.resume()
      const previousSessionId = latestSessionId
      const sessionChanged = previousSessionId !== current.sessionId
      if (sessionChanged) {
        nativeOutput?.reset()
        if (nativeOutput) transcript.pauseNativeHistory(false)
        historyLoadController?.abort()
        nativeRenderState = undefined
        if (liveBehavior.get().mouseMode === 'native' && previousSessionId !== '') {
          suppressNativeFrames = true
          if (nativeOutput) transcript.pauseNativeHistory(true)
          ;(tui as TUI & ManagedTui).resetRenderState?.()
          terminal.write(`\r\n${color.muted(ui(
            `── 切换会话 · ${escapeTerminalText(current.summary.displayTitle)} ──`,
            `── Session · ${escapeTerminalText(current.summary.displayTitle)} ──`,
          ))}\r\n${color.muted(ui('正在补载完整历史…', 'Loading complete history…'))}\r\n`)
        }
      }
      active = current
      const owningRoot = owningAgentRoot(capabilities.subagentPresentation(), current.sessionId)
      agentTree.showCollapsedRoot(owningRoot, current.sessionId === owningRoot ? undefined : current.sessionId)
      if (agentTree.isOpen()) agentTree.refreshVisibleStatus()
      updateTranscript(current)
      actions.syncPending(snapshot)
      editor.disableSubmit = childView.composerMode() === 'read-only'
      if (sessionChanged) {
        contextMenu.close()
        latestSessionId = current.sessionId
        mouseController.endGesture()
        clearTranscriptPointerGesture()
        dismissNotice()
        refreshHeader(true)
        if (liveBehavior.get().mouseMode === 'native' && previousSessionId !== '') {
          const controller = new AbortController()
          historyLoadController = controller
          void loadCompleteHistory(controller.signal).catch(() => 'incomplete' as const).then((result) => {
            if (historyLoadController !== controller || active?.sessionId !== current.sessionId) return
            historyLoadController = undefined
            updateTranscript(active)
            if (nativeOutput) { transcript.pauseNativeHistory(false); transcript.resetNativeHistory() }
            suppressNativeFrames = false
            ;(tui as TUI & ManagedTui).resetRenderState?.()
            requestSurfaceRender()
            if (result !== 'complete') setNotice(ui(
              '会话历史补载未完成；已显示当前可用内容，可用 /transcript replay 重试。',
              'Session history backfill was incomplete; available content is shown. Use /transcript replay to retry.',
            ), 'warning')
          })
        }
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

    const writeSelectedText = async (text: string): Promise<boolean> => {
      if (text === '') return false
      return writeClipboard(text, {
        fallback: liveBehavior.get().clipboardFallback,
        platform: process.platform,
        writeOsc52: sequence => { terminal.write(sequence) },
      }).then(() => true).catch((error: unknown) => {
        setNotice(ui(
          `复制失败：${capabilityError(error)}`,
          `Copy failed: ${capabilityError(error)}`,
        ), 'warning')
        return false
      })
    }
    const copyText = (text: string): void => { void writeSelectedText(text) }
    editor.onSubmit = dispatchSubmittedComposer

    const copyActiveSelection = (): void => {
      if (overlays.hasActive()) { copyText(overlays.textTarget()?.text ?? ''); return }
      const agentTreeText = agentTree.copySelectionText()
      const transcriptText = transcript.copySelectionText()
      copyText(agentTreeText !== '' ? agentTreeText : transcriptText !== '' ? transcriptText : composerSelectionText())
    }

    const openMouseContextMenu = async (
      semantic: Extract<MouseSemanticEvent, { kind: 'click' }>,
    ): Promise<void> => {
      const region = semantic.region
      if (region === undefined || region.action.kind === 'context-menu' || !overlays.allowsContextMenu()) return
      const inOverlay = region?.action.kind === 'overlay'
      if (inOverlay && region.role === 'passive') return
      const overlayTarget = inOverlay ? overlays.textTarget(region.role === 'input' ? 'input' : 'body') : undefined
      const composer = region?.role === 'input' || region?.action.kind === 'composer'
      const selectionText = inOverlay
        ? overlayTarget?.text ?? ''
        : composer
          ? composerSelectionText()
          : region.action.kind === 'agent-tree' ? agentTree.copySelectionText() : transcript.copySelectionText()
      const pasteSupported = (inOverlay ? overlayTarget?.editable === true : composer) && canReadClipboardText(process.platform)
      const commonNodes = mouseContextActions({
        target: inOverlay ? overlayTarget?.editable === true ? 'overlay-input' : 'overlay' : composer ? 'composer' : 'transcript',
        hasSelection: selectionText !== '',
        pasteSupported,
      })
      const optionId = region.action.kind === 'overlay' ? region.action.optionId : undefined
      const contextTarget: ContextTarget | undefined = region.action.kind === 'overlay' && region.action.optionId !== undefined
        ? overlays.contextTarget(region.action.optionId)
        : region.action.kind === 'transcript' && region.action.command === 'toggle' && region.action.targetKey !== undefined
          ? { kind: 'tool-card', targetKey: region.action.targetKey }
          : region.action.kind === 'transcript' && region.action.command === 'toggle-reasoning' && region.action.targetKey !== undefined
            ? { kind: 'reasoning', targetKey: region.action.targetKey }
            : region.action.kind === 'agent-tree' && region.action.sessionId !== undefined
              && (region.action.command === 'row' || region.action.command === 'chevron')
              ? { kind: 'agent-tree', sessionId: region.action.sessionId, part: region.action.command }
              : region.action.kind === 'chrome' && ['model', 'reasoning', 'mode', 'permission', 'detail'].includes(region.action.commandId)
                ? { kind: 'chrome', commandId: region.action.commandId }
                : undefined
      const localMenu = optionId === undefined ? undefined : overlays.contextMenu(optionId)
      const objectMenu = localMenu ?? (contextTarget === undefined ? undefined : actions.contextMenuFor(contextTarget))
      const objectMenuSnapshot = JSON.stringify(objectMenu)
      const safeObjectNodes = objectMenu?.nodes.filter(node => node.kind !== 'action' || node.danger !== true) ?? []
      const dangerousObjectNodes = objectMenu?.nodes.filter(node => node.kind === 'action' && node.danger === true) ?? []
      const nodes: readonly ContextActionNode[] = objectMenu === undefined
        ? commonNodes
        : [
          ...safeObjectNodes,
          { kind: 'separator', id: 'persistent-actions' },
          ...commonNodes,
          ...(dangerousObjectNodes.length === 0 ? [] : [{ kind: 'separator' as const, id: 'danger-actions' }, ...dangerousObjectNodes]),
        ]
      const owner = active?.session
      const pageGeneration = overlays.activeGeneration()
      const composerText = editor.getText()
      const composerCursor = editorMouseApi(editor).getCursor()
      const valid = (): boolean => stopping === undefined && active?.session === owner
        && overlays.activeGeneration() === pageGeneration && overlays.allowsContextMenu()
        && (optionId === undefined || JSON.stringify(overlays.contextTarget(optionId)) === JSON.stringify(contextTarget))
        && (contextTarget?.kind !== 'agent-tree' || agentTree.node(contextTarget.sessionId as SessionId) !== undefined)
        && (localMenu !== undefined || contextTarget === undefined || JSON.stringify(actions.contextMenuFor(contextTarget)) === objectMenuSnapshot)
        && (inOverlay ? overlayTarget?.valid() === true : !composer || (
          editor.getText() === composerText && composerSelectionText() === selectionText
          && editorMouseApi(editor).getCursor().line === composerCursor.line
          && editorMouseApi(editor).getCursor().col === composerCursor.col
        ))
      const selected = await contextMenu.open({
        point: semantic.point,
        title: objectMenu?.title ?? ui('文本操作', 'Text actions'),
        nodes,
        valid,
      })
      if (selected === undefined || selected.id === 'close' || !valid()) return
      const textAction = ['copy', 'undo', 'cut', 'delete', 'select-all', 'paste'].includes(selected.id)
      if (!textAction && contextTarget !== undefined) {
        if (contextTarget.kind === 'tool-card') transcript.pointerToggleTool(contextTarget.targetKey)
        else if (contextTarget.kind === 'reasoning') transcript.pointerToggleReasoning(contextTarget.targetKey)
        else if (contextTarget.kind === 'agent-tree') {
          const sessionId = contextTarget.sessionId as SessionId
          if (selected.id === 'toggle') agentTree.contextToggle(sessionId)
          else if (selected.id === 'open' && agentTree.node(sessionId) !== undefined) openAgentChild(sessionId)
        } else if (optionId === undefined || !await overlays.executeContextAction(optionId, selected.id, pageGeneration)) {
          const prompts = inOverlay ? overlays.contextPrompts(pageGeneration) : undefined
          if (inOverlay && prompts === undefined) return
          await actions.executeContext({ target: contextTarget, actionId: selected.id }, prompts)
          if (prompts !== undefined) await overlays.refreshContextPrompts(prompts)
        }
        renderWhileOpen()
        return
      }
      if (selected.id === 'copy') {
        copyText(selectionText)
        return
      }
      if (selected.id === 'undo') {
        if (overlayTarget?.editable === true) overlayTarget.undo()
        else if (composer) editor.handleInput('\u001A')
        return
      }
      if (selected.id === 'cut') {
        if (!await writeSelectedText(selectionText) || !valid()) return
        if (overlayTarget?.editable === true) overlayTarget.replace('')
        else if (composer) editorMouseApi(editor).replaceSelection?.('')
        return
      }
      if (selected.id === 'delete') {
        if (overlayTarget?.editable === true) overlayTarget.replace('')
        else if (composer) editorMouseApi(editor).replaceSelection?.('')
        return
      }
      if (selected.id === 'select-all') {
        if (overlayTarget?.editable === true) overlayTarget.selectAll()
        else if (composer) {
          const lines = editor.getLines()
          const focus = { line: Math.max(0, lines.length - 1), col: lines.at(-1)?.length ?? 0 }
          const api = editorMouseApi(editor)
          api.setSelection?.({ line: 0, col: 0 }, focus)
          api.setCursor?.(focus.line, focus.col)
          renderWhileOpen()
        }
        return
      }
      if (selected.id !== 'paste') return
      try {
        const pasted = await readClipboardText({ platform: process.platform })
        if (!valid()) return
        if (pasted === '') {
          setNotice(ui('剪贴板中没有文本', 'The clipboard contains no text'), 'info')
          return
        }
        if (inOverlay) {
          overlayTarget?.replace(escapeTerminalText(pasted))
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

    const applyOverlayPointer = (point: CellPoint, origin: CellPoint | undefined, input: boolean, count = 1, ended = false): void => {
      const body = hitMap.regions.find(region => region.id === `overlay:${overlays.activeOverlayId()}:body`)
      if (body === undefined) return
      const local = (value: CellPoint): CellPoint => ({ col: value.col - body.rect.col, row: value.row - body.rect.row })
      overlays.handleTextPointer(local(point), origin === undefined ? undefined : local(origin), input, count, ended)
    }

    const restoreMouseFocus = (region: { readonly action: { readonly kind: string } } | undefined): void => {
      if (region?.action.kind === 'agent-tree') {
        transcriptFocused = false
        agentTree.focus()
        tui.setFocus(agentTree)
        return
      }
      if (region?.action.kind === 'transcript') {
        transcriptFocused = true
        tui.setFocus(transcript)
        return
      }
      if (region?.action.kind === 'overlay') return
      focusEditor()
    }

    const openAgentChild = (sessionId: SessionId): void => {
      const rootSessionId = agentTree.owningRootId()
      if (rootSessionId === undefined) return
      const presentation = capabilities.subagentPresentation()
      const continuation = presentation.continuation(sessionId)
      const composerMode = continuation.support === 'supported' && continuation.value.state === 'available'
        ? 'continuable' as const
        : 'read-only' as const
      const parent = capabilities.active()
      const selected = agentTree.selectedNode()
      const opened = childView.openChildView({
        parentSessionId: rootSessionId,
        childSessionId: sessionId,
        composerMode,
        capture: () => {
          const api = editorMouseApi(editor)
          const selection = api.getSelection?.()
          const overlayId = overlays.activeOverlayId()
          return {
            transcript: transcript.snapshotPresentation(),
            composer: {
              text: editor.getExpandedText(),
              cursor: { ...api.getCursor() },
              ...(selection === undefined ? {} : { selection: { anchor: { ...selection.anchor }, focus: { ...selection.focus } } }),
            },
            attachments: capabilities.draftAttachments(),
            tree: agentTree.snapshotPresentation(),
            ...(overlayId === undefined ? {} : { overlayId }),
          }
        },
        open: childSessionId => {
          const result = presentation.openChild(childSessionId)
          return result.support === 'supported' && result.value.opened
        },
      })
      if (!opened) {
        setNotice(ui('子 Agent 地址已失效，请刷新后重试', 'The subagent address is stale; refresh and try again'), 'warning')
        return
      }
      capabilities.clearAttachments()
      editor.setText('')
      hideComposer = composerMode === 'read-only'
      editor.disableSubmit = composerMode === 'read-only'
      contextBar.setChildContext(parent?.summary.displayTitle ?? rootSessionId, selected?.label ?? sessionId, composerMode === 'read-only')
      agentTree.blur()
      agentTree.suspend()
      transcriptFocused = composerMode === 'read-only'
      tui.setFocus(composerMode === 'read-only' ? transcript : editor)
    }

    const applyHoverPresentation = (region: HitRegion | undefined): boolean => {
      const id = region?.id
      const transcriptChanged = transcript.setHoveredRegion(id)
      const editorChanged = editor.setHoveredTarget(
        id?.startsWith('composer:autocomplete:') === true || id?.startsWith('chrome:model') === true
          || id?.startsWith('chrome:reasoning') === true
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
        region?.action.kind === 'overlay' ? region.action.command : undefined,
      )
      const agentTreeChanged = agentTree.handleHover(
        region?.action.kind === 'agent-tree' ? region.action.command : undefined,
        region?.action.kind === 'agent-tree' ? region.action.sessionId as SessionId | undefined : undefined,
      )
      const menuChanged = contextMenu.handleHover(region)
      return transcriptChanged || editorChanged || statusChanged || overlayChanged || agentTreeChanged || menuChanged
    }

    clearHoverPresentation = (): boolean => {
      const controllerChanged = mouseController.clearHover()
      return applyHoverPresentation(undefined) || controllerChanged
    }

    const dispatchMouseClick = (semantic: Extract<MouseSemanticEvent, { kind: 'click' }>): void => {
      clearTranscriptPointerGesture()
      const region = semantic.region
      if (semantic.suppressed) return
      if (contextMenu.handleClick(semantic, (point, target) => {
        if (target !== undefined) void openMouseContextMenu({ ...semantic, point, region: target })
      })) return
      if (region?.action.kind === 'context-menu') return // A removed menu's last-painted hits are inert.
      if (semantic.button === 'right') {
        void openMouseContextMenu(semantic)
        return
      }
      restoreMouseFocus(region)
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
          // Ordinary menus can navigate immediately. Confirmations are Enter-only above.
          overlays.activateArmedOption()
          clearMouseArm()
          return
        }
        if (result === 'focused') armMouseTarget('option', optionId, contentGeneration)
        return
      }
      if (region?.action.kind === 'overlay') {
        if (region.role === 'button') {
          overlays.handleFooterClick(region.action.command)
        } else if (region.role === 'input' || region.role === 'text') {
          applyOverlayPointer(semantic.point, undefined, region.role === 'input', semantic.count)
        }
        return
      }
      if (region?.action.kind === 'agent-tree') {
        const result = agentTree.handleClick(
          region.action.command,
          region.action.sessionId as SessionId | undefined,
          semantic.count,
        )
        if (result.collapsed === true) {
          const root = agentTree.owningRootId()
          if (root !== undefined) capabilities.setSubagentCatalogOpen(root, false)
          const snapshot = agentTree.restoreComposerSnapshot()
          if (snapshot !== undefined) editor.setText(snapshot)
          focusEditor()
        } else if (result.requestedOpen === true) {
          void actions.execute('subagents', '')
        } else if (result.openedSessionId !== undefined) {
          openAgentChild(result.openedSessionId)
        }
        renderWhileOpen()
        return
      }
      if (region?.role === 'scrollbar') {
        const origin = layout.lastContentGeometry()?.transcript
        if (origin !== undefined) transcript.handleScrollbarClick(region, semantic.point, origin)
        return
      }
      if (region?.action.kind === 'transcript' && region.action.command === 'toggle' && region.action.targetKey !== undefined) {
        transcript.pointerToggleTool(region.action.targetKey)
        return
      }
      if (region?.action.kind === 'transcript' && region.action.command === 'toggle-reasoning' && region.action.targetKey !== undefined) {
        transcript.pointerToggleReasoning(region.action.targetKey)
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
        if (!mouseController.allowsMouseActivation) {
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
        if (!mouseController.allowsMouseActivation) {
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
        else if (commandId === 'reasoning') void actions.execute('effort', '')
        else if (commandId === 'mode') void actions.execute('mode', '')
        else if (commandId === 'permission') void actions.execute('permission', '')
        else if (commandId === 'detail') void actions.execute('status', '')
        return
      }
      if (region?.role === 'input' || region?.action.kind === 'composer') {
        applyComposerPointer(semantic.point, undefined, false)
      }
    }

    const dispatchMouseDrag = (semantic: Extract<MouseSemanticEvent, { kind: 'drag' }>): void => {
      if (contextMenu.hasActive() || semantic.region?.action.kind === 'context-menu') return
      clearMouseArm()
      restoreMouseFocus(semantic.region)
      if (semantic.grabOffset !== undefined || mouseController.gesture === 'dragging-scrollbar') {
        clearTranscriptPointerGesture()
        const origin = layout.lastContentGeometry()?.transcript
        if (origin !== undefined) transcript.dragThumb(semantic.point.row - origin.row, semantic.grabOffset ?? 0)
      } else if (semantic.region?.action.kind === 'overlay') {
        clearTranscriptPointerGesture()
        applyOverlayPointer(semantic.point, semantic.origin, semantic.region.role === 'input', 1, semantic.ended === true)
      } else if (semantic.region?.action.kind === 'agent-tree') {
        clearTranscriptPointerGesture()
        const composer = layout.lastContentGeometry()?.composer
        if (composer !== undefined && semantic.origin !== undefined) {
          agentTree.selectText(agentTree.dockedGeometry(composer), semantic.origin, semantic.point)
        }
      } else if (semantic.region?.role === 'input' || semantic.region?.action.kind === 'composer') {
        clearTranscriptPointerGesture()
        applyComposerPointer(semantic.point, semantic.origin, true)
      } else {
        applyTranscriptPointer(semantic.point, semantic.origin, 'character', semantic.ended === true)
      }
      if (semantic.ended === true && liveBehavior.get().copyOnSelect) copyActiveSelection()
    }

    tui.addInputListener((data) => {
      if (terminalSession.consumeInput(data)) return { consume: true }
      performanceProbe.markInput()
      // ProcessTerminal's StdinBuffer owns framing and Escape timeouts. Rebuffering
      // a resolved Escape here would join it to the next mouse report again.
      // Bracketed paste is one opaque input and must not be parsed for mouse bytes.
      const mouseEvent = decodeMouseSequence(data)
      let pendingWheel = 0
      let needMouseRender = false
      if (mouseEvent != null) {
        const event = mouseEvent
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
            api.scrollAutocomplete?.(-outcome.semantic.lines)
          } else if (region?.action.kind === 'composer' || region?.role === 'input') {
            // A mouse wheel is a semantic navigation gesture, never keyboard bytes.
            // Inputs consume it without changing text or cursor state.
          } else if (region?.action.kind === 'agent-tree') {
            agentTree.scrollBy(outcome.semantic.lines)
            needMouseRender = true
          } else if (outcome.scrollTranscript !== undefined) {
            if (pendingWheel !== 0) mouseController.noteCoalescedWheel()
            pendingWheel += outcome.scrollTranscript
          }
        } else if (outcome.semantic?.kind === 'click') {
          dispatchMouseClick(outcome.semantic)
        } else if (outcome.semantic?.kind === 'drag') {
          dispatchMouseDrag(outcome.semantic)
        } else if (outcome.semantic?.kind === 'hover') {
          applyHoverPresentation(outcome.semantic.region)
        } else if (outcome.semantic?.kind === 'focus' && !outcome.semantic.focused) {
          contextMenu.close()
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
      if (mouseEvent != null && needMouseRender) {
        mouseController.recordMouseRender()
        renderWhileOpen()
      }
      // null includes malformed/legacy mouse frames: consume them, never fall
      // back to forwarding the original protocol bytes to a text field.
      if (mouseEvent !== undefined) return { consume: true }
      const payload = data
      if (payload === '') return { consume: true }
      clearTranscriptPointerGesture()
      clearMouseArm()
      mouseController.endGesture()
      if (clearHoverPresentation()) renderWhileOpen()
      if (historyLoadController !== undefined && matchesKey(payload, Key.escape)) {
        historyLoadController.abort()
        setNotice(ui('已停止补载；当前会话和 Agent 仍保持运行', 'Backfill stopped; the Session and Agent are still running'), 'warning')
        return { consume: true }
      }
      if (nativeOutput && matchesKey(payload, Key.escape) && liveBehavior.get().mouseMode === 'native'
        && !overlays.hasActive() && !active?.session.getSnapshot().running && transcript.nativeHistoryPending()) {
        nativeOutput.reset()
        transcript.cancelNativeReplay()
        setNotice(ui('已停止历史输出；后续消息正常显示，可用 /transcript replay 完整回放', 'History output stopped; new messages remain visible. Use /transcript replay for complete history.'), 'warning')
        requestSurfaceRender()
        return { consume: true }
      }
      if (matchesBinding('toggleMouseMode', payload)) {
        contextMenu.close()
        void actions.execute('mouse', 'toggle')
        return { consume: true }
      }
      if (matchesBinding('copySelection', payload)) {
        copyActiveSelection()
        return { consume: true }
      }
      const interrupt = consumeRunningInterrupt(payload, capabilities.active()?.session)
      if (interrupt !== undefined) { contextMenu.close(); return interrupt }
      if (contextMenu.handleInput(payload)) return { consume: true }
      if (overlays.hasActive() && matchesKey(payload, Key.ctrl('x'))) {
        const target = overlays.textTarget()
        if (target?.editable === true && target.text !== '') {
          void writeSelectedText(target.text).then(copied => { if (copied) target.replace('') })
          return { consume: true }
        }
      }
      if (overlays.hasActive()) return undefined
      if (liveBehavior.get().mouseMode === 'native' && matchesKey(payload, Key.ctrl('l'))) {
        transcript.invalidate()
        tui.invalidate()
        requestSurfaceRender()
        return { consume: true }
      }
      if (childView.isOpen() && matchesKey(payload, Key.escape)) {
        closeAgentChildView()
        return { consume: true }
      }
      if (agentTree.isFocused() && matchesBinding('focusToggle', payload)) {
        agentTree.blur()
        focusEditor()
        return { consume: true }
      }
      if (agentTree.isFocused()) {
        const result = agentTree.handleInput(payload)
        if (result.collapsed === true) {
          const root = agentTree.owningRootId()
          if (root !== undefined) capabilities.setSubagentCatalogOpen(root, false)
          const snapshot = agentTree.restoreComposerSnapshot()
          if (snapshot !== undefined) editor.setText(snapshot)
          focusEditor()
        } else if (result.openedSessionId !== undefined) {
          openAgentChild(result.openedSessionId)
        }
        if (result.consumed) return { consume: true }
      }
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
      if (!matchesBinding('interrupt', payload)) return undefined
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
    const activateWelcome = (): void => {
      if (stopping === undefined && transcript.isEmptyState()) welcome.activate()
    }
    void startupOnboarding.then(activateWelcome, activateWelcome)
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
    detachSuspendGuards = attachSuspendGuards({
      suspend: () => {
        contextMenu.close()
        mouseController.endGesture()
        clearTranscriptPointerGesture()
        clearMouseArm(true)
        clearHoverPresentation()
        restoreSurfaceTerminalSync(terminalSession, process.stdin, chunk => { process.stdout.write(chunk) }, terminal)
        tui.stop()
      },
      resume: () => {
        if (stopping !== undefined) return
        terminalSession.enter(liveBehavior.get().mouseMode)
        tui.start()
        terminalSession.startBackgroundSync()
        requestSurfaceRender(true)
      },
    })
    let candidateHistoryLoad: (() => void) | undefined
    if (liveBehavior.get().mouseMode === 'native' && nativeOutput) {
      transcript.setNativeMode(true)
      transcript.pauseNativeHistory(true)
      const controller = new AbortController()
      historyLoadController = controller
      candidateHistoryLoad = () => {
        setNotice(ui('正在补载完整历史；按 Esc 取消', 'Backfilling complete history; press Esc to cancel'), 'info')
        void loadCompleteHistory(controller.signal, loaded => {
          setNotice(ui(`正在补载完整历史 · ${loaded} 个节点`, `Backfilling complete history · ${loaded} nodes`), 'info')
        }).catch(() => 'incomplete' as const).then(result => {
          if (stopping !== undefined || historyLoadController !== controller) return
          historyLoadController = undefined
          transcript.pauseNativeHistory(false)
          transcript.resetNativeHistory()
          if (result !== 'complete') setNotice(ui('历史补载未完成；可用 /transcript replay 重试', 'History backfill incomplete; retry with /transcript replay'), 'warning')
          else dismissNotice()
          requestSurfaceRender()
        })
      }
    } else if (liveBehavior.get().mouseMode === 'native') {
      transcript.setNativeMode(true)
      const historyResult = await loadCompleteHistory().catch(() => 'incomplete' as const)
      if (historyResult !== 'complete') setNotice(ui(
        '部分较早历史无法载入；已显示当前可用内容，可稍后使用 /transcript replay 重试。',
        'Some older history could not be loaded; available content is shown. Use /transcript replay to retry.',
      ), 'warning')
      ;(tui as TUI & ManagedTui).resetRenderState?.()
    }
    terminalSession.enter(liveBehavior.get().mouseMode)
    tui.start()
    terminalSession.startBackgroundSync()
    refreshHeader(true)
    refresh()
    candidateHistoryLoad?.()
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
    detachSuspendGuards()
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
