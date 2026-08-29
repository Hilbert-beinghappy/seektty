import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TuiWelcomeFastfetchResult, TuiWelcomeSettings } from '@deepseek-ai/dsh-tui-protocol'
import { setUiLocale } from '../src/client/locale.ts'
import { defaultWelcomeSettings } from '../src/client/welcome-settings.ts'
import {
  layoutWelcome,
  renderCustomWelcomeRows,
  renderFastfetchRows,
  WelcomeController,
  type WelcomeRuntimeFacts,
} from '../src/client/welcome.ts'
import type { WelcomeLogo } from '../src/client/welcome-logo.ts'

const FACTS: WelcomeRuntimeFacts = {
  seekttyVersion: '1.2.4',
  profile: 'default',
  workspace: 'D:\\Code\\seektty',
  model: 'deepseek-chat',
  reasoning: 'high',
  mode: 'standard',
  permission: 'workspace',
  theme: 'DeepSeek Dark',
  platform: 'win32',
}

function logo(width: number, height: number, marker: string): WelcomeLogo {
  return { width, height, lines: Array.from({ length: height }, () => marker.repeat(width)) }
}

afterEach(() => {
  vi.unstubAllEnvs()
  setUiLocale('zh')
})

describe('welcome renderer', () => {
  it('renders every custom row kind and escapes user controls', () => {
    vi.stubEnv('NO_COLOR', '1')
    const lines = renderCustomWelcomeRows([
      { kind: 'heading', text: 'Hello\u001B[2J' },
      { kind: 'text', text: 'plain' },
      { kind: 'field', label: 'Name', value: 'SeekTTY' },
      { kind: 'fact', fact: 'workspace' },
      { kind: 'separator' },
      { kind: 'blank' },
      { kind: 'palette' },
    ], FACTS, 60)
    const output = lines.join('\n')
    expect(output).toContain('Hello')
    expect(output).not.toContain('\u001B[2J')
    expect(output).toContain('Name:  SeekTTY')
    expect(output).toContain('工作区:  D:\\Code\\seektty')
    expect(output).toContain('────')
    expect(output).toContain('●')
  })

  it('selects large, compact, then hidden layouts without scaling', () => {
    const large = logo(20, 3, 'L')
    const compact = logo(8, 2, 'C')
    expect(layoutWelcome(60, large, compact, () => ['info'])[0]).toContain('LLLL')
    expect(layoutWelcome(45, large, compact, () => ['info'])[0]).toContain('CCCC')
    expect(layoutWelcome(35, large, compact, () => ['info'])).toEqual(['info'])
  })

  it('renders parsed Fastfetch fields and concise failures', () => {
    vi.stubEnv('NO_COLOR', '1')
    const result: TuiWelcomeFastfetchResult = {
      status: 'ok',
      rows: [
        { kind: 'field', label: 'OS', value: 'Windows 11' },
        { kind: 'text', text: 'extra' },
      ],
    }
    expect(renderFastfetchRows(result, 40)).toEqual(['OS:  Windows 11', 'extra'])
    expect(renderFastfetchRows({ status: 'timeout', rows: [] }, 40)).toEqual(['Fastfetch 不可用'])
  })

  it('collects Fastfetch once per process configuration and refreshes explicitly', async () => {
    vi.stubEnv('NO_COLOR', '1')
    const collect = vi.fn(async (): Promise<TuiWelcomeFastfetchResult> => ({
      status: 'ok',
      rows: [{ kind: 'field', label: 'OS', value: 'Windows' }],
    }))
    const renders = vi.fn()
    const settings: TuiWelcomeSettings = {
      ...defaultWelcomeSettings(),
      infoMode: 'mixed',
      logo: { ...defaultWelcomeSettings().logo, source: 'none' },
    }
    const controller = new WelcomeController(settings, FACTS, collect, renders, vi.fn())
    expect(controller.render(80, false).join('\n')).toContain('正在读取 Fastfetch')
    controller.activate()
    await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(controller.render(80, false).join('\n')).toContain('OS:  Windows'))
    controller.setRuntimeFacts({ ...FACTS, model: 'another-model' })
    expect(collect).toHaveBeenCalledTimes(1)
    await controller.refreshFastfetch()
    expect(collect).toHaveBeenCalledTimes(2)
    controller.dispose()
  })
})
