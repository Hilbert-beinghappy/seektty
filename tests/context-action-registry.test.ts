import { afterEach, describe, expect, it } from 'vitest'
import { contextActionMenu } from '../src/client/context-action-registry.ts'
import { setUiLocale } from '../src/client/locale.ts'
import type { ContextActionNode, ContextTarget } from '../src/client/context-actions.ts'

function actionIds(nodes: readonly ContextActionNode[]): string[] {
  return nodes.flatMap(node => node.kind === 'submenu'
    ? [node.id, ...node.children.filter(child => child.kind === 'action').map(child => child.id)]
    : node.kind === 'action' ? [node.id] : [])
}

afterEach(() => { setUiLocale('zh') })

describe('semantic context action registry', () => {
  it.each([
    [{ kind: 'session', sessionId: 's1' }, ['open', 'rename', 'fork', 'export', 'export-zip', 'export-descendants', 'export-markdown', 'archive']],
    [{ kind: 'workspace', workspaceId: 'w1' }, ['open', 'manage', 'rename', 'reorder-sessions', 'reorder', 'unregister']],
    [{ kind: 'welcome-row', rowId: 'r1' }, ['edit', 'move', 'move-top', 'move-up', 'move-down', 'move-bottom', 'delete']],
    [{ kind: 'fastfetch-module', moduleId: 'cpu' }, ['move', 'move-up', 'move-down', 'remove']],
    [{ kind: 'plugin', pluginId: 'p1' }, ['details', 'update', 'remove']],
    [{ kind: 'file', path: 'a.txt' }, ['view', 'copy-path', 'open-external']],
    [{ kind: 'mcp-instance', id: 'm1' }, ['details', 'doctor', 'settings']],
  ] as const)('maps %s to the expected existing actions', (target, expected) => {
    expect(actionIds(contextActionMenu(target as ContextTarget)!.nodes)).toEqual(expected)
  })

  it('keeps dangerous Session actions last and marked as danger', () => {
    const nodes = contextActionMenu({ kind: 'session', sessionId: 's1' })!.nodes
    const archive = nodes.find(node => node.kind === 'action' && node.id === 'archive')
    expect(archive).toMatchObject({ kind: 'action', id: 'archive', danger: true })
    expect(nodes.at(-1)).toBe(archive)
  })

  it('disables stale-state actions in the menu description', () => {
    const job = contextActionMenu({ kind: 'job', jobId: 'done' }, { jobStoppable: false })!
    expect(job.nodes.find(node => node.kind === 'action' && node.id === 'stop')).toMatchObject({ disabledReason: expect.any(String) })
    const builtin = contextActionMenu({ kind: 'theme', themeId: 'dark' }, { customTheme: false })!
    const customize = builtin.nodes.find(node => node.kind === 'submenu' && node.id === 'customize')
    expect(customize?.kind === 'submenu' && customize.children.find(node => node.kind === 'action' && node.id === 'delete')).toMatchObject({ disabledReason: expect.any(String) })
  })

  it('localizes labels without changing stable action ids', () => {
    const target: ContextTarget = { kind: 'session', sessionId: 's1' }
    const zh = contextActionMenu(target)!
    setUiLocale('en')
    const en = contextActionMenu(target)!
    expect(actionIds(en.nodes)).toEqual(actionIds(zh.nodes))
    expect(en.title).toBe('Session · s1')
    expect(zh.title).toBe('会话 · s1')
  })
})
