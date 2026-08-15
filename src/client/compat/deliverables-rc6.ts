/** Node-safe reader for dsh 0.1.0-rc.6, which does not publish its projection subpath. */

interface DeliverablesTurnData {
  readonly produced: readonly {
    readonly seq: number
    readonly path: string
  }[]
}

/**
 * Return unique produced paths that settled before the closing assistant message.
 * @param data - Harness turn-scoped deliverable facts.
 * @param seq - Closing assistant sequence number.
 * @returns First-seen paths available to the closing response.
 */
export function producedForClosing(
  data: Readonly<DeliverablesTurnData> | undefined,
  seq = Number.POSITIVE_INFINITY,
): readonly string[] {
  if (data === undefined) return []
  const paths: string[] = []
  const seen = new Set<string>()
  for (const produced of data.produced) {
    if (produced.seq > seq || seen.has(produced.path)) continue
    seen.add(produced.path)
    paths.push(produced.path)
  }
  return paths
}
