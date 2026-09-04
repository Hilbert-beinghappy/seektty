import type { ChatConversationViewNode, ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/node-client'
import type { WelcomeRuntimeFacts } from '../../src/client/welcome.ts'
import { defaultWelcomeSettings } from '../../src/client/welcome-settings.ts'

export const welcomeFacts: WelcomeRuntimeFacts = {
  seekttyVersion: 'fixture', profile: 'tui', workspace: 'synthetic',
  model: 'MODEL_BEFORE', reasoning: 'high', mode: 'standard',
  permission: 'workspace-write', theme: 'dark', platform: 'test',
}

export function welcomeSettings() {
  const defaults = defaultWelcomeSettings()
  return { ...defaults, infoMode: 'custom' as const,
    logo: { ...defaults.logo, source: 'none' as const },
    customRows: [{ kind: 'fact' as const, fact: 'model' as const }],
  }
}

export function welcomeAssistant(key: string, text: string, status: 'running' | 'settled', turn = 1): ChatConversationViewNode {
  return { key, id: key, kind: 'assistant-step', target: 'chat', anchorSeq: turn,
    location: { kind: 'session' }, visibility: 'visible',
    data: { status, turn, step: 1, time: 1, blocks: [{ kind: 'text', text }] },
  }
}

export function welcomeSnapshot(nodes: readonly ChatConversationViewNode[], id = 'welcome-fixture'): ConversationSnapshot {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  const legacy: ConversationSnapshot['chat']['legacy'] = {
    nodes: [], turnTimings: new Map(), turnEnds: new Map(), partial: null, runningCalls: [],
  }
  return {
    sessionId: id as SessionId, views: { get: () => undefined },
    chat: { order: nodes.map(node => node.key), nodes: { get: key => byKey.get(key), values: () => nodes },
      locations: { getTurn: () => [], getStep: () => [] }, timeline: { turnOrder: [], turns: new Map() }, legacy },
    ...legacy, pending: [], queue: [], running: nodes.some(node => (node.data as { status?: string }).status === 'running'),
    subagent: null, composerPhase: 'active', removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: nodes.length === 0, lastAgentError: null,
  }
}
