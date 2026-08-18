import { describe, expect, it, vi } from 'vitest'
import type { Component, OverlayHandle, TUI } from '@mariozechner/pi-tui'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'
import { OverlayQueue } from '../src/client/overlays.ts'
import type { Transcript } from '../src/client/transcript.ts'
import {
  TUI_APPEARANCE_SETTINGS_NAMESPACE,
  TUI_BEHAVIOR_SETTINGS_NAMESPACE,
  type TuiManagementBridge,
  type TuiSettingsDocument,
} from '../src/protocol.ts'

const ESCAPE = '\u001B'
const ENTER = '\r'
const DOWN = '\u001B[B'

function plain(lines: readonly string[]): string {
  return lines.join('\n').replace(/\u001B\[[0-9;:]*m/gu, '')
}

function settingsDocument(namespace: string, value: unknown): TuiSettingsDocument {
  return {
    namespace,
    schema: {},
    value,
    revision: 0,
    applies: 'live',
    secrets: [],
  }
}

function actionHarness(capabilities: Partial<HarnessTuiCapabilities> = {}): {
  readonly actions: TuiActions
  readonly hide: ReturnType<typeof vi.fn>
  component(): Component & { handleInput(data: string): void }
} {
  const management = {
    settings: {
      describe: vi.fn(async (namespace?: string) => {
        if (namespace === TUI_APPEARANCE_SETTINGS_NAMESPACE) {
          return [settingsDocument(TUI_APPEARANCE_SETTINGS_NAMESPACE, {
            theme: 'dark',
            codeTheme: 'auto',
            customThemes: [],
          })]
        }
        if (namespace === TUI_BEHAVIOR_SETTINGS_NAMESPACE) {
          return [settingsDocument(TUI_BEHAVIOR_SETTINGS_NAMESPACE, {})]
        }
        return []
      }),
    },
    plugins: {
      doctor: vi.fn(async () => ({
        profile: 'tui',
        pnpm: '9.0.0',
        diagnostics: [],
      })),
    },
    profiles: {
      list: vi.fn(async () => []),
    },
  } as unknown as TuiManagementBridge
  const defaults = {
    managementBridge: () => management,
    active: () => ({ workspaceId: 'w1', workspacePath: '/tmp/demo' }),
    listWorkspaces: () => [{
      workspaceId: 'w1',
      title: 'Demo',
      path: '/tmp/demo',
      sessionIds: ['s1'],
    }],
    listSessions: () => [],
    headerFacts: async () => ({
      hostVersion: '1.0.0',
      nodeVersion: 'v22.0.0',
      platform: 'darwin',
      architecture: 'arm64',
      profile: 'tui',
      workspace: '/tmp/demo',
      session: 'session',
      mode: 'agent',
      model: 'deepseek/chat',
      permission: 'default',
      running: false,
    }),
    pluginInventory: async () => [],
    toolCatalog: () => [{
      name: 'bash',
      description: 'Run a shell command',
      parameters: { type: 'object' },
    }],
    projection: () => undefined,
    producedFileGroups: async () => [{ turn: 1, paths: ['notes.md'] }],
    readProducedFile: async () => 'file body',
    producedFilePath: () => '/tmp/demo/notes.md',
    trajectory: () => ({
      eventNodes: [{}],
      requests: [{
        purpose: 'assistant',
        status: 'completed',
        startSeq: 1,
        requestConfig: { provider: 'deepseek', model: 'chat' },
        startedAt: 1,
        completedAt: 2,
      }],
      runningCalls: [],
    }),
    sessionStatistics: () => ({ lines: ['tokens 12'] }),
    projectionEntries: () => [['todos', [{ id: '1' }]]],
    exportSession: async () => ({ path: '/tmp/session.zip', bytes: 12 }),
  }
  let mounted: Component | undefined
  const hide = vi.fn()
  const tui = {
    showOverlay: vi.fn((component: Component) => {
      mounted = component
      return { hide } as unknown as OverlayHandle
    }),
    requestRender: vi.fn(),
  } as unknown as TUI
  const overlays = new OverlayQueue(tui)
  const host: TuiActionHost = {
    overlays,
    transcript: { cycleToolVisibility: () => 'collapsed' } as unknown as Transcript,
    notice: vi.fn(),
    refresh: vi.fn(),
    refreshHeader: vi.fn(),
    applyTheme: vi.fn(),
    applyLocale: vi.fn(),
    setEditor: vi.fn(),
    copy: vi.fn(),
    close: vi.fn(),
    restart: vi.fn(),
    requireRestart: vi.fn(),
  }
  return {
    actions: new TuiActions(
      { ...defaults, ...capabilities } as unknown as HarnessTuiCapabilities,
      host,
    ),
    hide,
    component: () => {
      if (mounted === undefined) throw new Error('overlay has not mounted')
      return mounted as Component & { handleInput(data: string): void }
    },
  }
}

async function expectPage(
  harness: ReturnType<typeof actionHarness>,
  pattern: string | RegExp,
): Promise<void> {
  await vi.waitFor(() => {
    expect(plain(harness.component().render(90))).toMatch(pattern)
  })
}

describe('nested overlay back stack', () => {
  it('returns from a help section to the help root on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('help', '')

    await expectPage(harness, /帮助|Help/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /键位速查|Keyboard shortcuts/)
    expect(plain(harness.component().render(90))).toMatch(/F1|Ctrl\+P/)

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /常用流程|Common workflows/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a keymap action to the keymap root on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('keymap', '')

    await expectPage(harness, /快捷键|Key bindings/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /设置新组合|Set a new chord/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /快捷键|Key bindings/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a theme child to the theme root on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('theme', '')

    await expectPage(harness, /主题|Theme/)
    harness.component().handleInput(DOWN)
    harness.component().handleInput(DOWN)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /代码块主题|Code-block theme/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /自定义颜色|Custom colors/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a workspace action to the workspace list on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('workspace', '')

    await expectPage(harness, /工作区|Workspace/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /打开／新建会话|Open \/ create session/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /添加目录|Add directory/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from export path input to the export scope list on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('export', '')

    await expectPage(harness, /导出会话|Export session/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /保存会话 ZIP|Save session ZIP/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /仅当前会话|Current session only/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a produced-file action to the file list on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('files', '')

    await expectPage(harness, /产出文件|Produced files/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /在 TUI 内查看|View in TUI/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /notes\.md/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a doctor detail page to the doctor root on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('doctor', '')

    await expectPage(harness, /诊断|Diagnostics/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /运行环境详情|Runtime details/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /诊断 · tui|Diagnostics · tui/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a trajectory detail page to the trajectory list on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('trajectory', '')

    await expectPage(harness, /轨迹|Trajectory/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /用途|Purpose/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /轨迹|Trajectory/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })

  it('returns from a status projection to the status root on Escape', async () => {
    const harness = actionHarness()
    const execution = harness.actions.execute('status', '')

    await expectPage(harness, /状态与统计|Status and statistics/)
    harness.component().handleInput(ENTER)
    await expectPage(harness, /会话数据|Session data/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await expectPage(harness, /状态与统计|Status and statistics/)
    expect(harness.hide).not.toHaveBeenCalled()

    harness.component().handleInput(ESCAPE)
    await execution
    expect(harness.hide).toHaveBeenCalledOnce()
  })
})
