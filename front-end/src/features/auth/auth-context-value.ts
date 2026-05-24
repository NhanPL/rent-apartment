import { createContext } from 'react'
import type { AuthUser, LoginPayload } from './types/auth'

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  login: (payload: LoginPayload) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshCurrentUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
