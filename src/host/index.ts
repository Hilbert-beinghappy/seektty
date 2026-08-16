/** Host-to-Client startup bridge for the DeepSeek Harness terminal surface. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'
import type { InProcessConnectionHandle } from '@deepseek-ai/dsh-client-connection/in-process'
import { InProcessApiClient, toFetchHandler, type IApiClient } from '@deepseek-ai/dsh-host-apiproxy'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection'
import type { TuiManagementBridge, TuiSurfaceOutcome } from '@deepseek-ai/dsh-tui-protocol'
import { startTui } from '../client/index.ts'
import { translateUiText } from '../client/locale.ts'
import { createTuiManagementBridge } from './management.ts'
import { TUI_STARTUP_SERVICE, type TuiStartupValues } from './startup.ts'

/** Stable Cordis plugin name. */
export const name = 'tui-runner'

/** Host services required before the terminal can assemble its Client Runtime. */
export const inject = [
  'apiProxy', 'connection', 'settings', 'credentials', 'profilePluginManager', 'tuiMarketplaceProviders', TUI_STARTUP_SERVICE,
]

/** Structural launch values crossing the Host/Client TypeScript-program boundary. */
export interface TuiSurfaceStartOptions extends TuiStartupValues {
  readonly api: IApiClient
  readonly rpc: ClientConnectionRpc
  readonly management: TuiManagementBridge
}

/** Structural surface lifecycle returned across the dynamic module boundary. */
export interface TuiSurfaceHandle {
  readonly closed: Promise<TuiSurfaceOutcome>
  stop(): Promise<void>
}

function isActive(ctx: Context): boolean {
  // FiberState is a declaration-only const enum in Cordis 4.0.1; ACTIVE is 2.
  return ctx.fiber.state === 2
}

/** Replaceable process seams used by lifecycle tests. */
export const internals: {
  stderr: { write(chunk: string): unknown }
} = {
  stderr: process.stderr,
}

async function run(ctx: Context): Promise<void> {
  await ctx.get('loader')?.await()
  if (!isActive(ctx)) return
  const startup = ctx.get(TUI_STARTUP_SERVICE) as TuiStartupValues | undefined
  const apiProxy = ctx.get('apiProxy')
  const connection = ctx.get('connection') as InProcessConnectionHandle | undefined
  const exit = ctx.get('appExit')
  if (startup === undefined || apiProxy === undefined || connection === undefined || exit === undefined) {
    throw new Error('tui-runner: Harness startup services are incomplete')
  }
  const surface = await startTui({
    ...startup,
    api: new InProcessApiClient(toFetchHandler(apiProxy)),
    rpc: connection.clientRpc,
    management: createTuiManagementBridge(ctx, startup.cwd),
  })
  if (!isActive(ctx)) {
    await surface.stop()
    return
  }
  ctx.effect(() => () => surface.stop(), 'tui-runner: terminal and Client Runtime')
  const outcome = await surface.closed
  if (!isActive(ctx)) return
  if (outcome.kind === 'exit') {
    exit(outcome.code)
    return
  }
  const restart = ctx.get('appRestart')
  if (restart === undefined) throw new Error('tui-runner: launcher 未提供受控重启能力')
  try {
    await restart({
      profile: outcome.request.profile,
      args: [
        '--cwd', outcome.request.cwd,
        ...(outcome.request.resume === undefined ? [] : ['--resume', outcome.request.resume]),
      ],
      handoff: { channel: 'seektty-v1', payload: outcome.request },
    })
  } catch (error) {
    internals.stderr.write(`deepseek: ${translateUiText(`重启失败：${error instanceof Error ? error.message : String(error)}`)}\n`)
    process.exitCode = 1
  }
}

/**
 * Start the terminal surface after the complete Host tree settles.
 * @param ctx - assembled Harness Host context.
 */
export function apply(ctx: Context): void {
  void run(ctx).catch((error: unknown) => {
    if (!isActive(ctx)) return
    internals.stderr.write(`deepseek: ${translateUiText(error instanceof Error ? error.message : String(error))}\n`)
    ctx.get('appExit')?.(1)
  })
}
