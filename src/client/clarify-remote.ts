/** Public Clarify Remote contract consumed through ConnectionHandle.rpc.call. */

import { PACKAGE_VERSION } from '../dsh-compat.ts'

export const CLARIFY_API_CHANNEL = '/api'
export const CLARIFY_NAMESPACE = 'clarify'
export const CLARIFY_WIRE_PROTOCOL = 'clarify.wire/1' as const
export const CLARIFY_METHODS = ['start', 'answer', 'accept', 'refine', 'cancel', 'fetchDraft'] as const
export const CLARIFY_REQUIRED_PACKAGE = 'dsh-plugin-clarify@0.2.0'
export const CLARIFY_FAILURE_CATEGORIES = [
  'retryable',
  'configuration',
  'conflict',
  'invalid-request',
  'protocol',
] as const
export const CLARIFY_REQUIRED_METHODS = CLARIFY_METHODS
export const CLARIFY_PROBE_PROCESS_ID = '__clarify_absent_probe__'

export type ClarifyMethod = (typeof CLARIFY_METHODS)[number]
export type ClarifyFailureCategory = (typeof CLARIFY_FAILURE_CATEGORIES)[number]
export type ClarifyProcessStatus = 'running' | 'cancelled' | 'stale' | 'complete'
export type ClarifyRunningKind = 'ask' | 'await_accept'
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
  readonly kind?: ClarifyRunningKind
  readonly previewVersion?: string
  readonly draftPreview?: string
  readonly materialChanges?: readonly string[]
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

const ABSENT_CODES = new Set([
  'invocation-unavailable',
  'definition-unavailable',
  'service-unavailable',
  'method-unavailable',
])

const ABSENT_MESSAGE = /no active Remote method|invocation-unavailable|definition-unavailable|no RPC handler|transport failure|HTTP 404|^not found$/i
const PROBE_PRESENCE_CODES = new Set(['PROCESS_NOT_FOUND'])
const PROBE_PRESENCE_MESSAGE = /PROCESS_NOT_FOUND|process .+ does not exist/i

export interface ClarifyParseOptions {
  /** Draft text is accepted only from a complete `fetchDraft` echo. */
  readonly allowDraft?: boolean
}

export class ClarifyRemoteError extends Error {
  readonly code: string
  readonly category?: ClarifyFailureCategory

  constructor(code: string, message: string, category?: ClarifyFailureCategory) {
    super(message)
    this.name = 'ClarifyRemoteError'
    this.code = code
    if (category !== undefined) this.category = category
  }
}

export function clarifyEndpoint(method: ClarifyMethod): string {
  return `${CLARIFY_NAMESPACE}/${method}`
}

export function omitClarifyArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue
    if (typeof value === 'string' && value.length === 0 && key !== 'sessionId' && key !== 'processId' && key !== 'questionId' && key !== 'previewVersion') {
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

function isClarifyFailureCategory(value: unknown): value is ClarifyFailureCategory {
  return typeof value === 'string' && (CLARIFY_FAILURE_CATEGORIES as readonly string[]).includes(value)
}

export function parseClarifyWireResult(value: unknown): {
  readonly protocol: typeof CLARIFY_WIRE_PROTOCOL
  readonly ok: true
  readonly value: unknown
} | {
  readonly protocol: typeof CLARIFY_WIRE_PROTOCOL
  readonly ok: false
  readonly error: { readonly code: string; readonly message: string; readonly category: ClarifyFailureCategory }
} {
  if (typeof value !== 'object' || value === null) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify wire result must be an object', 'protocol')
  }
  const record = value as Record<string, unknown>
  if (record.protocol !== CLARIFY_WIRE_PROTOCOL) {
    throw new ClarifyRemoteError('INVALID_ANSWER', `Clarify wire protocol must be ${CLARIFY_WIRE_PROTOCOL}`, 'protocol')
  }
  if (record.ok === true) {
    return { protocol: CLARIFY_WIRE_PROTOCOL, ok: true, value: record.value }
  }
  if (record.ok !== false) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify wire result.ok must be a boolean', 'protocol')
  }
  if (typeof record.error !== 'object' || record.error === null) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify wire error must be an object', 'protocol')
  }
  const error = record.error as Record<string, unknown>
  if (typeof error.code !== 'string' || typeof error.message !== 'string' || !isClarifyFailureCategory(error.category)) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify wire error is missing code, message, or category', 'protocol')
  }
  return {
    protocol: CLARIFY_WIRE_PROTOCOL,
    ok: false,
    error: { code: error.code, message: error.message, category: error.category },
  }
}

function tryParseClarifyWire(value: unknown): ReturnType<typeof parseClarifyWireResult> | undefined {
  try {
    return parseClarifyWireResult(value)
  } catch {
    return undefined
  }
}

function isClarifyV1ProcessNotFound(result: ClarifyRpcResult): boolean {
  if (!result.ok) return false
  const inner = tryParseClarifyWire(result.value)
  return inner !== undefined && inner.ok === false && inner.error.code === 'PROCESS_NOT_FOUND'
}

/** Recognize documented Clarify business failures. This is not probe presence. */
export function isClarifyBusinessError(result: ClarifyRpcResult): boolean {
  if (isClarifyAbsent(result) || !result.ok) return false
  const inner = tryParseClarifyWire(result.value)
  return inner !== undefined && inner.ok === false
}

/**
 * Presence proof for the impossible-processId `fetchDraft` probe.
 * Exact PROCESS_NOT_FOUND may prove presence. A wrapped/internal error must
 * mention CLARIFY_PROBE_PROCESS_ID, not an arbitrary other process.
 */
export function isClarifyProbePresence(result: ClarifyRpcResult): boolean {
  if (isClarifyAbsent(result)) return false
  if (isClarifyV1ProcessNotFound(result)) return true
  if (result.ok) return false
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
  if (!result.ok) {
    throw new ClarifyRemoteError(result.error?.code ?? 'internal', result.error?.message ?? `clarify/${method} failed`)
  }
  const inner = parseClarifyWireResult(result.value)
  if (inner.ok) return inner.value
  throw new ClarifyRemoteError(inner.error.code, inner.error.message, inner.error.category)
}

export async function probeClarifyRemote(rpc: ClarifyRpcCaller, signal?: AbortSignal): Promise<boolean> {
  try {
    const fetchDraft = await rpc(
      CLARIFY_API_CHANNEL,
      clarifyEndpoint('fetchDraft'),
      { args: { processId: CLARIFY_PROBE_PROCESS_ID } },
      signal,
    )
    if (!isClarifyProbePresence(fetchDraft)) return false
    const refine = await rpc(
      CLARIFY_API_CHANNEL,
      clarifyEndpoint('refine'),
      { args: { processId: CLARIFY_PROBE_PROCESS_ID, previewVersion: 'probe', feedback: 'probe' } },
      signal,
    )
    if (isClarifyAbsent(refine)) return false
    return isClarifyProbePresence(refine)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return isClarifyProbePresence({ ok: false, error: { message } })
  }
}

export function clarifySixMethodHostRefusedMessage(): string {
  return `SeekTTY ${PACKAGE_VERSION} requires ${CLARIFY_REQUIRED_PACKAGE} six-method Host (${CLARIFY_REQUIRED_METHODS.join(', ')}); five-method Hosts are refused`
}

export function clarifyCompatibleHostRefusedMessage(): string {
  return `SeekTTY ${PACKAGE_VERSION} requires ${CLARIFY_REQUIRED_PACKAGE} six-method Host with ${CLARIFY_WIRE_PROTOCOL}; old six-method or no-v1 Hosts are refused`
}

async function probeMethod(
  rpc: ClarifyRpcCaller,
  method: ClarifyMethod,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ClarifyRpcResult> {
  try {
    return await rpc(CLARIFY_API_CHANNEL, clarifyEndpoint(method), { args }, signal)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { message } }
  }
}

export async function requireClarifyCompatibleHost(rpc: ClarifyRpcCaller, signal?: AbortSignal): Promise<void> {
  const fetchDraft = await probeMethod(rpc, 'fetchDraft', { processId: CLARIFY_PROBE_PROCESS_ID }, signal)
  const refine = await probeMethod(
    rpc,
    'refine',
    { processId: CLARIFY_PROBE_PROCESS_ID, previewVersion: 'probe', feedback: 'probe' },
    signal,
  )
  if (isClarifyV1ProcessNotFound(fetchDraft) && isClarifyV1ProcessNotFound(refine)) return
  if (isClarifyAbsent(fetchDraft) || isClarifyAbsent(refine)) {
    throw new ClarifyRemoteError('method-unavailable', clarifySixMethodHostRefusedMessage(), 'protocol')
  }
  throw new ClarifyRemoteError('protocol', clarifyCompatibleHostRefusedMessage(), 'protocol')
}

export async function requireClarifySixMethodHost(rpc: ClarifyRpcCaller, signal?: AbortSignal): Promise<void> {
  await requireClarifyCompatibleHost(rpc, signal)
}

export function parseClarifyEcho(value: unknown, options: ClarifyParseOptions = {}): ClarifyProcessEcho {
  if (typeof value !== 'object' || value === null) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify response must be an object', 'protocol')
  }
  const record = value as Record<string, unknown>
  if (typeof record.processId !== 'string' || record.processId.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify processId must be a non-empty string', 'protocol')
  }
  if (
    typeof record.sessionId !== 'string' || record.sessionId.trim() === ''
    || typeof record.contextVersion !== 'string' || record.contextVersion.trim() === ''
    || typeof record.modelRouteId !== 'string' || record.modelRouteId.trim() === ''
  ) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify echo is missing session binding fields', 'protocol')
  }
  if (record.status !== 'running' && record.status !== 'cancelled' && record.status !== 'stale' && record.status !== 'complete') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify status is not a shared contract value', 'protocol')
  }
  const running = record.status === 'running' ? parseRunning(record) : undefined
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
    ...(running ?? {}),
    ...(draft === undefined || record.status !== 'complete' ? {} : { draft }),
  }
}

function parseRunning(record: Record<string, unknown>): {
  readonly kind: ClarifyRunningKind
  readonly previewVersion: string
  readonly draftPreview: string
  readonly materialChanges: readonly string[]
  readonly question?: ClarifyQuestion
} {
  if (record.kind !== 'ask' && record.kind !== 'await_accept') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify running kind must be ask or await_accept', 'protocol')
  }
  if (typeof record.previewVersion !== 'string' || record.previewVersion.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify running previewVersion must be a non-empty string', 'protocol')
  }
  if (typeof record.draftPreview !== 'string' || record.draftPreview.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify running draftPreview must be a non-empty string', 'protocol')
  }
  const materialChanges = parseTextList(record.materialChanges, 'materialChanges')
  const question = parseQuestion(record.question)
  if (record.kind === 'ask' && question === undefined) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify ask response must include a question', 'protocol')
  }
  if (record.kind === 'await_accept' && question !== undefined) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify await_accept response must not include a question', 'protocol')
  }
  return {
    kind: record.kind,
    previewVersion: record.previewVersion,
    draftPreview: record.draftPreview,
    materialChanges,
    ...(question === undefined ? {} : { question }),
  }
}

function parseTextList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ClarifyRemoteError('INVALID_ANSWER', `Clarify ${field} must be a non-empty string array`, 'protocol')
  }
  if (value.some(item => typeof item !== 'string' || item.trim() === '')) {
    throw new ClarifyRemoteError('INVALID_ANSWER', `Clarify ${field} must contain non-empty strings`, 'protocol')
  }
  if (new Set(value).size !== value.length) {
    throw new ClarifyRemoteError('INVALID_ANSWER', `Clarify ${field} must not contain duplicates`, 'protocol')
  }
  return [...value] as string[]
}

function parseQuestion(value: unknown): ClarifyQuestion | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question must be an object', 'protocol')
  }
  const record = value as Record<string, unknown>
  if (typeof record.questionId !== 'string' || record.questionId.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify questionId must be a non-empty string', 'protocol')
  }
  if (typeof record.text !== 'string' || record.text.trim() === '') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question text must be a non-empty string', 'protocol')
  }
  if (typeof record.multiple !== 'boolean' || typeof record.allowCustom !== 'boolean') {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question.multiple and allowCustom must be booleans', 'protocol')
  }
  if (!Array.isArray(record.options) || record.options.length === 0) {
    throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify question must include at least one option', 'protocol')
  }
  const seen = new Set<string>()
  const options = record.options.map((option) => {
    if (typeof option !== 'object' || option === null) {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify option must be an object', 'protocol')
    }
    const row = option as Record<string, unknown>
    if (typeof row.optionId !== 'string' || row.optionId.trim() === '') {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify optionId values must be non-empty', 'protocol')
    }
    if (typeof row.text !== 'string' || row.text.trim() === '') {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify option text must be a non-empty string', 'protocol')
    }
    if (seen.has(row.optionId)) {
      throw new ClarifyRemoteError('INVALID_ANSWER', 'Clarify optionId values must be unique', 'protocol')
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
