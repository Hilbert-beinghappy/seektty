/** SeekTTY-owned Clarify thin shell over public Remote methods and existing overlays. */

import type { TuiCommandCandidate } from './capabilities.ts'
import {
  callClarify,
  parseClarifyEcho,
  type ClarifyProcessEcho,
  type ClarifyQuestion,
  type ClarifyRpcCaller,
  type ClarifyStaleReason,
} from './clarify-remote.ts'
import { ui } from './locale.ts'
import type { OverlayChoice, OverlayPrompts } from './overlays.ts'

function clarifyCustomChoiceId(question: ClarifyQuestion): string {
  const used = new Set(question.options.map(option => option.optionId))
  let candidate = '__custom__'
  let n = 0
  while (used.has(candidate)) {
    n += 1
    candidate = `__custom__:${n}`
  }
  return candidate
}

export type ClarifyShellOutcome =
  | { readonly kind: 'applied'; readonly draft: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'abandoned'; readonly staleReason?: string }
  | { readonly kind: 'kept-composer'; readonly draft: string }

export interface ClarifyShellRequest {
  readonly sessionId: string
  readonly seedText: string
  readonly composerText: string
  readonly overlays: OverlayPrompts
  readonly call: ClarifyRpcCaller
  readonly writeComposer: (draft: string) => void
}

class ClarifyShellAbort extends Error {
  constructor() {
    super('clarify-shell-abort')
    this.name = 'ClarifyShellAbort'
  }
}

export function clarifyTuiCommand(): TuiCommandCandidate {
  return {
    name: 'clarify',
    description: ui('澄清当前输入并生成待发送草稿', 'Clarify the current input into a sendable draft'),
    source: 'TUI',
    behavior: 'local',
  }
}

export function mergeClarifyCatalog(
  commands: readonly TuiCommandCandidate[],
  present: boolean,
): readonly TuiCommandCandidate[] {
  if (!present || commands.some(command => command.name === 'clarify')) return commands
  const entry = clarifyTuiCommand()
  const index = commands.findIndex(command => command.name === 'doctor')
  if (index === -1) return [...commands, entry]
  return [...commands.slice(0, index), entry, ...commands.slice(index)]
}

/**
 * Resolve the Clarify seed from the two invocation paths.
 * Palette execution keeps the current composer and passes empty args, so the
 * composer body is the seed. Typed `/clarify some text` is submitted after the
 * composer is cleared, so only `rawArgs` remains. Typed `/clarify` alone has
 * no leftover body to preserve.
 */
export function clarifySeedText(composerText: string, rawArgs: string): string {
  const composer = composerText.trim()
  if (composer === '' || /^\/clarify(?:\s|$)/iu.test(composer)) return rawArgs.trim()
  return composer
}

export function buildClarifyAnswer(
  question: ClarifyQuestion,
  input: { readonly selectedOptionIds?: readonly string[]; readonly customText?: string },
): { readonly selectedOptionIds: readonly string[] } | { readonly customText: string } {
  const hasOptions = input.selectedOptionIds !== undefined
  const hasCustom = input.customText !== undefined
  if (hasOptions === hasCustom) {
    throw new Error('selectedOptionIds and customText are mutually exclusive and required as one of the two')
  }
  if (hasCustom) {
    if (!question.allowCustom) throw new Error('customText is only valid when allowCustom is true')
    const customText = input.customText?.trim() ?? ''
    if (customText === '') throw new Error('customText must not be empty')
    return { customText }
  }
  const selectedOptionIds = [...(input.selectedOptionIds ?? [])]
  if (selectedOptionIds.length === 0) {
    throw new Error(question.multiple
      ? 'multiple=true requires at least one selectedOptionId'
      : 'selectedOptionIds must not be empty')
  }
  if (!question.multiple && selectedOptionIds.length !== 1) {
    throw new Error('multiple=false requires exactly one selectedOptionId')
  }
  const allowed = new Set(question.options.map(option => option.optionId))
  const unique = new Set<string>()
  for (const optionId of selectedOptionIds) {
    if (!allowed.has(optionId)) {
      throw new Error(`selectedOptionId ${JSON.stringify(optionId)} is not in the current question`)
    }
    if (unique.has(optionId)) {
      throw new Error('selectedOptionIds must be unique')
    }
    unique.add(optionId)
  }
  return { selectedOptionIds }
}

export async function runClarifyShell(request: ClarifyShellRequest): Promise<ClarifyShellOutcome> {
  let processId: string | undefined
  try {
    while (true) {
      let current = await invoke(request, 'start', {
        sessionId: request.sessionId,
        ...(request.seedText === '' ? {} : { seedText: request.seedText }),
      })
      processId = current.processId
      if (current.status === 'stale') {
        if (await resolveStale(request, current) === 'restart') {
          processId = undefined
          continue
        }
        return abandoned(current)
      }
      while (current.status === 'running') {
        const question = current.question
        if (question === undefined) {
          throw new Error(ui('Clarify 进程在提问完成前结束', 'Clarify returned running without a question'))
        }
        const answer = await collectAnswer(request.overlays, question)
        if (answer === undefined) {
          await cancelQuietly(request, current.processId)
          return { kind: 'cancelled' }
        }
        current = await invoke(request, 'answer', {
          processId: current.processId,
          questionId: question.questionId,
          ...answer,
        })
        processId = current.processId
      }
      if (current.status === 'stale') {
        if (await resolveStale(request, current) === 'restart') {
          processId = undefined
          continue
        }
        return abandoned(current)
      }
      if (current.status !== 'complete') return { kind: 'cancelled' }
      const fetched = await invoke(request, 'fetchDraft', { processId: current.processId })
      if (fetched.status === 'stale') {
        if (await resolveStale(request, fetched) === 'restart') {
          processId = undefined
          continue
        }
        return abandoned(fetched)
      }
      if (fetched.status !== 'complete') {
        throw new Error(ui(
          `Clarify fetchDraft 返回了 ${fetched.status}，不能当作 stale`,
          `Clarify fetchDraft returned ${fetched.status} and must not be treated as stale`,
        ))
      }
      if (fetched.draft === undefined) {
        throw new Error(ui(
          'Clarify fetchDraft 在 complete 时缺少 draft',
          'Clarify fetchDraft returned complete without a draft',
        ))
      }
      processId = undefined
      return applyDraft(request, fetched.draft)
    }
  } catch (error) {
    if (processId !== undefined) await cancelQuietly(request, processId)
    if (error instanceof ClarifyShellAbort) return { kind: 'cancelled' }
    throw error
  }
}

function abandoned(echo: ClarifyProcessEcho): ClarifyShellOutcome {
  return {
    kind: 'abandoned',
    ...(echo.staleReason === undefined ? {} : { staleReason: echo.staleReason }),
  }
}

async function collectAnswer(
  overlays: OverlayPrompts,
  question: ClarifyQuestion,
): Promise<{ selectedOptionIds: readonly string[] } | { customText: string } | undefined> {
  const optionChoices = question.options.map(option => ({ id: option.optionId, label: option.text }))
  const customId = clarifyCustomChoiceId(question)
  if (question.multiple) {
    if (question.allowCustom) {
      const mode = await overlays.select({
        title: questionTitle(question),
        detail: statusDetail('running'),
        choices: [
          { id: 'options', label: ui('从选项中选择', 'Choose from options') },
          { id: customId, label: ui('自定义回答…', 'Custom answer…') },
        ],
      })
      if (mode === undefined) return undefined
      if (mode.id === customId) return readCustom(overlays, question)
    }
    const picked = await overlays.multiSelect({
      title: questionTitle(question),
      detail: statusDetail('running'),
      choices: optionChoices,
    })
    if (picked === undefined) return undefined
    return buildClarifyAnswer(question, { selectedOptionIds: picked.map(choice => choice.id) })
  }
  const choices: OverlayChoice[] = [
    ...optionChoices,
    ...(question.allowCustom ? [{ id: customId, label: ui('自定义回答…', 'Custom answer…') }] : []),
  ]
  const picked = await overlays.select({
    title: questionTitle(question),
    detail: statusDetail('running'),
    choices,
  })
  if (picked === undefined) return undefined
  if (picked.id === customId) return readCustom(overlays, question)
  return buildClarifyAnswer(question, { selectedOptionIds: [picked.id] })
}

async function readCustom(
  overlays: OverlayPrompts,
  question: ClarifyQuestion,
): Promise<{ customText: string } | undefined> {
  const custom = await overlays.multilineInput({
    title: questionTitle(question),
    detail: statusDetail('running'),
    placeholder: ui('输入自定义回答', 'Enter a custom answer'),
  })
  if (custom === undefined) return undefined
  const answer = buildClarifyAnswer(question, { customText: custom })
  if (!('customText' in answer)) return undefined
  return answer
}

async function resolveStale(
  request: ClarifyShellRequest,
  echo: ClarifyProcessEcho,
): Promise<'restart' | 'abandon'> {
  const selected = await request.overlays.select({
    title: ui('Clarify 已过期', 'Clarify is stale'),
    detail: staleDetail(echo.staleReason),
    searchable: false,
    choices: [
      { id: 'restart', label: ui('重新开始', 'Start over'), description: ui('丢弃过期结果并新建进程', 'Discard the stale result and start a new process') },
      { id: 'abandon', label: ui('放弃', 'Abandon'), description: ui('关闭并不再使用过期选项', 'Close without using the stale options') },
    ],
  })
  await cancelQuietly(request, echo.processId)
  if (selected?.id === 'restart') return 'restart'
  return 'abandon'
}

async function applyDraft(request: ClarifyShellRequest, draft: string): Promise<ClarifyShellOutcome> {
  await request.overlays.detail({
    title: ui('Clarify 草稿', 'Clarify draft'),
    content: draft,
    footer: ui('确认后写入输入区，不会自动发送', 'Confirm to write the composer; it is not sent automatically'),
  })
  const apply = await request.overlays.confirm(
    ui('将草稿填入输入区？', 'Insert the draft into the composer?'),
    ui('草稿只进入常规输入区，不会自动发送。', 'The draft only enters the regular composer and is not sent automatically.'),
    ui('填入', 'Insert'),
  )
  if (!apply) return { kind: 'cancelled' }
  if (request.composerText.trim() !== '') {
    const overwrite = await request.overlays.confirm(
      ui('覆盖当前输入区？', 'Replace the current composer text?'),
      ui('当前输入区已有内容，填入 Clarify 草稿将覆盖它。', 'The composer already has text; inserting the Clarify draft replaces it.'),
      ui('覆盖', 'Replace'),
    )
    if (!overwrite) return { kind: 'kept-composer', draft }
  }
  request.writeComposer(draft)
  return { kind: 'applied', draft }
}

async function invoke(
  request: ClarifyShellRequest,
  method: 'start' | 'answer' | 'cancel' | 'fetchDraft',
  args: Record<string, unknown>,
): Promise<ClarifyProcessEcho> {
  const result = await request.overlays.progress({
    title: ui('Clarify', 'Clarify'),
    detail: statusDetail('running'),
    work: async (_report, signal) => {
      if (method === 'start') return invokeStartWork(request, args, signal)
      return parseClarifyEcho(await callClarify(request.call, method, args, signal), {
        allowDraft: method === 'fetchDraft',
      })
    },
  })
  if (result === undefined) throw new ClarifyShellAbort()
  return result
}

/**
 * Overlay Esc aborts the progress signal and the in-process/HTTP carrier.
 * Clarify `start` has no cancellation parameter, so Gateway never injects that
 * signal into the Host method; aborting the RPC only discards the echo while
 * the process remains until TTL. Observe the overlay abort locally, keep the
 * start RPC running, and cancel the late processId.
 */
async function invokeStartWork(
  request: ClarifyShellRequest,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ClarifyProcessEcho | undefined> {
  if (signal.aborted) return undefined
  const pending = callClarify(request.call, 'start', args)
  const settled = pending.then(
    (value): { readonly ok: true; readonly value: unknown } => ({ ok: true, value }),
    (error: unknown): { readonly ok: false; readonly error: unknown } => ({ ok: false, error }),
  )
  const winner = await raceUntilAbort(settled, signal)
  if (winner === undefined) {
    void cancelLateStart(request, settled)
    return undefined
  }
  if (!winner.ok) throw winner.error
  return parseClarifyEcho(winner.value)
}

function cancelLateStart(
  request: ClarifyShellRequest,
  settled: Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: unknown }>,
): Promise<void> {
  return settled.then(async (result) => {
    if (!result.ok) return
    const processId = processIdFromValue(result.value)
    if (processId === undefined) return
    await cancelQuietly(request, processId)
  })
}

function processIdFromValue(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const processId = Reflect.get(value, 'processId')
  return typeof processId === 'string' && processId.trim() !== '' ? processId : undefined
}

function raceUntilAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => { resolve(undefined) }
    if (signal.aborted) {
      resolve(undefined)
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(signal.aborted ? undefined : value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) resolve(undefined)
        else reject(error)
      },
    )
  })
}

async function cancelQuietly(request: ClarifyShellRequest, processId: string): Promise<void> {
  try {
    await callClarify(request.call, 'cancel', { processId })
  } catch {
    // Restart and absence both treat cancel as best-effort.
  }
}

function questionTitle(question: ClarifyQuestion): string {
  return `${ui('Clarify', 'Clarify')} · ${question.text}`
}

function statusDetail(status: string): string {
  return ui(`状态：${status}`, `Status: ${status}`)
}

function staleDetail(reason: ClarifyStaleReason | string | undefined): string {
  const label = reason === undefined ? ui('未知原因', 'Unknown reason') : reason
  return ui(
    `Clarify 已 stale（${label}）。过期选项和草稿不能继续使用。`,
    `Clarify is stale (${label}). Stale options and drafts cannot be reused.`,
  )
}
