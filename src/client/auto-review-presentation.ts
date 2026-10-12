/** Presentation contract tested against published dsh 0.2.0-rc.2. */
export function autoReviewDenial(block: {
  readonly isError?: boolean
  readonly error?: { readonly name?: string; readonly code?: string; readonly reason?: unknown }
}): { readonly reason?: string } | undefined {
  if (block.isError !== true || block.error?.name !== 'AutoReviewDeniedError'
    || block.error.code !== 'AUTO_REVIEW_DENIED') return undefined
  return typeof block.error.reason === 'string' ? { reason: block.error.reason } : {}
}

/** Auto is advertised only by the live Host catalog, never inserted by this helper. */
export function autoPermissionPresentation(option: {
  readonly value: string; readonly name: string; readonly description?: string
}, locale: string): { readonly label: string; readonly description?: string } {
  if (option.value !== 'auto') return {
    label: option.name, ...(option.description === undefined ? {} : { description: option.description }),
  }
  const risk = locale === 'zh'
    ? '实验性：LLM 审查可直接允许工具执行，可能放行不安全操作或拒绝有效操作；每次审查消耗额外 token。'
    : 'Experimental: LLM review can allow tools to execute directly, may allow unsafe actions or deny useful ones, and consumes additional tokens per review.'
  return { label: `${option.name} · ${locale === 'zh' ? '实验性' : 'Experimental'}`,
    description: option.description === undefined ? risk : `${option.description}\n${risk}` }
}
