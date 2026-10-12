/** WAV-only optional speech entry. Does not record, enable plugins or submit messages. */
import type { OverlayPrompts } from './overlays.ts'
import { ui } from './locale.ts'
import { escapeTerminalText } from './theme.ts'
import { WavSpeechController } from './wav-speech.ts'
import type { SpeechProvider } from './speech-contract.ts'
const safe = (text: string) => escapeTerminalText(text).replace(/\u001b\[[0-9;:]*m/gu, '')
const title = () => ui('WAV 转写 · 实验性', 'WAV transcription · Experimental')

/** Byte counts are exact Host observations; resource estimates are never download percentages. */
export function speechProviderDetail(provider: SpeechProvider): string {
  const state = provider.preparation
  const estimate = provider.setupEstimate
  return [safe(provider.name), `${provider.location} · ${provider.languages.map(safe).join(', ')}`,
    `Host: ${state.phase}${state.step === undefined ? '' : ` · ${safe(state.step)}`}`,
    ...(state.phase === 'downloading' ? [`${safe(state.resource ?? '')}: ${String(state.completedBytes)} / ${state.totalBytes === undefined ? ui('总字节未知', 'total bytes unknown') : String(state.totalBytes)} bytes`] : []),
    ...(state.message === undefined ? [] : [safe(state.message)]),
    ...(state.download === undefined ? [] : [`${safe(state.download.resource)} · ${safe(state.download.source)} · ${safe(state.download.reason)}`]),
    ...(state.steps ?? []).map(step => `${safe(step.kind)}: ${safe(step.status)}`),
    estimate === undefined ? ui('准备资源估计未知', 'Preparation estimates unknown') : ui(
      `Host 估计：磁盘 ${estimate.recommendedDiskBytes} bytes；内存 ${estimate.expectedMemoryBytes} bytes；${estimate.minimumMinutes}–${estimate.maximumMinutes} 分钟`,
      `Host estimates: disk ${estimate.recommendedDiskBytes} bytes; memory ${estimate.expectedMemoryBytes} bytes; ${estimate.minimumMinutes}–${estimate.maximumMinutes} minutes`),
  ].join('\n')
}

/** E wires one explicit slash/menu action here with a bound controller and existing overlays. */
export async function wavSpeechCommand(controller: WavSpeechController, overlays: OverlayPrompts): Promise<void> {
  const progress = <T>(detail: string, work: (signal: AbortSignal) => Promise<T>) => overlays.progress({ title: title(), detail, work: (_report, signal) => work(signal) })
  try {
    while (true) {
      const catalog = await progress(ui('读取 Host speech 能力', 'Read Host speech capabilities'), signal => controller.catalog(signal))
      if (catalog === undefined) return
      const selected = await overlays.select({ title: title(), detail: ui(
        `选择 WAV：16kHz mono PCM16；本地与 Host 上限取较小值（${Math.min(catalog.maxAudioBytes, controller.budget.maxAudioBytes)} bytes / ${Math.min(catalog.maxDurationSeconds, controller.budget.maxDurationSeconds)} 秒）。不录音、不自动发消息。`,
        `WAV: 16kHz mono PCM16; smaller local/Host limits apply (${Math.min(catalog.maxAudioBytes, controller.budget.maxAudioBytes)} bytes / ${Math.min(catalog.maxDurationSeconds, controller.budget.maxDurationSeconds)} seconds). No recording or automatic message submission.`),
        choices: catalog.providers.map(provider => ({ id: provider.id, label: safe(provider.name), description: `${provider.location} · ${provider.preparation.phase}` })) })
      if (!selected) return
      const provider = catalog.providers.find(row => row.id === selected.id)!
      const action = await overlays.select({ title: title(), detail: speechProviderDetail(provider), searchable: false, choices: [
        { id: 'wav', label: ui('选择 WAV 文件并转写…', 'Choose WAV file and transcribe…') },
        { id: 'prepare', label: ui('准备模型/下载…', 'Prepare model/download…'), description: controller.port.reason('prepare') ?? ui('需明确确认资源估计', 'Explicit resource-estimate confirmation required') },
        { id: 'watch', label: ui('查看 Host 准备进度', 'Observe Host preparation') },
        { id: 'cancel', label: ui('取消共享 Host 准备…', 'Cancel shared Host preparation…') },
        { id: 'configure', label: ui('保存 Host 默认识别选择…', 'Save Host recognition defaults…') },
      ] })
      if (!action) continue
      if (action.id === 'watch') {
        await overlays.progress({ title: title(), detail: ui('关闭只停止观察；Host 准备任务继续', 'Closing stops observation; the Host preparation continues'),
          work: (report, signal) => controller.watchPreparation(provider.id, signal, row => report(`${speechProviderDetail(row)}\n`)) })
        continue
      }
      if (action.id === 'cancel') {
        const confirmed = await overlays.confirm(title(), ui('取消该 provider 的共享 Host 准备，可能影响其他窗口。关闭页面不会执行此操作。', 'Cancel this provider’s shared Host preparation; other windows may be affected. Closing the page does not cancel it.'), ui('取消准备', 'Cancel preparation'))
        if (confirmed) await progress(ui('等待 Host 取消结果', 'Wait for Host cancellation outcome'), signal => controller.cancelPreparation(provider.id, true, signal))
        continue
      }
      if (action.id === 'prepare') {
        const offer = await progress(ui('核对资源估计', 'Review resource estimates'), signal => controller.preparationOffer(provider.id, signal))
        if (offer === undefined) continue
        const source = await overlays.select({ title: title(), detail: speechProviderDetail(offer.provider), choices: [
          { id: 'default', label: ui('使用 Host 配置的下载策略', 'Use Host-configured download policy') },
          ...(offer.provider.downloadSources ?? []).map((source, index) => ({ id: `source:${index}`, label: safe(source) })),
        ] })
        if (!source) continue
        const confirmed = await overlays.confirm(title(), `${speechProviderDetail(offer.provider)}\n${ui('这些是 Host 估计；协议没有下载字节或存储硬上限参数。准备任务由 Host 共享持有，关闭此页面不会取消。', 'These are Host estimates; the protocol has no download-byte or storage hard-cap parameter. Preparation is shared and Host-owned; closing this page does not cancel it.')}`, ui('开始准备/下载', 'Start preparation/download'))
        if (confirmed) await progress(ui('提交明确准备请求', 'Submit explicit preparation request'), signal => controller.prepare(offer, true,
          source.id === 'default' ? undefined : offer.provider.downloadSources?.[Number(source.id.slice(7))], signal))
        continue
      }
      const language = await overlays.select({ title: title(), choices: provider.languages.map(value => ({ id: value, label: safe(value) })) })
      if (!language) continue
      const selection = { providerId: provider.id, language: language.id }
      if (action.id === 'configure') {
        if (await overlays.confirm(title(), ui('保存到 Host 的 speech 设置；不改变 Agent 模型或权限。', 'Save Host speech settings; Agent model and permissions remain unchanged.'), ui('保存默认', 'Save defaults'))) {
          await progress(ui('保存明确选择', 'Save explicit selection'), signal => controller.configure(selection, true, signal))
        }
        continue
      }
      const path = await overlays.input({ title: title(), detail: ui('输入本地 WAV 文件路径。不会自动转换音频。', 'Enter a local WAV path. Audio is not automatically converted.') })
      if (path === undefined || path.trim() === '') continue
      if (!await overlays.confirm(title(), `${safe(path)}\n${speechProviderDetail(provider)}\n${ui('发送此 WAV 到选定 Host provider 转写；cloud provider 可能把音频发送到其服务。结果仅待审查，不提交 Agent 消息。', 'Send this WAV to the selected Host provider; a cloud provider may send audio to its service. The result is only proposed for review; no Agent message is submitted.')}`, ui('转写此 WAV', 'Transcribe this WAV'))) continue
      const proposal = await progress(ui('转写中；未知结果不会自动重试', 'Transcribing; unknown outcomes are never automatically retried'), signal => controller.transcribeFile(path, selection, signal))
      if (proposal === undefined) return
      if (proposal.text.trim() === '') { await overlays.detail({ title: title(), content: ui('未识别到语音；草稿未改变', 'No speech recognized; draft unchanged') }); continue }
      await overlays.detail({ title: title(), content: `${proposal.text}\n\n${ui(`Host 音频 ${proposal.audioSeconds} 秒 · 推理 ${proposal.inferenceSeconds} 秒`, `Host audio ${proposal.audioSeconds}s · inference ${proposal.inferenceSeconds}s`)}` })
      if (await overlays.confirm(title(), ui('仅在会话与草稿 revision 未变化时，把此结果插入现有输入区。不会自动发送。', 'Insert this result into the existing composer only if Session and draft revision are unchanged. It will not be sent automatically.'), ui('插入草稿', 'Insert into draft'))) controller.insertProposal(proposal, true)
    }
  } catch (error) { await overlays.detail({ title: title(), content: safe(error instanceof Error ? error.message : String(error)) }) }
}
