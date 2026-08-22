export const DSH_LEGACY_PEER_MAXIMUM: '0.1.0-rc.8'

export function compareDshVersions(left: string, right: string): number | undefined

export function dshPeerRange(
  minimumVersion: string,
  testedVersion: string,
  legacyMaximum?: string,
): string
