/** Host-side composition checks for exactly dsh 0.2.0-rc.2; never probe by executing a mutation. */
import type { TypertLocalRegistry } from '@deepseek-ai/dsh-typert-protocol'
import type { ArtifactReviewReader } from '../client/artifact-view.ts'

const MANAGEMENT_ENDPOINTS = [
  'workspace/archiveSession', 'workspace/unarchiveSession', 'workspace/pinSession', 'workspace/unpinSession', 'session/cancel',
] as const

/** A descriptor in a client bundle does not prove the service is mounted on the connected Host. */
export function publishedSessionManagementMethods(
  local: Pick<TypertLocalRegistry, 'get'> | undefined,
  service: (key: string) => unknown,
): ReadonlySet<string> | undefined {
  if (local === undefined) return undefined
  const available = new Set<string>()
  for (const endpoint of MANAGEMENT_ENDPOINTS) {
    const descriptor = local.get(endpoint)
    if (descriptor === undefined || `${descriptor.namespace}/${descriptor.method}` !== endpoint || descriptor.invocation.kind !== 'direct') continue
    const receiver = service(descriptor.service)
    if ((typeof receiver === 'object' && receiver !== null || typeof receiver === 'function')
      && typeof Reflect.get(receiver, descriptor.implementation ?? descriptor.method) === 'function') available.add(endpoint)
  }
  return available
}

/** workspaceChanges is a published Host service, not a Typert Remote namespace. */
export function mountedArtifactReviewReader(value: unknown): ArtifactReviewReader | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (typeof Reflect.get(value, 'summary') !== 'function' || typeof Reflect.get(value, 'diff') !== 'function') return undefined
  return value as ArtifactReviewReader
}
