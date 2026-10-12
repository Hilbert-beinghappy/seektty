import { expect, it, vi } from 'vitest'
import { TYPERT_REMOTE } from '@deepseek-ai/dsh-api-workspace-controller/remote'
import { publishedSessionManagementMethods, mountedArtifactReviewReader } from '../src/host/session-management-support.ts'

it('uses actual local descriptors and mounted receivers, with no mutation calls', () => {
  const archiveSession = vi.fn()
  const pinSession = vi.fn()
  const methods = publishedSessionManagementMethods({ get: endpoint => TYPERT_REMOTE.descriptors.find(row => `${row.namespace}/${row.method}` === endpoint) }, key => key === 'workspaceController' ? { archiveSession, pinSession } : undefined)
  expect([...methods!]).toEqual(['workspace/archiveSession', 'workspace/pinSession'])
  expect(archiveSession).not.toHaveBeenCalled(); expect(pinSession).not.toHaveBeenCalled()
})
it('keeps missing registry unknown and withdrawn/unmounted service unavailable', () => {
  expect(publishedSessionManagementMethods(undefined, () => ({}))).toBeUndefined()
  expect([...publishedSessionManagementMethods({ get: () => undefined }, () => ({ archiveSession() {} }))!]).toEqual([])
  expect([...publishedSessionManagementMethods({ get: endpoint => TYPERT_REMOTE.descriptors.find(row => `${row.namespace}/${row.method}` === endpoint) }, () => undefined)!]).toEqual([])
})
it('recognizes only the real mounted Review service shape and preserves its identity/this', () => {
  const reader = { marker: 'Host-retained', summary() { return this.marker }, async diff() { return this.marker } }
  expect(mountedArtifactReviewReader(reader)).toBe(reader)
  expect(mountedArtifactReviewReader(reader)?.summary('fixture' as never, 1)).toBe('Host-retained')
  expect(mountedArtifactReviewReader(undefined)).toBeUndefined()
  expect(mountedArtifactReviewReader({ summary() {} })).toBeUndefined()
})
