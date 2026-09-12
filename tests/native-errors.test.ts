import { expect, it } from 'vitest'
import { terminalFailure } from '../src/host/native-errors.ts'
import { rpcErrorSchema } from '../vendor/api-contract/api/rpc.schema.js'

it.each([
  ['session/not-found', 'session-not-found', { sessionId: 'missing' }],
  ['session/attachment-invalid', 'attachment-error', { reason: 'invalid bytes' }],
  ['settings/conflict', 'settings-conflict', { ns: 'fixture', expected: 1, actual: 2 }],
  ['subagent/not-found', 'subagent-not-found', { parentSessionId: 'parent', childSessionId: 'child' }],
  ['directory-picker/exists', 'directory-exists', { path: '/fixture' }],
])('preserves %s as an actionable terminal failure', (code, expected, details) => {
  const result = terminalFailure({ code, message: 'fixture failure', details })
  expect(result).toEqual({ code: expected, message: 'fixture failure', details })
  expect(rpcErrorSchema.safeParse(result).success).toBe(true)
})

it('keeps unknown native codes visible without breaking RPC decoding', () => {
  const result = terminalFailure({ code: 'future/new-failure', message: 'fixture' })
  expect(result).toEqual({ code: 'internal', message: '[future/new-failure] fixture', details: {} })
  expect(rpcErrorSchema.safeParse(result).success).toBe(true)
})

it('does not emit a known variant with missing required details', () => {
  const result = terminalFailure({ code: 'session/not-found', message: 'fixture' })
  expect(result.code).toBe('internal')
  expect(rpcErrorSchema.safeParse(result).success).toBe(true)
})
