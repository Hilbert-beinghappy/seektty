import { z } from 'zod'
import { rpcErrorSchema } from '../../vendor/api-contract/api/rpc.schema.js'
import type { RpcError } from '../../vendor/api-contract/api/rpc.js'

const nativeError = z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() })
const aliases: Readonly<Record<string, string>> = {
  'session/not-found': 'session-not-found',
  'session/agent-busy': 'agent-busy',
  'session/model-unavailable': 'model-unavailable',
  'session/invalid-time-zone': 'invalid-time-zone',
  'subagent/invalid-time-zone': 'invalid-time-zone',
  'session/workspace-attach-failed': 'workspace-attach-failed',
  'session/attachment-invalid': 'attachment-error',
  'subagent/attachment-invalid': 'attachment-error',
  'session/queue-item-not-found': 'queue-item-not-found',
  'session/steer-unavailable': 'steer-unavailable',
  'session/title-invalid': 'title-invalid',
  'session/fork-unavailable': 'fork-unavailable',
  'directory-picker/unreadable': 'directory-unreadable',
  'directory-picker/exists': 'directory-exists',
  'directory-picker/create-failed': 'directory-create-failed',
}

/** Preserve compatible native failures; never send malformed legacy details. */
export function terminalFailure(error: unknown): RpcError {
  if (error instanceof z.ZodError) return { code: 'bad-request', message: error.message, details: { issues: error.issues } }
  const parsed = nativeError.safeParse(error)
  if (!parsed.success) return { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} }
  const { code, message, details = {} } = parsed.data
  const compatible = rpcErrorSchema.safeParse({ code: aliases[code] ?? code.replace('/', '-'), message, details })
  if (compatible.success) return compatible.data
  // New failures without a corresponding terminal variant remain visible by code.
  return { code: 'internal', message: `[${code}] ${message}`, details: {} }
}
