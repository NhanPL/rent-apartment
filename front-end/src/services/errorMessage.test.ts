import { describe, expect, it } from 'vitest'
import { ApiError } from './apiClient'
import { getUserErrorMessage } from './errorMessage'

describe('getUserErrorMessage', () => {
  it('translates business error codes into readable messages', () => {
    expect(getUserErrorMessage(new ApiError('technical message', 'ROOM_ALREADY_OCCUPIED', 409)))
      .toBe('The room has a current or future occupant.')
  })

  it('uses an HTTP fallback when the backend code is unknown', () => {
    expect(getUserErrorMessage(new ApiError('technical message', 'NEW_CODE', 403)))
      .toBe('You do not have permission to perform this action.')
  })

  it('explains network failures', () => {
    expect(getUserErrorMessage(new TypeError('Failed to fetch')))
      .toBe('Unable to connect to the system. Check your network connection or the backend service.')
  })
})
