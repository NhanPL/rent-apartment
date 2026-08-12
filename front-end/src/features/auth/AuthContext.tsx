import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { login as loginRequest, logoutApi, me, refresh, updatePreferredLanguage } from './authApi'
import { clearAuthStorage, setAccessToken } from './authStorage'
import type { AuthUser, LoginPayload } from './types/auth'
import { AuthContext, type AuthContextValue } from './auth-context-value'
import { useI18n } from '../../i18n'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLanguage } = useI18n()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const refreshCurrentUser = useCallback(async () => {
    try {
      setIsInitializing(true)
      const session = await refresh()
      setAccessToken(session.accessToken)
      const profile = await me()
      setUser(profile)
      if (profile.preferredLanguage) setLanguage(profile.preferredLanguage)
    } catch {
      clearAuthStorage()
      setUser(null)
    } finally {
      setIsInitializing(false)
    }
  }, [setLanguage])

  useEffect(() => {
    void refreshCurrentUser()
  }, [refreshCurrentUser])

  const login = useCallback(async (payload: LoginPayload) => {
    const data = await loginRequest(payload)
    setAccessToken(data.accessToken)
    setUser(data.user)
    if (data.user.preferredLanguage) setLanguage(data.user.preferredLanguage)
    return data.user
  }, [setLanguage])

  const setPreferredLanguage = useCallback(async (language: 'en' | 'vi') => {
    await updatePreferredLanguage(language)
    setUser((current) => current ? { ...current, preferredLanguage: language } : current)
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
      setPreferredLanguage,
    }),
    [isInitializing, login, logout, refreshCurrentUser, setPreferredLanguage, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
