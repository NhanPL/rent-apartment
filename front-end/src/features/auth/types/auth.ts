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
  twoFactorCode?: string
}

export interface LoginPayload {
  identifier: string
  password: string
  twoFactorCode?: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface AuthSession {
  id: string
  userAgent: string | null
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  current: boolean
}

export interface TwoFactorStatus {
  enabled: boolean
}

export interface TwoFactorSetup {
  secret: string
  otpauthUri: string
}

export interface ActivationTokenDetails {
  valid: true
  emailHint: string
  expiresAt: string
}

export interface ActivateAccountPayload {
  token: string
  newPassword: string
  confirmPassword: string
}

export interface RequestPasswordResetPayload {
  email: string
}

export interface ConfirmPasswordResetPayload {
  token: string
  newPassword: string
  confirmPassword: string
}
