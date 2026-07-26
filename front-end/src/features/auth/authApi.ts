import { apiRequest } from '../../services/apiClient'
import { API_ROUTES } from '../../services/apiRoutes'
import type {
  ActivateAccountPayload,
  ActivationTokenDetails,
  AuthUser,
  ChangePasswordPayload,
  LoginPayload,
  LoginResponse,
} from './types/auth'

export function login(payload: LoginPayload) {
  return apiRequest<LoginResponse>(API_ROUTES.auth.login, {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}

export function refresh(refreshToken: string) {
  return apiRequest<{ accessToken: string; refreshToken?: string }>(API_ROUTES.auth.refresh, {
    method: 'POST',
    body: { refreshToken },
    skipAuth: true,
  })
}

export function me() {
  return apiRequest<AuthUser>(API_ROUTES.auth.me)
}

export function logoutApi(refreshToken: string | null) {
  return apiRequest<{ success: boolean }>(API_ROUTES.auth.logout, {
    method: 'POST',
    body: refreshToken ? { refreshToken } : {},
    skipAuth: true,
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
