/** Retained terminal request envelope; native roster/document are owned by the published registry. */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { AgentPresetRow, AgentPresetRoster, AgentPresetDocument } from '@deepseek-ai/dsh-agent-preset-registry/types';
import type { RpcRequest, RpcResponse } from './rpc.ts';
export type AgentPresetEntry = AgentPresetRow;
export interface AgentPresetsApi {
    list(request: RpcRequest<{}>): Promise<RpcResponse<AgentPresetRoster>>;
    select(request: RpcRequest<{ sessionId: SessionId; agentPreset: string }>): Promise<RpcResponse<{ agentPreset: string }>>;
    /** Read-only declared composition YAML; authoring remains owned by the Host. */
    read(request: RpcRequest<{ agentPreset: string }>): Promise<RpcResponse<AgentPresetDocument>>;
    /** Retained endpoint for an explicit unsupported response; rc.2 has no copy Remote. */
    copy(request: RpcRequest<{ from: string; agentPreset: string; name?: string }>): Promise<RpcResponse<{ agentPreset: string }>>;
    /** Opens the native profile Settings document through the terminal adapter. */
    openDocument(request: RpcRequest<{ agentPreset: string }>, signal: AbortSignal): Promise<RpcResponse<{ opened: true } | { opened: false; path: string }>>;
    /** Retained endpoint for an explicit unsupported response; rc.2 has no remove Remote. */
    remove(request: RpcRequest<{ agentPreset: string }>): Promise<RpcResponse<{}>>;
}
