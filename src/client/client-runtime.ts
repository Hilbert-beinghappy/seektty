/** TUI assembly over the official Harness Client Runtime and projections. */

import { Context } from '@deepseek-ai/cordis'
import * as gatewayPlugin from '@deepseek-ai/dsh-api-gateway/node-client'
import * as remotesPlugin from '@deepseek-ai/dsh-api-remotes/node-client'
import {
  createConnectionHandle,
  type ConnectionHandle,
} from '@deepseek-ai/dsh-client-connection/node-client'
import * as runtimePlugin from '@deepseek-ai/dsh-client-runtime/node-client'
import type {
  ObservableSnapshot,
  SessionFace,
  SessionId,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/node-client'
import { registerConversationNodes } from '@deepseek-ai/dsh-client-ui-conversation/projection'
import { registerDeliverablesProjection } from '@deepseek-ai/dsh-client-ui-deliverables/projection'
import { registerGoalProjection } from '@deepseek-ai/dsh-client-ui-goal/projection'
import { registerTrajectoryProjection } from '@deepseek-ai/dsh-client-ui-trajectory/projection'
import { registerWorkflowRunProjection } from '@deepseek-ai/dsh-client-ui-workflow-run/projection'
import * as registryPlugin from '@deepseek-ai/dsh-typert-registry/node-client'
import type { TuiStartOptions } from './index.ts'
import { HarnessTuiCapabilities } from './capabilities.ts'
import type { TuiClientContext } from './context.ts'
import {
  DSH_COMPATIBILITY,
  dshCompatibilityError,
  launcherPrefersEnglish,
} from '../dsh-compat.ts'
import { measureStartup } from '../startup-trace.ts'
import { ui } from './locale.ts'
import { explainFailure, startupTimeoutError } from './error-advice.ts'

const STARTUP_TIMEOUT_MS = 20_000

/** Running Client Context and selected Harness session. */
export interface TuiClient {
  readonly ctx: TuiClientContext
  readonly session: SessionFace
  readonly sessionId: SessionId
  readonly workspacePath: string
  /** Dynamic actions and selection following over the same Client Runtime. */
  readonly capabilities: HarnessTuiCapabilities
}

/**
 * Wait until an observable reaches a required state without polling.
 * @param source - Harness snapshot source.
 * @param accepts - completion predicate.
 * @param label - Chinese startup phase used in timeout diagnostics.
 * @returns the accepted snapshot.
 */
export function waitForSnapshot<T>(
  source: ObservableSnapshot<T>,
  accepts: (snapshot: T) => boolean,
  label: string,
): Promise<T> {
  const current = source.getSnapshot()
  if (accepts(current)) return Promise.resolve(current)
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let unsubscribe = (): void => undefined
    const finish = (value: T): void => {
      // A synchronous subscribe() callback can settle before the real
      // disposer is assigned. The post-subscribe snapshot calls finish again
      // and reaches this branch with the disposer available.
      if (settled) {
        unsubscribe()
        return
      }
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      resolve(value)
    }
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(startupTimeoutError(label))
    }, STARTUP_TIMEOUT_MS)
    const registeredUnsubscribe = source.subscribe(() => {
      const snapshot = source.getSnapshot()
      if (accepts(snapshot)) finish(snapshot)
    })
    unsubscribe = registeredUnsubscribe
    const afterSubscribe = source.getSnapshot()
    if (accepts(afterSubscribe)) finish(afterSubscribe)
  })
}

/**
 * Resolve a resumable row from the ready Runtime baseline.
 * @param resume - explicit id, or `true` for the latest visible session.
 * @param list - authoritative Session Runtime list snapshot.
 * @param archivedSessionIds - Workspace Runtime's hidden-session set.
 * @returns the selected, non-archived session summary.
 */
export function selectResumeSession(
  resume: string | true,
  list: SessionListState,
  archivedSessionIds: readonly SessionId[],
): SessionSummary {
  const archived = new Set(archivedSessionIds)
  const sessionId = resume === true
    ? list.ids
      .map(id => list.byId[id])
      .filter((summary): summary is SessionSummary =>
        summary !== undefined && !archived.has(summary.id))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id
    : resume as SessionId
  if (sessionId === undefined) throw new Error(ui('没有可恢复的会话', 'No session is available to resume'))
  const summary = list.byId[sessionId]
  if (summary === undefined) {
    throw new Error(ui(
      `找不到会话 ${JSON.stringify(resume)}`,
      `Session ${JSON.stringify(resume)} was not found`,
    ))
  }
  if (archived.has(sessionId)) {
    throw new Error(ui(
      `会话 ${JSON.stringify(resume)} 已归档；当前 Harness 不支持恢复归档会话`,
      `Session ${JSON.stringify(resume)} is archived; this Harness cannot resume archived sessions`,
    ))
  }
  return summary
}

async function targetSession(ctx: TuiClientContext, options: TuiStartOptions): Promise<{
  sessionId: SessionId
  workspacePath: string
}> {
  const workspaceState = await waitForSnapshot(
    ctx.workspaces.list,
    snapshot => snapshot.baselinesReady,
    ui('读取工作区与会话', 'Reading workspace and sessions'),
  )
  if (options.resume !== undefined) {
    const summary = selectResumeSession(
      options.resume,
      ctx.sessions.list.getSnapshot(),
      workspaceState.archivedSessionIds,
    )
    ctx.sessions.open(summary.id)
    return { sessionId: summary.id, workspacePath: summary.cwd ?? options.cwd }
  }

  const workspace = await ctx.workspaces.create({ path: options.cwd })
  const sessionId = await ctx.workspaces.connectWorkspace(workspace.workspaceId)
  ctx.sessions.open(sessionId)
  return { sessionId, workspacePath: workspace.path }
}

/**
 * Assemble the Client half and select/open the launch target through Runtime APIs.
 * @param options - Host bridge plus launch facts.
 * @returns selected Client Context and Session face.
 */
export async function startTuiClient(
  options: TuiStartOptions,
): Promise<TuiClient> {
  const ctx = new Context()
  try {
    ctx.provide('connection', createConnectionHandle({ api: options.api, rpc: options.rpc, isLoopback: true }))
    await measureStartup('plugins', async () => {
      await Promise.all([
        ctx.plugin(registryPlugin).await(),
        ctx.plugin(gatewayPlugin).await(),
        ctx.plugin(remotesPlugin).await(),
      ])
      await ctx.plugin(runtimePlugin, { initialSelection: false }).await()
    })
    const connection = (ctx as unknown as { readonly connection: ConnectionHandle }).connection
    const description = await waitForSnapshot(
      connection.hostDescription,
      snapshot => snapshot !== undefined,
      ui('读取 Harness 版本', 'Reading the Harness version'),
    )
    const mismatch = dshCompatibilityError(
      description?.version,
      DSH_COMPATIBILITY,
      launcherPrefersEnglish(process.env),
    )
    if (mismatch !== undefined) throw new Error(mismatch)
    registerConversationNodes(ctx)
    registerGoalProjection(ctx)
    registerWorkflowRunProjection(ctx)
    registerDeliverablesProjection(ctx)
    registerTrajectoryProjection(ctx)

    const clientCtx = ctx as unknown as TuiClientContext
    const target = await targetSession(clientCtx, options)
    const binding = clientCtx.sessions.binding(target.sessionId)
    if (binding === undefined) {
      throw new Error(ui(
        `会话 ${target.sessionId} 未进入 Harness Runtime`,
        `Session ${target.sessionId} did not enter the Harness Runtime`,
      ))
    }
    const snapshot = await waitForSnapshot(
      binding.session,
      candidate => candidate.openState === 'open' || candidate.openState === 'error',
      ui('打开会话', 'Opening the session'),
    )
    if (snapshot.openState === 'error') {
      throw new Error(ui(
        `打开会话失败：${snapshot.openError?.message ?? ui('未知错误', 'unknown error')}`,
        `Failed to open the session: ${snapshot.openError?.message ?? ui('未知错误', 'unknown error')}`,
      ))
    }
    return {
      ctx: clientCtx,
      session: binding.session,
      sessionId: target.sessionId,
      workspacePath: target.workspacePath,
      capabilities: new HarnessTuiCapabilities(
        clientCtx,
        options.api,
        options.profile ?? 'tui',
        target.workspacePath,
        options.management,
      ),
    }
  } catch (error) {
    await ctx.fiber.dispose()
    if (error instanceof Error) throw new Error(explainFailure(error.message), { cause: error })
    throw error
  }
}
