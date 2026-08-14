/**
 * Browser wire client. The plugin selects fixture or HTTP transport, provides
 * the shared API client, and lets the runtime object layer start the stream
 * controller with its sinks.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { HostDescription, IApiClient } from './api.ts';
import { type ConnectionConfig, type ConnectionSinks, type ConnectionState } from './connection.ts';
import type { ClientConnectionRpc } from '../rpc.ts';
export type { ApiProxy, SessionsApi, SessionSearchItem, SessionSummary, PromptContentPart, HostApi, EventsApi, MuxFrame, HostFrame, ApprovalResponsePayload, QuestionResponsePayload, HistoryEntry, ToolEventView, DirectoryEntry, DirectoryListing, ToolCallView, ToolResultView, WorkspaceApi, WorkspaceId, WorkspaceView, SkillsApi, SkillEntry, ModelCatalogFailure, ModelCatalogModel, ModelProviderGroup, ModelReasoning, MessageId, ModelReasoningEffort, ModelSelection, QueueAction, QueuedInboxItem, SessionModels, SubagentsApi, SubagentAddress, SubagentCatalog, SubagentListEntry, SubagentPromptReceipt, JobView, RpcRequest, RpcResponse, RpcResult, RpcError, RpcErrorCode, ClientRequest, ServerResponse, ServerRequest, ClientResponse, RpcMessage, RpcReceipt, HostDescription, IApiClient, SessionId, SessionEvent, ContentBlock, StreamChunk, GoalsApi, GoalRef, SettingsApi, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView, CredentialsApi, CredentialView, ConfigurableProviderView, DiscoveredModelView, LlmApi, } from './api.ts';
export { RpcId, AbstractApiClient, transportError, } from './api.ts';
export type { ConnectionConfig, ConnectionSinks, ConnectionState };
export type { ClientConnectionRpc } from '../rpc.ts';
/** Observable Host description published by each completed connection handshake. */
export interface HostDescriptionSource {
    /** Latest connected-generation description; absent before connect and while reconnecting. */
    getSnapshot(): HostDescription | undefined;
    /** Subscribe to description replacement and connection loss. */
    subscribe(listener: () => void): () => void;
}
/** Required services (none — this is the wire root). */
export declare const inject: string[];
/**
 * The ctx.connection service API: the API client plus a one-shot
 * controller starter (the runtime plugin supplies sinks when its object layer
 * is ready — connection stays consumer-agnostic).
 */
export interface ConnectionHandle {
    /** Shared api client (fixture or real, decided at boot from the page URL). */
    readonly api: IApiClient;
    /** Whether the current page authority is loopback; non-browser contexts default to true. */
    readonly isLoopback: boolean;
    /** Generation-scoped Host facts, including native path-open capability. */
    readonly hostDescription: HostDescriptionSource;
    /** Generic logical RPC channels over the same Connection transport. */
    readonly rpc: ClientConnectionRpc;
    /**
     * Start the connect/pump/reconnect loop with the consumer's frame sinks.
     * One consumer owns the streams (the runtime object layer); a second call
     * throws.
     * @param sinks - frame/state callbacks.
     * @param config - reconnect/backoff tunables.
     * @returns stop handle for the loop.
     */
    start(sinks: ConnectionSinks, config?: ConnectionConfig): {
        stop(): void;
    };
}
/** Inputs for the transport-independent Connection handle. */
export interface ConnectionHandleOptions {
    /** API carrier implementing unary calls and the two event streams. */
    readonly api: IApiClient;
    /** Logical RPC caller paired with the same Host carrier. */
    readonly rpc: ClientConnectionRpc;
    /** Whether native loopback-only client capabilities may be offered. */
    readonly isLoopback?: boolean;
}
/**
 * Build the shared Client Connection lifecycle over a selected carrier.
 * Browser and in-process surfaces use this same single-owner stream loop,
 * Host-description publication, reconnect lifecycle, and sink isolation.
 * @param options - API and logical-RPC carrier pair.
 * @returns consumer-agnostic Connection handle.
 */
export declare function createConnectionHandle(options: ConnectionHandleOptions): ConnectionHandle;
/**
 * Client plugin body: pick the api by page mode and provide ctx.connection.
 * @param ctx - client cordis context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map