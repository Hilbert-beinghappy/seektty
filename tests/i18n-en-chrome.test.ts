import { afterEach, describe, expect, it } from 'vitest'
import { tuiCommands } from '../src/client/capabilities.ts'
import { ContextBar, StatusBar } from '../src/client/chrome.ts'
import { desktopNotifyBody } from '../src/client/desktop-notify.ts'
import { EMPTY_SESSION_EXAMPLES, emptyExampleText } from '../src/client/empty-examples.ts'
import { explainFailure } from '../src/client/error-advice.ts'
import { helpSectionChoices, helpSectionText, type HelpSectionId } from '../src/client/help.ts'
import { jobKillNotice } from '../src/client/job-control.ts'
import { helpKeymapText } from '../src/client/keymap.ts'
import { setUiLocale } from '../src/client/locale.ts'
import { relativeTime } from '../src/client/relative-time.ts'
import { Transcript } from '../src/client/transcript.ts'
import {
  DSH_COMPATIBILITY,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  launcherCopy,
  versionMessage,
} from '../src/dsh-compat.ts'

const HAN = /[\u4e00-\u9fff]/u

afterEach(() => { setUiLocale('zh') })

function englishChrome(): string {
  setUiLocale('en')
  const now = Date.parse('2026-08-18T00:00:00.000Z')
  const transcript = new Transcript(() => 8)
  transcript.empty()
  const context = new ContextBar('tui', '/tmp/workspace')
  const status = new StatusBar()
  status.setPermission('workspace-write')
  const sections: readonly HelpSectionId[] = ['keys', 'flows', 'doctor']
  return [
    ...helpSectionChoices().flatMap(choice => [choice.label, choice.description]),
    ...sections.map(helpSectionText),
    helpKeymapText(),
    ...EMPTY_SESSION_EXAMPLES.map(emptyExampleText),
    ...tuiCommands().flatMap(command => [command.description, command.argumentHint ?? '']),
    relativeTime(now - 10_000, now),
    relativeTime(now - 60_000, now),
    relativeTime(now - 3_600_000, now),
    relativeTime(now - 86_400_000, now),
    jobKillNotice('requested'),
    jobKillNotice('already-finished'),
    desktopNotifyBody('turn-complete'),
    desktopNotifyBody('approval'),
    desktopNotifyBody('question'),
    explainFailure('transport failure for /api/foo: handler failure: boom'),
    explainFailure('read timed out, please run /doctor'),
    ...transcript.render(60),
    ...context.render(80),
    ...status.render(80),
    launcherCopy('--profile 需要一个 Profile 名称', '--profile requires a Profile name', true),
    versionMessage({
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      compatibility: DSH_COMPATIBILITY,
    }, true),
  ].join('\n')
}

describe('i18n English chrome gate (task 7)', () => {
  it('keeps renderable chrome, help, and launcher copy free of Chinese in en mode', () => {
    const rendered = englishChrome()
    expect(rendered).not.toMatch(HAN)
    expect(rendered).toContain('Command palette')
    expect(rendered).toContain('New session')
    expect(rendered).toContain('Enter a message below')
  })
})
