/** Same-process optional capability ports. Never promotes a cold Agent or mounts a plugin. */
import { symbols, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { TuiManagementBridge } from '../protocol.ts'
import { nativeMcpResourcePort, nativeTeamBoardPort, nativeSubagentDescendantPort, nativeScheduleRemote, publishedScheduleMethods } from './optional-native-views.ts'

/** Cordis contextual proxies are recreated on access; the published original token owns identity. */
function nativeIdentity(value: unknown): unknown {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
  return Reflect.get(value, symbols.original) ?? value
}

export function createOptionalManagementPorts(ctx: Context): Pick<TuiManagementBridge, 'optionalViews'> {
  const service = (key: string): unknown => ctx.get(key as never)
  const caller = (id: string) => ctx.get('agents')?.get(SessionId(id))
  const team = (id: string) => nativeTeamBoardPort(() => service('agentTeams'), () => caller(id), async (teamId, signal) => {
    // Revalidate membership at the read boundary. An arbitrary ancestry/address is not authority.
    const agent = caller(id)
    const teams = service('agentTeams')
    if (agent === undefined || teams === undefined || teams === null) throw new Error('Team scope is unavailable')
    const membership = Reflect.get(Object(teams), 'membership')
    if (typeof membership !== 'function') throw new Error('Team membership is unavailable')
    const agentIdentity = nativeIdentity(agent)
    const teamsIdentity = nativeIdentity(teams)
    const requireLead = (): void => {
      const currentAgent = caller(id)
      const currentTeams = service('agentTeams')
      if (nativeIdentity(currentAgent) !== agentIdentity || nativeIdentity(currentTeams) !== teamsIdentity) throw new Error('Team scope changed')
      const currentMembership: unknown = Reflect.get(Object(currentTeams), 'membership')
      if (typeof currentMembership !== 'function') throw new Error('Team membership is unavailable')
      const value: unknown = Reflect.apply(currentMembership, currentTeams, [currentAgent])
      if (typeof value !== 'object' || value === null) throw new Error('Team membership is unconfirmed')
      const root: unknown = Reflect.get(value, 'root')
      if (typeof root !== 'object' || root === null || Reflect.get(root, 'id') !== teamId) throw new Error('Team Lead identity changed')
    }
    signal.throwIfAborted(); requireLead()
    const controller = ctx.get('sessionController')
    if (controller === undefined) throw new Error('Native Session journal reader is unavailable')
    const inspection = await controller.inspect(SessionId(teamId), signal)
    signal.throwIfAborted(); requireLead()
    if (inspection.meta.id !== teamId) throw new Error('Team journal identity mismatch')
    // inspect provides a normalized event prefix; do not promise complete delivery coverage.
    return { teamId, events: inspection.events, complete: false }
  })
  return { optionalViews: {
    mcp: id => nativeMcpResourcePort(() => ctx.get('tools'), () => caller(id)),
    team,
    descendants: open => nativeSubagentDescendantPort(() => service('subagents'), open),
    scheduleMethods: () => publishedScheduleMethods(ctx.get('typert')?.local, service),
    schedule: nativeScheduleRemote(ctx.typertGateway),
  } }
}
