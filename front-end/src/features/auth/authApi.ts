import { apiRequest, refreshAuthSession } from '../../services/apiClient'
import { API_ROUTES } from '../../services/apiRoutes'
import type {
  ActivateAccountPayload,
  ActivationTokenDetails,
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  ConfirmPasswordResetPayload,
  LoginPayload,
  LoginResponse,
  RequestPasswordResetPayload,
  TwoFactorSetup,
  TwoFactorStatus,
} from './types/auth'

export function login(payload: LoginPayload) {
  return apiRequest<LoginResponse>(API_ROUTES.auth.login, {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}

export function refresh() {
  return refreshAuthSession()
}

export function me() {
  return apiRequest<AuthUser>(API_ROUTES.auth.me)
}

export function logoutApi() {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.logout, {
    method: 'POST',
    skipAuth: true,
  })
}

export function revokeAllSessions() {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.revokeAllSessions, {
    method: 'POST',
  })
}

export function listSessions() {
  return apiRequest<{ items: AuthSession[] }>(API_ROUTES.auth.sessions)
}

export function revokeSession(id: string) {
  return apiRequest<{ revokedCurrent: boolean }>(API_ROUTES.auth.sessionDetail(id), {
    method: 'DELETE',
  })
}

export function getTwoFactorStatus() {
  return apiRequest<TwoFactorStatus>(API_ROUTES.auth.twoFactor)
}

export function beginTwoFactorSetup() {
  return apiRequest<TwoFactorSetup>(API_ROUTES.auth.twoFactorSetup, { method: 'POST' })
}

export function enableTwoFactor(code: string) {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.twoFactorEnable, {
    method: 'POST',
    body: { code },
  })
}

export function disableTwoFactor(payload: { currentPassword: string; code: string }) {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.twoFactorDisable, {
    method: 'POST',
    body: payload,
  })
}

export function changePassword(payload: ChangePasswordPayload) {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.password, {
    method: 'PUT',
    body: payload,
  })
}

export function validateAccountActivation(token: string) {
  const query = new URLSearchParams({ token })
  return apiRequest<ActivationTokenDetails>(`${API_ROUTES.auth.activation}?${query.toString()}`, {
    skipAuth: true,
  })
}

export function activateAccount(payload: ActivateAccountPayload) {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.activate, {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}

export function requestPasswordReset(payload: RequestPasswordResetPayload) {
  return apiRequest<{ message: string }>(API_ROUTES.auth.passwordResetRequest, {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}

export function confirmPasswordReset(payload: ConfirmPasswordResetPayload) {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.passwordResetConfirm, {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}
