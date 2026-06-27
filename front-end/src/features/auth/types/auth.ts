export type AppRole = 'MANAGER' | 'TENANT'

export interface AuthUser {
  id: string
  role: AppRole
  email: string | null
  username: string | null
  fullName: string | null
  tenantId: string | null
}

export interface LoginFormValues {
  identifier: string
  password: string
  rememberMe: boolean
}

export interface LoginPayload {
  identifier: string
  password?: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}
