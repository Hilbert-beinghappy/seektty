import { describe, expect, it } from 'vitest'
import { DEFAULT_TERMINAL_TITLE, sessionTerminalTitle } from '../src/client/terminal-title.ts'

describe('terminal title', () => {
  it('follows running and pending-approval state, or stays on the product name when disabled', () => {
    expect(sessionTerminalTitle({
      follow: false,
      sessionTitle: 'Inspect theme',
      running: true,
      pendingApproval: true,
    })).toBe(DEFAULT_TERMINAL_TITLE)
    expect(sessionTerminalTitle({
      follow: true,
      sessionTitle: 'Inspect theme',
      running: true,
      pendingApproval: false,
    })).toBe('⏺ Inspect theme')
    expect(sessionTerminalTitle({
      follow: true,
      sessionTitle: 'Inspect theme',
      running: false,
      pendingApproval: true,
    })).toBe('⚠ Inspect theme')
    expect(sessionTerminalTitle({
      follow: true,
      sessionTitle: 'Inspect theme',
      running: false,
      pendingApproval: false,
    })).toBe('Inspect theme')
    expect(sessionTerminalTitle({
      follow: true,
      sessionTitle: '',
      running: false,
      pendingApproval: false,
    })).toBe(DEFAULT_TERMINAL_TITLE)
  })
})
