/** Per-session client-side tool approval memory. Session end clears it. */

export class SessionToolAllowlist {
  private sessionId: string | undefined
  private readonly tools = new Set<string>()

  /**
   * Bind the allowlist to the active session, clearing it on a session change.
   * @param sessionId - current Runtime session id.
   */
  bind(sessionId: string): void {
    if (this.sessionId === sessionId) return
    this.sessionId = sessionId
    this.tools.clear()
  }

  /** Remember one tool name for the bound session. */
  add(toolName: string): void {
    if (toolName !== '') this.tools.add(toolName)
  }

  /** Whether this session already auto-allows the tool. */
  has(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  /** Drop every remembered tool for the bound session. */
  clear(): void {
    this.tools.clear()
  }

  /** Number of tools auto-allowed in this session. */
  get size(): number {
    return this.tools.size
  }

  /** Remembered tool names in insertion order. */
  names(): readonly string[] {
    return [...this.tools]
  }
}
