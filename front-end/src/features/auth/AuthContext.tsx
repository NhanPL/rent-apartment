import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { login as loginRequest, logoutApi, me, refresh } from './authApi'
import { clearAuthStorage, setAccessToken } from './authStorage'
import type { AuthUser, LoginPayload } from './types/auth'
import { AuthContext, type AuthContextValue } from './auth-context-value'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const refreshCurrentUser = useCallback(async () => {
    try {
      setIsInitializing(true)
      const session = await refresh()
      setAccessToken(session.accessToken)
      const profile = await me()
      setUser(profile)
    } catch {
      clearAuthStorage()
      setUser(null)
    } finally {
      setIsInitializing(false)
    }
  }, [])

  useEffect(() => {
    void refreshCurrentUser()
  }, [refreshCurrentUser])

  const login = useCallback(async (payload: LoginPayload) => {
    const data = await loginRequest(payload)
    setAccessToken(data.accessToken)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // noop
    }
    clearAuthStorage()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      login,
      logout,
      refreshCurrentUser,
    }),
    [isInitializing, login, logout, refreshCurrentUser, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
