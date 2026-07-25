import { describe, expect, it } from 'vitest'
import { ApiError } from './apiClient'
import { getFormErrorMessage, getUserErrorMessage, isFormValidationError } from './errorMessage'

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

  it('uses the first field message for form validation failures', () => {
    const error = {
      errorFields: [
        { name: ['email'], errors: ['Please enter a valid email address.'] },
        { name: ['phone'], errors: ['Please enter a phone number.'] },
      ],
    }

    expect(isFormValidationError(error)).toBe(true)
    expect(getFormErrorMessage(error)).toBe('Please enter a valid email address.')
  })

  it('uses a readable fallback when form validation has no field message', () => {
    expect(getFormErrorMessage({ errorFields: [] }))
      .toBe('Please review the highlighted fields and try again.')
  })

  it('keeps API errors meaningful when used by form submit handlers', () => {
    expect(getFormErrorMessage(new ApiError('technical message', 'TENANT_DUPLICATE', 409)))
      .toBe('The phone number or identity document already exists.')
  })
})
