/** Starter prompts shown on an empty session; Enter submits the focused one. */

import { ui } from './locale.ts'

export interface EmptySessionExample {
  readonly id: string
  readonly zh: string
  readonly en: string
}

/** Two tasks a coding session can send without typing. */
export const EMPTY_SESSION_EXAMPLES: readonly EmptySessionExample[] = [
  {
    id: 'review',
    zh: '概览当前仓库，并指出最值得先处理的问题',
    en: 'Give an overview of this repo and name the problems worth handling first',
  },
  {
    id: 'boot',
    zh: '说明这个仓库如何启动和验证',
    en: 'Explain how this repo starts and how to verify it',
  },
]

/**
 * Localized prompt text for one empty-session example.
 * @param example - catalog entry.
 */
export function emptyExampleText(example: EmptySessionExample): string {
  return ui(example.zh, example.en)
}

/**
 * Resolve one example by id.
 * @param id - EMPTY_SESSION_EXAMPLES id.
 */
export function emptyExampleById(id: string): EmptySessionExample | undefined {
  return EMPTY_SESSION_EXAMPLES.find(example => example.id === id)
}
