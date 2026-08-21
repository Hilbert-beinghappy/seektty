import { afterEach, describe, expect, it } from 'vitest'
import {
  attachmentRestoreFailureItem,
  attachmentRestoreFailureNotice,
  attachmentRestoreSuccessNotice,
} from '../src/client/attachment-restore.ts'
import { setUiLocale } from '../src/client/locale.ts'

afterEach(() => {
  setUiLocale('zh')
})

describe('restart attachment restore notices', () => {
  it('keeps the success copy unchanged', () => {
    setUiLocale('zh')
    expect(attachmentRestoreSuccessNotice(2)).toBe('已恢复 2 个附件')
    setUiLocale('en')
    expect(attachmentRestoreSuccessNotice(1)).toBe('Restored 1 attachment(s)')
  })

  it('shows basename plus the error and never the absolute path', () => {
    const unix = '/Users/secret/photos/resume.png'
    const windows = 'C:\\Users\\secret\\photos\\resume.png'
    setUiLocale('en')
    const unixItem = attachmentRestoreFailureItem(unix, new Error('too large'), 0)
    const windowsItem = attachmentRestoreFailureItem(windows, new Error('too large'), 1)
    expect(unixItem).toContain('resume.png')
    expect(unixItem).toContain('too large')
    expect(unixItem).not.toContain('/Users/secret')
    expect(unixItem).not.toContain(unix)
    expect(windowsItem).toContain('resume.png')
    expect(windowsItem).not.toContain('C:\\Users\\secret')
    expect(windowsItem).not.toContain('C:/Users/secret')
    setUiLocale('zh')
    const notice = attachmentRestoreFailureNotice([
      attachmentRestoreFailureItem(unix, new Error('无法读取'), 0),
    ])
    expect(notice).toBe('部分附件未恢复：resume.png: 无法读取')
    expect(notice).not.toContain('/Users/secret')
  })

  it('redacts the original path when an unclassified filesystem error repeats it', () => {
    const path = '/Users/private-account/photos/secret.png'
    setUiLocale('en')
    const item = attachmentRestoreFailureItem(
      path,
      new Error(`EIO: input/output error, read '${path}'`),
      0,
    )
    expect(item).toContain('secret.png')
    expect(item).toContain('EIO')
    expect(item).not.toContain('/Users/private-account')
    expect(item).not.toContain(path)
  })

  it('falls back to a 1-based index when the path has no filename', () => {
    setUiLocale('en')
    const item = attachmentRestoreFailureItem('/', new Error('missing'), 3)
    expect(item.startsWith('4:')).toBe(true)
    expect(item).toContain('missing')
    expect(item).not.toContain('/')
    const notice = attachmentRestoreFailureNotice([item])
    expect(notice).toBe('Some attachments were not restored: 4: missing')
  })
})
