/** Width-aware virtual block heights with O(log n) prefix queries. */

const INITIAL_CAPACITY = 64

/**
 * Fenwick (binary indexed) tree over 0-based heights.
 * Point updates and prefix sums are O(log n). Capacity doubles on growth so a
 * streaming tail append does not rewrite every later prefix entry.
 */
export class FenwickTree {
  private tree: number[] = new Array(INITIAL_CAPACITY + 1).fill(0)
  private size = 0
  /** Fenwick node writes; a tail push must stay O(log n), not O(n). */
  touches = 0

  get length(): number {
    return this.size
  }

  /** Replace the stored sequence. Used for session switch and prepend. */
  rebuild(values: readonly number[]): void {
    this.size = values.length
    this.tree = new Array(capacityFor(values.length) + 1).fill(0)
    for (let index = 0; index < values.length; index += 1) {
      this.add(index, values[index] ?? 0)
    }
  }

  /** Append one height without touching earlier prefix nodes linearly. */
  push(value: number): void {
    this.ensure(this.size + 1)
    this.size += 1
    this.add(this.size - 1, value)
  }

  /** Add `delta` to height `index`. */
  add(index: number, delta: number): void {
    if (delta === 0) return
    for (let fenwick = index + 1; fenwick < this.tree.length; fenwick += fenwick & -fenwick) {
      this.tree[fenwick] = (this.tree[fenwick] ?? 0) + delta
      this.touches += 1
    }
  }

  /** Sum of the first `count` heights. */
  prefix(count: number): number {
    const limit = Math.max(0, Math.min(count, this.size))
    let sum = 0
    for (let fenwick = limit; fenwick > 0; fenwick -= fenwick & -fenwick) {
      sum += this.tree[fenwick] ?? 0
    }
    return sum
  }

  total(): number {
    return this.prefix(this.size)
  }

  /**
   * Smallest 0-based index whose prefix sum is greater than `offset`.
   * @returns `size` when `offset` is at or past the total.
   */
  indexAt(offset: number): number {
    if (this.size === 0 || offset < 0) return 0
    let remaining = offset
    let index = 0
    let bit = 1
    while (bit << 1 < this.tree.length) bit <<= 1
    for (; bit > 0; bit >>= 1) {
      const next = index + bit
      const value = this.tree[next] ?? 0
      if (next <= this.size && remaining >= value) {
        remaining -= value
        index = next
      }
    }
    return Math.min(index, this.size)
  }

  private ensure(size: number): void {
    if (size + 1 <= this.tree.length) return
    const grown = new Array(capacityFor(size) + 1).fill(0)
    for (let index = 0; index < this.tree.length; index += 1) {
      grown[index] = this.tree[index] ?? 0
    }
    this.tree = grown
  }
}

function capacityFor(size: number): number {
  let capacity = INITIAL_CAPACITY
  while (capacity < size) capacity *= 2
  return capacity
}

export interface HeightIndexEntry {
  readonly key: string
  readonly height: number
  readonly exact: boolean
}

/** Block-key height map used by the resident scrollbar and virtual search. */
export class HeightIndex {
  private keys: string[] = []
  private heights: number[] = []
  private exactFlags: boolean[] = []
  private readonly byKey = new Map<string, number>()
  private readonly fenwick = new FenwickTree()
  private width = 0
  exactEntries = 0
  estimatedEntries = 0

  get blockCount(): number {
    return this.keys.length
  }

  get contentWidth(): number {
    return this.width
  }

  /** Sum of exact and estimated heights. */
  total(): number {
    return this.fenwick.total()
  }

  /** Prefix sum before `key`. */
  offsetOf(key: string, lineOffset = 0): number {
    const index = this.byKey.get(key)
    if (index === undefined) return 0
    return this.fenwick.prefix(index) + Math.max(0, lineOffset)
  }

  /** Block containing `offset` in the concatenated height space. */
  atOffset(offset: number): { readonly key: string; readonly lineOffset: number } | undefined {
    if (this.keys.length === 0) return undefined
    const total = this.total()
    const clamped = Math.max(0, Math.min(offset, Math.max(0, total - 1)))
    const index = Math.min(this.fenwick.indexAt(clamped), this.keys.length - 1)
    const prefix = this.fenwick.prefix(index)
    const height = this.heights[index] ?? 1
    const key = this.keys[index]
    if (key === undefined) return undefined
    return {
      key,
      lineOffset: Math.max(0, Math.min(clamped - prefix, Math.max(0, height - 1))),
    }
  }

  /**
   * Reconcile to the current block order without rendering.
   * Append-only tail growth is O(log n) per new block; prepend/reorder rebuilds.
   */
  reconcile(
    keys: readonly string[],
    estimateFor: (key: string) => number,
    width: number,
  ): void {
    const widthChanged = width !== this.width
    if (widthChanged && this.keys.length > 0) {
      for (let index = 0; index < this.exactFlags.length; index += 1) {
        this.exactFlags[index] = false
      }
      this.recount()
    }
    this.width = width
    const previousHeights = new Map<string, { height: number; exact: boolean }>()
    for (const [index, key] of this.keys.entries()) {
      previousHeights.set(key, {
        height: this.heights[index] ?? estimateFor(key),
        exact: this.exactFlags[index] === true && width === this.width,
      })
    }
    const prefixUnchanged = keys.length >= this.keys.length
      && this.keys.every((key, index) => keys[index] === key)
    if (prefixUnchanged && keys.length >= this.keys.length && width === this.width) {
      for (let index = this.keys.length; index < keys.length; index += 1) {
        const key = keys[index]
        if (key === undefined) continue
        const estimated = Math.max(1, estimateFor(key))
        this.keys.push(key)
        this.heights.push(estimated)
        this.exactFlags.push(false)
        this.byKey.set(key, index)
        this.fenwick.push(estimated)
        this.estimatedEntries += 1
      }
      return
    }
    this.keys = [...keys]
    this.heights = keys.map((key) => {
      const previous = previousHeights.get(key)
      return previous?.height ?? Math.max(1, estimateFor(key))
    })
    this.exactFlags = keys.map((key) => previousHeights.get(key)?.exact === true)
    this.byKey.clear()
    for (const [index, key] of this.keys.entries()) this.byKey.set(key, index)
    this.fenwick.rebuild(this.heights)
    this.recount()
  }

  /** Record an exact rendered height for one visited block. */
  setExact(key: string, height: number): void {
    const index = this.byKey.get(key)
    if (index === undefined) return
    const next = Math.max(0, Math.floor(height))
    const previous = this.heights[index] ?? 0
    if (next !== previous) {
      this.heights[index] = next
      this.fenwick.add(index, next - previous)
    }
    if (this.exactFlags[index] !== true) {
      this.exactFlags[index] = true
      this.exactEntries += 1
      this.estimatedEntries = Math.max(0, this.estimatedEntries - 1)
    }
  }

  isExact(key: string): boolean {
    const index = this.byKey.get(key)
    return index !== undefined && this.exactFlags[index] === true
  }

  heightOf(key: string): number {
    const index = this.byKey.get(key)
    return index === undefined ? 0 : this.heights[index] ?? 0
  }

  snapshot(): readonly HeightIndexEntry[] {
    return this.keys.map((key, index) => ({
      key,
      height: this.heights[index] ?? 0,
      exact: this.exactFlags[index] === true,
    }))
  }

  clear(): void {
    this.keys = []
    this.heights = []
    this.exactFlags = []
    this.byKey.clear()
    this.fenwick.rebuild([])
    this.width = 0
    this.exactEntries = 0
    this.estimatedEntries = 0
  }

  private recount(): void {
    this.exactEntries = this.exactFlags.filter(flag => flag).length
    this.estimatedEntries = this.keys.length - this.exactEntries
  }
}
