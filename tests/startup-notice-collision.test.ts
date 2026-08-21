import { afterEach, describe, expect, it } from 'vitest'
import {
  applyHandoffAttachmentRestoreNotice,
  attachmentRestoreFailureItem,
} from '../src/client/attachment-restore.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { onboardingDeferredNotice } from '../src/client/provider-onboarding.ts'
import {
  NoticeBoard,
  pickStatusLine,
  type StatusPriorityInput,
} from '../src/client/status-priority.ts'

function lineOf(board: NoticeBoard, extra: StatusPriorityInput = {}): string | undefined {
  const view = board.view()
  return pickStatusLine({
    ...(view.error === undefined ? {} : { error: view.error.message }),
    ...(view.warning === undefined ? {} : { warning: view.warning.message }),
    ...(view.toast === undefined ? {} : { notice: view.toast.message }),
    ...extra,
  })
}

afterEach(() => {
  setUiLocale('zh')
})

describe('startup notice collision after restart restore', () => {
  it('keeps a basename restore-failure visible after deferred onboarding overwrites the warning slot', () => {
    const path = '/Users/secret/photos/VISION_RC2_QK17.png'
    const board = new NoticeBoard()
    const setNotice = (message: string, tone: Parameters<NoticeBoard['set']>[1]): void => {
      board.set(message, tone)
    }

    applyHandoffAttachmentRestoreNotice(setNotice, [
      attachmentRestoreFailureItem(
        path,
        new Error(`ENOENT: no such file or directory, open '${path}'`),
        0,
      ),
    ], 0)
    setNotice(onboardingDeferredNotice(), 'warning')

    const line = lineOf(board)
    expect(line).toContain('VISION_RC2_QK17.png')
    expect(line).toMatch(/未恢复|not restored/u)
    expect(line).not.toContain('/Users/secret')
    expect(line).not.toContain(path)
    expect(line).not.toBe(onboardingDeferredNotice())
    setUiLocale('en')
    const english = lineOf(board)
    expect(english).toContain('VISION_RC2_QK17.png')
    expect(english).toMatch(/not restored/u)
    expect(english).not.toContain('/Users/secret')
    board.dispose()
  })

  it('still wins when deferred onboarding is recorded first', () => {
    const path = 'C:\\Users\\secret\\photos\\VISION_RC2_QK17.png'
    const board = new NoticeBoard()
    const setNotice = (message: string, tone: Parameters<NoticeBoard['set']>[1]): void => {
      board.set(message, tone)
    }

    setNotice(onboardingDeferredNotice(), 'warning')
    applyHandoffAttachmentRestoreNotice(setNotice, [
      attachmentRestoreFailureItem(path, new Error(`EIO: input/output error, read '${path}'`), 0),
    ], 0)

    const line = lineOf(board)
    expect(line).toContain('VISION_RC2_QK17.png')
    expect(line).not.toContain('C:\\Users\\secret')
    expect(line).not.toContain('C:/Users/secret')
    expect(line).not.toBe(onboardingDeferredNotice())
    board.dispose()
  })
})
