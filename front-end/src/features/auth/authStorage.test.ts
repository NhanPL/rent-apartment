import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuthStorage, getAccessToken, setAccessToken } from './authStorage'

describe('authStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAuthStorage()
  })

  it('keeps the access token in memory and removes legacy persisted tokens', () => {
    localStorage.setItem('auth_refresh_token', 'legacy-refresh-token')
    localStorage.setItem('auth_access_token', 'legacy-access-token')

    setAccessToken('memory-access-token')

    expect(getAccessToken()).toBe('memory-access-token')
    expect(localStorage.getItem('auth_access_token')).toBeNull()
    expect(localStorage.getItem('auth_refresh_token')).toBeNull()

    clearAuthStorage()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem('auth_access_token')).toBeNull()
    expect(localStorage.getItem('auth_refresh_token')).toBeNull()
  })
})
