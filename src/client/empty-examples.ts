/** Starter prompts shown on an empty session; Enter submits the focused one. */

import { ui } from './locale.ts'

export interface EmptySessionExample {
  readonly id: string
  readonly zh: string
  readonly en: string
}

/** Two or three tasks a coding session can send without typing. */
export const EMPTY_SESSION_EXAMPLES: readonly EmptySessionExample[] = [
  {
    id: 'review',
    zh: '审查当前改动并指出风险',
    en: 'Review the current changes and call out risks',
  },
  {
    id: 'test',
    zh: '为刚才改过的文件补测试',
    en: 'Add tests for the files just changed',
  },
  {
    id: 'boot',
    zh: '解释这个仓库怎么启动和验证',
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
