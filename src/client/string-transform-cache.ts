/** Instance-owned, bounded memoization of a pure string transformation. */
export class StringTransformCache {
  private readonly entries = new Map<string, string>()
  private characters = 0

  constructor(private readonly transform: (source: string) => string) {}

  clear(): void { this.entries.clear(); this.characters = 0 }

  get(source: string): string {
    const cached = this.entries.get(source)
    if (cached !== undefined) {
      this.entries.delete(source); this.entries.set(source, cached)
      return cached
    }
    const result = this.transform(source)
    const size = source.length + result.length
    if (size <= 8_000_000) {
      this.entries.set(source, result); this.characters += size
      while (this.entries.size > 20_000 || this.characters > 8_000_000) {
        const oldest = this.entries.keys().next().value!
        this.characters -= oldest.length + this.entries.get(oldest)!.length
        this.entries.delete(oldest)
      }
    }
    return result
  }
}
