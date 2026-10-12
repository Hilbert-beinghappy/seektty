import { expect, it } from 'vitest'
import { createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import * as officialLocale from '@deepseek-ai/dsh-client-locale'
import * as terminalLocale from '../src/compat/locale-contract.ts'
import { terminalSessionEvent } from '../src/host/api-compat.ts'
import { dispatchTerminalRequest } from '../src/host/native-api-dispatch.ts'

it('keeps worker locale constants equal to the installed official contract', () => {
  expect(terminalLocale.LOCALE_IDS).toEqual(officialLocale.LOCALE_IDS)
  expect(terminalLocale.LOCALE_PREFERENCE_FIELD).toBe(officialLocale.LOCALE_PREFERENCE_FIELD)
  expect(terminalLocale.LOCALE_SETTINGS_NAMESPACE).toBe(officialLocale.LOCALE_SETTINGS_NAMESPACE)
})

it('projects a native flat tool result without changing the durable Host message', () => {
  const message = createToolResultMessage({ callId: ToolCallId('call'), content: [{ type: 'text', text: 'failure' }], isError: true })
  const event = { type: 'tool/result', seq: SessionSeq(0), time: 1, surfaceOp: 'append', data: { turn: 1, step: 1, message } } as SessionEvent
  const before = JSON.stringify(event)
  expect(terminalSessionEvent(event)).toMatchObject({ data: { message: { content: [{
    type: 'tool-result', content: [{ type: 'text', text: 'failure' }], isError: true,
  }] } } })
  expect(JSON.stringify(event)).toBe(before)
})

it.each(['agentPreset.copy', 'agentPreset.remove'])('rejects retired %s without invoking a missing Host endpoint', async method => {
  let calls = 0
  const gateway = { async invoke() { calls++; return {} } }
  await expect(dispatchTerminalRequest(gateway, {} as never, method, {}, 'fixture', new AbortController().signal))
    .rejects.toThrow('Harness profile patch')
  expect(calls).toBe(0)
})
