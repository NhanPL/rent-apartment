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
  password: string
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
