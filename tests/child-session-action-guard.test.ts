import { describe, expect, it, vi } from 'vitest'
import { TuiActions, type TuiActionHost } from '../src/client/actions.ts'
import type { HarnessTuiCapabilities } from '../src/client/capabilities.ts'

describe('child Session action guard', () => {
  it.each(['new', 'resume', 'sessions', 'fork', 'archive'])(
    'blocks /%s until the child view is closed',
    async (command) => {
      const capabilities = {
        newSession: vi.fn(),
        listRootSessions: vi.fn(),
        listSessions: vi.fn(),
        forkSession: vi.fn(),
        archiveSession: vi.fn(),
      } as unknown as HarnessTuiCapabilities
      const notice = vi.fn()
      const host = {
        canChangeSession: () => false,
        notice,
      } as unknown as TuiActionHost

      await new TuiActions(capabilities, host).execute(command, '')

      expect(capabilities.newSession).not.toHaveBeenCalled()
      expect(capabilities.listRootSessions).not.toHaveBeenCalled()
      expect(capabilities.forkSession).not.toHaveBeenCalled()
      expect(capabilities.archiveSession).not.toHaveBeenCalled()
      expect(notice).toHaveBeenCalledWith(expect.stringContaining('Esc'), 'warning')
    },
  )

  it('blocks only workspace operations that would open another Session', async () => {
    const openWorkspace = vi.fn()
    const capabilities = { openWorkspace } as unknown as HarnessTuiCapabilities
    const host = {
      canChangeSession: () => false,
      notice: vi.fn(),
    } as unknown as TuiActionHost

    await new TuiActions(capabilities, host).execute('workspace', 'open C:\\review')

    expect(openWorkspace).not.toHaveBeenCalled()
    expect(host.notice).toHaveBeenCalledWith(expect.stringContaining('Esc'), 'warning')
  })
})
