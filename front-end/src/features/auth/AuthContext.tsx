import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { login as loginRequest, logoutApi, me } from './authApi'
import { clearAuthStorage, getCurrentUser, getRefreshToken, setCurrentUser, setTokens } from './authStorage'
import type { AuthUser, LoginPayload } from './types/auth'

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  login: (payload: LoginPayload) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshCurrentUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())
  const [isInitializing, setIsInitializing] = useState(false)

  const refreshCurrentUser = useCallback(async () => {
    if (!getRefreshToken()) {
      return
    }

    try {
      setIsInitializing(true)
      const profile = await me()
      setUser(profile)
      setCurrentUser(profile)
    } catch {
      clearAuthStorage()
      setUser(null)
    } finally {
      setIsInitializing(false)
    }
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    const data = await loginRequest(payload)
    setTokens(data.accessToken, data.refreshToken)
    setCurrentUser(data.user)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    try {
      await logoutApi(refreshToken)
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
