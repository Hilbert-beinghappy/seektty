/** Public Clarify Remote contract consumed through ConnectionHandle.rpc.call. */

export const CLARIFY_API_CHANNEL = '/api'
export const CLARIFY_NAMESPACE = 'clarify'
export const CLARIFY_METHODS = ['start', 'answer', 'cancel', 'fetchDraft'] as const
export const CLARIFY_PROBE_PROCESS_ID = '__clarify_absent_probe__'

export type ClarifyMethod = (typeof CLARIFY_METHODS)[number]
export type ClarifyProcessStatus = 'running' | 'cancelled' | 'stale' | 'complete'
export type ClarifyStaleReason =
  | 'session-changed'
  | 'route-changed'
  | 'context-changed'
  | 'new-official-message'
  | 'compaction'
  | 'recall-injection'
  | 'ttl-expired'

export interface ClarifyOption {
  readonly optionId: string
  readonly text: string
}

export interface ClarifyQuestion {
  readonly questionId: string
  readonly text: string
  readonly options: readonly ClarifyOption[]
  readonly multiple: boolean
  readonly allowCustom: boolean
}

export interface ClarifyProcessEcho {
  readonly processId: string
  readonly sessionId: string
  readonly status: ClarifyProcessStatus
  readonly contextVersion: string
  readonly modelRouteId: string
  readonly staleReason?: ClarifyStaleReason | string
  readonly question?: ClarifyQuestion
  readonly draft?: string
}

export interface ClarifyRpcError {
  readonly code?: string
  readonly message?: string
}

export interface ClarifyRpcResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: ClarifyRpcError
}

export type ClarifyRpcCaller = (
  channel: string,
  endpoint: string,
  payload: { readonly args: Record<string, unknown> },
  signal?: AbortSignal,
) => Promise<ClarifyRpcResult>

const BUSINESS_CODES = new Set([
  'PROCESS_NOT_FOUND',
  'PROCESS_BUSY',
  'SESSION_ID_REQUIRED',
  'INVALID_ANSWER',
])

const ABSENT_CODES = new Set([
  'invocation-unavailable',
  'definition-unavailable',
  'service-unavailable',
  'method-unavailable',
])

const BUSINESS_MESSAGE = /PROCESS_NOT_FOUND|PROCESS_BUSY|SESSION_ID_REQUIRED|INVALID_ANSWER|process .+ does not exist|sessionId is required|session .+ is not available|already inferring/i
const ABSENT_MESSAGE = /no active Remote method|invocation-unavailable|definition-unavailable|no RPC handler|transport failure|HTTP 404|^not found$/i
const PROBE_PRESENCE_CODES = new Set(['PROCESS_NOT_FOUND'])
const PROBE_PRESENCE_MESSAGE = /PROCESS_NOT_FOUND|process .+ does not exist/i

export interface ClarifyParseOptions {
  /** Draft text is accepted only from a complete `fetchDraft` echo. */
  readonly allowDraft?: boolean
}

export class ClarifyRemoteError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ClarifyRemoteError'
    this.code = code
  }
}

export function clarifyEndpoint(method: ClarifyMethod): string {
  return `${CLARIFY_NAMESPACE}/${method}`
}

export function omitClarifyArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.length === 0 && key !== 'sessionId' && key !== 'processId' && key !== 'questionId') {
      continue
    }
    if (key === 'selectedOptionIds' && Array.isArray(value)) {
      if (value.length === 0) continue
      out[key] = [...value]
      continue
    }
    out[key] = value
  }
  return out
}

function clarifyErrorParts(result: ClarifyRpcResult): { readonly code: string; readonly message: string } {
  return {
    code: result.error?.code ?? '',
    message: result.error?.message ?? '',
  }
}

function isClarifyAbsent(result: ClarifyRpcResult): boolean {
  const { code, message } = clarifyErrorParts(result)
  return ABSENT_CODES.has(code) || ABSENT_MESSAGE.test(message)
}

/** Recognize documented Clarify business failures. This is not probe presence. */
export function isClarifyBusinessError(result: ClarifyRpcResult): boolean {
  if (isClarifyAbsent(result)) return false
  const { code, message } = clarifyErrorParts(result)
  return BUSINESS_CODES.has(code) || BUSINESS_MESSAGE.test(message)
}

/**
 * Presence proof for the impossible-processId `fetchDraft` probe.
 * Exact PROCESS_NOT_FOUND may prove presence. A wrapped/internal error must
 * mention CLARIFY_PROBE_PROCESS_ID, not an arbitrary other process.
 */
export function isClarifyProbePresence(result: ClarifyRpcResult): boolean {
  if (isClarifyAbsent(result)) return false
  const { code, message } = clarifyErrorParts(result)
  if (PROBE_PRESENCE_CODES.has(code)) return true
  return message.includes(CLARIFY_PROBE_PROCESS_ID) && PROBE_PRESENCE_MESSAGE.test(message)
}

/** Probe-only presence. Unrelated business errors do not prove the receiver. */
export function isClarifyReceiverPresent(result: ClarifyRpcResult): boolean {
  return isClarifyProbePresence(result)
}

export async function callClarify(
  rpc: ClarifyRpcCaller,
  method: ClarifyMethod,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await rpc(CLARIFY_API_CHANNEL, clarifyEndpoint(method), { args: omitClarifyArgs(args) }, signal)
  if (result.ok) return result.value
  throw new ClarifyRemoteError(result.error?.code ?? 'internal', result.error?.message ?? `clarify/${method} failed`)
}

export async function probeClarifyRemote(rpc: ClarifyRpcCaller, signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await rpc(
      CLARIFY_API_CHANNEL,
      clarifyEndpoint('fetchDraft'),
      { args: { processId: CLARIFY_PROBE_PROCESS_ID } },
      signal,
    )
    return isClarifyProbePresence(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return isClarifyProbePresence({ ok: false, error: { message } })
  }
}

export function parseClarifyEcho(value: unknown, options: ClarifyParseOptions = {}): ClarifyProcessEcho {
  if (typeof value !== 'object' || value === null) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify response must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.processId !== 'string' || record.processId.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify processId must be a non-empty string')
  }
  if (
    typeof record.sessionId !== 'string' || record.sessionId.trim() === ''
    || typeof record.contextVersion !== 'string' || record.contextVersion.trim() === ''
    || typeof record.modelRouteId !== 'string' || record.modelRouteId.trim() === ''
  ) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify echo is missing session binding fields')
  }
  if (record.status !== 'running' && record.status !== 'cancelled' && record.status !== 'stale' && record.status !== 'complete') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify status is not a shared contract value')
  }
  const question = record.status === 'running' ? parseQuestion(record.question) : undefined
  const draft = record.status === 'complete' && options.allowDraft === true && typeof record.draft === 'string'
    ? record.draft
    : undefined
  return {
    processId: record.processId,
    sessionId: record.sessionId,
    status: record.status,
    contextVersion: record.contextVersion,
    modelRouteId: record.modelRouteId,
    ...(typeof record.staleReason === 'string' ? { staleReason: record.staleReason } : {}),
    ...(question === undefined || record.status !== 'running' ? {} : { question }),
    ...(draft === undefined || record.status !== 'complete' ? {} : { draft }),
  }
}

function parseQuestion(value: unknown): ClarifyQuestion | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question must be an object')
  }
  const record = value as Record<string, unknown>
  if (typeof record.questionId !== 'string' || record.questionId.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify questionId must be a non-empty string')
  }
  if (typeof record.text !== 'string' || record.text.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question text must be a non-empty string')
  }
  if (typeof record.multiple !== 'boolean' || typeof record.allowCustom !== 'boolean') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question.multiple and allowCustom must be booleans')
  }
  if (!Array.isArray(record.options) || record.options.length === 0) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question must include at least one option')
  }
  const seen = new Set<string>()
  const options = record.options.map((option) => {
    if (typeof option !== 'object' || option === null) {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify option must be an object')
    }
    const row = option as Record<string, unknown>
    if (typeof row.optionId !== 'string' || row.optionId.trim() === '') {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify optionId values must be non-empty')
    }
    if (typeof row.text !== 'string' || row.text.trim() === '') {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify option text must be a non-empty string')
    }
    if (seen.has(row.optionId)) {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify optionId values must be unique')
    }
    seen.add(row.optionId)
    return { optionId: row.optionId, text: row.text }
  })
  return {
    questionId: record.questionId,
    text: record.text,
    multiple: record.multiple,
    allowCustom: record.allowCustom,
    options,
  }
}
