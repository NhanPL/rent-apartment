import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from './authStorage'

const authApiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  logoutApi: vi.fn(),
  me: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('./authApi', () => authApiMocks)

import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

function AuthState() {
  const auth = useAuth()
  if (auth.isInitializing) return <div>Restoring session</div>
  return <div>{auth.user?.email ?? 'Signed out'}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    authApiMocks.refresh.mockReset()
    authApiMocks.me.mockReset()
    authApiMocks.refresh.mockResolvedValue({ accessToken: 'restored-access-token' })
    authApiMocks.me.mockResolvedValue({
      id: 'manager-1',
      role: 'MANAGER',
      email: 'manager@example.com',
      username: 'manager',
      fullName: 'Manager',
      tenantId: null,
    })
  })

  it('restores the user through the HttpOnly refresh cookie flow', async () => {
    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    )

    expect(screen.getByText('Restoring session')).toBeInTheDocument()
    expect(await screen.findByText('manager@example.com')).toBeInTheDocument()
    expect(authApiMocks.refresh).toHaveBeenCalledWith()
    expect(getAccessToken()).toBe('restored-access-token')
    expect(localStorage.getItem('auth_access_token')).toBeNull()
    expect(localStorage.getItem('auth_refresh_token')).toBeNull()
  })
})
