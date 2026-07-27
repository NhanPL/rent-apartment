import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthStorage } from './authStorage'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
)

function AuthState() {
  const auth = useAuth()
  if (auth.isInitializing) return <div>Restoring session</div>
  return <div>{auth.user?.email ?? 'Signed out'}</div>
}

describe('AuthProvider StrictMode session restore', () => {
  beforeEach(() => {
    clearAuthStorage()
    vi.restoreAllMocks()
  })

  it('rotates the refresh cookie only once when StrictMode runs effects twice', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0])
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1
        await new Promise((resolve) => window.setTimeout(resolve, 10))
        return jsonResponse({ accessToken: 'restored-access-token' })
      }
      if (url.endsWith('/auth/me')) {
        return jsonResponse({
          id: 'manager-1',
          role: 'MANAGER',
          email: 'manager@example.com',
          username: 'manager',
          fullName: 'Manager',
          tenantId: null,
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <StrictMode>
        <AuthProvider>
          <AuthState />
        </AuthProvider>
      </StrictMode>,
    )

    expect(await screen.findByText('manager@example.com')).toBeInTheDocument()
    expect(refreshCalls).toBe(1)
  })
})
