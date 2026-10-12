/** Captured structural shapes from untouched published dsh-tool-web@0.2.0-rc.2
 * lib/index.js presentFetchCall/presentFetchResult (no tool or network execution).
 */
import type { FetchTitlePresentation } from '../../src/client/fetch-title-target.ts'

export const fetchUrl = 'https://example.invalid/path?q=fixture'
export const redirectedUrl = 'https://redirect.invalid/final'
export const fetchCall: FetchTitlePresentation = {
  for: 'call', view: { card: 'generic', title: fetchUrl, kind: 'fetch', rawInput: fetchUrl },
}
export const fetchResult: FetchTitlePresentation = {
  for: 'result', view: { card: 'web', kind: 'fetch', title: fetchUrl, url: fetchUrl, statusCode: 200, truncated: false },
}
export const fetchRedirect: FetchTitlePresentation = {
  for: 'result', view: { card: 'web', kind: 'fetch', title: fetchUrl, url: redirectedUrl, statusCode: 200, truncated: true },
}

/** Exact safeArtifactUrl body from frozen E 5c16782 artifact-view.ts.
 * Unit-fixture adapter only; production injects the original function.
 * Frozen-E validation separately compares this policy with the actual export.
 */
export function fixtureSafeArtifactUrl(value: string): string {
  if (/[\u0000-\u0020\u007f]/u.test(value)) throw new Error('Presenter URL contains whitespace or control characters')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Presenter URL is invalid') }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' || parsed.username !== '' || parsed.password !== '') throw new Error('Presenter URL requires HTTP(S) without embedded credentials')
  return parsed.href
}
