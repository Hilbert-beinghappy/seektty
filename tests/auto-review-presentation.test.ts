import { describe, expect, it } from 'vitest'
import { autoReviewDenial, autoPermissionPresentation } from '../src/client/auto-review-presentation.ts'

const error = { name: 'AutoReviewDeniedError', code: 'AUTO_REVIEW_DENIED', reason: 'Exact reviewer reason' }
describe('official structured Auto denial', () => {
  it('retains the raw reason only for a settled structured denial', () => {
    expect(autoReviewDenial({ isError: true, error })).toEqual({ reason: error.reason })
    expect(autoReviewDenial({ isError: true, error: { ...error, reason: 2 } })).toEqual({})
  })
  it.each([
    { isError: false, error }, {}, { isError: true },
    { isError: true, error: { ...error, name: 'Error' } },
    { isError: true, error: { ...error, code: 'TRANSPORT_FAILED' } },
    { isError: true, error: { name: 'Error', code: 'FAILED', reason: 'Auto review denied this call.' } },
  ])('keeps technical failures and incomplete identities distinct: %j', block => {
    expect(autoReviewDenial(block)).toBeUndefined()
  })
  it('decorates only the Host-provided Auto option and preserves its description', () => {
    expect(autoPermissionPresentation({ value: 'auto', name: 'Auto', description: 'Host description' }, 'en'))
      .toEqual({ label: 'Auto · Experimental', description: expect.stringMatching(/^Host description\nExperimental:.*additional tokens/u) })
    expect(autoPermissionPresentation({ value: 'custom-auto', name: 'Auto' }, 'en')).toEqual({ label: 'Auto' })
  })
})
