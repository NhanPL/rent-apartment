import { describe, expect, it } from 'vitest'
import { ApiError } from './apiClient'
import { getUserErrorMessage } from './errorMessage'

describe('getUserErrorMessage', () => {
  it('translates business error codes into readable messages', () => {
    expect(getUserErrorMessage(new ApiError('technical message', 'ROOM_ALREADY_OCCUPIED', 409)))
      .toBe('Phong da co hop dong dang hoat dong.')
  })

  it('uses an HTTP fallback when the backend code is unknown', () => {
    expect(getUserErrorMessage(new ApiError('technical message', 'NEW_CODE', 403)))
      .toBe('Ban khong co quyen thuc hien thao tac nay.')
  })

  it('explains network failures', () => {
    expect(getUserErrorMessage(new TypeError('Failed to fetch')))
      .toBe('Khong the ket noi den he thong. Vui long kiem tra mang hoac may chu backend.')
  })
})
