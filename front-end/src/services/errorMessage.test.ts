import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './apiClient'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage, isFormValidationError } from './errorMessage'

describe('getUserErrorMessage', () => {
  it('translates business error codes into readable messages', () => {
    expect(getUserErrorMessage(new ApiError('technical message', 'ROOM_ALREADY_OCCUPIED', 409)))
      .toBe('The room has a current or future occupant.')
  })

  it('uses a generic message for invalid login credentials', () => {
    expect(getUserErrorMessage(new ApiError('Invalid credentials', 'INVALID_CREDENTIALS', 401)))
      .toBe('The username or password is incorrect. Please try again.')
  })

  it('maps password policy errors without echoing the submitted password', () => {
    const message = getUserErrorMessage(new ApiError(
      'technical message',
      'PASSWORD_TOO_COMMON',
      400,
    ))

    expect(message).toBe(
      'This password is too common. Choose a less common password or a longer passphrase.',
    )
    expect(message).not.toContain('technical message')
  })

  it('uses an HTTP fallback when the backend code is unknown', () => {
    expect(getUserErrorMessage(new ApiError('technical message', 'NEW_CODE', 403)))
      .toBe('You do not have permission to perform this action.')
  })

  it('explains network failures', () => {
    expect(getUserErrorMessage(new TypeError('Failed to fetch')))
      .toBe('Unable to connect to the system. Check your network connection or the backend service.')
  })

  it('does not expose SQL or backend stack details', () => {
    expect(getUserErrorMessage(new Error('select * from app_user at Query.run()'), 'Unable to save.'))
      .toBe('Unable to save.')
  })

  it('maps API validation errors to their related form fields', () => {
    const setFields = vi.fn()
    const error = new ApiError(
      'Validation failed',
      'VALIDATION_ERROR',
      422,
      { identity_number: ['Citizen ID is invalid.'], body: ['Invalid body.'] },
      'request-field-errors',
    )

    expect(applyApiFieldErrors({ setFields }, error, { identity_number: 'identityNumber' })).toBe(true)
    expect(setFields).toHaveBeenCalledWith([
      { name: 'identityNumber', errors: ['Citizen ID is invalid.'] },
    ])
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
