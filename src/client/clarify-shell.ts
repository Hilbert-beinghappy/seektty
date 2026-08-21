/** SeekTTY-owned Clarify thin shell over public Remote methods and existing overlays. */

import type { TuiCommandCandidate } from './capabilities.ts'
import {
  callClarify,
  ClarifyRemoteError,
  parseClarifyEcho,
  requireClarifyCompatibleHost,
  type ClarifyProcessEcho,
  type ClarifyQuestion,
  type ClarifyRpcCaller,
  type ClarifyStaleReason,
} from './clarify-remote.ts'
import { ui } from './locale.ts'
import type { OverlayChoice, OverlayPrompts } from './overlays.ts'

function clarifyReservedChoiceId(question: ClarifyQuestion, prefix: string): string {
  const used = new Set(question.options.map(option => option.optionId))
  let candidate = prefix
  let n = 0
  while (used.has(candidate)) {
    n += 1
    candidate = `${prefix}:${n}`
  }
  return candidate
}

function clarifyCustomChoiceId(question: ClarifyQuestion): string {
  return clarifyReservedChoiceId(question, '__custom__')
}

function clarifyAcceptChoiceId(question: ClarifyQuestion): string {
  return clarifyReservedChoiceId(question, '__accept_preview__')
}

function clarifyRefineChoiceId(question: ClarifyQuestion): string {
  return clarifyReservedChoiceId(question, '__refine_preview__')
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

class ClarifyStayOnQuestion extends Error {
  constructor() {
    super('clarify-stay-on-question')
    this.name = 'ClarifyStayOnQuestion'
  }
}

class ClarifyRestartProcess extends Error {
  constructor() {
    super('clarify-restart-process')
    this.name = 'ClarifyRestartProcess'
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
  const seedText = request.seedText
  try {
    await requireClarifyCompatibleHost(request.call)
    while (true) {
      try {
      let current = await invokeInferring(request, undefined, 'start', {
        sessionId: request.sessionId,
        ...(seedText === '' ? {} : { seedText }),
      })
      processId = current.processId
      if (current.status === 'complete') {
        throw new Error(ui(
          'Clarify start 在明确审阅并采用预览前返回了 complete',
          'Clarify start returned complete before explicit preview review and acceptance',
        ))
      }
      if (current.status === 'stale') {
        if (await resolveStale(request, current) === 'restart') {
          processId = undefined
          continue
        }
        return abandoned(current)
      }
      while (current.status === 'running') {
        try {
        if (
          current.kind === undefined
          || current.previewVersion === undefined
          || current.draftPreview === undefined
          || current.materialChanges === undefined
        ) {
          throw new Error(ui('Clarify running 响应缺少 preview 协议字段', 'Clarify running response is missing preview protocol fields'))
        }
        if (current.kind === 'await_accept') {
          const decision = await choosePreviewAction(request.overlays, current)
          if (decision.kind === 'abandon') {
            await cancelQuietly(request, current.processId)
            return { kind: 'cancelled' }
          }
          if (decision.kind === 'refine') {
            current = await invokeInferring(request, current, 'refine', {
              processId: current.processId,
              previewVersion: current.previewVersion,
              feedback: decision.feedback,
            })
            processId = current.processId
            if (current.status === 'complete') {
              throw new Error(ui(
                'Clarify refine 在明确审阅并采用预览前返回了 complete',
                'Clarify refine returned complete before explicit preview review and acceptance',
              ))
            }
            continue
          }
          current = await invokeRecoverable(request, current, 'accept', {
            processId: current.processId,
            previewVersion: current.previewVersion,
          })
          processId = current.processId
          if (current.status === 'running') continue
          break
        }
        const question = current.question
        if (question === undefined) {
          throw new Error(ui('Clarify ask 响应缺少 question', 'Clarify ask response is missing a question'))
        }
        const action = await collectAskAction(request.overlays, question, current)
        if (action === undefined) {
          await cancelQuietly(request, current.processId)
          return { kind: 'cancelled' }
        }
        if (action.kind === 'accept') {
          current = await invokeRecoverable(request, current, 'accept', {
            processId: current.processId,
            previewVersion: current.previewVersion,
          })
          processId = current.processId
          if (current.status === 'running') continue
          break
        }
        if (action.kind === 'refine') {
          current = await invokeInferring(request, current, 'refine', {
            processId: current.processId,
            previewVersion: current.previewVersion,
            feedback: action.feedback,
          })
          processId = current.processId
          if (current.status === 'complete') {
            throw new Error(ui(
              'Clarify refine 在明确审阅并采用预览前返回了 complete',
              'Clarify refine returned complete before explicit preview review and acceptance',
            ))
          }
          continue
        }
        current = await invokeInferring(request, current, 'answer', {
          processId: current.processId,
          questionId: question.questionId,
          previewVersion: current.previewVersion,
          ...action.answer,
        })
        processId = current.processId
        if (current.status === 'complete') {
          throw new Error(ui(
            'Clarify answer 在明确审阅并采用预览前返回了 complete',
            'Clarify answer returned complete before explicit preview review and acceptance',
          ))
        }
        } catch (error) {
          if (error instanceof ClarifyStayOnQuestion) continue
          throw error
        }
      }
      if (current.status === 'stale') {
        if (await resolveStale(request, current) === 'restart') {
          processId = undefined
          continue
        }
        return abandoned(current)
      }
      if (current.status !== 'complete') return { kind: 'cancelled' }
      const fetched = await invokeFetchDraft(request, current)
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
      } catch (error) {
        if (error instanceof ClarifyRestartProcess) {
          processId = undefined
          continue
        }
        throw error
      }
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

type AskAction =
  | { readonly kind: 'answer'; readonly answer: { readonly selectedOptionIds: readonly string[] } | { readonly customText: string } }
  | { readonly kind: 'accept' }
  | { readonly kind: 'refine'; readonly feedback: string }

function previewActionChoices(question: ClarifyQuestion): OverlayChoice[] {
  return [
    {
      id: clarifyAcceptChoiceId(question),
      label: ui('审阅并采用当前预览', 'Review and accept current preview'),
      description: ui('完整审阅后冻结当前草稿；不会自动发送', 'Review the full current draft, then freeze it; it is not sent automatically'),
    },
    {
      id: clarifyRefineChoiceId(question),
      label: ui('直接完善当前预览…', 'Refine current preview…'),
      description: ui('对当前预览给出一次性反馈，不回答本题', 'Give one-shot feedback on the current preview without answering this question'),
    },
  ]
}

async function collectAskAction(
  overlays: OverlayPrompts,
  question: ClarifyQuestion,
  echo: ClarifyProcessEcho,
): Promise<AskAction | undefined> {
  const detail = previewDetail(echo)
  const optionChoices = question.options.map(option => ({ id: option.optionId, label: option.text }))
  const customId = clarifyCustomChoiceId(question)
  const acceptId = clarifyAcceptChoiceId(question)
  const refineId = clarifyRefineChoiceId(question)
  if (question.multiple) {
    const mode = await overlays.select({
      title: questionTitle(question),
      detail,
      choices: [
        { id: 'options', label: ui('从选项中选择', 'Choose from options') },
        ...(question.allowCustom ? [{ id: customId, label: ui('自定义回答…', 'Custom answer…') }] : []),
        ...previewActionChoices(question),
      ],
    })
    if (mode === undefined) return undefined
    if (mode.id === acceptId) return await confirmAcceptPreview(overlays, echo)
    if (mode.id === refineId) return await readRefineFeedback(overlays, echo)
    if (mode.id === customId) {
      const custom = await readCustom(overlays, question, detail)
      return custom === undefined ? undefined : { kind: 'answer', answer: custom }
    }
    const picked = await overlays.multiSelect({
      title: questionTitle(question),
      detail,
      choices: optionChoices,
      requireSelection: true,
    })
    if (picked === undefined) return undefined
    return { kind: 'answer', answer: buildClarifyAnswer(question, { selectedOptionIds: picked.map(choice => choice.id) }) }
  }
  const choices: OverlayChoice[] = [
    ...optionChoices,
    ...(question.allowCustom ? [{ id: customId, label: ui('自定义回答…', 'Custom answer…') }] : []),
    ...previewActionChoices(question),
  ]
  const picked = await overlays.select({
    title: questionTitle(question),
    detail,
    choices,
  })
  if (picked === undefined) return undefined
  if (picked.id === acceptId) return await confirmAcceptPreview(overlays, echo)
  if (picked.id === refineId) return await readRefineFeedback(overlays, echo)
  if (picked.id === customId) {
    const custom = await readCustom(overlays, question, detail)
    return custom === undefined ? undefined : { kind: 'answer', answer: custom }
  }
  return { kind: 'answer', answer: buildClarifyAnswer(question, { selectedOptionIds: [picked.id] }) }
}

async function readCustom(
  overlays: OverlayPrompts,
  question: ClarifyQuestion,
  detail: string,
): Promise<{ customText: string } | undefined> {
  const custom = await overlays.input({
    title: questionTitle(question),
    detail,
    placeholder: ui('输入自定义回答', 'Enter a custom answer'),
    requireText: true,
  })
  if (custom === undefined) return undefined
  const answer = buildClarifyAnswer(question, { customText: custom })
  if (!('customText' in answer)) return undefined
  return answer
}

type PreviewAction =
  | { readonly kind: 'accept' }
  | { readonly kind: 'refine'; readonly feedback: string }
  | { readonly kind: 'abandon' }

async function choosePreviewAction(
  overlays: OverlayPrompts,
  echo: ClarifyProcessEcho,
): Promise<PreviewAction> {
  while (true) {
    const selected = await overlays.select({
      title: ui('Clarify 草稿已可确认', 'Clarify draft is ready'),
      detail: previewDetail(echo),
      searchable: false,
      choices: [
        {
          id: 'accept',
          label: ui('采用并填入输入区', 'Accept and insert'),
          description: ui('冻结当前草稿；不会自动发送', 'Freeze this draft; it is not sent automatically'),
        },
        {
          id: 'refine',
          label: ui('继续完善', 'Continue refining'),
          description: ui('说明还需要修改什么，并从当前预览继续', 'Describe what to change and continue from this preview'),
        },
        {
          id: 'abandon',
          label: ui('放弃', 'Abandon'),
          description: ui('关闭 Clarify 并保留原输入', 'Close Clarify and keep the original composer'),
        },
      ],
    })
    if (selected === undefined || selected.id === 'abandon') return { kind: 'abandon' }
    if (selected.id === 'accept') {
      const accepted = await confirmAcceptPreview(overlays, echo)
      if (accepted) return accepted
      continue
    }
    const refined = await readRefineFeedback(overlays, echo)
    if (refined !== undefined) return refined
  }
}

async function confirmAcceptPreview(
  overlays: OverlayPrompts,
  echo: ClarifyProcessEcho,
): Promise<{ readonly kind: 'accept' } | undefined> {
  await overlays.detail({
    title: ui('完整审阅 Clarify 草稿', 'Review the full Clarify draft'),
    content: previewDetail(echo),
  })
  const confirmed = await overlays.confirm(
    ui('采用这份完整草稿？', 'Accept this full draft?'),
    ui('草稿将被冻结并填入常规输入区，但不会自动发送。', 'The draft will be frozen and inserted into the regular composer, but it will not be sent automatically.'),
    ui('采用', 'Accept'),
  )
  return confirmed ? { kind: 'accept' } : undefined
}

async function readRefineFeedback(
  overlays: OverlayPrompts,
  echo: ClarifyProcessEcho,
): Promise<{ readonly kind: 'refine'; readonly feedback: string } | undefined> {
  const feedback = await overlays.input({
    title: ui('继续完善草稿', 'Continue refining the draft'),
    detail: previewDetail(echo),
    placeholder: ui('说明希望补充、删改或重新聚焦的内容', 'Describe what to add, remove, or refocus'),
    requireText: true,
  })
  if (feedback === undefined) return undefined
  return { kind: 'refine', feedback: feedback.trim() }
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

async function applyDraft(
  request: ClarifyShellRequest,
  draft: string,
): Promise<ClarifyShellOutcome> {
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
  method: 'start' | 'answer' | 'accept' | 'refine' | 'cancel' | 'fetchDraft',
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

async function invokeFetchDraft(
  request: ClarifyShellRequest,
  current: ClarifyProcessEcho,
): Promise<ClarifyProcessEcho> {
  try {
    return await invoke(request, 'fetchDraft', { processId: current.processId })
  } catch (error) {
    if (
      error instanceof ClarifyRemoteError
      && error.category === 'conflict'
      && error.code === 'PROCESS_NOT_FOUND'
    ) {
      return await handleConflict(request, current, 'answer', error)
    }
    throw error
  }
}

async function invokeRecoverable(
  request: ClarifyShellRequest,
  current: ClarifyProcessEcho,
  method: 'answer' | 'accept' | 'refine',
  args: Record<string, unknown>,
): Promise<ClarifyProcessEcho> {
  try {
    return await invoke(request, method, args)
  } catch (error) {
    return await handleClarifyFailure(request, current, method, args, error)
  }
}

async function handleClarifyFailure(
  request: ClarifyShellRequest,
  current: ClarifyProcessEcho | undefined,
  method: 'start' | 'answer' | 'accept' | 'refine',
  args: Record<string, unknown>,
  error: unknown,
): Promise<ClarifyProcessEcho> {
  if (!(error instanceof ClarifyRemoteError)) throw error
  if (error.category === 'retryable') throw error
  if (error.category === 'conflict') {
    if (current === undefined) throw error
    return await handleConflict(request, current, method, error)
  }
  if (error.category === 'invalid-request') {
    await request.overlays.detail({
      title: ui('Clarify 请求需要修正', 'Clarify request needs a correction'),
      content: error.message,
      footer: ui('关闭后继续当前问题', 'Close to stay on the current question'),
    })
    throw new ClarifyStayOnQuestion()
  }
  if (error.category === 'configuration') {
    await request.overlays.detail({
      title: ui('Clarify 需要调整设置', 'Clarify needs a settings change'),
      content: [
        ui('打开 /model 检查模型路由，或根据下面的错误调整设置。', 'Open /model to check the model route, or use the error below to adjust settings.'),
        error.message,
      ].join('\n'),
      footer: ui('关闭后返回输入区', 'Close to return to the composer'),
    })
    throw new ClarifyShellAbort()
  }
  if (error.category === 'protocol') {
    await request.overlays.detail({
      title: ui('Clarify 协议不兼容', 'Clarify protocol is incompatible'),
      content: error.message,
      footer: ui('关闭后返回输入区', 'Close to return to the composer'),
    })
    throw new ClarifyShellAbort()
  }
  if (error.code === 'cancelled') throw new ClarifyShellAbort()
  throw error
}

async function handleConflict(
  request: ClarifyShellRequest,
  current: ClarifyProcessEcho,
  method: 'start' | 'answer' | 'accept' | 'refine',
  error: ClarifyRemoteError,
): Promise<ClarifyProcessEcho> {
  if (error.code === 'PROCESS_BUSY') {
    await request.overlays.detail({
      title: ui('Clarify 仍在推理', 'Clarify is still inferring'),
      content: error.message,
      footer: ui('关闭后查看最新状态，不会自动重提', 'Close to reload the latest state without resubmitting'),
    })
    return await invokeFetchDraft(request, current)
  }
  if (error.code === 'PROCESS_NOT_FOUND') {
    const selected = await request.overlays.select({
      title: ui('Clarify 进程已不存在', 'Clarify process is gone'),
      detail: error.message,
      searchable: false,
      choices: [
        {
          id: 'restart',
          label: ui('重新开始', 'Restart'),
          description: ui('同一 Session 与种子新建进程', 'Start a new process with the same session and seed'),
        },
        {
          id: 'cancel',
          label: ui('取消', 'Cancel'),
          description: ui('关闭 Clarify 并保留原输入', 'Close Clarify and keep the original composer'),
        },
      ],
    })
    if (selected?.id === 'restart') throw new ClarifyRestartProcess()
    throw new ClarifyShellAbort()
  }
  await request.overlays.detail({
    title: ui('Clarify 状态已更新', 'Clarify state was updated'),
    content: ui(
      `当前操作未提交（${error.code}）。将重新读取 Host 保留的最新问题和草稿，不会销毁流程。`,
      `The operation was not committed (${error.code}). Clarify will reload the latest question and draft preserved by the Host without destroying the process.`,
    ),
    footer: ui('关闭后继续', 'Close to continue'),
  })
  const latest = await invokeFetchDraft(request, current)
  if (method === 'refine' && latest.status === 'complete') {
    throw new Error(ui(
      'Clarify refine 恢复读到 complete，不能当作未提交的 refine 结果',
      'Clarify refine recovery reached complete and must not be treated as an uncommitted refine result',
    ))
  }
  if (
    method === 'accept'
    && latest.status === 'complete'
    && latest.previewVersion !== current.previewVersion
  ) {
    throw new Error(ui(
      'Clarify 已完成，但完成版本不是你刚刚审阅并确认的版本；为避免采用未审阅草稿，本次不会写入输入区',
      'Clarify completed with a different preview version than the one you reviewed and confirmed; the unreviewed draft will not be inserted',
    ))
  }
  return latest
}

async function invokeInferring(
  request: ClarifyShellRequest,
  current: ClarifyProcessEcho | undefined,
  method: 'start' | 'answer' | 'refine',
  args: Record<string, unknown>,
): Promise<ClarifyProcessEcho> {
  while (true) {
    try {
      if (method === 'start') {
        try {
          return await invoke(request, method, args)
        } catch (error) {
          return await handleClarifyFailure(request, current, method, args, error)
        }
      }
      return await invokeRecoverable(request, current!, method, args)
    } catch (error) {
      if (!(error instanceof ClarifyRemoteError) || error.category !== 'retryable') {
        throw error
      }
      const selected = await request.overlays.select({
        title: ui('Clarify 推理失败', 'Clarify inference failed'),
        detail: error.message,
        searchable: false,
        choices: [
          {
            id: 'retry',
            label: ui('重试', 'Retry'),
            description: ui('保留输入区原文，重复刚才的操作', 'Keep the composer text and repeat the intended operation'),
          },
          {
            id: 'cancel',
            label: ui('取消', 'Cancel'),
            description: ui('关闭 Clarify 并保留原输入', 'Close Clarify and keep the original composer'),
          },
        ],
      })
      if (selected === undefined || selected.id === 'cancel') throw new ClarifyShellAbort()
      if (method === 'start' || current === undefined) continue
      const latest = await invokeFetchDraft(request, current)
      if (latest.status !== 'running') return latest
      if (latest.previewVersion !== args.previewVersion) return latest
      if (method === 'answer' && latest.question?.questionId !== args.questionId) return latest
    }
  }
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

function previewDetail(echo: ClarifyProcessEcho): string {
  const preview = echo.draftPreview ?? ui('暂无预览', 'No preview available')
  const changes = echo.materialChanges ?? []
  return [
    statusDetail(echo.status),
    ui('当前草稿预览：', 'Current draft preview:'),
    preview,
    changes.length === 0
      ? ui('本轮变化：未提供', 'Changes this round: not provided')
      : ui(`本轮变化：${changes.join('；')}`, `Changes this round: ${changes.join('; ')}`),
  ].join('\n')
}

function staleDetail(reason: ClarifyStaleReason | string | undefined): string {
  const label = reason === undefined ? ui('未知原因', 'Unknown reason') : reason
  return ui(
    `Clarify 已 stale（${label}）。过期选项和草稿不能继续使用。`,
    `Clarify is stale (${label}). Stale options and drafts cannot be reused.`,
  )
}
