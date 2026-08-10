import { describe, expect, it } from 'vitest'
import { ApiError } from '../services/apiClient'
import { queryKeys, shouldRetryQuery } from './queryClient'

describe('query client policy', () => {
  it('does not retry validation or authorization failures', () => {
    expect(shouldRetryQuery(0, new ApiError('Invalid', 'VALIDATION_ERROR', 422))).toBe(false)
    expect(shouldRetryQuery(0, new ApiError('Forbidden', 'FORBIDDEN', 403))).toBe(false)
  })

  it('retries transient failures at most twice', () => {
    expect(shouldRetryQuery(0, new ApiError('Unavailable', 'UNAVAILABLE', 503))).toBe(true)
    expect(shouldRetryQuery(2, new ApiError('Unavailable', 'UNAVAILABLE', 503))).toBe(false)
  })

  it('uses feature-scoped query keys', () => {
    expect(queryKeys.invoices.list({ month: '2026-08' }).slice(0, 2)).toEqual(['invoices', 'list'])
    expect(queryKeys.contracts.references).toEqual(['contracts', 'references'])
  })
})
