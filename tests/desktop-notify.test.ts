import { describe, expect, it } from 'vitest'
import {
  desktopNotifyBody,
  desktopNotifySequence,
  nextDesktopNotify,
} from '../src/client/desktop-notify.ts'
import { setUiLocale } from '../src/client/locale.ts'

describe('desktop notifications', () => {
  it('emits BEL plus OSC 9 and strips control characters from the body', () => {
    expect(desktopNotifySequence('回合完成')).toBe('\u0007\u001B]9;回合完成\u0007')
    expect(desktopNotifySequence('bad\u0007bell')).toBe('\u0007\u001B]9;bad bell\u0007')
  })

  it('notifies on turn completion, new approvals, and new questions after the first snapshot', () => {
    const idle = { running: false, pending: [] }
    const running = { running: true, pending: [] }
    const approval = { running: false, pending: [{ key: 'a1', kind: 'approval' }] }
    const question = { running: false, pending: [{ key: 'q1', kind: 'question' }] }

    expect(nextDesktopNotify(idle, running, false)).toBeUndefined()
    expect(nextDesktopNotify(running, idle, true)).toBe('turn-complete')
    expect(nextDesktopNotify(running, approval, true)).toBe('approval')
    expect(nextDesktopNotify(idle, question, true)).toBe('question')
    expect(nextDesktopNotify(approval, approval, true)).toBeUndefined()
    expect(desktopNotifyBody('approval')).toContain('工具审批')
    setUiLocale('en')
    expect(desktopNotifyBody('approval')).toContain('approval')
  })
})
